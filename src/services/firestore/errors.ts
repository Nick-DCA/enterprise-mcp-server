export class FirestoreApiError extends Error {
  public readonly statusCode?: number;
  public readonly code?: string;

  constructor(message: string, statusCode?: number, code?: string) {
    super(message);
    this.name = 'FirestoreApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class FirestorePermissionError extends FirestoreApiError {
  constructor(message: string) {
    super(message, 403, 'PERMISSION_DENIED');
    this.name = 'FirestorePermissionError';
  }
}

export class FirestoreWriteDisabledError extends FirestoreApiError {
  constructor(message: string) {
    super(message, 403, 'WRITE_DISABLED');
    this.name = 'FirestoreWriteDisabledError';
  }
}

export class FirestoreNotFoundError extends FirestoreApiError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
    this.name = 'FirestoreNotFoundError';
  }
}

/**
 * Formats a Firestore error into an actionable message for LLM prompt self-correction.
 */
export function formatFirestoreError(error: any): string {
  if (!error) {
    return 'Unknown Firestore error occurred.';
  }

  if (error instanceof FirestoreWriteDisabledError) {
    return `Firestore Mutation Blocked: ${error.message}. Writes are disabled by policy (FIRESTORE_ALLOW_WRITES=false).`;
  }

  if (error instanceof FirestorePermissionError) {
    return `Firestore Access Denied: ${error.message}. Collection is not permit-listed or IAM credentials lack permissions.`;
  }

  const message = error.message || String(error);

  if (message.includes('NOT_FOUND') || message.includes('No document to update')) {
    return `Firestore Resource/Document Not Found: ${message}. Check document path or verify Firestore database is provisioned in GCP project.`;
  }

  if (message.includes('PERMISSION_DENIED') || message.includes('Missing or insufficient permissions')) {
    return `Firestore Permission Denied: ${message}. Verify GCP Cloud Run service account permissions.`;
  }

  if (message.includes('INVALID_ARGUMENT') || message.includes('Cannot use')) {
    return `Firestore Query Parameter Error: ${message}. Ensure filter operators (==, !=, <, <=, >, >=, in, array-contains) and types are valid.`;
  }

  return `Firestore Error: ${message}`;
}
