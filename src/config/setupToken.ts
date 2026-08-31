import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { runtimeConfig } from './runtimeConfig.js';
import { writeSecretValue, fetchSecret, getGcpProjectId, deleteSecret } from './secretManager.js';

export const SETUP_SESSION_COOKIE = '__setup_session';
export const SETUP_TOKEN_SECRET_NAME = 'MCP_SETUP_TOKEN';

let memorySetupToken: string | null = null;

/**
 * Resolves or generates the secure bootstrap setup token.
 */
export function getOrCreateSetupToken(): string {
  if (process.env.SETUP_ADMIN_TOKEN && process.env.SETUP_ADMIN_TOKEN.trim() !== '') {
    return process.env.SETUP_ADMIN_TOKEN.trim();
  }
  if (!memorySetupToken) {
    memorySetupToken = crypto.randomBytes(32).toString('hex');
  }
  return memorySetupToken;
}

/**
 * Ensures the bootstrap token is synchronized to Google Secret Manager in production.
 */
export async function syncSetupTokenToSecretManager(): Promise<string> {
  const isCompleted = await runtimeConfig.isSetupCompleted();
  if (isCompleted) {
    return '';
  }

  const projectId = await getGcpProjectId();
  if (projectId) {
    try {
      const existingSecret = await fetchSecret(SETUP_TOKEN_SECRET_NAME, projectId);
      if (existingSecret && existingSecret.length >= 16) {
        memorySetupToken = existingSecret;
        return memorySetupToken;
      }
    } catch {
      // ignore
    }
  }

  const token = getOrCreateSetupToken();
  if (projectId) {
    try {
      await writeSecretValue(SETUP_TOKEN_SECRET_NAME, token);
      logger.info({ secretName: SETUP_TOKEN_SECRET_NAME }, 'Synchronized bootstrap setup token to Google Secret Manager');
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Could not persist bootstrap token to Secret Manager');
    }
  }
  return token;
}

/**
 * Permanently invalidates the bootstrap token upon successful installation.
 */
export async function invalidateSetupToken(): Promise<void> {
  memorySetupToken = null;
  delete process.env.SETUP_ADMIN_TOKEN;
  try {
    await deleteSecret(SETUP_TOKEN_SECRET_NAME);
  } catch (err: any) {
    logger.warn({ error: err.message }, 'Failed to delete bootstrap token from Secret Manager');
  }
}

/**
 * Verifies a candidate setup token using constant-time comparison.
 */
export function verifySetupToken(candidate: string): boolean {
  if (!candidate || typeof candidate !== 'string') {
    return false;
  }
  const actual = getOrCreateSetupToken();
  try {
    const candidateBuf = Buffer.from(candidate.trim());
    const actualBuf = Buffer.from(actual);
    if (candidateBuf.length !== actualBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(candidateBuf, actualBuf);
  } catch {
    return false;
  }
}

import { exec } from 'child_process';

function openBrowser(url: string): void {
  const start =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
      ? 'start ""'
      : 'xdg-open';
  exec(`${start} "${url}"`, (_err) => {
    // Ignore error if headless or browser cannot be opened
  });
}

/**
 * Logs a high-visibility startup banner if the system is uninitialized
 * and automatically launches the web browser with token when running locally.
 */
export async function logSetupBanner(port: number | string): Promise<void> {
  const isCompleted = await runtimeConfig.isSetupCompleted();
  if (!isCompleted) {
    const token = await syncSetupTokenToSecretManager();
    const setupUrl = `http://localhost:${port}/admin/setup?token=${token}`;

    console.log('\n' + '='.repeat(80));
    console.log('⚡ [INITIAL SETUP REQUIRED] Enterprise MCP Gateway');
    console.log('='.repeat(80));
    console.log(`  Admin Setup URL:  http://localhost:${port}/admin/setup`);
    console.log(`  1-Click Magic:    ${setupUrl}`);
    console.log(`  Bootstrap Token:  ${token}`);
    console.log('='.repeat(80));
    console.log('  To get the 1-click production setup link, run: npm run setup:prod\n' + '='.repeat(80) + '\n');

    logger.info({ setupUrl: `http://localhost:${port}/admin/setup`, token: '[REDACTED_IN_JSON_LOGS]' }, 'Setup is required. Bootstrap token is active.');

    // Auto-launch default browser on local development / setup run
    if (!process.env.K_SERVICE) {
      setTimeout(() => {
        openBrowser(setupUrl);
      }, 500);
    }
  }
}

/**
 * Express middleware protecting /api/setup/* endpoints.
 */
export async function requireSetupAuth(req: Request, res: Response, next: NextFunction): Promise<any> {
  const isCompleteEndpoint = req.path === '/complete' || req.originalUrl?.endsWith('/complete');

  // If setup is already completed and this is not a finalization request, block access to setup API
  const isCompleted = await runtimeConfig.isSetupCompleted();
  if (isCompleted && !isCompleteEndpoint) {
    return res.status(403).json({
      error: 'SetupAlreadyCompleted',
      message: 'Initial platform setup has already been completed. Use the Admin Portal at /admin/ to manage settings.',
    });
  }

  // Check setup session cookie or header
  const sessionToken = req.cookies?.[SETUP_SESSION_COOKIE] || (req.headers['x-setup-token'] as string);

  if (!sessionToken || !verifySetupToken(sessionToken)) {
    return res.status(401).json({
      error: 'SetupTokenRequired',
      message: 'Valid bootstrap setup token is required to perform initialisation.',
    });
  }

  next();
}
