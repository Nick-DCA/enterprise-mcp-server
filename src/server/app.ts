import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { requestLoggerMiddleware } from './middleware/logger.js';
import { acceptHeaderMiddleware } from './middleware/acceptHeader.js';
import { createBearerAuthMiddleware } from './middleware/bearerAuth.js';
import { globalErrorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { handleMcpRequest } from './routes/mcp.js';
import { createOAuthRouter } from './routes/oauth.js';
import { adminApiRouter } from './routes/api/index.js';
import { OAuthService } from '../auth/oauthService.js';
import { McpAuthConfig } from '../auth/types.js';
import { logger } from '../utils/logger.js';

export interface CreateAppOptions {
  oauthService?: OAuthService;
  authConfig?: McpAuthConfig;
}

export function createApp(options?: CreateAppOptions): express.Application {
  const app = express();

  // Enable JSON and URL-encoded form parsing, cookies, and CORS
  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Mount request logging middleware
  app.use(requestLoggerMiddleware);

  // Favicon handlers (Sierpinski Fractal)
  const faviconPngPath = path.resolve(process.cwd(), 'frontend', 'public', 'favicon.png');
  const faviconIcoPath = path.resolve(process.cwd(), 'frontend', 'public', 'favicon.ico');
  const faviconSvgPath = path.resolve(process.cwd(), 'frontend', 'public', 'favicon.svg');

  app.get(['/favicon.ico', '/favicon.png'], (_req, res) => {
    if (fs.existsSync(faviconIcoPath)) {
      res.sendFile(faviconIcoPath);
    } else if (fs.existsSync(faviconPngPath)) {
      res.type('image/png').sendFile(faviconPngPath);
    } else if (fs.existsSync(faviconSvgPath)) {
      res.type('image/svg+xml').sendFile(faviconSvgPath);
    } else {
      res.status(204).end();
    }
  });

  app.get('/favicon.svg', (_req, res) => {
    if (fs.existsSync(faviconSvgPath)) {
      res.type('image/svg+xml').sendFile(faviconSvgPath);
    } else {
      res.status(204).end();
    }
  });

  // Public Health check route
  app.use(healthRouter);

  // Public OAuth 2.0 endpoints for Gemini Enterprise (/oauth/authorize, /oauth/token)
  app.use('/oauth', createOAuthRouter(options?.oauthService));

  // Admin REST API Endpoints (/api/*)
  app.use('/api', adminApiRouter);

  // Static Frontend SPA Serving (/admin/*)
  const frontendDistPath = path.resolve(process.cwd(), 'frontend', 'dist');
  const hasFrontendDist = fs.existsSync(frontendDistPath);

  if (hasFrontendDist) {
    // Serve static frontend assets under /admin and /assets
    app.use('/admin', express.static(frontendDistPath));
    app.use('/assets', express.static(path.join(frontendDistPath, 'assets')));

    // Handle React Router SPA client-side routes under /admin/*
    app.get(['/admin', '/admin/*'], (_req, res) => {
      res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
  } else {
    // Fallback info page if frontend has not been compiled yet
    app.get(['/admin', '/admin/*'], (_req, res) => {
      res.type('html').send(`
        <!DOCTYPE html>
        <html>
          <head><title>Admin Portal - Setup</title></head>
          <body style="font-family: system-ui, sans-serif; background: #0B0F17; color: #E2E8F0; padding: 3rem; max-width: 650px; margin: 0 auto;">
            <h2 style="color: #38BDF8;">🛠️ Admin Portal SPA Build Pending</h2>
            <p>The Admin Portal REST API is live under <code>/api/*</code>. To access the web frontend, run:</p>
            <pre style="background: #1E293B; padding: 1rem; border-radius: 8px; color: #34D399;">cd frontend && npm install && npm run build</pre>
            <p>Once built, the React dashboard will automatically render at this URL.</p>
          </body>
        </html>
      `);
    });
  }

  // Dynamic portal theme stylesheet endpoint (serves the active CSS tokens and styles)
  app.get(['/theme.css', '/assets/theme.css'], (_req, res) => {
    // 1. Check compiled frontend dist assets
    if (fs.existsSync(frontendDistPath)) {
      const assetsDir = path.join(frontendDistPath, 'assets');
      if (fs.existsSync(assetsDir)) {
        try {
          const cssFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.css'));
          if (cssFiles.length > 0) {
            res.type('text/css').sendFile(path.join(assetsDir, cssFiles[0]));
            return;
          }
        } catch {}
      }
    }
    // 2. Fallback to source index.css
    const srcCssPath = path.resolve(process.cwd(), 'frontend', 'src', 'index.css');
    if (fs.existsSync(srcCssPath)) {
      res.type('text/css').sendFile(srcCssPath);
      return;
    }
    res.status(404).type('text/plain').send('/* Theme stylesheet not found */');
  });

  // Public Root landing page
  app.get('/', (_req, res) => {
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
          <title>Enterprise Multi-SaaS MCP Gateway</title>
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
                    
                    var indicator = document.getElementById('theme-indicator');
                    if (indicator) {
                      var presetName = cfg.preset ? cfg.preset.replace('-', ' ') : 'minimal dark';
                      var accentName = cfg.accent || 'mono';
                      indicator.textContent = 'Theme: ' + presetName.toUpperCase() + ' (' + accentName + ')';
                    }
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
            .landing-card {
              background: var(--bg-card, #18181B);
              border: var(--card-border-width, 1px) solid var(--border-subtle, #27272A);
              backdrop-filter: var(--backdrop-blur, none);
              border-radius: var(--radius-lg, 12px);
              max-width: 680px;
              width: 100%;
              padding: 2.75rem 2.5rem;
              box-shadow: var(--shadow-lg, 0 10px 30px rgba(0, 0, 0, 0.4));
              transition: border-color 0.2s ease, box-shadow 0.2s ease;
            }
            .landing-card:hover {
              border-color: var(--border-active, #3F3F46);
            }
            .brand-badge-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 1.25rem;
              flex-wrap: wrap;
              gap: 0.5rem;
            }
            .badge-pulse {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              background: rgba(16, 185, 129, 0.12);
              color: var(--emerald-bright, #34D399);
              border: 1px solid rgba(16, 185, 129, 0.3);
              padding: 4px 12px;
              border-radius: var(--radius-full, 9999px);
              font-size: 0.725rem;
              font-weight: 700;
              letter-spacing: 0.05em;
              text-transform: uppercase;
            }
            .pulse-dot {
              width: 7px;
              height: 7px;
              border-radius: 50%;
              background: var(--emerald-primary, #10B981);
              box-shadow: 0 0 8px var(--emerald-primary, #10B981);
            }
            .theme-tag {
              font-size: 0.725rem;
              font-family: var(--font-mono, monospace);
              color: var(--text-muted, #71717A);
              letter-spacing: 0.03em;
            }
            h1 {
              font-size: 1.85rem;
              font-weight: 800;
              letter-spacing: -0.03em;
              color: var(--text-primary, #FAFAFA);
              margin-bottom: 0.75rem;
              line-height: 1.2;
            }
            p.lead {
              color: var(--text-secondary, #A1A1AA);
              font-size: 0.95rem;
              line-height: 1.6;
              margin-bottom: 1.75rem;
            }
            .connectors-strip {
              display: flex;
              flex-wrap: wrap;
              gap: 0.5rem;
              margin-bottom: 2rem;
              padding: 0.75rem 1rem;
              background: var(--bg-input, #121215);
              border: 1px solid var(--border-subtle, #27272A);
              border-radius: var(--radius-md, 6px);
            }
            .connector-chip {
              font-size: 0.75rem;
              font-family: var(--font-mono, monospace);
              color: var(--text-secondary, #A1A1AA);
              display: inline-flex;
              align-items: center;
              gap: 4px;
            }
            .connector-chip strong {
              color: var(--text-primary, #FAFAFA);
            }
            .connector-chip::after {
              content: "•";
              margin-left: 6px;
              color: var(--border-active, #3F3F46);
            }
            .connector-chip:last-child::after {
              content: "";
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
              gap: 1rem;
              margin-bottom: 2rem;
            }
            .action-card {
              display: flex;
              flex-direction: column;
              padding: 1.25rem 1.35rem;
              border-radius: var(--radius-md, 6px);
              text-decoration: none;
              transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
            }
            .action-primary {
              background: var(--accent-primary, #FAFAFA);
              color: var(--accent-contrast, #09090B);
              border: 1px solid transparent;
            }
            .action-primary:hover {
              transform: translateY(-2px);
              background: var(--accent-bright, #FFFFFF);
              box-shadow: 0 10px 20px -5px var(--accent-glow, rgba(250, 250, 250, 0.25));
            }
            .action-secondary {
              background: var(--bg-card-hover, #27272A);
              color: var(--text-primary, #FAFAFA);
              border: 1px solid var(--border-subtle, #27272A);
            }
            .action-secondary:hover {
              transform: translateY(-2px);
              background: var(--bg-elevated, #3F3F46);
              border-color: var(--border-active, #52525B);
            }
            .action-title {
              font-weight: 700;
              font-size: 1.05rem;
              display: flex;
              align-items: center;
              gap: 0.5rem;
            }
            .action-desc {
              font-size: 0.8rem;
              font-weight: 400;
              opacity: 0.85;
              margin-top: 0.35rem;
              line-height: 1.4;
            }
            .footer-info {
              display: flex;
              justify-content: space-between;
              font-size: 0.775rem;
              color: var(--text-muted, #71717A);
              border-top: 1px solid var(--border-subtle, #27272A);
              padding-top: 1.25rem;
              flex-wrap: wrap;
              gap: 0.5rem;
            }
            .footer-info code {
              font-family: var(--font-mono, monospace);
              color: var(--text-secondary, #A1A1AA);
              background: var(--bg-input, #121215);
              padding: 2px 6px;
              border-radius: var(--radius-sm, 3px);
              border: 1px solid var(--border-subtle, #27272A);
            }
          </style>
        </head>
        <body>
          <div class="landing-card">
            <div class="brand-badge-row">
              <div class="badge-pulse"><span class="pulse-dot"></span> System Operational</div>
              <span id="theme-indicator" class="theme-tag">Theme: Minimal Dark</span>
            </div>

            <h1>Enterprise Multi-SaaS MCP Gateway</h1>
            <p class="lead">Unified Model Context Protocol gateway hosting 61 tools across Xero Accounting, Google BigQuery, Cloud Firestore, Sage HR, and Slack Federated Search for Google Gemini Enterprise.</p>
            
            <div class="connectors-strip">
              <span class="connector-chip"><strong>BigQuery</strong> (5)</span>
              <span class="connector-chip"><strong>Xero</strong> (36)</span>
              <span class="connector-chip"><strong>Firestore</strong> (6)</span>
              <span class="connector-chip"><strong>Sage HR</strong> (12)</span>
              <span class="connector-chip"><strong>Slack</strong> (2)</span>
            </div>

            <div class="grid">
              <a href="/admin" class="action-card action-primary">
                <span class="action-title">Administration Portal</span>
                <span class="action-desc">Configure multi-instance SaaS cards, secret vaults, &amp; IAM permissions</span>
              </a>
              <a href="/healthz" class="action-card action-secondary">
                <span class="action-title">System Health Status</span>
                <span class="action-desc">Check runtime diagnostic health &amp; GCP Secret Manager status</span>
              </a>
            </div>

            <div class="footer-info">
              <span>StreamableHTTP: <code>/mcp</code></span>
              <span>OAuth PKCE: <code>/oauth/*</code></span>
              <span>REST API: <code>/api/*</code></span>
            </div>
          </div>
        </body>
      </html>
    `);
  });

  // Bearer authentication middleware for protected MCP routes
  const authMiddleware = createBearerAuthMiddleware(options?.authConfig);

  // Normalize Accept header for MCP SDK compatibility
  app.use(acceptHeaderMiddleware);

  // Protected MCP protocol HTTP endpoints
  app.post(['/mcp', '/'], authMiddleware, handleMcpRequest);
  app.get('/mcp', authMiddleware, handleMcpRequest);
  app.delete(['/mcp', '/'], authMiddleware, handleMcpRequest);

  // Fallback 404 handler
  app.use((req, res) => {
    logger.warn(
      { method: req.method, path: req.path, url: req.url },
      `[HTTP 404] Unmatched route hit: ${req.method} ${req.url}`
    );
    res.status(404).json({
      status: 'error',
      message: `Route ${req.method} ${req.path} not found on this MCP server. Available endpoints: /admin, /api/*, /mcp, /oauth/*, /healthz`,
    });
  });

  // Global error handler
  app.use(globalErrorHandler);

  return app;
}
