import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { runtimeConfig } from '../../../config/runtimeConfig.js';
import { getOrCreateSetupToken, verifySetupToken, requireSetupAuth, SETUP_SESSION_COOKIE, invalidateSetupToken } from '../../../config/setupToken.js';
import { gcpSetupService, FirestoreDatabaseInfo } from '../../../services/gcp/setupService.js';
import { getGcpProjectId, writeSecretValue } from '../../../config/secretManager.js';
import { clearAuthConfigCache } from '../../../config/authConfig.js';
import { SESSION_COOKIE_NAME } from '../../middleware/adminAuth.js';
import { logger } from '../../../utils/logger.js';

export const setupApiRouter = Router();

/**
 * GET /api/setup/status
 * Public status check used by frontend to determine if wizard should render.
 */
setupApiRouter.get('/status', async (req: Request, res: Response) => {
  try {
    const isCompleted = await runtimeConfig.isSetupCompleted();
    const installation = await runtimeConfig.getInstallationMetadata();
    const detectedProjectId = (await getGcpProjectId()) || process.env.GCP_PROJECT_ID || '';
    const serviceAccountEmail = await gcpSetupService.getServiceAccountEmail();

    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const callbackUri = `${protocol}://${host}/api/auth/callback`;

    const hasGoogleClientId = Boolean(process.env.GOOGLE_CLIENT_ID);
    const hasJwtSecret = Boolean(process.env.MCP_JWT_SECRET);

    const isDev = process.env.NODE_ENV !== 'production';
    const devBootstrapToken = isDev && !isCompleted ? getOrCreateSetupToken() : undefined;

    const detectedRegion = await gcpSetupService.getCloudRunRegion();
    const activeGoogleAccount = await gcpSetupService.getActiveGcloudAccount();
    let existingDatabases: FirestoreDatabaseInfo[] = [];
    if (detectedProjectId && detectedProjectId !== 'your-gcp-project-id') {
      existingDatabases = await gcpSetupService.listProjectFirestoreDatabases(detectedProjectId);
    }

    const defaultDatabaseId =
      installation?.firestoreDatabaseId ||
      process.env.FIRESTORE_DATABASE_ID ||
      (existingDatabases.length > 0 ? existingDatabases[0].databaseId : '(default)');

    res.json({
      success: true,
      isCompleted,
      isDev,
      devBootstrapToken,
      installationStatus: installation?.initializationStatus || (isCompleted ? 'CORE_COMPLETED' : 'UNINITIALIZED'),
      detectedProjectId,
      detectedRegion,
      serviceAccountEmail,
      activeGoogleAccount,
      callbackUri,
      currentDatabaseId: defaultDatabaseId,
      existingDatabases,
      googleOAuthConfigured: hasGoogleClientId,
      jwtSecretConfigured: hasJwtSecret,
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to query setup status');
    res.status(500).json({ error: 'SetupStatusError', message: error.message });
  }
});

/**
 * POST /api/setup/verify-token
 * Validates bootstrap setup token and issues temporary setup session cookie.
 */
setupApiRouter.post('/verify-token', async (req: Request, res: Response) => {
  const { token } = req.body || {};

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'BadRequest', message: 'Field "token" (string) is required' });
  }

  const isValid = verifySetupToken(token);
  if (!isValid) {
    logger.warn('Invalid bootstrap setup token submitted');
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid bootstrap setup token' });
  }

  const isHttps = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
  
  // 1. Issue temporary bootstrap setup session cookie
  res.cookie(SETUP_SESSION_COOKIE, token.trim(), {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    maxAge: 2 * 60 * 60 * 1000,
    path: '/',
  });

  // 2. Auto-purge any stale admin session cookie so setup starts with a clean state
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    path: '/',
  });

  res.json({ success: true, message: 'Bootstrap setup token verified successfully. Stale sessions purged.' });
});

/**
 * POST /api/setup/gcp-diagnostics
 * Probes target GCP project and Service Account permissions.
 */
