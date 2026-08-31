export class SageHrApiError extends Error {
  public readonly statusCode?: number;
  public readonly code?: string;

  constructor(message: string, statusCode?: number, code?: string) {
    super(message);
    this.name = 'SageHrApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class SageHrPermissionError extends SageHrApiError {
  constructor(message: string) {
    super(message, 403, 'PERMISSION_DENIED');
    this.name = 'SageHrPermissionError';
  }
}

export class SageHrWriteDisabledError extends SageHrApiError {
  constructor(message: string) {
    super(message, 403, 'WRITE_DISABLED');
    this.name = 'SageHrWriteDisabledError';
  }
}

export class SageHrNotFoundError extends SageHrApiError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
    this.name = 'SageHrNotFoundError';
  }
}

/**
 * Formats a Sage HR error into an actionable message for LLM prompt self-correction.
 */
export function formatSageHrError(error: any): string {
  if (!error) {
    return 'Unknown Sage HR error occurred.';
  }

  if (error instanceof SageHrWriteDisabledError) {
    return `Sage HR Mutation Blocked: ${error.message}. Writes are disabled by policy (SAGE_HR_ALLOW_WRITES=false).`;
  }

  if (error instanceof SageHrPermissionError) {
    return `Sage HR Access Denied: ${error.message}. Check API key permissions or team allowlist policy.`;
  }

  const message = error.message || String(error);
  const status = error.statusCode || error.response?.status;

  if (status === 401 || message.includes('Unauthorized') || message.includes('X-Auth-Token')) {
    return 'Sage HR Authentication Failed: Invalid or missing API key (X-Auth-Token). Verify SAGE_HR_API_KEY in Secret Manager.';
  }

  if (status === 403 || message.includes('Forbidden') || message.includes('Access Denied')) {
    return 'Sage HR Access Forbidden: Your API token does not have administrator permissions for this resource.';
  }

  if (status === 404 || message.includes('Not Found')) {
    return `Sage HR Resource Not Found: ${message}. Verify employee ID, request ID, or company subdomain.`;
  }

  if (status === 422 || message.includes('Unprocessable')) {
    const errorDetails = error.response?.data?.errors || error.response?.data?.error;
    const detailStr = typeof errorDetails === 'object' ? JSON.stringify(errorDetails) : String(errorDetails || message);
    return `Sage HR Validation Error (HTTP 422): ${detailStr}. Please verify dates, policy IDs, or employee parameters.`;
  }

  if (status === 429 || message.includes('Rate limit')) {
    return 'Sage HR Rate Limit Exceeded: Too many requests sent to Sage HR API. Please retry shortly.';
  }

  return `Sage HR Error: ${message}`;
}
