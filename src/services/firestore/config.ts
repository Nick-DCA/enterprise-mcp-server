import { getGcpProjectId } from '../../config/secretManager.js';
import { logger } from '../../utils/logger.js';

export const DEFAULT_BLOCKED_COLLECTIONS: readonly string[] = [
  'system_metadata',
  'services_config',
  'users_access',
  'user_sessions',
  'sessions',
  'audit_logs',
];

export interface FirestoreConfig {
  projectId: string;
  databaseId: string;
  allowedCollections: string[]; // empty [] means query nothing; ['allow_all'] or ['*'] means all non-blocked; or ['customers', 'orders']
  blockedCollections: string[]; // explicit blocklist (highest precedence)
  allowWrites: boolean; // default: false (strict read-only for tool layer)
  excludedFields: string[]; // default sensitive fields to redact
  maxDocuments: number; // default: 50, hard max: 500
  queryTimeoutMs: number; // default: 15,000 ms
  firestoreGuardrailMode: 'STRICT_READ_ONLY' | 'GRANULAR_CUSTOM';
  allowedOperations: string[];
  blockedOperations: string[];
}

let cachedConfig: FirestoreConfig | null = null;
let dynamicDatabaseId: string | null = null;

export function setCustomDatabaseId(databaseId: string): void {
  dynamicDatabaseId = databaseId.trim();
  cachedConfig = null;
}

