import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { runtimeConfig } from '../../../config/runtimeConfig.js';
import { requireAdminAuth, SESSION_COOKIE_NAME } from '../../middleware/adminAuth.js';
import { getSecretValue, getGcpProjectId } from '../../../config/secretManager.js';
import { gcpSetupService } from '../../../services/gcp/setupService.js';
import { logger } from '../../../utils/logger.js';

export const authApiRouter = Router();

// Helper to resolve Google OAuth credentials from Secret Manager or environment
async function getGoogleOAuthConfig(req: Request) {
  const clientId = (await getSecretValue('GOOGLE_CLIENT_ID')) || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = (await getSecretValue('GOOGLE_CLIENT_SECRET')) || process.env.GOOGLE_CLIENT_SECRET;
  
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const defaultRedirectUri = `${protocol}://${host}/api/auth/callback`;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || defaultRedirectUri;

  const allowedDomainsEnv = (await getSecretValue('ALLOWED_EMAIL_DOMAINS')) || process.env.ALLOWED_EMAIL_DOMAINS || '';
  const allowedDomains = allowedDomainsEnv
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  return {
    clientId,
    clientSecret,
    redirectUri,
    allowedDomains,
    isConfigured: Boolean(clientId && clientSecret),
  };
}

/**
 * GET /api/auth/config-status
 * Returns whether live Google OAuth is configured or in dev mode.
 */
authApiRouter.get('/config-status', async (req: Request, res: Response) => {
  const config = await getGoogleOAuthConfig(req);
  let projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || (await getGcpProjectId()) || 'unconfigured-project';
  try {
    const install = await runtimeConfig.getInstallationMetadata();
    if (install?.gcpProjectId) projectId = install.gcpProjectId;
  } catch (_e) {
    // fallback
  }

  const cloudRunStats = await gcpSetupService.getCloudRunInstanceStats();

  res.json({
    googleOAuthConfigured: config.isConfigured,
    allowedDomains: config.allowedDomains.length > 0 ? config.allowedDomains : ['* (All Authorized Domains)'],
    devModeAllowed: process.env.NODE_ENV !== 'production',
    diagnostics: {
      projectId,
      revision: cloudRunStats.revision,
      region: cloudRunStats.region,
      ramMb: cloudRunStats.ramMb,
      instancesCount: cloudRunStats.instancesCount,
      uptimeHours: cloudRunStats.uptimeHours,
      isCloudRun: cloudRunStats.isCloudRun,
    },
  });
});

/**
 * GET /api/auth/login
 * Initiates Google Workspace OIDC login flow.
 */
authApiRouter.get('/login', async (req: Request, res: Response) => {
  try {
    const config = await getGoogleOAuthConfig(req);

    if (!config.isConfigured) {
      const isProd = process.env.NODE_ENV === 'production';
      if (isProd) {
        return res.redirect('/admin/setup?notice=google_oauth_required');
      }
      return res.redirect('/admin/login?notice=google_not_configured');
    }

    const state = crypto.randomBytes(16).toString('hex');
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', config.clientId!);
    authUrl.searchParams.set('redirect_uri', config.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'online');
    authUrl.searchParams.set('prompt', 'select_account');

    if (config.allowedDomains.length === 1 && !config.allowedDomains[0].includes('*')) {
      authUrl.searchParams.set('hd', config.allowedDomains[0].replace(/^@/, ''));
    }

    res.redirect(authUrl.toString());
  } catch (error: any) {
    logger.error({ error }, 'Failed to generate Google OAuth login URL');
    res.status(500).json({ error: 'OAuthInitFailed', message: error.message });
  }
});

/**
 * GET /api/auth/callback
 * Handles Google OAuth callback and issues session.
 */
authApiRouter.get('/callback', async (req: Request, res: Response) => {
  const { code, error } = req.query;

  if (error) {
    logger.warn({ error }, 'Google OAuth error returned to callback');
    const isCompleted = await runtimeConfig.isSetupCompleted();
    if (!isCompleted) {
      return res.redirect('/admin/setup');
    }
    return res.redirect(`/admin/login?error=${encodeURIComponent(String(error))}`);
  }

  if (!code || typeof code !== 'string') {
    const isCompleted = await runtimeConfig.isSetupCompleted();
    if (!isCompleted) {
      return res.redirect('/admin/setup');
    }
    return res.redirect('/admin/login?error=missing_code');
  }

  try {
    const config = await getGoogleOAuthConfig(req);
    if (!config.isConfigured) {
      return res.redirect('/admin/login?error=google_oauth_not_configured');
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId!,
        client_secret: config.clientSecret!,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      logger.error({ errorBody }, 'Failed to exchange Google OAuth code for tokens');
      return res.redirect('/admin/login?error=token_exchange_failed');
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string; id_token: string };

    // Fetch user profile from Google
    const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userinfoResponse.ok) {
      return res.redirect('/admin/login?error=failed_to_fetch_profile');
    }

    const profile = (await userinfoResponse.json()) as {
      email: string;
      name?: string;
      hd?: string;
      picture?: string;
    };

    const email = profile.email.toLowerCase();
    const emailDomain = email.split('@')[1];

    // Domain validation check
    if (config.allowedDomains.length > 0 && !config.allowedDomains.includes('*')) {
      const isAllowed = config.allowedDomains.some((d) => {
        const cleanDomain = d.replace(/^@/, '').toLowerCase();
        return emailDomain === cleanDomain;
      });

      if (!isAllowed) {
        logger.warn({ email, emailDomain, allowedDomains: config.allowedDomains }, 'Login rejected due to email domain mismatch');
        return res.redirect('/admin/login?error=domain_not_authorized');
      }
    }

    // Check or bootstrap user access record
    let user = await runtimeConfig.getUserAccess(email);
    if (!user) {
      // Auto-register first user as admin, subsequent as standard admin/users
      const allUsers = await runtimeConfig.getAllUsers();
      const isFirst = allUsers.length === 0 || allUsers.every((u) => u.userEmail === 'admin@company.com');

      user = await runtimeConfig.createUserAccess(
        {
          userEmail: email,
          fullName: profile.name || email.split('@')[0],
          isAdmin: isFirst,
          isEnabled: true,
          allowedServices: ['xero', 'bigquery', 'firestore', 'sagehr', 'slack'],
          readOnlyOnly: false,
        },
        'google-oauth'
      );
    }

    if (!user.isEnabled) {
      return res.redirect('/admin/login?error=account_disabled');
    }

    // Create session in Firestore
    const sessionId = crypto.randomUUID();
    await runtimeConfig.createSession({
      sessionId,
      userEmail: email,
      fullName: profile.name || user.fullName,
      role: user.isAdmin ? 'ADMIN' : 'USER',
      ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1',
      userAgent: req.get('user-agent') || 'Unknown',
      ttlHours: 8,
    });

    // Set secure HttpOnly session cookie
    const isHttps = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
    res.cookie(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
      path: '/',
    });

    await runtimeConfig.logAudit('ADMIN_LOGIN', email, `sessions/${sessionId}`, {
      action: 'LOGIN_SUCCESS',
      provider: 'google_oidc',
    });

    res.redirect('/admin/');
  } catch (err: any) {
    logger.error({ error: err }, 'Unexpected error in Google OAuth callback');
    res.redirect(`/admin/login?error=${encodeURIComponent(err.message || 'unknown_error')}`);
  }
});

