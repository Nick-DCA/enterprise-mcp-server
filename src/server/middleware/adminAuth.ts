import { Request, Response, NextFunction } from 'express';
import { runtimeConfig, SessionDocument, UserAccessDocument } from '../../config/runtimeConfig.js';
import { logger } from '../../utils/logger.js';

export interface AdminUserContext {
  sessionId: string;
  email: string;
  fullName: string;
  isAdmin: boolean;
  isEnabled: boolean;
  allowedServices: string[];
  readOnlyOnly: boolean;
  session: SessionDocument;
  userAccess?: UserAccessDocument;
}

declare global {
  namespace Express {
    interface Request {
      adminUser?: AdminUserContext;
    }
  }
}

export const SESSION_COOKIE_NAME = '__session';

/**
 * Express middleware to authenticate admin users using session cookies or Authorization headers.
 */
export async function requireAdminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // 1. Extract session ID from cookie or Bearer token
    let sessionId = req.cookies?.[SESSION_COOKIE_NAME];

    if (!sessionId && req.headers.authorization?.startsWith('Bearer ')) {
      sessionId = req.headers.authorization.substring(7).trim();
    }

    const clearSessionCookie = () => {
      const isHttps = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
      res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        path: '/',
      });
    };

    if (!sessionId) {
      clearSessionCookie();
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No active admin session found. Please log in at /admin/login',
      });
      return;
    }

    // 2. Validate session in Firestore / Cache
    const session = await runtimeConfig.getSession(sessionId);
    if (!session) {
      clearSessionCookie();
      res.status(401).json({
        error: 'SessionExpired',
        message: 'Admin session has expired or been revoked. Please log in again.',
      });
      return;
    }

    // 3. Validate user access record
    const userAccess = await runtimeConfig.getUserAccess(session.userEmail);

    if (userAccess && !userAccess.isEnabled) {
      clearSessionCookie();
      res.status(403).json({
        error: 'AccountDisabled',
        message: `Account for ${session.userEmail} has been disabled by an administrator.`,
      });
      return;
    }

    const isAdmin = userAccess?.isAdmin ?? (session.role === 'ADMIN');
    if (!isAdmin) {
      clearSessionCookie();
      res.status(403).json({
        error: 'Forbidden',
        message: 'Administrative privileges are required to access this resource.',
      });
      return;
    }

    // Attach admin user context
    req.adminUser = {
      sessionId: session.sessionId,
      email: session.userEmail,
      fullName: session.fullName,
      isAdmin: true,
      isEnabled: userAccess?.isEnabled ?? true,
      allowedServices: userAccess?.allowedServices || ['xero', 'bigquery', 'firestore', 'sagehr', 'slack'],
      readOnlyOnly: userAccess?.readOnlyOnly ?? false,
      session,
      userAccess: userAccess || undefined,
    };

    next();
  } catch (error: any) {
    logger.error({ error }, 'Error in requireAdminAuth middleware');
    res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to verify admin authentication session.',
    });
  }
}
