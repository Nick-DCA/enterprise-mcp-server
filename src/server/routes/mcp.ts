import { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from '../../mcp/server.js';
import { logger } from '../../utils/logger.js';
import { toMcpErrorResponse } from '../../utils/errors.js';
import { RequestContext } from '../context.js';
import { cleanUserEmail } from '../../utils/identity.js';
import { userLogService } from '../services/userLogService.js';
import type { UserLogTraceDocument } from '../types/logs.js';

/**
 * MCP Request Handler Function (Per-request stateless transport for Cloud Run & Gemini Enterprise)
 */
export async function handleMcpRequest(req: Request, res: Response) {
  const startTime = Date.now();
  const traceId = `mcp_trace_${startTime}_${randomBytes(4).toString('hex')}`;
  const ipAddress =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip;
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;
  const jsonrpcMethod = req.body?.method || 'unknown';

  logger.info(
    { path: req.path, method: req.method, jsonrpcMethod, reqId: req.body?.id, traceId },
    `[MCP] Handling ${req.method} request for method: ${jsonrpcMethod}`
  );

  let caughtError: any = null;

  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless transport created per-request
      enableJsonResponse: true,      // Direct JSON-RPC response mode
    });

    const rawEmailCandidate =
      (req.auth as any)?.email ||
      (req.auth as any)?.userEmail ||
      (typeof req.headers['x-goog-authenticated-user-email'] === 'string'
        ? req.headers['x-goog-authenticated-user-email']
        : undefined);
    const userEmail = cleanUserEmail(rawEmailCandidate);
    const clientId = (req.auth as any)?.clientId || (req.auth as any)?.sub;

    await RequestContext.run(
      {
        traceId,
        startTime,
        ipAddress,
        userAgent,
        upstreamSpans: [],
        userEmail,
        authUserId: (req.auth as any)?.sub || clientId,
        token: req.auth?.token,
        clientId,
        scopes: req.auth?.scopes,
        ...req.auth,
      },
      async () => {
        try {
          await server.connect(transport);
          await transport.handleRequest(req, res, req.body);
        } finally {
          const totalDurationMs = Date.now() - startTime;
          const toolExec = RequestContext.getToolExecution();
          const upstreamSpans = RequestContext.getSpans();

          const traceDoc: UserLogTraceDocument = {
            traceId,
            timestamp: new Date(startTime).toISOString(),
            timestampEpochMs: startTime,
            userEmail,
            clientId,
            isHumanUser: Boolean(userEmail),
            ipAddress,
            userAgent,
            jsonrpcMethod,
            toolName:
              toolExec?.toolName ||
              (jsonrpcMethod === 'tools/call' ? req.body?.params?.name : undefined),
            domain: toolExec?.domain,
            arguments:
              toolExec?.arguments ||
              (jsonrpcMethod === 'tools/call' ? req.body?.params?.arguments : undefined),
            status: toolExec?.status || (caughtError ? 'ERROR' : 'SUCCESS'),
            durationMs: toolExec?.durationMs || totalDurationMs,
            responsePreview: toolExec?.responsePreview,
            responsePayload: toolExec?.responsePayload,
            responseChars: toolExec?.responseChars || 0,
            errorMessage: toolExec?.errorMessage || (caughtError ? caughtError.message || String(caughtError) : undefined),
            upstreamSpans,
            upstreamCallsCount: upstreamSpans.length,
          };

          // Record trace via Dual Emission pipeline
          userLogService.recordTrace(traceDoc);
        }
      }
    );
  } catch (error: any) {
    caughtError = error;
    logger.error(
      { error: error.message || error, stack: error.stack, path: req.path, body: req.body, traceId },
      'Error handling MCP request'
    );
    if (!res.headersSent) {
      res.status(500).json(toMcpErrorResponse(error, req.body?.id));
    }
  }
}
