import { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from '../../mcp/server.js';
import { logger } from '../../utils/logger.js';
import { toMcpErrorResponse } from '../../utils/errors.js';

import { RequestContext } from '../context.js';

/**
 * MCP Request Handler Function (Per-request stateless transport for Cloud Run & Gemini Enterprise)
 */
export async function handleMcpRequest(req: Request, res: Response) {
  logger.info(
    { path: req.path, method: req.method, jsonrpcMethod: req.body?.method, reqId: req.body?.id },
    `[MCP] Handling ${req.method} request for method: ${req.body?.method || 'unknown'}`
  );

  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless transport created per-request
      enableJsonResponse: true,      // Direct JSON-RPC response mode
    });

    const userEmail =
      (req.auth as any)?.email ||
      (req.auth as any)?.userEmail ||
      (req.auth as any)?.sub ||
      req.auth?.clientId;

    await RequestContext.run(
      {
        userEmail,
        authUserId: (req.auth as any)?.sub || req.auth?.clientId,
        token: req.auth?.token,
        clientId: req.auth?.clientId,
        scopes: req.auth?.scopes,
        ...req.auth,
      },
      async () => {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      }
    );
  } catch (error: any) {
    logger.error(
      { error: error.message || error, stack: error.stack, path: req.path, body: req.body },
      'Error handling MCP request'
    );
    if (!res.headersSent) {
      res.status(500).json(toMcpErrorResponse(error, req.body?.id));
    }
  }
}