export async function getFirestoreConfig(customDbId?: string): Promise<FirestoreConfig> {
  if (cachedConfig && !customDbId) {
    return cachedConfig;
  }

  const projectId = process.env.FIRESTORE_PROJECT_ID || (await getGcpProjectId());

  if (!projectId) {
    throw new Error(
      'GCP Project ID is required for Firestore. Set FIRESTORE_PROJECT_ID or GCP_PROJECT_ID.'
    );
  }

  // 1. Fetch dynamic settings from RuntimeConfig (if initialized)
  let runtimeSettings: Record<string, any> = {};
  try {
    const { runtimeConfig } = await import('../../config/runtimeConfig.js');
    const serviceDoc = runtimeConfig.getInMemoryServiceConfig('firestore');
    if (serviceDoc?.settings) {
      runtimeSettings = serviceDoc.settings;
    }
  } catch (_e) {
    // RuntimeConfig may still be initializing during early bootstrap
  }

  const databaseId =
    customDbId ||
    dynamicDatabaseId ||
    runtimeSettings.databaseId ||
    process.env.FIRESTORE_DATABASE_ID ||
    '(default)';

  // 2. Blocked collections parsing (Blocklist - takes highest precedence)
  let blockedCollections: string[] = [...DEFAULT_BLOCKED_COLLECTIONS];
  if (runtimeSettings.blockedCollections !== undefined && runtimeSettings.blockedCollections !== null) {
    if (Array.isArray(runtimeSettings.blockedCollections)) {
      blockedCollections = runtimeSettings.blockedCollections
        .map((c: string) => String(c).trim().toLowerCase())
        .filter((c: string) => c.length > 0);
    } else {
      blockedCollections = String(runtimeSettings.blockedCollections)
        .split(',')
        .map((c) => c.trim().toLowerCase())
        .filter((c) => c.length > 0);
    }
  } else if (process.env.FIRESTORE_BLOCKED_COLLECTIONS) {
    blockedCollections = process.env.FIRESTORE_BLOCKED_COLLECTIONS
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter((c) => c.length > 0);
  }

  // 3. Allowed collections allowlist parsing (Default: empty = query nothing)
  let allowedCollections: string[] = [];
  if (runtimeSettings.collections && Array.isArray(runtimeSettings.collections)) {
    allowedCollections = runtimeSettings.collections
      .map((c: string) => String(c).trim().toLowerCase())
      .filter((c: string) => c.length > 0);
  } else if (runtimeSettings.allowedCollections !== undefined && runtimeSettings.allowedCollections !== null) {
    if (Array.isArray(runtimeSettings.allowedCollections)) {
      allowedCollections = runtimeSettings.allowedCollections
        .map((c: string) => String(c).trim().toLowerCase())
        .filter((c: string) => c.length > 0);
    } else {
      allowedCollections = String(runtimeSettings.allowedCollections)
        .split(',')
        .map((c) => c.trim().toLowerCase())
        .filter((c) => c.length > 0);
    }
  } else if (process.env.FIRESTORE_ALLOWED_COLLECTIONS) {
    allowedCollections = process.env.FIRESTORE_ALLOWED_COLLECTIONS
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter((c) => c.length > 0);
  }

  // 4. Write permissions lock (default false for read-only safety in tool domain)
  const allowWrites =
    runtimeSettings.allowWrites !== undefined
      ? Boolean(runtimeSettings.allowWrites)
      : process.env.FIRESTORE_ALLOW_WRITES === 'true';

  // 5. Excluded sensitive fields
  const defaultExcluded = ['password', 'passwordhash', 'secret', 'token', 'apikey', 'ssn', 'privatekey'];
  let customExcluded: string[] = [];
  if (runtimeSettings.excludedFields) {
    if (Array.isArray(runtimeSettings.excludedFields)) {
      customExcluded = runtimeSettings.excludedFields
        .map((f: string) => String(f).trim().toLowerCase())
        .filter((f: string) => f.length > 0);
    } else {
      customExcluded = String(runtimeSettings.excludedFields)
        .split(',')
        .map((f) => f.trim().toLowerCase())
        .filter((f) => f.length > 0);
    }
  } else if (process.env.FIRESTORE_EXCLUDED_FIELDS) {
    customExcluded = process.env.FIRESTORE_EXCLUDED_FIELDS
      .split(',')
      .map((f) => f.trim().toLowerCase())
      .filter((f) => f.length > 0);
  }
  const excludedFields = Array.from(new Set([...defaultExcluded, ...customExcluded]));

  // Max documents returned limit (capped at 500)
  const rawMaxDocs = runtimeSettings.maxDocuments || process.env.FIRESTORE_MAX_DOCUMENTS;
  const maxDocuments = rawMaxDocs ? Math.min(parseInt(String(rawMaxDocs), 10), 500) : 50;

  // Timeout ms
  const rawTimeout = runtimeSettings.queryTimeoutMs || process.env.FIRESTORE_TIMEOUT_MS;
  const queryTimeoutMs = rawTimeout ? parseInt(String(rawTimeout), 10) : 15000;

  // Firestore Guardrails & Operations
  const firestoreGuardrailMode = (runtimeSettings.firestoreGuardrailMode as 'STRICT_READ_ONLY' | 'GRANULAR_CUSTOM') || 'STRICT_READ_ONLY';
  const defaultAllowed = 'get,list,query,where,orderBy,limit,offset,count,collectionGroup,get document,get documents,list documents,query collection,query collection group,startAt,startAfter,endAt,endBefore,count aggregation';
  const rawAllowedOps = runtimeSettings.allowedOperations || defaultAllowed;
  const allowedOperations = (Array.isArray(rawAllowedOps) ? rawAllowedOps.join(',') : String(rawAllowedOps))
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  const defaultBlocked = 'create,set,update,delete,batchWrite,transaction,increment,arrayUnion,arrayRemove,deleteField,create document,set document,update document,delete document,batch write';
  const rawBlockedOps = runtimeSettings.blockedOperations || defaultBlocked;
  const blockedOperations = (Array.isArray(rawBlockedOps) ? rawBlockedOps.join(',') : String(rawBlockedOps))
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  const resolved: FirestoreConfig = {
    projectId,
    databaseId,
    allowedCollections,
    blockedCollections,
    allowWrites,
    excludedFields,
    maxDocuments,
    queryTimeoutMs,
    firestoreGuardrailMode,
    allowedOperations,
    blockedOperations,
  };

  if (!customDbId) {
    cachedConfig = resolved;
  }

  logger.info(
    {
      projectId,
      databaseId,
      allowedCollectionsCount: allowedCollections.length,
      blockedCollectionsCount: blockedCollections.length,
      allowWrites,
      maxDocuments,
    },
    'Firestore configuration initialized'
  );

  return resolved;
}

export function clearFirestoreConfigCache(): void {
  cachedConfig = null;
}
