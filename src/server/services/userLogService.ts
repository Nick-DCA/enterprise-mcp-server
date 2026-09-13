import { Timestamp } from '@google-cloud/firestore';
import { runtimeConfig } from '../../config/runtimeConfig.js';
import { logger } from '../../utils/logger.js';
import type {
  McpExecutionStatus,
  UserLogFilterParams,
  UserLogStats,
  UserLogTraceDocument,
} from '../types/logs.js';

const MAX_PAYLOAD_CHARS = 500000;
const TRUNCATION_NOTICE = '... [TRUNCATED: Response exceeded maximum log ceiling]';

/**
 * Recursively sanitizes any payload, replacing sensitive credentials and tokens with:
 * `[REDACTED - <TOOL_NAME> - <TOKEN_TYPE>]`
 */
export function sanitizeLogPayload(
  payload: any,
  toolName?: string,
  depth = 0,
  seen = new WeakSet()
): any {
  if (payload === null || payload === undefined) {
    return payload;
  }

  const activeTool = toolName && toolName.trim() ? toolName.trim() : 'system';

  // String value inspection
  if (typeof payload === 'string') {
    let sanitized = payload;

    // 1. Redact Slack tokens
    sanitized = sanitized.replace(/xoxp-[a-zA-Z0-9-]+/g, `[REDACTED - ${activeTool} - xoxp]`);
    sanitized = sanitized.replace(/xoxb-[a-zA-Z0-9-]+/g, `[REDACTED - ${activeTool} - xoxb]`);
    sanitized = sanitized.replace(/xoxr-[a-zA-Z0-9-]+/g, `[REDACTED - ${activeTool} - xoxr]`);

    // 2. Redact Bearer JWT and raw JWT tokens
    sanitized = sanitized.replace(
      /Bearer\s+eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
      `Bearer [REDACTED - ${activeTool} - jwt]`
    );
    sanitized = sanitized.replace(
      /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+\b/g,
      `[REDACTED - ${activeTool} - jwt]`
    );

    // 3. Redact RSA / Private Keys
    sanitized = sanitized.replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
      `[REDACTED - ${activeTool} - private_key]`
    );

    // 4. Truncate if exceeds ceiling
    if (sanitized.length > MAX_PAYLOAD_CHARS) {
      sanitized = sanitized.slice(0, MAX_PAYLOAD_CHARS) + TRUNCATION_NOTICE;
    }

    return sanitized;
  }

  // Primitives
  if (typeof payload !== 'object') {
    return payload;
  }

  // Cycle detection & depth limit
  if (seen.has(payload)) {
    return '[CIRCULAR]';
  }
  seen.add(payload);

  if (depth > 12) {
    return '[MAX_DEPTH]';
  }

  // Arrays
  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizeLogPayload(item, activeTool, depth + 1, seen));
  }

  // Objects
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    // 1. If value is a string, check if it matches a specific token pattern first (xoxp, xoxb, xoxr, jwt, private_key)
    if (typeof value === 'string') {
      const sanitizedVal = sanitizeLogPayload(value, activeTool, depth + 1, seen);
      if (sanitizedVal !== value) {
        result[key] = sanitizedVal;
        continue;
      }
    }

    const lowerKey = key.toLowerCase();

    // 2. Check for sensitive key names and assign contextual redaction reason
    if (lowerKey.includes('client_secret') || lowerKey.includes('clientsecret')) {
      result[key] = `[REDACTED - ${activeTool} - client_secret]`;
    } else if (lowerKey.includes('private_key') || lowerKey.includes('privatekey')) {
      result[key] = `[REDACTED - ${activeTool} - private_key]`;
    } else if (lowerKey.includes('api_key') || lowerKey.includes('apikey')) {
      result[key] = `[REDACTED - ${activeTool} - api_key]`;
    } else if (lowerKey.includes('password')) {
      result[key] = `[REDACTED - ${activeTool} - password]`;
    } else if (lowerKey === 'authorization' || lowerKey === 'auth') {
      result[key] = `[REDACTED - ${activeTool} - authorization]`;
    } else if (lowerKey.includes('secret')) {
      result[key] = `[REDACTED - ${activeTool} - secret]`;
    } else if (lowerKey.includes('token') && !lowerKey.includes('count') && !lowerKey.includes('usage')) {
      result[key] = `[REDACTED - ${activeTool} - token]`;
    } else {
      result[key] = sanitizeLogPayload(value, activeTool, depth + 1, seen);
    }
  }

  return result;
}

