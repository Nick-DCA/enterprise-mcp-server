export class XeroApiError extends Error {
  public statusCode?: number;
  public correlationId?: string;
  public validationErrors?: string[];

  constructor(message: string, statusCode?: number, correlationId?: string, validationErrors?: string[]) {
    super(message);
    this.name = 'XeroApiError';
    this.statusCode = statusCode;
    this.correlationId = correlationId;
    this.validationErrors = validationErrors;
  }
}

export class XeroRateLimitError extends XeroApiError {
  public retryAfterSeconds?: number;

  constructor(message: string, retryAfterSeconds?: number, correlationId?: string) {
    super(message, 429, correlationId);
    this.name = 'XeroRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class XeroAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XeroAuthError';
  }
}

/**
 * Extracts Xero response correlation ID header for distributed tracing.
 */
export function extractCorrelationId(error: any): string | undefined {
  return (
    error?.response?.headers?.['x-correlation-id'] ||
    error?.response?.headers?.['X-Correlation-Id'] ||
    error?.headers?.['x-correlation-id'] ||
    error?.headers?.['X-Correlation-Id']
  );
}

/**
 * Formats nested Xero API validation errors (e.g. response.body.Elements[0].ValidationErrors)
 * into human-readable strings for LLM prompt self-correction.
 */
export function formatXeroValidationError(error: any): string {
  const correlationId = extractCorrelationId(error);
  let details: string[] = [];

  const body = error?.response?.body || error?.response?.data || error?.body;
  const elements = body?.Elements;
  if (Array.isArray(elements)) {
    for (const elem of elements) {
      if (Array.isArray(elem.ValidationErrors)) {
        for (const valErr of elem.ValidationErrors) {
          if (valErr?.Message) {
            details.push(valErr.Message);
          }
        }
      }
    }
  }

  const statusCode = error?.response?.status || error?.status || error?.statusCode;
  const statusText = error?.response?.statusText;
  const bodyMessage =
    typeof body === 'object'
      ? body?.Message || body?.message || body?.Detail || body?.detail
      : typeof body === 'string'
      ? body
      : undefined;

  let rawMessage = bodyMessage || error?.message || 'Xero API call failed';
  if (statusCode) {
    rawMessage = `HTTP ${statusCode}${statusText ? ' ' + statusText : ''}: ${rawMessage}`;
  }

  let formatted = rawMessage;
  if (details.length > 0) {
    formatted += `: ${details.join('; ')}`;
  }
  if (correlationId) {
    formatted += ` (X-Correlation-Id: ${correlationId})`;
  }

  return formatted;
}
