import { Router, Request, Response } from 'express';
import { checkSecretStatus, writeSecretValue } from '../../../config/secretManager.js';
import { clearAuthConfigCache, getMcpAuthConfig } from '../../../config/authConfig.js';
import { clearSecretsCache } from '../../../services/xero/config.js';
import { clearSageHrConfigCache } from '../../../services/sagehr/config.js';
import { runtimeConfig } from '../../../config/runtimeConfig.js';
import { requireAdminAuth } from '../../middleware/adminAuth.js';
import { logger } from '../../../utils/logger.js';

export const secretsApiRouter = Router();

secretsApiRouter.use(requireAdminAuth);

export interface SecretMetadata {
  key: string;
  category: 'Platform' | 'Xero' | 'BigQuery' | 'Firestore' | 'Sage HR' | 'Slack' | 'Google Workspace Auth';
  description: string;
  required: boolean;
  isCustomInstance?: boolean;
  customerName?: string;
}

const MANAGED_SECRETS_INVENTORY: SecretMetadata[] = [
  // Platform Core & Gemini Enterprise (Required from Setup)
  {
    key: 'MCP_CLIENT_ID',
    category: 'Platform',
    description: 'OAuth Client ID expected from Google Gemini Enterprise during /oauth/authorize handshakes.',
    required: true,
  },
  {
    key: 'MCP_CLIENT_SECRET',
    category: 'Platform',
    description: 'OAuth Client Secret expected from Google Gemini Enterprise during /oauth/token exchanges.',
    required: true,
  },
  {
    key: 'MCP_JWT_SECRET',
    category: 'Platform',
    description: 'Symmetric HMAC-SHA256 secret key for signing stateless auth codes and Bearer access tokens.',
    required: true,
  },

  // Google Workspace Admin Auth (Required from Setup)
  {
    key: 'GOOGLE_CLIENT_ID',
    category: 'Google Workspace Auth',
    description: 'Google OAuth 2.0 Client ID for Administrator web portal login.',
    required: true,
  },
  {
    key: 'GOOGLE_CLIENT_SECRET',
    category: 'Google Workspace Auth',
    description: 'Google OAuth 2.0 Client Secret for Administrator web portal login.',
    required: true,
  },
  {
    key: 'ALLOWED_EMAIL_DOMAINS',
    category: 'Google Workspace Auth',
    description: 'Comma-separated allowlist of permitted corporate email domains (e.g. company.com,corp.com).',
    required: true,
  },

  // Xero (SaaS Connector Service - Optional from get-go)
  {
    key: 'XERO_CLIENT_ID',
    category: 'Xero',
    description: 'OAuth 2.0 Client ID generated in Xero Developer Portal for Custom Connection.',
    required: false,
  },
  {
    key: 'XERO_CLIENT_SECRET',
    category: 'Xero',
    description: 'OAuth 2.0 Client Secret for Xero Custom Connection machine-to-machine authentication.',
    required: false,
  },
  {
    key: 'XERO_TENANT_ID',
    category: 'Xero',
    description: 'Explicit Xero organization tenant UUID override (auto-resolved if empty).',
    required: false,
  },
  {
    key: 'XERO_SCOPES',
    category: 'Xero',
    description: 'Space-separated OAuth scopes requested from Xero API.',
    required: false,
  },

  // BigQuery (SaaS Connector Service - Optional from get-go)
  {
    key: 'BIGQUERY_PROJECT_ID',
    category: 'BigQuery',
    description: 'Target Google Cloud Project ID hosting BigQuery datasets (defaults to host GCP project).',
    required: false,
  },
  {
    key: 'BIGQUERY_DEFAULT_DATASET',
    category: 'BigQuery',
    description: 'Default BigQuery dataset ID used when queries omit dataset qualification.',
    required: false,
  },

  // Firestore (SaaS Connector Service - Optional from get-go)
  {
    key: 'FIRESTORE_PROJECT_ID',
    category: 'Firestore',
    description: 'Target Google Cloud Project ID hosting Firestore (defaults to host GCP project).',
    required: false,
  },
  {
    key: 'FIRESTORE_DATABASE_ID',
    category: 'Firestore',
    description: 'Target Firestore Database ID (defaults to "(default)").',
    required: false,
  },

  // Sage HR (SaaS Connector Service - Optional from get-go)
  {
    key: 'SAGE_HR_API_KEY',
    category: 'Sage HR',
    description: 'API Token generated in Sage HR Admin Integrations settings for REST API authentication.',
    required: false,
  },
  {
    key: 'SAGE_HR_SUBDOMAIN',
    category: 'Sage HR',
    description: 'Company subdomain on Sage HR (e.g. acme for acme.sage.hr).',
    required: false,
  },

  // Slack (SaaS Connector Service - Optional from get-go)
  {
    key: 'SLACK_CLIENT_ID',
    category: 'Slack',
    description: 'OAuth Client ID generated in Slack App Settings for user-delegated federated search.',
    required: false,
  },
  {
    key: 'SLACK_CLIENT_SECRET',
    category: 'Slack',
    description: 'OAuth Client Secret for Slack App OAuth v2 user token exchanges.',
    required: false,
  },
];

/**
 * Helper to get the full combined secrets list (Platform static + Customer instance dynamic)
 */