setupApiRouter.post('/gcp-diagnostics', requireSetupAuth, async (req: Request, res: Response) => {
  const { projectId } = req.body || {};
  const targetProject = projectId || (await getGcpProjectId()) || process.env.GCP_PROJECT_ID || '';

  try {
    const diagnostics = await gcpSetupService.checkGcpPermissions(targetProject);
    const existingDatabases = await gcpSetupService.listProjectFirestoreDatabases(targetProject);
    const detectedRegion = await gcpSetupService.getCloudRunRegion();
    res.json({ success: true, diagnostics, existingDatabases, detectedRegion });
  } catch (error: any) {
    logger.error({ error }, 'Failed to run GCP setup diagnostics');
    res.status(500).json({ error: 'DiagnosticsFailed', message: error.message });
  }
});

/**
 * POST /api/setup/init-firestore
 * Initializes custom named Firestore database and tests read/write integrity.
 */
setupApiRouter.post('/init-firestore', requireSetupAuth, async (req: Request, res: Response) => {
  const { databaseId = '(default)', projectId } = req.body || {};
  const cleanDbId = String(databaseId).trim() || '(default)';
  const activeProjectId = projectId || process.env.GCP_PROJECT_ID || (await getGcpProjectId()) || '';

  if (activeProjectId) {
    process.env.GCP_PROJECT_ID = activeProjectId;
  }

  try {
    runtimeConfig.setCustomDatabaseId(cleanDbId);
    const testResult = await runtimeConfig.testFirestoreConnectivity(cleanDbId);

    const saEmail = await gcpSetupService.getServiceAccountEmail(activeProjectId);
    const region = await gcpSetupService.getCloudRunRegion();
    const existingDatabases = await gcpSetupService.listProjectFirestoreDatabases(activeProjectId);
    const existingMatch = existingDatabases.find((d) => d.databaseId === cleanDbId);

    // Update installation metadata ONLY on successful connection
    if (testResult.success) {
      await runtimeConfig.setInstallationMetadata({
        firestoreDatabaseId: cleanDbId,
        region: existingMatch?.locationId || region,
        initializationStatus: 'IN_PROGRESS',
      });
    }

    if (!testResult.success) {
      const isPermissionDenied =
        testResult.error?.includes('7 PERMISSION_DENIED') ||
        testResult.error?.includes('PERMISSION_DENIED') ||
        testResult.error?.includes('403');

      const isNotFound = testResult.error?.includes('5 NOT_FOUND') || testResult.error?.includes('NOT_FOUND');

      if (isPermissionDenied) {
        const iamFixCmd = `gcloud projects add-iam-policy-binding ${activeProjectId} \\\n  --member="serviceAccount:${saEmail}" \\\n  --role="roles/datastore.user"`;
        return res.json({
          success: true,
          connected: false,
          isCreatedInGcp: true,
          permissionDenied: true,
          message: `Permission denied connecting to database '${cleanDbId}'. If you just ran the 'roles/datastore.user' gcloud command, please note that Google Cloud IAM tokens take 1–5 minutes to propagate across Cloud Run.`,
          databaseId: cleanDbId,
          iamFixCommand: iamFixCmd,
          latencyMs: testResult.latencyMs,
          detectedRegion: existingMatch?.locationId || region,
        });
      }

      const gcloudCreateCmd = cleanDbId === '(default)'
        ? `gcloud firestore databases create \\\n  --project=${activeProjectId} \\\n  --location=${region} \\\n  --type=firestore-native`
        : `gcloud firestore databases create \\\n  --project=${activeProjectId} \\\n  --database="${cleanDbId}" \\\n  --location=${region} \\\n  --type=firestore-native`;
      return res.json({
        success: true,
        connected: false,
        isCreatedInGcp: false,
        databaseNotFound: true,
        message: isNotFound
          ? `Database '${cleanDbId}' not found in GCP project. Run the gcloud command below with region '${region}' to create it.`
          : (testResult.error || 'Firestore connectivity probe completed.'),
        databaseId: cleanDbId,
        gcloudCreateCommand: gcloudCreateCmd,
        latencyMs: testResult.latencyMs,
        detectedRegion: region,
      });
    }

    res.json({
      success: true,
      connected: true,
      isCreatedInGcp: true,
      databaseNotFound: false,
      permissionDenied: false,
      message: `Firestore database '${cleanDbId}' connected and verified successfully in Google Cloud (Location: ${existingMatch?.locationId || region}).`,
      databaseId: cleanDbId,
      detectedRegion: existingMatch?.locationId || region,
      latencyMs: testResult.latencyMs,
    });
  } catch (error: any) {
    logger.error({ error, databaseId: cleanDbId }, 'Failed to initialize Firestore during setup');
    res.status(500).json({ error: 'FirestoreInitError', message: error.message });
  }
});

