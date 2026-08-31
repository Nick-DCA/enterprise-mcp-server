export class BigQueryApiError extends Error {
  public readonly statusCode?: number;
  public readonly code?: string;
  public readonly errors?: any[];

  constructor(message: string, statusCode?: number, code?: string, errors?: any[]) {
    super(message);
    this.name = 'BigQueryApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
  }
}

export class BigQueryCostLimitError extends BigQueryApiError {
  constructor(message: string, bytesEstimated?: number, maxBytesAllowed?: number) {
    super(message, 400, 'COST_LIMIT_EXCEEDED');
    this.name = 'BigQueryCostLimitError';
  }
}

export class BigQueryPermissionError extends BigQueryApiError {
  constructor(message: string) {
    super(message, 403, 'PERMISSION_DENIED');
    this.name = 'BigQueryPermissionError';
  }
}

export class BigQuerySyntaxError extends BigQueryApiError {
  constructor(message: string) {
    super(message, 400, 'INVALID_QUERY');
    this.name = 'BigQuerySyntaxError';
  }
}

/**
 * Formats a BigQuery error into a descriptive message for LLM prompt self-correction.
 */
export function formatBigQueryError(error: any): string {
  if (!error) {
    return 'Unknown BigQuery error occurred.';
  }

  // Cost limit error
  if (error instanceof BigQueryCostLimitError) {
    return `Query rejected for cost protection: ${error.message}`;
  }

  // Standard GCP / BigQuery error object
  const message = error.message || String(error);
  const errors = error.errors || error.response?.data?.error?.errors;

  if (Array.isArray(errors) && errors.length > 0) {
    const errorDetails = errors
      .map((e: any) => e.message || e.reason)
      .filter(Boolean)
      .join('; ');
    return `BigQuery Error: ${errorDetails} (${message})`;
  }

  if (message.includes('Syntax error') || message.includes('Unrecognized name')) {
    return `SQL Syntax Error: ${message}. Please check column and table names.`;
  }

  if (message.includes('Not found') || message.includes('notFound')) {
    return `BigQuery Resource Not Found: ${message}. Verify dataset and table IDs using bigquery-list-tables.`;
  }

  if (message.includes('Access Denied') || message.includes('permission')) {
    return `BigQuery Permission Denied: ${message}. Ensure the Cloud Run service account has BigQuery Data Viewer / Job User roles.`;
  }

  if (message.includes('bytes billed limit')) {
    return `BigQuery Cost Limit: ${message}. Refine query with WHERE filters, partitions, or selected columns instead of SELECT *.`;
  }

  return `BigQuery Error: ${message}`;
}
