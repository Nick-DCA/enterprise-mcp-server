import { logger } from './logger.js';
import {
  XeroApiError,
  XeroRateLimitError,
  XeroAuthError,
  extractCorrelationId,
  formatXeroValidationError,
} from '../services/xero/errors.js';

export {
  XeroApiError,
  XeroRateLimitError,
  XeroAuthError,
  extractCorrelationId,
  formatXeroValidationError,
};

export class McpToolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpToolValidationError';
  }
}

/**
 * Formats an unknown error into a standard JSON-RPC MCP error object response.
 */
export function toMcpErrorResponse(error: any, reqId: any = null) {
  const correlationId = extractCorrelationId(error);
  const message = error?.name === 'XeroApiError' || error?.response?.body?.Elements
    ? formatXeroValidationError(error)
    : error?.message || 'MCP execution failed';

  logger.error(
    {
      error: error.message || error,
      correlationId,
      stack: error.stack,
    },
    `MCP Execution Error: ${message}`
  );

  return {
    jsonrpc: '2.0',
    error: {
      code: error instanceof McpToolValidationError ? -32602 : -32603,
      message,
    },
    id: reqId,
  };
}