/**
 * POST /api/setup/configure-gws-oauth
 * Writes Google Workspace OAuth credentials and JWT secrets directly to Google Secret Manager.
 */
setupApiRouter.post('/configure-gws-oauth', requireSetupAuth, async (req: Request, res: Response) => {
  const {
    googleClientId,
    googleClientSecret,
    allowedDomains,
    jwtSecret,
    adminEmail,
    adminName,
  } = req.body || {};

  if (!googleClientId || typeof googleClientId !== 'string') {
    return res.status(400).json({ error: 'BadRequest', message: 'Field "googleClientId" is required.' });
  }

  if (!googleClientSecret || typeof googleClientSecret !== 'string') {
    return res.status(400).json({ error: 'BadRequest', message: 'Field "googleClientSecret" is required.' });
  }

  const cleanClientId = googleClientId.trim();
  const cleanClientSecret = googleClientSecret.trim();
  const cleanDomains = allowedDomains ? String(allowedDomains).trim() : '';
  const cleanJwt = jwtSecret ? String(jwtSecret).trim() : crypto.randomBytes(32).toString('hex');
  const cleanAdminEmail = adminEmail ? String(adminEmail).trim().toLowerCase() : 'admin@company.com';
  const cleanAdminName = adminName ? String(adminName).trim() : cleanAdminEmail.split('@')[0];

  try {
    // Write secrets to Secret Manager / environment
    await writeSecretValue('GOOGLE_CLIENT_ID', cleanClientId);
    await writeSecretValue('GOOGLE_CLIENT_SECRET', cleanClientSecret);
    if (cleanDomains) {
      await writeSecretValue('ALLOWED_EMAIL_DOMAINS', cleanDomains);
    }
    await writeSecretValue('MCP_JWT_SECRET', cleanJwt);

    clearAuthConfigCache();
    runtimeConfig.clearCache();

    // Seed or update initial admin user access
    await runtimeConfig.createUserAccess(
      {
        userEmail: cleanAdminEmail,
        fullName: cleanAdminName,
        isAdmin: true,
        isEnabled: true,
        allowedServices: ['xero', 'bigquery', 'firestore', 'sagehr', 'slack'],
        readOnlyOnly: false,
      },
      'setup-wizard'
    );

    await runtimeConfig.logAudit('SECRET_UPDATE', cleanAdminEmail, 'secrets/GOOGLE_CLIENT_ID', {
      action: 'SETUP_GWS_OAUTH',
      domains: cleanDomains,
    });

    res.json({
      success: true,
      message: 'Google Workspace OAuth credentials securely persisted to Secret Manager.',
      adminEmail: cleanAdminEmail,
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to write GWS OAuth secrets during setup');
    res.status(500).json({ error: 'SecretsWriteFailed', message: error.message });
  }
});

/**
 * GET /api/setup/gemini-config
 * Retrieves current Gemini Enterprise MCP integration status and Secret Manager readiness.
 */
setupApiRouter.get('/gemini-config', requireSetupAuth, async (req: Request, res: Response) => {
  try {
    const projectId = (await getGcpProjectId()) || process.env.GCP_PROJECT_ID || 'your-gcp-project-id';
    const saEmail = await gcpSetupService.getServiceAccountEmail();
    const smProbe = await gcpSetupService.checkSecretManagerAccess(projectId);

    const existingClientId = process.env.MCP_CLIENT_ID || 'gemini-enterprise-mcp';
    const existingClientSecret = process.env.MCP_CLIENT_SECRET || '';
    const existingJwtSecret = process.env.MCP_JWT_SECRET || '';

    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const baseUrl = `${protocol}://${host}`;

    res.json({
      success: true,
      clientId: existingClientId,
      clientSecret: existingClientSecret,
      jwtSecret: existingJwtSecret,
      geminiConfig: {
        serverBaseUrl: baseUrl,
        mcpEndpoint: `${baseUrl}/mcp`,
        authType: 'OAuth 2.0 (PKCE)',
        authorizationUrl: `${baseUrl}/oauth/authorize`,
        tokenUrl: `${baseUrl}/oauth/token`,
        clientId: existingClientId,
        clientSecret: existingClientSecret,
        scopes: 'all',
      },
      secretManagerStatus: {
        hasAccess: smProbe.hasAccess,
        permissionDenied: smProbe.permissionDenied,
        iamFixCommand: smProbe.iamFixCommand,
        serviceAccountEmail: saEmail,
      },
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to query Gemini setup config');
    res.status(500).json({ error: 'GeminiConfigError', message: error.message });
  }
});

/**
 * POST /api/setup/gemini-config
 * Generates or updates MCP OAuth credentials for Google Gemini Enterprise in GCP Secret Manager.
 */
setupApiRouter.post('/gemini-config', requireSetupAuth, async (req: Request, res: Response) => {
  const { clientId, clientSecret, jwtSecret } = req.body || {};

  const projectId = (await getGcpProjectId()) || process.env.GCP_PROJECT_ID || 'your-gcp-project-id';
  const saEmail = await gcpSetupService.getServiceAccountEmail();

  // Check Secret Manager permission
  const smProbe = await gcpSetupService.checkSecretManagerAccess(projectId);

  // Generate or sanitize credentials
  const cleanClientId =
    clientId && typeof clientId === 'string' && clientId.trim().length > 0
      ? clientId.trim()
      : (process.env.MCP_CLIENT_ID || 'gemini-enterprise-mcp');

  const cleanClientSecret =
    clientSecret && typeof clientSecret === 'string' && clientSecret.trim().length > 0
      ? clientSecret.trim()
      : (process.env.MCP_CLIENT_SECRET || crypto.randomBytes(24).toString('hex'));

  const cleanJwtSecret =
    jwtSecret && typeof jwtSecret === 'string' && jwtSecret.trim().length > 0
      ? jwtSecret.trim()
      : (process.env.MCP_JWT_SECRET || crypto.randomBytes(32).toString('hex'));

  try {
    // Write all 3 secrets to Secret Manager (and memory)
    const idWrite = await writeSecretValue('MCP_CLIENT_ID', cleanClientId);
    const secWrite = await writeSecretValue('MCP_CLIENT_SECRET', cleanClientSecret);
    const jwtWrite = await writeSecretValue('MCP_JWT_SECRET', cleanJwtSecret);

    runtimeConfig.clearCache();

    // Construct Gemini Enterprise connection endpoints
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const baseUrl = `${protocol}://${host}`;

    const geminiConfig = {
      serverBaseUrl: baseUrl,
      mcpEndpoint: `${baseUrl}/mcp`,
      authType: 'OAuth 2.0 (PKCE)',
      authorizationUrl: `${baseUrl}/oauth/authorize`,
      tokenUrl: `${baseUrl}/oauth/token`,
      clientId: cleanClientId,
      clientSecret: cleanClientSecret,
      scopes: 'all',
    };

    await runtimeConfig.logAudit('SECRET_UPDATE', 'setup-wizard', 'secrets/MCP_CLIENT_ID', {
      action: 'SETUP_GEMINI_ENTERPRISE_CONFIG',
      persistedToGsm: idWrite.source === 'SECRET_MANAGER',
    });

    res.json({
      success: true,
      message: 'Gemini Enterprise MCP credentials provisioned successfully.',
      geminiConfig,
      variables: [
        {
          name: 'MCP_CLIENT_ID',
          description: 'OAuth 2.0 Client ID presented by Gemini Enterprise',
          source: idWrite.source,
          value: cleanClientId,
        },
        {
          name: 'MCP_CLIENT_SECRET',
          description: 'OAuth 2.0 Client Secret authenticated against this server',
          source: secWrite.source,
          value: cleanClientSecret,
        },
        {
          name: 'MCP_JWT_SECRET',
          description: 'Internal HMAC-SHA256 signing secret for session tokens & PKCE codes',
          source: jwtWrite.source,
          value: cleanJwtSecret.substring(0, 8) + '...',
        },
      ],
      secretManagerStatus: {
        hasAccess: smProbe.hasAccess,
        permissionDenied: smProbe.permissionDenied,
        iamFixCommand: smProbe.iamFixCommand,
        serviceAccountEmail: saEmail,
      },
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to configure Gemini Enterprise secrets during setup');
    res.status(500).json({ error: 'GeminiConfigError', message: error.message });
  }
});

/**
 * POST /api/setup/complete
 * Finalizes installation, sets status to CORE_COMPLETED, issues admin session, and cleans up setup cookie.
 */
setupApiRouter.post('/complete', requireSetupAuth, async (req: Request, res: Response) => {
  const { adminEmail = 'admin@company.com', adminName = 'System Administrator', setupMode = 'QUICKSTART_CORE' } = req.body || {};
  const cleanEmail = String(adminEmail).trim().toLowerCase();

  try {
    const projectId = (await getGcpProjectId()) || 'unknown';

    // Mark installation as COMPLETED in Firestore
    await runtimeConfig.setInstallationMetadata({
      initializationStatus: 'CORE_COMPLETED',
      initializedBy: cleanEmail,
      setupMode: setupMode as any,
      gcpProjectId: projectId,
      configuredServices: ['gws_auth', 'platform'],
      pendingServices: ['bigquery', 'xero', 'sagehr', 'slack'],
    });

    // Ensure admin user access exists
    let user = await runtimeConfig.getUserAccess(cleanEmail);
    if (!user) {
      user = await runtimeConfig.createUserAccess(
        {
          userEmail: cleanEmail,
          fullName: String(adminName).trim() || cleanEmail.split('@')[0],
          isAdmin: true,
          isEnabled: true,
          allowedServices: ['xero', 'bigquery', 'firestore', 'sagehr', 'slack'],
          readOnlyOnly: false,
        },
        'setup-completion'
      );
    }

    // Create active admin session in Firestore
    const sessionId = crypto.randomUUID();
    const session = await runtimeConfig.createSession({
      sessionId,
      userEmail: cleanEmail,
      fullName: user.fullName,
      role: 'ADMIN',
      ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1',
      userAgent: req.get('user-agent') || 'Setup Wizard',
      ttlHours: 8,
    });

    // Set production admin session cookie
    const isHttps = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
    res.cookie(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });

    // Clear setup cookie and invalidate bootstrap token from GSM & memory
    res.clearCookie(SETUP_SESSION_COOKIE, { path: '/' });
    await invalidateSetupToken();

    await runtimeConfig.logAudit('INITIALIZATION_STEP', cleanEmail, 'system_metadata/installation', {
      action: 'SETUP_COMPLETED',
      setupMode,
      sessionId,
    });

    logger.info({ adminEmail: cleanEmail, setupMode }, 'Platform initial setup completed successfully');

    res.json({
      success: true,
      message: 'Platform initialisation completed successfully! Welcome to the Admin Portal.',
      sessionId,
      sessionExpiresAt: session.expiresAt,
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to complete platform setup');
    res.status(500).json({ error: 'SetupCompletionFailed', message: error.message });
  }
});

/**
 * POST /api/setup/enable-apis
 * Enable required GCP APIs for the target project.
 */
setupApiRouter.post('/enable-apis', requireSetupAuth, async (req: Request, res: Response) => {
  const { projectId } = req.body || {};
  if (!projectId) {
    return res.status(400).json({ error: 'MissingProjectId', message: 'GCP Project ID is required' });
  }

  const result = await gcpSetupService.enableRequiredApis(projectId);
  if (!result.success) {
    return res.status(500).json({ error: 'ApiEnablementFailed', message: result.error });
  }

  res.json({
    success: true,
    message: 'Required Google Cloud APIs enabled successfully',
    enabledApis: result.enabledApis,
  });
});

/**
 * POST /api/setup/create-firestore
 * Create Standard '(default)' or Enterprise custom-named Firestore database in target region.
 */
setupApiRouter.post('/create-firestore', requireSetupAuth, async (req: Request, res: Response) => {
  const { projectId, databaseId = '(default)', region = 'europe-west1' } = req.body || {};
  if (!projectId) {
    return res.status(400).json({ error: 'MissingProjectId', message: 'GCP Project ID is required' });
  }

  const result = await gcpSetupService.createFirestoreDatabase(projectId, databaseId, region);
  if (!result.success) {
    return res.status(400).json({
      error: 'DatabaseCreationFailed',
      message: result.message,
      databaseId: result.databaseId,
      details: result.error,
    });
  }

  res.json(result);
});

/**
 * POST /api/setup/deploy-cloudrun
 * Trigger Google Cloud Run build and deployment from the local machine with live streaming logs.
 */
setupApiRouter.post('/deploy-cloudrun', requireSetupAuth, async (req: Request, res: Response) => {
  const {
    projectId,
    region = 'europe-west1',
    serviceName = 'enterprise-mcp-server',
    databaseId = '(default)',
    allowedDomains = '',
  } = req.body || {};

  if (!projectId) {
    return res.status(400).json({ error: 'MissingProjectId', message: 'GCP Project ID is required' });
  }

  // Set headers for Chunked / Event streaming
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  res.write(`[DEPLOY_START] Initializing Google Cloud Run Deployment to ${region}...\n`);
  res.write(`[INFO] Project: ${projectId} | Service: ${serviceName} | Database: ${databaseId}\n`);

  try {
    const { spawn } = await import('child_process');

    const deployArgs = [
      'run',
      'deploy',
      serviceName,
      '--source',
      '.',
      `--region=${region}`,
      `--project=${projectId}`,
      `--set-env-vars=GCP_PROJECT_ID=${projectId},FIRESTORE_DATABASE_ID=${databaseId},GCP_REGION=${region},NODE_ENV=production`,
      `--set-secrets=MCP_CLIENT_ID=MCP_CLIENT_ID:latest,MCP_CLIENT_SECRET=MCP_CLIENT_SECRET:latest,MCP_JWT_SECRET=MCP_JWT_SECRET:latest,ALLOWED_EMAIL_DOMAINS=ALLOWED_EMAIL_DOMAINS:latest`,
      '--allow-unauthenticated',
      '--clear-base-image',
    ];

    res.write(`[EXEC] Running: gcloud ${deployArgs.join(' ')}\n\n`);

    const child = spawn('gcloud', deployArgs, { shell: true });

    child.stdout.on('data', (data) => {
      res.write(data.toString());
    });

    child.stderr.on('data', (data) => {
      res.write(data.toString());
    });

    child.on('close', (code) => {
      if (code === 0) {
        res.write(`\n[DEPLOY_SUCCESS] Cloud Run container revision deployed successfully!\n`);
        res.write(`[INFO] Checking and binding public invoker IAM policy (roles/run.invoker) for Gemini Enterprise...\n`);

        const iamArgs = [
          'run',
          'services',
          'add-iam-policy-binding',
          serviceName,
          `--region=${region}`,
          `--project=${projectId}`,
          '--member=allUsers',
          '--role=roles/run.invoker',
        ];

        res.write(`[EXEC] Running: gcloud ${iamArgs.join(' ')}\n\n`);

        const iamChild = spawn('gcloud', iamArgs, { shell: true });

        iamChild.stdout.on('data', (d) => res.write(d.toString()));
        iamChild.stderr.on('data', (d) => res.write(d.toString()));

        iamChild.on('close', (iamCode) => {
          if (iamCode === 0) {
            res.write(`\n[IAM_SUCCESS] Public Cloud Run invoker policy verified (allUsers -> roles/run.invoker).\n`);
          } else {
            res.write(`\n[IAM_NOTICE] If your GCP organization enforces Domain Restricted Sharing (iam.allowedPolicyMemberDomains), ask your Org Admin to run:\n`);
            res.write(`  gcloud resource-manager org-policies disable-enforce iam.allowedPolicyMemberDomains --project=${projectId}\n`);
            res.write(`  gcloud run services add-iam-policy-binding ${serviceName} --region=${region} --project=${projectId} --member="allUsers" --role="roles/run.invoker"\n`);
          }
          res.end();
        });

        iamChild.on('error', (_err) => {
          res.write(`\n[IAM_WARNING] Could not execute IAM binding automatically. Ensure allUsers has roles/run.invoker.\n`);
          res.end();
        });
      } else {
        res.write(`\n[DEPLOY_ERROR] Deployment exited with non-zero exit code: ${code}\n`);
        res.end();
      }
    });

    child.on('error', (err) => {
      res.write(`\n[DEPLOY_FATAL] Failed to spawn gcloud process: ${err.message}\n`);
      res.end();
    });
  } catch (err: any) {
    res.write(`\n[DEPLOY_FATAL] Unexpected error: ${err.message}\n`);
    res.end();
  }
});
