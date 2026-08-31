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
    // Serve static frontend assets under /admin
    app.use('/admin', express.static(frontendDistPath));

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

  // Public Root landing page
  app.get('/', (_req, res) => {
    res.type('html').send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Enterprise Multi-SaaS MCP Gateway</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              background: radial-gradient(circle at 50% 0%, #1E293B 0%, #0B0F17 75%);
              color: #F1F5F9;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 1.5rem;
            }
            .card {
              background: rgba(30, 41, 59, 0.7);
              backdrop-filter: blur(16px);
              border: 1px solid rgba(255, 255, 255, 0.1);
              border-radius: 16px;
              max-width: 680px;
              width: 100%;
              padding: 2.5rem;
              box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(56, 189, 248, 0.15);
            }
            .badge {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              background: rgba(16, 185, 129, 0.15);
              color: #34D399;
              border: 1px solid rgba(16, 185, 129, 0.3);
              padding: 4px 12px;
              border-radius: 9999px;
              font-size: 0.825rem;
              font-weight: 600;
              margin-bottom: 1.25rem;
            }
            .pulse {
              width: 8px;
              height: 8px;
              border-radius: 50%;
              background: #10B981;
              box-shadow: 0 0 8px #10B981;
            }
            h1 {
              font-size: 1.75rem;
              font-weight: 700;
              letter-spacing: -0.025em;
              margin-bottom: 0.75rem;
              background: linear-gradient(135deg, #FFFFFF 0%, #94A3B8 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
            }
            p {
              color: #94A3B8;
              font-size: 0.975rem;
              line-height: 1.6;
              margin-bottom: 1.75rem;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
              gap: 1rem;
              margin-bottom: 2rem;
            }
            .btn-primary {
              display: flex;
              flex-direction: column;
              background: linear-gradient(135deg, #0284C7 0%, #2563EB 100%);
              color: #FFFFFF;
              text-decoration: none;
              padding: 1.2rem;
              border-radius: 12px;
              font-weight: 600;
              font-size: 1rem;
              transition: transform 0.2s, box-shadow 0.2s;
              border: 1px solid rgba(255, 255, 255, 0.2);
            }
            .btn-primary:hover {
              transform: translateY(-2px);
              box-shadow: 0 10px 20px -5px rgba(2, 132, 199, 0.5);
            }
            .btn-secondary {
              display: flex;
              flex-direction: column;
              background: rgba(15, 23, 42, 0.8);
              color: #E2E8F0;
              text-decoration: none;
              padding: 1.2rem;
              border-radius: 12px;
              font-weight: 600;
              font-size: 1rem;
              transition: transform 0.2s, border-color 0.2s;
              border: 1px solid rgba(255, 255, 255, 0.1);
            }
            .btn-secondary:hover {
              transform: translateY(-2px);
              border-color: rgba(56, 189, 248, 0.4);
            }
            .btn-desc {
              font-size: 0.8rem;
              font-weight: 400;
              opacity: 0.8;
              margin-top: 4px;
            }
            .footer-info {
              display: flex;
              justify-content: space-between;
              font-size: 0.8rem;
              color: #64748B;
              border-top: 1px solid rgba(255, 255, 255, 0.08);
              padding-top: 1.25rem;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge"><span class="pulse"></span> System Operational</div>
            <h1>Enterprise Multi-SaaS MCP Gateway</h1>
            <p>Unified Model Context Protocol gateway hosting 59 tools across Xero Accounting, Google BigQuery, Cloud Firestore, and Sage HR for Google Gemini Enterprise.</p>
            
            <div class="grid">
              <a href="/admin" class="btn-primary">
                <span>⚙️ Administration Portal</span>
                <span class="btn-desc">Manage SaaS toggles, secrets, & permissions</span>
              </a>
              <a href="/healthz" class="btn-secondary">
                <span>🩺 System Health Status</span>
                <span class="btn-desc">Check runtime health & GCP Secret status</span>
              </a>
            </div>

            <div class="footer-info">
              <span>StreamableHTTP: <code>/mcp</code></span>
              <span>OAuth PKCE: <code>/oauth/*</code></span>
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
