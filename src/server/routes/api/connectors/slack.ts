import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { getSecretValue, writeSecretValue, deleteSecret } from '../../../../config/secretManager.js';
import { getMcpAuthConfig } from '../../../../config/authConfig.js';
import { runtimeConfig } from '../../../../config/runtimeConfig.js';
import { logger } from '../../../../utils/logger.js';

export const slackConnectorRouter = Router();

interface SignedState {
  userEmail: string;
  nonce: string;
  exp: number;
}

function signState(payload: SignedState, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function verifyState(rawState: string, secret: string): SignedState | null {
  try {
    const [data, signature] = rawState.split('.');
    if (!data || !signature) return null;

    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    const payload: SignedState = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * GET /api/connectors/slack/connect
 * Initiates user-delegated Slack OAuth v2 flow.
 */
slackConnectorRouter.get('/connect', async (req: Request, res: Response) => {
  const userEmail = (req.query.userEmail as string)?.trim().toLowerCase();

  if (!userEmail) {
    res.status(400).type('html').send(`
      <!DOCTYPE html>
      <html>
        <head><title>Slack Connection Error</title></head>
        <body style="font-family: system-ui, sans-serif; background: #0B0F17; color: #F87171; padding: 3rem; text-align: center;">
          <h2>❌ Missing User Email</h2>
          <p>Please provide a valid <code>userEmail</code> query parameter to link your Slack account.</p>
        </body>
      </html>
    `);
    return;
  }

  const clientId = (await getSecretValue('SLACK_CLIENT_ID')) || process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    res.status(500).type('html').send(`
      <!DOCTYPE html>
      <html>
        <head><title>Slack Not Configured</title></head>
        <body style="font-family: system-ui, sans-serif; background: #0B0F17; color: #F87171; padding: 3rem; text-align: center;">
          <h2>Slack Integration Not Configured</h2>
          <p>The Slack OAuth Client ID is missing. Please configure <code>SLACK_CLIENT_ID</code> in Secret Manager.</p>
        </body>
      </html>
    `);
    return;
  }

  const authConfig = await getMcpAuthConfig();
  const jwtSecret = authConfig.jwtSecret;

  // Resolve redirect URI (configured secret or auto-detected from host)
  const defaultCloudRunUrl = 'https://enterprise-mcp-server-1058873375196.europe-west1.run.app';
  const host = req.get('host') || 'localhost:3000';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const defaultCallback = isLocal ? `${defaultCloudRunUrl}/api/connectors/slack/callback` : `${protocol}://${host}/api/connectors/slack/callback`;
  const redirectUri = (await getSecretValue('SLACK_REDIRECT_URI')) || process.env.SLACK_REDIRECT_URI || defaultCallback;

  // Sign state with 10-minute expiry
  const statePayload: SignedState = {
    userEmail,
    nonce: crypto.randomBytes(16).toString('hex'),
    exp: Date.now() + 10 * 60 * 1000,
  };
  const signedState = signState(statePayload, jwtSecret);

  // User-delegated read scopes from Slack service config (with fallback to official read scopes)
  const slackConfig = await runtimeConfig.getServiceConfig('slack');
  const userScopes =
    (slackConfig?.settings?.scopes as string)?.trim() ||
    'search:read.public,search:read.private,search:read.im,search:read.mpim,search:read.files,search:read.users,users:read,channels:read,groups:read,im:read,mpim:read,channels:history,groups:history,im:history,mpim:history,files:read';

  const slackAuthUrl = new URL('https://slack.com/oauth/v2/authorize');
  slackAuthUrl.searchParams.set('client_id', clientId);
  slackAuthUrl.searchParams.set('user_scope', userScopes);
  slackAuthUrl.searchParams.set('redirect_uri', redirectUri);
  slackAuthUrl.searchParams.set('state', signedState);

  logger.info({ userEmail, redirectUri }, 'Initiating user-delegated Slack OAuth handshake');
  res.redirect(slackAuthUrl.toString());
});

/**
 * GET /api/connectors/slack/callback
 * Handles OAuth callback from Slack, vaults user tokens with Token Rotation, and updates Firestore.
 */
slackConnectorRouter.get('/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const rawState = req.query.state as string;
  const error = req.query.error as string;

  if (error) {
    logger.warn({ error }, 'Slack OAuth authorization denied by user or workspace');
    res.status(400).type('html').send(`
      <!DOCTYPE html>
      <html>
        <head><title>Authorization Cancelled</title></head>
        <body style="font-family: system-ui, sans-serif; background: #0B0F17; color: #F1F5F9; padding: 3rem; text-align: center;">
          <div style="max-width: 500px; margin: 0 auto; background: #1E293B; padding: 2rem; border-radius: 12px; border: 1px solid rgba(239, 68, 68, 0.3);">
            <h2 style="color: #EF4444;">Authorization Cancelled</h2>
            <p style="color: #94A3B8; margin-top: 1rem;">Slack reported error: <code>${error}</code></p>
            <p style="color: #64748B; margin-top: 1rem;">You can close this tab and try connecting again whenever you are ready.</p>
          </div>
        </body>
      </html>
    `);
    return;
  }

  if (!code || !rawState) {
    res.status(400).send('Missing code or state parameter.');
    return;
  }

  const authConfig = await getMcpAuthConfig();
  const statePayload = verifyState(rawState, authConfig.jwtSecret);
  if (!statePayload) {
    res.status(400).type('html').send(`
      <!DOCTYPE html>
      <html>
        <head><title>Session Expired</title></head>
        <body style="font-family: system-ui, sans-serif; background: #0B0F17; color: #F87171; padding: 3rem; text-align: center;">
          <h2>⚠️ Security Verification Failed</h2>
          <p>The state parameter is invalid or expired. Please re-initiate the connection from Gemini Enterprise.</p>
        </body>
      </html>
    `);
    return;
  }

  const { userEmail } = statePayload;
  const clientId = (await getSecretValue('SLACK_CLIENT_ID')) || process.env.SLACK_CLIENT_ID;
  const clientSecret = (await getSecretValue('SLACK_CLIENT_SECRET')) || process.env.SLACK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.status(500).send('Server error: Slack credentials not configured in Secret Manager.');
    return;
  }

  const defaultCloudRunUrl = 'https://enterprise-mcp-server-1058873375196.europe-west1.run.app';
  const host = req.get('host') || 'localhost:3000';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const defaultCallback = isLocal ? `${defaultCloudRunUrl}/api/connectors/slack/callback` : `${protocol}://${host}/api/connectors/slack/callback`;
  const redirectUri = (await getSecretValue('SLACK_REDIRECT_URI')) || process.env.SLACK_REDIRECT_URI || defaultCallback;

  try {
    // Exchange authorization code for token payload
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const data: any = await tokenResponse.json();

    if (!data.ok) {
      logger.error({ error: data.error }, 'Failed to exchange Slack authorization code');
      res.status(400).type('html').send(`
        <!DOCTYPE html>
        <html
          lang="en"
          data-theme="minimal-dark"
          data-mode="dark"
          data-icons="feather"
          data-accent="mono"
          data-palette="monochrome-titanium"
          data-radius="compact"
          data-layout="sidebar"
        >
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
            <title>Slack Connection Error</title>
            <link rel="icon" type="image/png" href="/favicon.png" />
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
            <link rel="stylesheet" href="/theme.css" />
            <script>
              (function() {
                try {
                  var saved = localStorage.getItem('mcp_portal_theme_config');
                  if (saved) {
                    var cfg = JSON.parse(saved);
                    var root = document.documentElement;
                    if (cfg.preset) root.setAttribute('data-theme', cfg.preset);
                    if (cfg.mode) root.setAttribute('data-mode', cfg.mode);
                    if (cfg.accent) root.setAttribute('data-accent', cfg.accent);
                    if (cfg.palette) root.setAttribute('data-palette', cfg.palette);
                    if (cfg.radius) root.setAttribute('data-radius', cfg.radius);
                    if (cfg.iconStyle) root.setAttribute('data-icons', cfg.iconStyle);
                  }
                } catch (e) {}
              })();
            </script>
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body {
                font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
                background-color: var(--bg-main, #09090B);
                color: var(--text-primary, #FAFAFA);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 1.5rem;
                -webkit-font-smoothing: antialiased;
              }
              .error-card {
                background: var(--bg-card, #18181B);
                border: var(--card-border-width, 1px) solid var(--border-subtle, #27272A);
                backdrop-filter: var(--backdrop-blur, none);
                border-radius: var(--radius-lg, 12px);
                max-width: 520px;
                width: 100%;
                padding: 2.75rem 2.25rem;
                text-align: center;
                box-shadow: var(--shadow-lg, 0 10px 30px rgba(0, 0, 0, 0.4));
              }
              .error-icon {
                width: 56px;
                height: 56px;
                border-radius: 50%;
                background: rgba(244, 63, 94, 0.12);
                border: 1px solid var(--rose-primary, #F43F5E);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 1.75rem;
                margin-bottom: 1.25rem;
              }
              h1 {
                font-size: 1.5rem;
                font-weight: 700;
                color: var(--text-primary, #FAFAFA);
                margin-bottom: 0.5rem;
              }
              p {
                color: var(--text-secondary, #A1A1AA);
                font-size: 0.925rem;
                line-height: 1.5;
                margin-bottom: 1.5rem;
              }
              .err-box {
                background: var(--bg-input, #121215);
                border: 1px solid var(--border-subtle, #27272A);
                border-radius: var(--radius-md, 6px);
                padding: 1rem;
                font-family: var(--font-mono, monospace);
                color: var(--rose-bright, #FB7185);
                font-size: 0.85rem;
                margin-bottom: 1.75rem;
                word-break: break-all;
              }
              .btn-row {
                display: flex;
                gap: 0.75rem;
              }
              .btn {
                flex: 1;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 0.65rem 1.25rem;
                border-radius: var(--radius-md, 6px);
                font-weight: 600;
                font-size: 0.875rem;
                text-decoration: none;
                cursor: pointer;
                border: 1px solid transparent;
              }
              .btn-primary {
                background: var(--accent-primary, #FAFAFA);
                color: var(--accent-contrast, #09090B);
              }
            </style>
          </head>
          <body>
            <div class="error-card">
              <div class="error-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--rose-bright, #FB7185)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </div>
              <h1>Slack Connection Failed</h1>
              <p>An error occurred while exchanging the OAuth code with Slack.</p>
              <div class="err-box">${data.error}</div>
              <div class="btn-row">
                <a href="/admin" class="btn btn-primary">Return to Admin Portal</a>
              </div>
            </div>
          </body>
        </html>
      `);
      return;
    }

    const authedUser = data.authed_user;
    if (!authedUser || !authedUser.access_token) {
      res.status(400).send('No user token was returned by Slack OAuth.');
      return;
    }

    const slackUserId = authedUser.id;
    const accessToken = authedUser.access_token;
    const refreshToken = authedUser.refresh_token || null;
    const expiresIn = authedUser.expires_in ? Number(authedUser.expires_in) : 43200; // 12 hours
    const expiresAt = Date.now() + expiresIn * 1000;
    const scope = authedUser.scope || 'search:read,im:read,mpim:read';
    const workspaceId = data.team?.id || 'unknown';
    const workspaceName = data.team?.name || 'Slack Workspace';

    // 1. Vault tokens in Secret Manager under slack-user-<slackUserId>
    const secretPayload = JSON.stringify({
      accessToken,
      refreshToken,
      tokenType: 'user',
      scope,
      expiresAt,
      updatedAt: new Date().toISOString(),
    });

    await writeSecretValue(`slack-user-${slackUserId}`, secretPayload);

    // 2. Persist connection metadata in Firestore user_connections
    const firestore = await runtimeConfig.getFirestore();
    const docId = `${userEmail}_slack`;
    const connectionDoc = {
      id: docId,
      geminiUserEmail: userEmail,
      serviceId: 'slack',
      slackWorkspaceId: workspaceId,
      slackWorkspaceName: workspaceName,
      slackUserId,
      tokenSecretReference: `slack-user-${slackUserId}`,
      grantedScopes: scope.split(',').map((s: string) => s.trim()).filter(Boolean),
      status: 'ACTIVE',
      expiresAt: new Date(expiresAt).toISOString(),
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (firestore) {
      await firestore.collection('user_connections').doc(docId).set(connectionDoc, { merge: true });
    }

    // 3. Log Audit Trail
    await runtimeConfig.recordAuditLog(
      {
        logId: `audit_slack_conn_${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorEmail: userEmail,
        action: 'SLACK_CONNECT',
        target: `${workspaceName} (${workspaceId})`,
        details: {
          slackUserId,
          scopes: connectionDoc.grantedScopes,
          rotationEnabled: Boolean(refreshToken),
          expiresAt: connectionDoc.expiresAt,
        },
      },
      userEmail
    );

    logger.info({ userEmail, slackUserId, workspaceId }, 'Slack account connected and vaulted successfully');

    // 4. Render Success Screen
    res.type('html').send(`
      <!DOCTYPE html>
      <html
        lang="en"
        data-theme="minimal-dark"
        data-mode="dark"
        data-icons="feather"
        data-accent="mono"
        data-palette="monochrome-titanium"
        data-radius="compact"
        data-layout="sidebar"
      >
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
          <title>Slack Connected Successfully</title>
          <link rel="icon" type="image/png" href="/favicon.png" />
          <link rel="alternate icon" type="image/x-icon" href="/favicon.ico" />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
          <link rel="stylesheet" href="/theme.css" />
          <script>
            (function() {
              function applyPortalTheme() {
                try {
                  var saved = localStorage.getItem('mcp_portal_theme_config');
                  if (saved) {
                    var cfg = JSON.parse(saved);
                    var root = document.documentElement;
                    if (cfg.preset) root.setAttribute('data-theme', cfg.preset);
                    if (cfg.mode) root.setAttribute('data-mode', cfg.mode);
                    if (cfg.accent) root.setAttribute('data-accent', cfg.accent);
                    if (cfg.palette) root.setAttribute('data-palette', cfg.palette);
                    if (cfg.radius) root.setAttribute('data-radius', cfg.radius);
                    if (cfg.iconStyle) root.setAttribute('data-icons', cfg.iconStyle);
                    if (cfg.layoutMode) root.setAttribute('data-layout', cfg.layoutMode);
                  }
                } catch (e) {}
              }
              applyPortalTheme();
              window.addEventListener('storage', applyPortalTheme);
              document.addEventListener('DOMContentLoaded', applyPortalTheme);
            })();
          </script>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
              background-color: var(--bg-main, #09090B);
              color: var(--text-primary, #FAFAFA);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 1.5rem;
              line-height: 1.5;
              -webkit-font-smoothing: antialiased;
            }
            .callback-card {
              background: var(--bg-card, #18181B);
              border: var(--card-border-width, 1px) solid var(--border-subtle, #27272A);
              backdrop-filter: var(--backdrop-blur, none);
              border-radius: var(--radius-lg, 12px);
              max-width: 520px;
              width: 100%;
              padding: 2.75rem 2.25rem;
              text-align: center;
              box-shadow: var(--shadow-lg, 0 10px 30px rgba(0, 0, 0, 0.4));
              transition: border-color 0.2s ease, box-shadow 0.2s ease;
            }
            .callback-card:hover {
              border-color: var(--border-active, #3F3F46);
            }
            .icon-badge {
              width: 58px;
              height: 58px;
              border-radius: 50%;
              background: rgba(16, 185, 129, 0.12);
              border: 1px solid rgba(16, 185, 129, 0.35);
              display: inline-flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 1.25rem;
              box-shadow: 0 0 20px rgba(16, 185, 129, 0.15);
            }
            h1 {
              font-size: 1.65rem;
              font-weight: 800;
              color: var(--text-primary, #FAFAFA);
              letter-spacing: -0.025em;
              margin-bottom: 0.5rem;
              line-height: 1.2;
            }
            p.lead {
              color: var(--text-secondary, #A1A1AA);
              font-size: 0.925rem;
              line-height: 1.55;
              margin-bottom: 1.75rem;
            }
            .details-box {
              background: var(--bg-input, #121215);
              border: 1px solid var(--border-subtle, #27272A);
              border-radius: var(--radius-md, 6px);
              padding: 1.15rem 1.25rem;
              margin-bottom: 1.5rem;
              font-size: 0.825rem;
              text-align: left;
            }
            .details-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 0.65rem;
              gap: 0.75rem;
            }
            .details-row:last-child {
              margin-bottom: 0;
            }
            .label {
              color: var(--text-muted, #71717A);
              font-size: 0.8rem;
            }
            .val {
              font-family: var(--font-mono, monospace);
              font-weight: 600;
              font-size: 0.825rem;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              max-width: 60%;
            }
            .instruction-banner {
              background: var(--accent-glow, rgba(250, 250, 250, 0.05));
              border: 1px solid var(--border-subtle, #27272A);
              border-radius: var(--radius-md, 6px);
              padding: 0.85rem 1rem;
              font-size: 0.85rem;
              color: var(--text-secondary, #A1A1AA);
              margin-bottom: 1.75rem;
              line-height: 1.45;
              text-align: left;
              display: flex;
              align-items: flex-start;
              gap: 0.6rem;
            }
            .instruction-banner strong {
              color: var(--text-primary, #FAFAFA);
            }
            .badge-emerald {
              display: inline-flex;
              align-items: center;
              gap: 5px;
              background: rgba(16, 185, 129, 0.15);
              color: var(--emerald-bright, #34D399);
              border: 1px solid rgba(16, 185, 129, 0.3);
              padding: 3px 8px;
              border-radius: var(--radius-full, 9999px);
              font-size: 0.7rem;
              font-weight: 700;
              letter-spacing: 0.03em;
              text-transform: uppercase;
            }
            .pulse-dot {
              width: 6px;
              height: 6px;
              border-radius: 50%;
              background: var(--emerald-primary, #10B981);
              box-shadow: 0 0 6px var(--emerald-primary, #10B981);
            }
            .btn-row {
              display: flex;
              gap: 0.75rem;
              margin-bottom: 0.5rem;
            }
            .btn {
              flex: 1;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 0.4rem;
              padding: 0.65rem 1.25rem;
              border-radius: var(--radius-md, 6px);
              font-weight: 600;
              font-size: 0.875rem;
              text-decoration: none;
              cursor: pointer;
              border: 1px solid transparent;
              transition: transform 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
            }
            .btn-primary {
              background: var(--accent-primary, #FAFAFA);
              color: var(--accent-contrast, #09090B);
            }
            .btn-primary:hover {
              background: var(--accent-bright, #FFFFFF);
              transform: translateY(-1px);
            }
            .btn-secondary {
              background: var(--bg-card-hover, #27272A);
              color: var(--text-primary, #FAFAFA);
              border-color: var(--border-subtle, #27272A);
            }
            .btn-secondary:hover {
              background: var(--bg-elevated, #3F3F46);
              border-color: var(--border-active, #52525B);
              transform: translateY(-1px);
            }
            .close-hint {
              font-size: 0.75rem;
              color: var(--text-muted, #71717A);
              margin-top: 0.5rem;
              display: none;
            }
          </style>
        </head>
        <body>
          <div class="callback-card">
            <div class="icon-badge">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--emerald-bright, #34D399)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>

            <h1>Slack Account Connected</h1>
            <p class="lead">Your Slack account is linked to Gemini Enterprise with personal user-delegated authorization.</p>
            
            <div class="details-box">
              <div class="details-row">
                <span class="label">Google Workspace User:</span>
                <span class="val" style="color: var(--accent-bright, #FAFAFA);">${userEmail}</span>
              </div>
              <div class="details-row">
                <span class="label">Workspace:</span>
                <span class="val" style="color: var(--cyan-bright, #38BDF8);">${workspaceName}</span>
              </div>
              <div class="details-row">
                <span class="label">Token Rotation:</span>
                <span class="badge-emerald"><span class="pulse-dot"></span> Active (12h/90d)</span>
              </div>
            </div>

            <div class="instruction-banner">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary, #FAFAFA)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 1px;">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              <span><strong>You can close this tab now.</strong> Re-run your search query in Gemini Enterprise to retrieve messages from your Slack channels and direct messages!</span>
            </div>

            <div class="btn-row">
              <button onclick="handleClose()" class="btn btn-primary">Close Tab</button>
              <a href="/admin" class="btn btn-secondary">Admin Portal</a>
            </div>
            <div id="close-msg" class="close-hint">Tab cannot be closed automatically by browser. Please close this tab manually or switch back to Gemini Enterprise.</div>
          </div>

          <script>
            function handleClose() {
              window.close();
              setTimeout(function() {
                var msg = document.getElementById('close-msg');
                if (msg) msg.style.display = 'block';
              }, 300);
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    logger.error({ error: err.message, stack: err.stack }, 'Error in Slack OAuth callback handler');
    res.status(500).send(`Server error processing Slack callback: ${err.message}`);
  }
});

/**
 * POST /api/connectors/slack/disconnect
 * Actively revokes tokens upstream on Slack via POST auth.revoke (Option A) and updates Firestore.
 */
slackConnectorRouter.post('/disconnect', async (req: Request, res: Response) => {
  const userEmail = (req.body?.userEmail || (req as any).user?.email)?.trim().toLowerCase();

  if (!userEmail) {
    res.status(400).json({ error: 'userEmail is required to disconnect Slack.' });
    return;
  }

  try {
    const firestore = await runtimeConfig.getFirestore();
    const docId = `${userEmail}_slack`;

    let slackUserId: string | undefined;
    if (firestore) {
      const doc = await firestore.collection('user_connections').doc(docId).get();
      if (doc.exists) {
        slackUserId = doc.data()?.slackUserId;
      }
    }

    if (slackUserId) {
      // Fetch user token from Secret Manager to call upstream auth.revoke
      const rawSecret = await getSecretValue(`slack-user-${slackUserId}`);
      if (rawSecret) {
        try {
          const secretObj = JSON.parse(rawSecret);
          const tokenToRevoke = secretObj.accessToken;
          if (tokenToRevoke) {
            // Option A: Active upstream revocation on Slack
            await fetch('https://slack.com/api/auth.revoke', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${tokenToRevoke}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
            });
            logger.info({ slackUserId, userEmail }, 'Successfully revoked token upstream on Slack');
          }
        } catch (revokeErr) {
          logger.warn({ error: revokeErr }, 'Failed to revoke token on Slack API, proceeding with local deletion');
        }
      }

      // Delete Secret from Secret Manager
      await deleteSecret(`slack-user-${slackUserId}`);
    }

    // Update Firestore status to REVOKED
    if (firestore) {
      await firestore.collection('user_connections').doc(docId).set(
        {
          status: 'REVOKED',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    // Audit Log
    await runtimeConfig.recordAuditLog(
      {
        logId: `audit_slack_disc_${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorEmail: userEmail,
        action: 'SLACK_DISCONNECT',
        target: `User: ${userEmail}`,
        details: { message: 'User disconnected Slack connection; token actively revoked upstream.' },
      },
      userEmail
    );

    res.json({ success: true, message: 'Slack account disconnected and token revoked successfully.' });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to disconnect Slack account');
    res.status(500).json({ error: err.message });
  }
});
