/**
 * User Logs Telemetry Types
 * Full-trace runtime execution observability for Agent <-> MCP Server <-> Upstream SaaS APIs.
 */

export type McpExecutionStatus = 'SUCCESS' | 'ERROR' | 'RATE_LIMITED' | 'BLOCKED';

export type UpstreamServiceId = 'xero' | 'bigquery' | 'firestore' | 'sagehr' | 'slack' | 'platform';

export interface UpstreamApiCallSpan {
  spanId: string;
  serviceId: UpstreamServiceId;
  endpoint: string;                    // e.g. "GET https://api.xro/2.0/Invoices" or "POST /api/search.messages"
  httpMethod?: string;                 // "GET" | "POST" | "PATCH" | "DELETE"
  httpStatus?: number;                 // 200, 400, 429, 500
  durationMs: number;
  rateLimitRemaining?: number;         // e.g. x-minlimit-remaining
  quotaInfo?: string;                  // e.g. "Quota: 58/60" or "Billed: 12.4 MB"
  errorMessage?: string;
  timestamp: string;                   // ISO 8601
}

export interface UserLogTraceDocument {
  traceId: string;                     // Unique trace identifier (e.g. "mcp_trace_1725200000_abc123")
  timestamp: string;                   // ISO 8601
  timestampEpochMs: number;            // For fast numeric range indexing and filtering
  userEmail?: string;                  // Verified corporate user email
  clientId?: string;                   // OAuth client ID / agent identity
  isHumanUser: boolean;                // True if human user identity; false if machine fallback
  ipAddress?: string;                  // Inbound caller IP
  userAgent?: string;                  // Caller User-Agent header
  
  // MCP Inbound Layer
  jsonrpcMethod: string;               // e.g. "tools/call", "tools/list"
  toolName?: string;                   // e.g. "xero-list-invoices"
  domain?: string;                     // e.g. "accounting", "slack", "bigquery"
  arguments?: Record<string, any>;     // Sanitized tool input arguments
  
  // MCP Execution & Response Layer
  status: McpExecutionStatus;
  durationMs: number;
  responsePreview?: string;            // First 500 characters of response for feed cards
  responsePayload?: string;            // Full response payload for inspector modal
  responseChars: number;               // Total character length
  errorMessage?: string;               // Human-readable formatted error message if failed
  
  // Outbound SaaS Layer
  upstreamSpans: UpstreamApiCallSpan[];
  upstreamCallsCount: number;
}

export interface UserLogStats {
  totalInvocations: number;
  successRatePercent: number;
  averageLatencyMs: number;
  activeUsersCount: number;
  activeAgentsCount: number;
  upstreamCallsCount: number;
  errorCount: number;
  blockedCount: number;
  rateLimitedCount: number;
}

export interface UserLogFilterParams {
  userEmail?: string;
  clientId?: string;
  service?: string;
  toolName?: string;
  status?: McpExecutionStatus | 'ALL';
  search?: string;
  preset?: 'all' | '15m' | '1h' | '24h' | '7d' | '30d' | 'custom';
  startTime?: string;
  endTime?: string;
  hasUpstream?: 'all' | 'with' | 'without';
  hasPayload?: 'all' | 'with' | 'without';
  argsSearch?: string;
  limit?: number;
  offset?: number;
}
