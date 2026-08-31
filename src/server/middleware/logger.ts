import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger.js';

export function requestLoggerMiddleware(req: Request, _res: Response, next: NextFunction) {
  logger.info(
    {
      method: req.method,
      url: req.url,
      path: req.path,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    },
    `[HTTP Request] ${req.method} ${req.url}`
  );
  next();
}
