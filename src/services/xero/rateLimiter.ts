import { logger } from '../../utils/logger.js';
import { XeroRateLimitError, extractCorrelationId } from './errors.js';
import { RequestContext } from '../../server/context.js';

export interface RateLimiterOptions {
  maxRetries?: number;
  initialDelayMs?: number;
}

/**
 * Executes a Xero API operation with exponential backoff for HTTP 429 Rate Limit responses.
 */
export async function executeWithRateLimit<T>(
  operationName: string,
  fn: () => Promise<T>,
  options: RateLimiterOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  let delay = options.initialDelayMs ?? 1000;
  const startTime = Date.now();

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result: any = await fn();
      const durationMs = Date.now() - startTime;

      // Check remaining rate limit headers if available
      const responseHeaders = result?.response?.headers || result?.headers;
      let remainingCalls: string | undefined;
      if (responseHeaders) {
        remainingCalls = responseHeaders['x-minlimit-remaining'];
        if (remainingCalls !== undefined && parseInt(remainingCalls, 10) < 5) {
          logger.warn(
            { operationName, remainingCalls },
            `Xero API minute quota warning: only ${remainingCalls} calls remaining`
          );
        }
      }

      const rateLimitNum = remainingCalls ? parseInt(remainingCalls, 10) : undefined;
      RequestContext.recordSpan({
        spanId: `span_xero_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        serviceId: 'xero',
        endpoint: operationName,
        httpStatus: result?.response?.status || 200,
        durationMs,
        rateLimitRemaining: rateLimitNum,
        quotaInfo: rateLimitNum !== undefined ? `Quota: ${rateLimitNum}/60` : undefined,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error: any) {
      const statusCode = error?.response?.status || error?.status || error?.statusCode;
      const correlationId = extractCorrelationId(error);

      // Handle HTTP 429 Too Many Requests
      if (statusCode === 429) {
        const headers = error?.response?.headers || error?.headers || {};
        const retryAfterHeader = headers['retry-after'] || headers['Retry-After'];
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : Math.ceil(delay / 1000);

        logger.warn(
          {
            operationName,
            attempt,
            maxRetries,
            retryAfterSec,
            correlationId,
          },
          `Xero API Rate Limit hit (HTTP 429). Retrying in ${retryAfterSec}s...`
        );

        if (attempt > maxRetries) {
          throw new XeroRateLimitError(
            `Xero Rate Limit exceeded after ${maxRetries} retries for ${operationName}`,
            retryAfterSec,
            correlationId
          );
        }

        // Wait for retry-after duration or exponential backoff
        const waitMs = retryAfterHeader ? retryAfterSec * 1000 : delay;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        delay *= 2; // Exponential backoff for next attempt if needed
        continue;
      }

      // If not 429 or max retries exceeded, rethrow
      throw error;
    }
  }

  throw new Error(`Execution failed for ${operationName} after ${maxRetries} retries`);
}
