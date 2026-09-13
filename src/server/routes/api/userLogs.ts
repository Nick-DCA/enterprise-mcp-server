import { Router, Request, Response } from 'express';
import { requireAdminAuth } from '../../middleware/adminAuth.js';
import { userLogService } from '../../services/userLogService.js';
import { logger } from '../../../utils/logger.js';
import type { UserLogFilterParams, McpExecutionStatus } from '../../types/logs.js';

export const userLogsApiRouter = Router();

userLogsApiRouter.use(requireAdminAuth);

/**
 * GET /api/logs/user
 * Queries runtime execution traces with filtering, search, timeline presets, and pagination.
 */
userLogsApiRouter.get('/', async (req: Request, res: Response) => {
  try {
    const filters: UserLogFilterParams = {
      userEmail: typeof req.query.userEmail === 'string' ? req.query.userEmail : undefined,
      clientId: typeof req.query.clientId === 'string' ? req.query.clientId : undefined,
      service: typeof req.query.service === 'string' ? req.query.service : undefined,
      toolName: typeof req.query.toolName === 'string' ? req.query.toolName : undefined,
      status: typeof req.query.status === 'string' ? (req.query.status as McpExecutionStatus | 'ALL') : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      preset: typeof req.query.preset === 'string' ? (req.query.preset as any) : undefined,
      startTime: typeof req.query.startTime === 'string' ? req.query.startTime : undefined,
      endTime: typeof req.query.endTime === 'string' ? req.query.endTime : undefined,
      hasUpstream: typeof req.query.hasUpstream === 'string' ? (req.query.hasUpstream as any) : undefined,
      hasPayload: typeof req.query.hasPayload === 'string' ? (req.query.hasPayload as any) : undefined,
      argsSearch: typeof req.query.argsSearch === 'string' ? req.query.argsSearch : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    };

    const result = await userLogService.getTraces(filters);
    res.json({
      success: true,
      traces: result.traces,
      total: result.total,
      limit: filters.limit,
      offset: filters.offset,
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to query user logs');
    res.status(500).json({ error: 'QueryUserLogsFailed', message: error.message || String(error) });
  }
});

/**
 * GET /api/logs/user/stats
 * Aggregates runtime telemetry statistics for KPI ribbons.
 */
userLogsApiRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    const timeRangeMs = req.query.timeRangeMs
      ? parseInt(req.query.timeRangeMs as string, 10)
      : 24 * 60 * 60 * 1000;

    const stats = await userLogService.getStats(timeRangeMs);
    res.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to compute user logs stats');
    res.status(500).json({ error: 'ComputeStatsFailed', message: error.message || String(error) });
  }
});

/**
 * GET /api/logs/user/:traceId
 * Retrieves a single complete trace document by traceId.
 */
userLogsApiRouter.get('/:traceId', async (req: Request, res: Response) => {
  try {
    const { traceId } = req.params;
    const trace = await userLogService.getTraceById(traceId);
    if (!trace) {
      return res.status(404).json({ error: 'TraceNotFound', message: `Trace '${traceId}' not found.` });
    }

    res.json({
      success: true,
      trace,
    });
  } catch (error: any) {
    logger.error({ error, traceId: req.params.traceId }, 'Failed to get user log trace');
    res.status(500).json({ error: 'GetTraceFailed', message: error.message || String(error) });
  }
});
