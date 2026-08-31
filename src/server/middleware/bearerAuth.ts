import { Request, Response, NextFunction } from 'express';
import { verifyJwt } from '../../auth/jwt.js';
import { AccessTokenPayload, McpAuthConfig } from '../../auth/types.js';
import { getMcpAuthConfig } from '../../config/authConfig.js';
import { logger } from '../../utils/logger.js';

type JwtSecretResolver = string | McpAuthConfig | (() => Promise<string>) | undefined;

let cachedJwtSecret: string | null = null;

async function resolveJwtSecret(resolver?: JwtSecretResolver): Promise<string> {
  if (typeof resolver === 'string') {
    return resolver;
  }
  if (resolver && typeof resolver === 'object' && 'jwtSecret' in resolver) {
    return resolver.jwtSecret;
  }
  if (typeof resolver === 'function') {
    return resolver();
  }
  if (cachedJwtSecret) {
    return cachedJwtSecret;
  }
  const config = await getMcpAuthConfig();
  cachedJwtSecret = config.jwtSecret;
  return cachedJwtSecret;
}

/**
 * Express middleware enforcing OAuth 2.0 Bearer token authentication on protected routes.
 */
export function createBearerAuthMiddleware(secretResolver?: JwtSecretResolver) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn(
        { path: req.path, method: req.method, ip: req.ip },
        'Request rejected: Missing or invalid Authorization Bearer header'
      );
      res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
      res.status(401).json({
        error: 'unauthorized',
        error_description: 'Invalid, expired, or missing Bearer access token',
      });
      return;
    }

    const token = authHeader.substring(7).trim();

    try {
      const secret = await resolveJwtSecret(secretResolver);
      const decoded = verifyJwt<AccessTokenPayload>(token, secret);

      // Attach authenticated claims and SDK-compatible AuthInfo to Request context
      req.auth = {
        token,
        clientId: decoded.sub,
        scopes: (decoded.scope || '').split(' ').filter(Boolean),
        expiresAt: decoded.exp,
        ...decoded,
      };
      logger.debug({ sub: decoded.sub, path: req.path }, 'Bearer token authenticated successfully');
      next();
    } catch (err: any) {
      logger.warn(
        { path: req.path, method: req.method, error: err.message, ip: req.ip },
        'Bearer token verification failed'
      );
      res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
      res.status(401).json({
        error: 'unauthorized',
        error_description: 'Invalid, expired, or missing Bearer access token',
      });
    }
  };
}