export class UserLogService {
  private static instance: UserLogService | null = null;
  private circularBuffer: UserLogTraceDocument[] = [];
  private readonly maxBufferSize = 300;

  public static getInstance(): UserLogService {
    if (!UserLogService.instance) {
      UserLogService.instance = new UserLogService();
    }
    return UserLogService.instance;
  }

  /**
   * Clears the in-memory circular buffer (useful for test isolation).
   */
  public clearBuffer(): void {
    this.circularBuffer = [];
  }

  /**
   * Dual Emission logging pipeline:
   * 1. Stores in memory circular buffer (FIFO, capped at 300).
   * 2. Emits structured JSON to stdout for Google Cloud Logging indexing.
   * 3. Asynchronously writes to Firestore collection 'user_logs' off critical path.
   */
  public recordTrace(rawTrace: UserLogTraceDocument): void {
    try {
      // 1. Contextual Redaction
      const toolName = rawTrace.toolName || 'mcp';
      const sanitizedArguments = rawTrace.arguments
        ? sanitizeLogPayload(rawTrace.arguments, toolName)
        : undefined;

      const sanitizedPreview = rawTrace.responsePreview
        ? sanitizeLogPayload(rawTrace.responsePreview, toolName)
        : undefined;

      const sanitizedPayload = rawTrace.responsePayload
        ? sanitizeLogPayload(rawTrace.responsePayload, toolName)
        : undefined;

      const sanitizedError = rawTrace.errorMessage
        ? sanitizeLogPayload(rawTrace.errorMessage, toolName)
        : undefined;

      const trace: UserLogTraceDocument = {
        ...rawTrace,
        arguments: sanitizedArguments,
        responsePreview: sanitizedPreview,
        responsePayload: sanitizedPayload,
        errorMessage: sanitizedError,
        upstreamCallsCount: rawTrace.upstreamSpans ? rawTrace.upstreamSpans.length : 0,
      };

      // 2. Memory Circular Buffer (Prepend newest first)
      this.circularBuffer.unshift(trace);
      if (this.circularBuffer.length > this.maxBufferSize) {
        this.circularBuffer.pop();
      }

      // 3. Google Cloud Logging Structured JSON Emission
      logger.info(
        {
          userLog: {
            traceId: trace.traceId,
            timestamp: trace.timestamp,
            userEmail: trace.userEmail,
            clientId: trace.clientId,
            isHumanUser: trace.isHumanUser,
            toolName: trace.toolName,
            domain: trace.domain,
            status: trace.status,
            durationMs: trace.durationMs,
            upstreamCallsCount: trace.upstreamCallsCount,
          },
        },
        `[USER_LOG] ${trace.toolName || trace.jsonrpcMethod} by ${
          trace.userEmail || trace.clientId || 'anonymous'
        } -> ${trace.status} (${trace.durationMs}ms)`
      );

      // 4. Firestore Asynchronous Off-Critical-Path Persistence
      setImmediate(async () => {
        try {
          const firestore = await runtimeConfig.getFirestore();
          if (!firestore) {
            return;
          }

          const docRef = firestore.collection('user_logs').doc(trace.traceId);
          await docRef.set({
            ...trace,
            timestamp: Timestamp.fromDate(new Date(trace.timestamp)),
          });
        } catch (persistErr) {
          logger.warn(
            {
              error: persistErr instanceof Error ? persistErr.message : String(persistErr),
              traceId: trace.traceId,
            },
            'Failed to asynchronously persist user log trace to Firestore'
          );
        }
      });
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'UserLogService failed to process trace record'
      );
    }
  }

  /**
   * Retrieves traces using composite filters across Firestore and memory buffer.
   */
  public async getTraces(
    filters: UserLogFilterParams = {}
  ): Promise<{ traces: UserLogTraceDocument[]; total: number }> {
    const combinedMap = new Map<string, UserLogTraceDocument>();

    // 1. Populate from circular buffer
    for (const trace of this.circularBuffer) {
      combinedMap.set(trace.traceId, trace);
    }

    // 2. Query Firestore if available
    try {
      const firestore = await runtimeConfig.getFirestore();
      if (firestore) {
        let query: FirebaseFirestore.Query = firestore.collection('user_logs');

        // Apply Firestore level bounds where possible
        if (filters.status && filters.status !== 'ALL') {
          query = query.where('status', '==', filters.status);
        }
        if (filters.userEmail) {
          query = query.where('userEmail', '==', filters.userEmail.trim().toLowerCase());
        }
        if (filters.toolName) {
          query = query.where('toolName', '==', filters.toolName.trim());
        }

        try {
          query = query.orderBy('timestamp', 'desc').limit(filters.limit ? filters.limit * 2 : 100);
          const snapshot = await query.get();
          for (const doc of snapshot.docs) {
            const data = doc.data();
            let timestampStr = new Date().toISOString();
            if (data.timestamp?.toDate) {
              timestampStr = data.timestamp.toDate().toISOString();
            } else if (typeof data.timestamp === 'string') {
              timestampStr = data.timestamp;
            }

            combinedMap.set(doc.id, {
              ...(data as UserLogTraceDocument),
              traceId: doc.id,
              timestamp: timestampStr,
            });
          }
        } catch (queryErr) {
          logger.debug(
            { error: queryErr instanceof Error ? queryErr.message : String(queryErr) },
            'Firestore user_logs indexed query failed, falling back to in-memory filter'
          );
        }
      }
    } catch (_dbErr) {
      // Offline fallback
    }

    let allTraces = Array.from(combinedMap.values());

    // 3. Apply Timeline Preset or Custom Range
    const now = Date.now();
    let minEpoch = 0;
    let maxEpoch = Infinity;

    if (filters.preset && filters.preset !== 'all' && filters.preset !== 'custom') {
      const presetMsMap: Record<string, number> = {
        '15m': 15 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
      };
      const duration = presetMsMap[filters.preset];
      if (duration) {
        minEpoch = now - duration;
      }
    } else if (filters.preset === 'custom' || filters.startTime || filters.endTime) {
      if (filters.startTime) {
        minEpoch = new Date(filters.startTime).getTime() || 0;
      }
      if (filters.endTime) {
        maxEpoch = new Date(filters.endTime).getTime() || Infinity;
      }
    }

    if (minEpoch > 0 || maxEpoch < Infinity) {
      allTraces = allTraces.filter((t) => {
        const epoch = t.timestampEpochMs || new Date(t.timestamp).getTime();
        return epoch >= minEpoch && epoch <= maxEpoch;
      });
    }

    // 4. Memory-Level Filters
    if (filters.userEmail) {
      const targetUser = filters.userEmail.trim().toLowerCase();
      allTraces = allTraces.filter((t) => t.userEmail?.toLowerCase() === targetUser);
    }

    if (filters.clientId) {
      const targetClient = filters.clientId.trim().toLowerCase();
      allTraces = allTraces.filter((t) => t.clientId?.toLowerCase().includes(targetClient));
    }

    if (filters.service && filters.service !== 'all') {
      const targetService = filters.service.trim().toLowerCase();
      allTraces = allTraces.filter(
        (t) =>
          t.domain?.toLowerCase() === targetService ||
          t.upstreamSpans?.some((s) => s.serviceId?.toLowerCase() === targetService)
      );
    }

    if (filters.toolName) {
      const targetTool = filters.toolName.trim();
      allTraces = allTraces.filter((t) => t.toolName === targetTool);
    }

    if (filters.status && filters.status !== 'ALL') {
      allTraces = allTraces.filter((t) => t.status === filters.status);
    }

    // 5. Upstream Spans Filter (With / Without)
    if (filters.hasUpstream && filters.hasUpstream !== 'all') {
      if (filters.hasUpstream === 'with') {
        allTraces = allTraces.filter(
          (t) => (t.upstreamCallsCount || (t.upstreamSpans && t.upstreamSpans.length)) > 0
        );
      } else if (filters.hasUpstream === 'without') {
        allTraces = allTraces.filter(
          (t) => !t.upstreamCallsCount && (!t.upstreamSpans || t.upstreamSpans.length === 0)
        );
      }
    }

    // 6. Response Payload Filter (With / Without)
    if (filters.hasPayload && filters.hasPayload !== 'all') {
      if (filters.hasPayload === 'with') {
        allTraces = allTraces.filter((t) => Boolean(t.responsePayload || t.responsePreview));
      } else if (filters.hasPayload === 'without') {
        allTraces = allTraces.filter((t) => !t.responsePayload && !t.responsePreview);
      }
    }

    // 7. Arguments Keyword Search
    if (filters.argsSearch && filters.argsSearch.trim().length > 0) {
      const term = filters.argsSearch.trim().toLowerCase();
      allTraces = allTraces.filter((t) => {
        return t.arguments && JSON.stringify(t.arguments).toLowerCase().includes(term);
      });
    }

    // 8. Full-Text Search across toolName, userEmail, clientId, responsePreview, error, args
    if (filters.search && filters.search.trim().length > 0) {
      const term = filters.search.trim().toLowerCase();
      allTraces = allTraces.filter((t) => {
        return (
          t.traceId.toLowerCase().includes(term) ||
          (t.toolName && t.toolName.toLowerCase().includes(term)) ||
          (t.userEmail && t.userEmail.toLowerCase().includes(term)) ||
          (t.clientId && t.clientId.toLowerCase().includes(term)) ||
          (t.errorMessage && t.errorMessage.toLowerCase().includes(term)) ||
          (t.responsePreview && t.responsePreview.toLowerCase().includes(term)) ||
          (t.arguments && JSON.stringify(t.arguments).toLowerCase().includes(term)) ||
          t.upstreamSpans?.some(
            (s) =>
              s.endpoint.toLowerCase().includes(term) ||
              (s.errorMessage && s.errorMessage.toLowerCase().includes(term))
          )
        );
      });
    }

    // 6. Chronological sorting (newest first)
    allTraces.sort((a, b) => {
      const epochA = a.timestampEpochMs || new Date(a.timestamp).getTime();
      const epochB = b.timestampEpochMs || new Date(b.timestamp).getTime();
      return epochB - epochA;
    });

    const total = allTraces.length;
    const offset = Math.max(0, filters.offset || 0);
    const limit = Math.min(200, Math.max(1, filters.limit || 50));
    const paginated = allTraces.slice(offset, offset + limit);

    return { traces: paginated, total };
  }

  /**
   * Retrieves a single trace document by traceId.
   */
  public async getTraceById(traceId: string): Promise<UserLogTraceDocument | null> {
    // 1. Check in-memory buffer
    const inMem = this.circularBuffer.find((t) => t.traceId === traceId);
    if (inMem) {
      return inMem;
    }

    // 2. Check Firestore
    try {
      const firestore = await runtimeConfig.getFirestore();
      if (firestore) {
        const doc = await firestore.collection('user_logs').doc(traceId).get();
        if (doc.exists) {
          const data = doc.data() as UserLogTraceDocument;
          let timestampStr = new Date().toISOString();
          if ((data as any).timestamp?.toDate) {
            timestampStr = (data as any).timestamp.toDate().toISOString();
          } else if (typeof data.timestamp === 'string') {
            timestampStr = data.timestamp;
          }
          return {
            ...data,
            traceId: doc.id,
            timestamp: timestampStr,
          };
        }
      }
    } catch (err) {
      logger.debug({ error: err, traceId }, 'Error looking up user log in Firestore');
    }

    return null;
  }

  /**
   * Calculates KPI statistics for the telemetry ribbon.
   */
  public async getStats(timeRangeMs = 24 * 60 * 60 * 1000): Promise<UserLogStats> {
    const { traces } = await this.getTraces({
      preset: 'custom',
      startTime: new Date(Date.now() - timeRangeMs).toISOString(),
      limit: 200,
    });

    if (traces.length === 0) {
      return {
        totalInvocations: 0,
        successRatePercent: 100,
        averageLatencyMs: 0,
        activeUsersCount: 0,
        activeAgentsCount: 0,
        upstreamCallsCount: 0,
        errorCount: 0,
        blockedCount: 0,
        rateLimitedCount: 0,
      };
    }

    const totalInvocations = traces.length;
    let totalLatency = 0;
    let successCount = 0;
    let errorCount = 0;
    let blockedCount = 0;
    let rateLimitedCount = 0;
    let upstreamCallsCount = 0;

    const uniqueUsers = new Set<string>();
    const uniqueAgents = new Set<string>();

    for (const t of traces) {
      totalLatency += t.durationMs || 0;
      upstreamCallsCount += t.upstreamCallsCount || (t.upstreamSpans ? t.upstreamSpans.length : 0);

      if (t.status === 'SUCCESS') successCount++;
      else if (t.status === 'ERROR') errorCount++;
      else if (t.status === 'BLOCKED') blockedCount++;
      else if (t.status === 'RATE_LIMITED') rateLimitedCount++;

      if (t.userEmail) uniqueUsers.add(t.userEmail.toLowerCase());
      if (t.clientId) uniqueAgents.add(t.clientId.toLowerCase());
    }

    return {
      totalInvocations,
      successRatePercent: Number(((successCount / totalInvocations) * 100).toFixed(1)),
      averageLatencyMs: Math.round(totalLatency / totalInvocations),
      activeUsersCount: uniqueUsers.size,
      activeAgentsCount: uniqueAgents.size,
      upstreamCallsCount,
      errorCount,
      blockedCount,
      rateLimitedCount,
    };
  }
}

export const userLogService = UserLogService.getInstance();