/**
 * POST /api/auth/dev-login
 * Developer convenience login endpoint for local testing and initial setup.
 */
authApiRouter.post('/dev-login', async (req: Request, res: Response) => {
  // Strict Security Guardrail: Developer login is NEVER permitted in production
  if (process.env.NODE_ENV === 'production') {
    logger.warn({ ip: req.ip }, 'Blocked dev-login attempt in production environment');
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Local developer login is strictly disabled in production. Authenticate via Google Workspace SSO.',
    });
  }

  const { email = 'admin@company.com', fullName = 'System Administrator' } = req.body || {};
  const cleanEmail = String(email).trim().toLowerCase();

  let user = await runtimeConfig.getUserAccess(cleanEmail);
  if (!user) {
    user = await runtimeConfig.createUserAccess(
      {
        userEmail: cleanEmail,
        fullName: fullName || cleanEmail.split('@')[0],
        isAdmin: true,
        isEnabled: true,
        allowedServices: ['xero', 'bigquery', 'firestore', 'sagehr', 'slack'],
        readOnlyOnly: false,
      },
      'dev-login'
    );
  } else {
    // In dev-login mode, ensure local test user is enabled and has admin privileges
    if (!user.isEnabled) {
      user = await runtimeConfig.toggleUserAccess(cleanEmail, true, 'dev-login');
    }
    if (!user.isAdmin) {
      user = await runtimeConfig.updateUserPermissions(cleanEmail, { isAdmin: true }, 'dev-login');
    }
  }

  const sessionId = crypto.randomUUID();
  const session = await runtimeConfig.createSession({
    sessionId,
    userEmail: cleanEmail,
    fullName: user.fullName,
    role: user.isAdmin ? 'ADMIN' : 'USER',
    ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1',
    userAgent: req.get('user-agent') || 'Unknown',
    ttlHours: 8,
  });

  const isHttps = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });

  await runtimeConfig.logAudit('ADMIN_LOGIN', cleanEmail, `sessions/${sessionId}`, {
    action: 'DEV_LOGIN_SUCCESS',
    role: user.isAdmin ? 'ADMIN' : 'USER',
  });

  res.json({
    success: true,
    sessionId,
    user: {
      email: user.userEmail,
      fullName: user.fullName,
      isAdmin: user.isAdmin,
      allowedServices: user.allowedServices,
      readOnlyOnly: user.readOnlyOnly,
    },
    sessionExpiresAt: session.expiresAt,
  });
});

/**
 * GET /api/auth/me
 * Retrieves current admin profile & active session metadata.
 */
authApiRouter.get('/me', requireAdminAuth, async (req: Request, res: Response) => {
  const admin = req.adminUser!;
  res.json({
    email: admin.email,
    fullName: admin.fullName,
    isAdmin: admin.isAdmin,
    isEnabled: admin.isEnabled,
    allowedServices: admin.allowedServices,
    readOnlyOnly: admin.readOnlyOnly,
    sessionId: admin.sessionId,
    sessionExpiresAt: admin.session.expiresAt,
  });
});

/**
 * POST /api/auth/logout
 * Revokes current session and clears cookie.
 */
authApiRouter.post('/logout', async (req: Request, res: Response) => {
  const sessionId = req.cookies?.[SESSION_COOKIE_NAME] || req.adminUser?.sessionId;

  if (sessionId) {
    await runtimeConfig.revokeSession(sessionId);
  }

  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * POST /api/auth/revoke-all
 * Emergency action to revoke all active sessions.
 */
authApiRouter.post('/revoke-all', requireAdminAuth, async (req: Request, res: Response) => {
  const actorEmail = req.adminUser!.email;
  const count = await runtimeConfig.revokeAllSessions();

  await runtimeConfig.logAudit('SESSION_REVOKE', actorEmail, 'sessions/*', {
    revokedCount: count,
  });

  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({
    success: true,
    revokedSessionsCount: count,
    message: 'All active sessions have been terminated. Please log in again.',
  });
});
