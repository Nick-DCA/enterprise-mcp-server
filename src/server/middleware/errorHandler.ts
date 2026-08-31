import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger.js';
import { toMcpErrorResponse } from '../../utils/errors.js';

/**
 * Global Express error handling middleware.
 */
export function globalErrorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  logger.error(
    {
      error: err.message || err,
      stack: err.stack,
      path: req.path,
      method: req.method,
    },
    'Global Express Error'
  );

  if (!res.headersSent) {
    if (req.path === '/mcp' || req.path === '/' || req.method === 'POST') {
      res.status(500).json(toMcpErrorResponse(err, req.body?.id));
    } else {
      res.status(500).json({
        status: 'error',
        message: err.message || 'Internal Server Error',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
