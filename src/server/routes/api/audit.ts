import { Router, Request, Response } from 'express';
import { runtimeConfig } from '../../../config/runtimeConfig.js';
import { requireAdminAuth } from '../../middleware/adminAuth.js';
import { logger } from '../../../utils/logger.js';

export const auditApiRouter = Router();

auditApiRouter.use(requireAdminAuth);

/**
 * GET /api/audit/logs
 * Fetches recent audit log entries.
 */
auditApiRouter.get('/logs', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 200, 500);

  try {
    const logs = await runtimeConfig.getAuditLogs(limit);
    res.json({
      success: true,
      logs,
      count: logs.length,
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to fetch audit logs');
    res.status(500).json({ error: 'FetchLogsFailed', message: error.message });
  }
});