async function getFullSecretsInventory(): Promise<SecretMetadata[]> {
  const customList = await runtimeConfig.getAllCustomRegisteredSecrets();
  const dynamicItems: SecretMetadata[] = customList.map((c) => ({
    key: c.key,
    category: c.category,
    description: c.description,
    required: c.required,
    isCustomInstance: true,
    customerName: c.customerName,
  }));

  // Deduplicate by key (platform items take precedence)
  const map = new Map<string, SecretMetadata>();
  for (const item of MANAGED_SECRETS_INVENTORY) {
    map.set(item.key, item);
  }
  for (const item of dynamicItems) {
    if (!map.has(item.key)) {
      map.set(item.key, item);
    }
  }

  return Array.from(map.values());
}

/**
 * GET /api/secrets/status
 * Returns checklist status of all Secret Manager keys without exposing plaintext values.
 */
secretsApiRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    const fullInventory = await getFullSecretsInventory();

    const statusList = await Promise.all(
      fullInventory.map(async (item) => {
        const status = await checkSecretStatus(item.key);
        return {
          key: item.key,
          category: item.category,
          description: item.description,
          required: item.required,
          isCustomInstance: item.isCustomInstance,
          customerName: item.customerName,
          isConfigured: status.configured,
          status: status.source, // 'SECRET_MANAGER' | 'ENVIRONMENT' | 'MISSING'
          lastUpdated: status.lastUpdated,
        };
      })
    );

    const configuredCount = statusList.filter((s) => s.isConfigured).length;
    const totalCount = statusList.length;
    const requiredMissing = statusList.filter((s) => s.required && !s.isConfigured).length;

    res.json({
      success: true,
      secrets: statusList,
      totalCount,
      configuredCount,
      missingCount: totalCount - configuredCount,
      requiredMissingCount: requiredMissing,
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to query secret statuses');
    res.status(500).json({ error: 'StatusQueryFailed', message: error.message });
  }
});

/**
 * POST /api/secrets/update
 * Sets or updates a secret directly in GCP Secret Manager without exposing it.
 */
secretsApiRouter.post('/update', async (req: Request, res: Response) => {
  const { secretKey, secretValue } = req.body || {};

  if (!secretKey || typeof secretKey !== 'string') {
    return res.status(400).json({ error: 'BadRequest', message: 'Field "secretKey" (string) is required' });
  }

  if (secretValue === undefined || secretValue === null || typeof secretValue !== 'string') {
    return res.status(400).json({ error: 'BadRequest', message: 'Field "secretValue" (string) is required' });
  }

  const cleanKey = secretKey.trim().toUpperCase();
  const fullInventory = await getFullSecretsInventory();
  const known = fullInventory.find((s) => s.key === cleanKey);
  if (!known) {
    return res.status(400).json({
      error: 'InvalidSecretKey',
      message: `Secret key '${cleanKey}' is not a registered managed secret or customer connector key.`,
    });
  }

  const actorEmail = req.adminUser?.email || 'system';

  try {
    const result = await writeSecretValue(cleanKey, secretValue);

    // Clear caches across subsystems
    clearAuthConfigCache();
    clearSecretsCache();
    clearSageHrConfigCache();
    runtimeConfig.clearCache();

    await runtimeConfig.logAudit('SECRET_UPDATE', actorEmail, `secrets/${cleanKey}`, {
      secretKey: cleanKey,
      source: result.source,
      versionPath: result.versionPath,
    });

    res.json({
      success: true,
      secretKey: cleanKey,
      source: result.source,
      message: `Secret '${cleanKey}' initialized & updated successfully in ${result.source === 'SECRET_MANAGER' ? 'Google Cloud Secret Manager' : 'Environment'}.`,
    });
  } catch (error: any) {
    logger.error({ error, secretKey: cleanKey }, 'Failed to update secret');
    res.status(500).json({ error: 'UpdateSecretFailed', message: error.message });
  }
});

/**
 * GET /api/secrets/gemini-blueprint
 * Returns the exact configuration parameters required to register this MCP server
 * into Google Gemini Enterprise -> Agent Builder -> Data Stores -> Custom MCP Server.
 */
secretsApiRouter.get('/gemini-blueprint', async (req: Request, res: Response) => {
  try {
    let clientId = 'gemini-enterprise-mcp';
    let clientSecret = '';
    let isClientSecretSet = false;

    try {
      const authConfig = await getMcpAuthConfig();
      clientId = authConfig.clientId;
      clientSecret = authConfig.clientSecret;
      isClientSecretSet = Boolean(clientSecret);
    } catch {
      clientId = process.env.MCP_CLIENT_ID || 'gemini-enterprise-mcp';
      clientSecret = process.env.MCP_CLIENT_SECRET || '';
      isClientSecretSet = Boolean(clientSecret);
    }

    const host = req.get('host') || 'localhost:3000';
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';

    // Cloud Run Production URL resolution
    const defaultCloudRunUrl = 'https://enterprise-mcp-server-1058873375196.europe-west1.run.app';
    const envUrl = process.env.CLOUD_RUN_URL || process.env.MCP_SERVER_URL || process.env.SERVICE_URL;
    const productionUrl = !isLocal ? `${protocol}://${host}` : (envUrl || defaultCloudRunUrl);
    const baseUrl = productionUrl;

    res.json({
      success: true,
      blueprint: {
        serverBaseUrl: baseUrl,
        mcpEndpoint: `${baseUrl}/mcp`,
        authType: 'OAuth 2.0 (PKCE)',
        grantType: 'authorization_code',
        responseType: 'code',
        codeChallengeMethod: 'S256',
        authorizationUrl: `${baseUrl}/oauth/authorize`,
        tokenUrl: `${baseUrl}/oauth/token`,
        clientId: clientId,
        clientSecret: clientSecret,
        isClientSecretSet,
        scopes: 'all',
      },
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to generate Gemini blueprint');
    res.status(500).json({ error: 'BlueprintError', message: error.message });
  }
});

