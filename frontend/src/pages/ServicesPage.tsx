import React, { useState, useRef } from 'react';
import { ServiceConfig, DiagnosticTestResult, ServiceId } from '../api/client.js';
import { ThemeIcon } from '../theme/ThemeContext.js';

interface ServicesPageProps {
  services: ServiceConfig[];
  onToggle: (instanceId: string, enabled: boolean) => Promise<void>;
  onUpdateConfig: (
    instanceId: string,
    settings: Record<string, any>,
    meta?: { name?: string; description?: string; customerName?: string; requiredSecrets?: string[] }
  ) => Promise<void>;
  onDeleteInstance?: (instanceId: string) => Promise<void>;
  onTestConnection: (instanceId: string) => Promise<DiagnosticTestResult>;
  onOpenAddInstanceModal?: (serviceId?: ServiceId) => void;
  onNavigateToSecrets?: (category?: string) => void;
}

const SERVICE_GROUPS: {
  id: ServiceId;
  title: string;
  subtitle: string;
  icon: any;
  colorBadge: string;
}[] = [
  {
    id: 'bigquery',
    title: 'Google BigQuery Connectors',
    subtitle: 'GoogleSQL analytics, table URLs, dataset boundaries & query scan quotas.',
    icon: 'bigquery',
    colorBadge: 'badge-cyan',
  },
  {
    id: 'xero',
    title: 'Xero Accounting Connectors',
    subtitle: 'Organization instances, custom OAuth 2.0 credentials & financial sync.',
    icon: 'xero',
    colorBadge: 'badge-emerald',
  },
  {
    id: 'firestore',
    title: 'Cloud Firestore Connectors',
    subtitle: 'Hierarchical database instances, subcollection permit-lists & PII field exclusion tags.',
    icon: 'firestore',
    colorBadge: 'badge-amber',
  },
  {
    id: 'sagehr',
    title: 'Sage HR Connectors',
    subtitle: 'Regional company subdomains, employee directory sync & privacy attribute masking.',
    icon: 'sagehr',
    colorBadge: 'badge-muted',
  },
  {
    id: 'slack',
    title: 'Slack Federated Search Connectors',
    subtitle: 'User-delegated conversational search across channels & DMs with Token Rotation.',
    icon: 'search',
    colorBadge: 'badge-purple',
  },
];

type StorageUnit = 'MB' | 'GB' | 'TB';

const UNIT_MULTIPLIERS: Record<StorageUnit, number> = {
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
  TB: 1024 * 1024 * 1024 * 1024,
};

const formatBytesLimit = (bytes?: number) => {
  if (bytes === 0) return 'OFF (Disabled)';
  if (bytes === undefined || bytes === null || bytes === -1) return '∞';
  if (bytes < UNIT_MULTIPLIERS.GB) return `${(bytes / UNIT_MULTIPLIERS.MB).toFixed(0)} MB`;
  if (bytes < UNIT_MULTIPLIERS.TB) return `${(bytes / UNIT_MULTIPLIERS.GB).toFixed(1)} GB`;
  return `${(bytes / UNIT_MULTIPLIERS.TB).toFixed(2)} TB`;
};

const renderBytesLimit = (bytes?: number) => {
  if (bytes === 0) return 'OFF (Disabled)';
  if (bytes === undefined || bytes === null || bytes === -1) {
    return (
      <span title="Infinity" style={{ cursor: 'help', fontSize: '1.1rem', lineHeight: 1, display: 'inline-block' }}>
        ∞
      </span>
    );
  }
  return formatBytesLimit(bytes);
};

export interface SqlKeywordItem {
  keyword: string;
  category: 'READ_SAFE' | 'ROW_MUTATION' | 'DDL_DANGER';
  description: string;
}

export const ALL_SQL_KEYWORDS: SqlKeywordItem[] = [
  // Read / Safe Clauses (Green Allowed)
  { keyword: 'SELECT', category: 'READ_SAFE', description: 'reads columns & expressions' },
  { keyword: 'WITH', category: 'READ_SAFE', description: 'common table expressions (CTE)' },
  { keyword: 'FROM', category: 'READ_SAFE', description: 'specifies source table/view' },
  { keyword: 'JOIN', category: 'READ_SAFE', description: 'relational table join' },
  { keyword: 'LEFT JOIN', category: 'READ_SAFE', description: 'left outer matching join' },
  { keyword: 'RIGHT JOIN', category: 'READ_SAFE', description: 'right outer matching join' },
  { keyword: 'FULL JOIN', category: 'READ_SAFE', description: 'full outer matching join' },
  { keyword: 'INNER JOIN', category: 'READ_SAFE', description: 'inner strict matching join' },
  { keyword: 'UNION', category: 'READ_SAFE', description: 'combines unique query rows' },
  { keyword: 'UNION ALL', category: 'READ_SAFE', description: 'combines all result rows' },
  { keyword: 'WHERE', category: 'READ_SAFE', description: 'filters rows by condition' },
  { keyword: 'GROUP BY', category: 'READ_SAFE', description: 'aggregates row dimensions' },
  { keyword: 'HAVING', category: 'READ_SAFE', description: 'filters aggregated groups' },
  { keyword: 'ORDER BY', category: 'READ_SAFE', description: 'sorts result output' },
  { keyword: 'LIMIT', category: 'READ_SAFE', description: 'caps returned row count' },
  { keyword: 'OFFSET', category: 'READ_SAFE', description: 'skips starting rows' },
  { keyword: 'DISTINCT', category: 'READ_SAFE', description: 'eliminates duplicate rows' },
  { keyword: 'EXPLAIN', category: 'READ_SAFE', description: 'explains query execution plan' },

  // Row / Table Mutation (Red Blocked)
  { keyword: 'DELETE', category: 'ROW_MUTATION', description: 'deletes rows from table' },
  { keyword: 'UPDATE', category: 'ROW_MUTATION', description: 'modifies existing rows' },
  { keyword: 'INSERT', category: 'ROW_MUTATION', description: 'adds new rows to table' },
  { keyword: 'MERGE', category: 'ROW_MUTATION', description: 'conditional upsert/delete' },
  { keyword: 'TRUNCATE', category: 'ROW_MUTATION', description: 'removes all table data' },
  { keyword: 'TRUNCATE TABLE', category: 'ROW_MUTATION', description: 'removes all table data' },
  { keyword: 'DROP', category: 'ROW_MUTATION', description: 'permanently deletes table/view/schema' },
  { keyword: 'DROP TABLE', category: 'ROW_MUTATION', description: 'permanently deletes table' },
  { keyword: 'DROP VIEW', category: 'ROW_MUTATION', description: 'permanently deletes view' },
  { keyword: 'DROP SCHEMA', category: 'ROW_MUTATION', description: 'deletes dataset/schema' },
  { keyword: 'CREATE OR REPLACE TABLE', category: 'ROW_MUTATION', description: 'overwrites existing table' },
  { keyword: 'CREATE OR REPLACE VIEW', category: 'ROW_MUTATION', description: 'overwrites existing view' },
  { keyword: 'REPLACE', category: 'ROW_MUTATION', description: 'replaces existing objects' },
  { keyword: 'ALTER', category: 'ROW_MUTATION', description: 'modifies table/schema structure' },
  { keyword: 'ALTER TABLE', category: 'ROW_MUTATION', description: 'modifies table columns' },
  { keyword: 'ALTER SCHEMA', category: 'ROW_MUTATION', description: 'modifies dataset options' },

  // Danger DDL / Stored Execution & Cost Risks (Red Blocked)
  { keyword: 'CROSS JOIN', category: 'DDL_DANGER', description: 'Cartesian join (potential billing explosion)' },
  { keyword: 'CREATE', category: 'DDL_DANGER', description: 'creates persistent database objects' },
  { keyword: 'CREATE TABLE', category: 'DDL_DANGER', description: 'creates new persistent table' },
  { keyword: 'CREATE VIEW', category: 'DDL_DANGER', description: 'creates new SQL view' },
  { keyword: 'CREATE MATERIALIZED VIEW', category: 'DDL_DANGER', description: 'creates materialized view' },
  { keyword: 'CREATE FUNCTION', category: 'DDL_DANGER', description: 'creates user-defined function (UDF)' },
  { keyword: 'CREATE PROCEDURE', category: 'DDL_DANGER', description: 'creates stored procedure' },
  { keyword: 'CALL', category: 'DDL_DANGER', description: 'executes stored procedure' },
  { keyword: 'EXPORT', category: 'DDL_DANGER', description: 'exports query data to external storage' },
  { keyword: 'EXPORT DATA', category: 'DDL_DANGER', description: 'exports data to Cloud Storage' },
  { keyword: 'LOAD', category: 'DDL_DANGER', description: 'loads external data into BigQuery' },
  { keyword: 'LOAD DATA', category: 'DDL_DANGER', description: 'loads external data files' },
];

export const DEFAULT_ALLOWED_KEYWORDS = ALL_SQL_KEYWORDS.filter((k) => k.category === 'READ_SAFE').map((k) => k.keyword);
export const DEFAULT_BLOCKED_KEYWORDS = ALL_SQL_KEYWORDS.filter((k) => k.category !== 'READ_SAFE').map((k) => k.keyword);

export interface FirestoreOperationItem {
  operation: string;
  category: 'READ_SAFE' | 'WRITE_MUTATION';
  description: string;
}

export const ALL_FIRESTORE_OPERATIONS: FirestoreOperationItem[] = [
  // Permitted / Read-Safe Operations (Green Safe)
  { operation: 'get', category: 'READ_SAFE', description: 'retrieves single document by path or ID' },
  { operation: 'list', category: 'READ_SAFE', description: 'enumerates collection document references' },
  { operation: 'query', category: 'READ_SAFE', description: 'executes structured collection query' },
  { operation: 'where', category: 'READ_SAFE', description: 'filters documents by condition' },
  { operation: 'orderBy', category: 'READ_SAFE', description: 'sorts document results by field' },
  { operation: 'limit', category: 'READ_SAFE', description: 'caps returned document count' },
  { operation: 'offset', category: 'READ_SAFE', description: 'skips starting documents' },
  { operation: 'count', category: 'READ_SAFE', description: 'computes document count aggregation' },
  { operation: 'collectionGroup', category: 'READ_SAFE', description: 'queries across all subcollections' },
  { operation: 'get document', category: 'READ_SAFE', description: 'retrieves single document snapshot' },
  { operation: 'get documents', category: 'READ_SAFE', description: 'batch fetches document snapshots' },
  { operation: 'list documents', category: 'READ_SAFE', description: 'lists documents in target path' },
  { operation: 'query collection', category: 'READ_SAFE', description: 'executes filtered collection query' },
  { operation: 'query collection group', category: 'READ_SAFE', description: 'executes cross-subcollection query' },
  { operation: 'startAt', category: 'READ_SAFE', description: 'cursor pagination starting at value' },
  { operation: 'startAfter', category: 'READ_SAFE', description: 'cursor pagination starting after value' },
  { operation: 'endAt', category: 'READ_SAFE', description: 'cursor pagination ending at value' },
  { operation: 'endBefore', category: 'READ_SAFE', description: 'cursor pagination ending before value' },
  { operation: 'count aggregation', category: 'READ_SAFE', description: 'zero-read document count aggregation' },

  // Blocked / Mutation Operations (Red Blocked)
  { operation: 'create', category: 'WRITE_MUTATION', description: 'creates new document' },
  { operation: 'create document', category: 'WRITE_MUTATION', description: 'creates document if missing' },
  { operation: 'set', category: 'WRITE_MUTATION', description: 'overwrites document data' },
  { operation: 'set document', category: 'WRITE_MUTATION', description: 'sets or merges document data' },
  { operation: 'update', category: 'WRITE_MUTATION', description: 'modifies existing document fields' },
  { operation: 'update document', category: 'WRITE_MUTATION', description: 'updates specific document fields' },
  { operation: 'delete', category: 'WRITE_MUTATION', description: 'removes document from collection' },
  { operation: 'delete document', category: 'WRITE_MUTATION', description: 'permanently deletes document' },
  { operation: 'batchWrite', category: 'WRITE_MUTATION', description: 'atomic multi-document batch write' },
  { operation: 'batch write', category: 'WRITE_MUTATION', description: 'atomic multi-document batch write' },
  { operation: 'transaction', category: 'WRITE_MUTATION', description: 'interactive read-write transaction' },
  { operation: 'increment', category: 'WRITE_MUTATION', description: 'atomic numeric field increment' },
  { operation: 'arrayUnion', category: 'WRITE_MUTATION', description: 'atomically appends array elements' },
  { operation: 'arrayRemove', category: 'WRITE_MUTATION', description: 'atomically removes array elements' },
  { operation: 'deleteField', category: 'WRITE_MUTATION', description: 'sentinel operation to delete field' },
];

export const DEFAULT_ALLOWED_FIRESTORE_OPERATIONS = ALL_FIRESTORE_OPERATIONS.filter((o) => o.category === 'READ_SAFE').map((o) => o.operation);
export const DEFAULT_BLOCKED_FIRESTORE_OPERATIONS = ALL_FIRESTORE_OPERATIONS.filter((o) => o.category !== 'READ_SAFE').map((o) => o.operation);

const LEGACY_FIRESTORE_OPS = new Set([
  'DISCOVERY',
  'SCHEMA_SAMPLE',
  'SUBCOLLECTION_TRAVERSAL',
  'DOCUMENT_READ',
  'STRUCTURED_QUERY',
  'DOCUMENT_WRITE_MERGE',
]);

export function resolveFirestoreOperations(
  rawAllowed: string[] | string | undefined,
  rawBlocked: string[] | string | undefined
): { allowed: string[]; blocked: string[] } {
  let parsedAllowed: string[] = [];
  if (rawAllowed !== undefined && rawAllowed !== null) {
    parsedAllowed = Array.isArray(rawAllowed)
      ? rawAllowed.map(String).map((s) => s.trim()).filter(Boolean)
      : String(rawAllowed).split(',').map((s) => s.trim()).filter(Boolean);
  }

  let parsedBlocked: string[] = [];
  if (rawBlocked !== undefined && rawBlocked !== null) {
    parsedBlocked = Array.isArray(rawBlocked)
      ? rawBlocked.map(String).map((s) => s.trim()).filter(Boolean)
      : String(rawBlocked).split(',').map((s) => s.trim()).filter(Boolean);
  }

  // Check if legacy uppercase values are present
  const hasLegacy =
    parsedAllowed.some((op) => LEGACY_FIRESTORE_OPS.has(op.toUpperCase())) ||
    parsedBlocked.some((op) => LEGACY_FIRESTORE_OPS.has(op.toUpperCase()));

  const allKnownOps = ALL_FIRESTORE_OPERATIONS.map((o) => o.operation.toLowerCase());
  const hasKnownAllowed = parsedAllowed.some((op) => allKnownOps.includes(op.toLowerCase()));
  const hasKnownBlocked = parsedBlocked.some((op) => allKnownOps.includes(op.toLowerCase()));

  // If unconfigured, legacy, or empty of recognized operations, return full default lists
  if (hasLegacy || (!hasKnownAllowed && !hasKnownBlocked)) {
    return {
      allowed: [...DEFAULT_ALLOWED_FIRESTORE_OPERATIONS],
      blocked: [...DEFAULT_BLOCKED_FIRESTORE_OPERATIONS],
    };
  }

  // Preserve user custom selections and fill in any unassigned operations from catalog
  const allowedLower = new Set(parsedAllowed.map((o) => o.toLowerCase()));
  const blockedLower = new Set(parsedBlocked.map((o) => o.toLowerCase()));

  const finalAllowed = [...parsedAllowed];
  const finalBlocked = [...parsedBlocked];

  for (const item of ALL_FIRESTORE_OPERATIONS) {
    const opLower = item.operation.toLowerCase();
    if (!allowedLower.has(opLower) && !blockedLower.has(opLower)) {
      if (item.category === 'READ_SAFE') {
        finalAllowed.push(item.operation);
      } else {
        finalBlocked.push(item.operation);
      }
    }
  }

  return { allowed: finalAllowed, blocked: finalBlocked };
}

export function resolveSqlClauses(
  rawAllowed: string[] | string | undefined,
  rawBlocked: string[] | string | undefined
): { allowed: string[]; blocked: string[] } {
  let parsedAllowed: string[] = [];
  if (rawAllowed !== undefined && rawAllowed !== null) {
    parsedAllowed = Array.isArray(rawAllowed)
      ? rawAllowed.map(String).map((s) => s.trim()).filter(Boolean)
      : String(rawAllowed).split(',').map((s) => s.trim()).filter(Boolean);
  }

  let parsedBlocked: string[] = [];
  if (rawBlocked !== undefined && rawBlocked !== null) {
    parsedBlocked = Array.isArray(rawBlocked)
      ? rawBlocked.map(String).map((s) => s.trim()).filter(Boolean)
      : String(rawBlocked).split(',').map((s) => s.trim()).filter(Boolean);
  }

  const allKnownKeywords = ALL_SQL_KEYWORDS.map((k) => k.keyword.toUpperCase());
  const hasKnownAllowed = parsedAllowed.some((k) => allKnownKeywords.includes(k.toUpperCase()));
  const hasKnownBlocked = parsedBlocked.some((k) => allKnownKeywords.includes(k.toUpperCase()));

  if (!hasKnownAllowed && !hasKnownBlocked) {
    return {
      allowed: [...DEFAULT_ALLOWED_KEYWORDS],
      blocked: [...DEFAULT_BLOCKED_KEYWORDS],
    };
  }

  const allowedUpper = new Set(parsedAllowed.map((k) => k.toUpperCase()));
  const blockedUpper = new Set(parsedBlocked.map((k) => k.toUpperCase()));

  const finalAllowed = [...parsedAllowed];
  const finalBlocked = [...parsedBlocked];

  for (const item of ALL_SQL_KEYWORDS) {
    const kwUpper = item.keyword.toUpperCase();
    if (!allowedUpper.has(kwUpper) && !blockedUpper.has(kwUpper)) {
      if (item.category === 'READ_SAFE') {
        finalAllowed.push(item.keyword);
      } else {
        finalBlocked.push(item.keyword);
      }
    }
  }

  return { allowed: finalAllowed, blocked: finalBlocked };
}

export interface SlackScopeItem {
  scope: string;
  category: 'SEARCH' | 'METADATA' | 'HISTORY' | 'FILES';
  description: string;
  recommended: boolean;
}

export const ALL_SLACK_SCOPES: SlackScopeItem[] = [
  // Search scopes
  { scope: 'search:read.public', category: 'SEARCH', description: 'Searches messages & content in public Slack channels', recommended: true },
  { scope: 'search:read.private', category: 'SEARCH', description: 'Searches messages in accessible private channels', recommended: true },
  { scope: 'search:read.im', category: 'SEARCH', description: 'Searches direct messages accessible to authorized user', recommended: true },
  { scope: 'search:read.mpim', category: 'SEARCH', description: 'Searches multi-person direct messages accessible to user', recommended: true },
  { scope: 'search:read.files', category: 'SEARCH', description: 'Searches for files & documents shared in Slack', recommended: true },
  { scope: 'search:read.users', category: 'SEARCH', description: 'Searches for & identifies users in the workspace', recommended: true },

  // Metadata scopes
  { scope: 'users:read', category: 'METADATA', description: 'Retrieves user names & profile info to resolve user IDs', recommended: true },
  { scope: 'channels:read', category: 'METADATA', description: 'Retrieves public channel names & metadata', recommended: true },
  { scope: 'groups:read', category: 'METADATA', description: 'Retrieves private channel metadata for accessible channels', recommended: true },
  { scope: 'im:read', category: 'METADATA', description: 'Retrieves direct message conversation metadata', recommended: true },
  { scope: 'mpim:read', category: 'METADATA', description: 'Retrieves multi-person direct message conversation metadata', recommended: true },

  // History scopes
  { scope: 'channels:history', category: 'HISTORY', description: 'Retrieves messages & context from public channels', recommended: true },
  { scope: 'groups:history', category: 'HISTORY', description: 'Retrieves messages & context from accessible private channels', recommended: true },
  { scope: 'im:history', category: 'HISTORY', description: 'Retrieves messages & context from direct messages', recommended: true },
  { scope: 'mpim:history', category: 'HISTORY', description: 'Retrieves messages & context from multi-person direct messages', recommended: true },

  // Files scope
  { scope: 'files:read', category: 'FILES', description: 'Retrieves file metadata & accesses contents of shared files', recommended: true },
];

export const DEFAULT_ALLOWED_SLACK_SCOPES = ALL_SLACK_SCOPES.map((s) => s.scope);

export function resolveSlackScopes(rawScopes: string[] | string | undefined): { allowed: string[]; blocked: string[] } {
  let parsedAllowed: string[] = [];
  if (rawScopes !== undefined && rawScopes !== null && rawScopes !== '') {
    parsedAllowed = Array.isArray(rawScopes)
      ? rawScopes.map(String).map((s) => s.trim().toLowerCase()).filter(Boolean)
      : String(rawScopes).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  } else {
    return {
      allowed: ALL_SLACK_SCOPES.map((s) => s.scope),
      blocked: [],
    };
  }

  const allKnownScopes = ALL_SLACK_SCOPES.map((s) => s.scope.toLowerCase());
  const hasKnownAllowed = parsedAllowed.some((s) => allKnownScopes.includes(s));

  if (!hasKnownAllowed) {
    return {
      allowed: ALL_SLACK_SCOPES.map((s) => s.scope),
      blocked: [],
    };
  }

  const allowedLower = new Set(parsedAllowed);
  const finalAllowed: string[] = [];
  const finalBlocked: string[] = [];

  for (const item of ALL_SLACK_SCOPES) {
    if (allowedLower.has(item.scope.toLowerCase())) {
      finalAllowed.push(item.scope);
    } else {
      finalBlocked.push(item.scope);
    }
  }

  return { allowed: finalAllowed, blocked: finalBlocked };
}

export const ServicesPage: React.FC<ServicesPageProps> = ({
  services,
  onToggle,
  onUpdateConfig,
  onDeleteInstance,
  onTestConnection,
  onOpenAddInstanceModal,
  onNavigateToSecrets,
}) => {
  // Currently configuring instance in focused overlay mode
  const [activeConfigInstanceId, setActiveConfigInstanceId] = useState<string | null>(null);

  // Selected unit for BigQuery query scan cap editor
  const [scanCapUnit, setScanCapUnit] = useState<StorageUnit>('GB');

  // Resource pagination pages per instance
  const [bqResourcePage, setBqResourcePage] = useState<Record<string, number>>({});
  const [firestoreResourcePage, setFirestoreResourcePage] = useState<Record<string, number>>({});

  // Collapsed state per service group (collapsed by default)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const group of SERVICE_GROUPS) {
      initial[group.id] = true;
    }
    return initial;
  });

  // Local settings per instanceId
  const [localSettings, setLocalSettings] = useState<Record<string, Record<string, any>>>(() => {
    const map: Record<string, Record<string, any>> = {};
    for (const s of services) {
      map[s.instanceId] = { ...s.settings };
    }
    return map;
  });

  // Local metadata per instanceId
  const [localMeta, setLocalMeta] = useState<
    Record<
      string,
      {
        name: string;
        customerName: string;
        description: string;
        newTableInput: string;
        newCollectionInput: string;
        newBlockedCollectionInput?: string;
        newTagInput: string;
      }
    >
  >(() => {
    const map: any = {};
    for (const s of services) {
      map[s.instanceId] = {
        name: s.name,
        customerName: s.customerName || 'Default Instance',
        description: s.description,
        newTableInput: '',
        newCollectionInput: '',
        newBlockedCollectionInput: '',
        newTagInput: '',
      };
    }
    return map;
  });

  const [savingInstance, setSavingInstance] = useState<string | null>(null);
  const [testingInstance, setTestingInstance] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Refs for horizontal scroll ribbons
  const ribbonRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleScrollRibbon = (groupId: string, direction: 'left' | 'right') => {
    const el = ribbonRefs.current[groupId];
    if (el) {
      const scrollAmount = direction === 'left' ? -380 : 380;
      el.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const handleSettingChange = (instanceId: string, key: string, value: any) => {
    setLocalSettings((prev) => ({
      ...prev,
      [instanceId]: {
        ...(prev[instanceId] || {}),
        [key]: value,
      },
    }));
  };

  const handleMetaChange = (instanceId: string, field: string, value: string) => {
    setLocalMeta((prev) => ({
      ...prev,
      [instanceId]: {
        ...(prev[instanceId] || {}),
        [field]: value,
      },
    }));
  };

  // Add Table Resource to BigQuery instance
  const handleAddTable = (instanceId: string) => {
    const currentTableInput = localMeta[instanceId]?.newTableInput?.trim();
    if (!currentTableInput) return;

    const currentTables: string[] = localSettings[instanceId]?.tables || [];
    if (!currentTables.includes(currentTableInput)) {
      handleSettingChange(instanceId, 'tables', [...currentTables, currentTableInput]);
    }
    handleMetaChange(instanceId, 'newTableInput', '');
  };

  const handleRemoveTable = (instanceId: string, tableToRemove: string) => {
    const currentTables: string[] = localSettings[instanceId]?.tables || [];
    handleSettingChange(
      instanceId,
      'tables',
      currentTables.filter((t) => t !== tableToRemove)
    );
  };

  // SQL Keyword Guardrail Handlers (BigQuery)
  const handleShiftToBlocked = (instanceId: string, kw: string) => {
    const currentAllowed: string[] = activeAllowedSqlClauses;
    const currentBlocked: string[] = activeBlockedSqlClauses;
    const nextAllowed = currentAllowed.filter((k) => k.toUpperCase() !== kw.toUpperCase());
    const nextBlocked = currentBlocked.map((k) => k.toUpperCase()).includes(kw.toUpperCase())
      ? currentBlocked
      : [...currentBlocked, kw];
    handleSettingChange(instanceId, 'allowedSqlClauses', nextAllowed);
    handleSettingChange(instanceId, 'blockedSqlClauses', nextBlocked);
  };

  const handleShiftToAllowed = (instanceId: string, kw: string) => {
    const currentAllowed: string[] = activeAllowedSqlClauses;
    const currentBlocked: string[] = activeBlockedSqlClauses;
    const nextBlocked = currentBlocked.filter((k) => k.toUpperCase() !== kw.toUpperCase());
    const nextAllowed = currentAllowed.map((k) => k.toUpperCase()).includes(kw.toUpperCase())
      ? currentAllowed
      : [...currentAllowed, kw];
    handleSettingChange(instanceId, 'allowedSqlClauses', nextAllowed);
    handleSettingChange(instanceId, 'blockedSqlClauses', nextBlocked);
  };

  const handleResetDefaultSqlGuardrails = (instanceId: string) => {
    handleSettingChange(instanceId, 'allowedSqlClauses', DEFAULT_ALLOWED_KEYWORDS);
    handleSettingChange(instanceId, 'blockedSqlClauses', DEFAULT_BLOCKED_KEYWORDS);
  };

  const handleBlockAllMutations = (instanceId: string) => {
    const mutationKeys = ALL_SQL_KEYWORDS.filter((k) => k.category === 'ROW_MUTATION').map((k) => k.keyword);
    const currentAllowed = activeAllowedSqlClauses.filter((k) => !mutationKeys.includes(k));
    const currentBlocked = Array.from(new Set([...activeBlockedSqlClauses, ...mutationKeys]));
    handleSettingChange(instanceId, 'allowedSqlClauses', currentAllowed);
    handleSettingChange(instanceId, 'blockedSqlClauses', currentBlocked);
  };

  const handleBlockAllDdl = (instanceId: string) => {
    const ddlKeys = ALL_SQL_KEYWORDS.filter((k) => k.category === 'DDL_DANGER').map((k) => k.keyword);
    const currentAllowed = activeAllowedSqlClauses.filter((k) => !ddlKeys.includes(k));
    const currentBlocked = Array.from(new Set([...activeBlockedSqlClauses, ...ddlKeys]));
    handleSettingChange(instanceId, 'allowedSqlClauses', currentAllowed);
    handleSettingChange(instanceId, 'blockedSqlClauses', currentBlocked);
  };

  const handleAllowAllReadMethods = (instanceId: string) => {
    const readKeys = ALL_SQL_KEYWORDS.filter((k) => k.category === 'READ_SAFE').map((k) => k.keyword);
    const currentAllowed = Array.from(new Set([...activeAllowedSqlClauses, ...readKeys]));
    const currentBlocked = activeBlockedSqlClauses.filter((k) => !readKeys.includes(k));
    handleSettingChange(instanceId, 'allowedSqlClauses', currentAllowed);
    handleSettingChange(instanceId, 'blockedSqlClauses', currentBlocked);
  };

  // Firestore Operation Guardrail Handlers
  const handleShiftToBlockedFirestoreOp = (instanceId: string, op: string) => {
    const currentAllowed: string[] = activeFirestoreAllowedOps;
    const currentBlocked: string[] = activeFirestoreBlockedOps;
    const nextAllowed = currentAllowed.filter((o) => o.toLowerCase() !== op.toLowerCase());
    const nextBlocked = currentBlocked.some((o) => o.toLowerCase() === op.toLowerCase())
      ? currentBlocked
      : [...currentBlocked, op];
    handleSettingChange(instanceId, 'allowedOperations', nextAllowed);
    handleSettingChange(instanceId, 'blockedOperations', nextBlocked);
  };

  const handleShiftToAllowedFirestoreOp = (instanceId: string, op: string) => {
    const currentAllowed: string[] = activeFirestoreAllowedOps;
    const currentBlocked: string[] = activeFirestoreBlockedOps;
    const nextBlocked = currentBlocked.filter((o) => o.toLowerCase() !== op.toLowerCase());
    const nextAllowed = currentAllowed.some((o) => o.toLowerCase() === op.toLowerCase())
      ? currentAllowed
      : [...currentAllowed, op];
    handleSettingChange(instanceId, 'allowedOperations', nextAllowed);
    handleSettingChange(instanceId, 'blockedOperations', nextBlocked);
  };

  const handleResetDefaultFirestoreGuardrails = (instanceId: string) => {
    handleSettingChange(instanceId, 'allowedOperations', DEFAULT_ALLOWED_FIRESTORE_OPERATIONS);
    handleSettingChange(instanceId, 'blockedOperations', DEFAULT_BLOCKED_FIRESTORE_OPERATIONS);
    handleSettingChange(instanceId, 'allowWrites', false);
  };

  const handleBlockAllFirestoreWrites = (instanceId: string) => {
    const writeOps = ALL_FIRESTORE_OPERATIONS.filter((o) => o.category === 'WRITE_MUTATION').map((o) => o.operation);
    const currentAllowed = activeFirestoreAllowedOps.filter((o) => !writeOps.some((w) => w.toLowerCase() === o.toLowerCase()));
    const currentBlocked = Array.from(new Set([...activeFirestoreBlockedOps, ...writeOps]));
    handleSettingChange(instanceId, 'allowedOperations', currentAllowed);
    handleSettingChange(instanceId, 'blockedOperations', currentBlocked);
    handleSettingChange(instanceId, 'allowWrites', false);
  };

  const handleAllowAllFirestoreReads = (instanceId: string) => {
    const readOps = ALL_FIRESTORE_OPERATIONS.filter((o) => o.category === 'READ_SAFE').map((o) => o.operation);
    const currentAllowed = Array.from(new Set([...activeFirestoreAllowedOps, ...readOps]));
    const currentBlocked = activeFirestoreBlockedOps.filter((o) => !readOps.some((r) => r.toLowerCase() === o.toLowerCase()));
    handleSettingChange(instanceId, 'allowedOperations', currentAllowed);
    handleSettingChange(instanceId, 'blockedOperations', currentBlocked);
  };

  // Add Collection to Firestore instance
  const handleAddCollection = (instanceId: string) => {
    const currentInput = localMeta[instanceId]?.newCollectionInput?.trim();
    if (!currentInput) return;

    const currentCols: string[] = localSettings[instanceId]?.collections || [];
    if (!currentCols.includes(currentInput)) {
      handleSettingChange(instanceId, 'collections', [...currentCols, currentInput]);
    }
    handleMetaChange(instanceId, 'newCollectionInput', '');
  };

  const handleRemoveCollection = (instanceId: string, colToRemove: string) => {
    const currentCols: string[] = activeCollectionsList;
    handleSettingChange(
      instanceId,
      'collections',
      currentCols.filter((c) => c !== colToRemove)
    );
  };

  const handleToggleAllowAll = (instanceId: string) => {
    const currentCols: string[] = activeCollectionsList;
    if (currentCols.includes('allow_all') || currentCols.includes('*')) {
      handleSettingChange(instanceId, 'collections', []);
      handleSettingChange(instanceId, 'allowedCollections', '');
    } else {
      handleSettingChange(instanceId, 'collections', ['allow_all']);
      handleSettingChange(instanceId, 'allowedCollections', 'allow_all');
    }
  };

  const handleAddBlockedCollection = (instanceId: string) => {
    const currentInput = localMeta[instanceId]?.newBlockedCollectionInput?.trim();
    if (!currentInput) return;
    const currentBlocked: string[] = activeBlockedCollectionsList;
    if (!currentBlocked.map((c) => c.toLowerCase()).includes(currentInput.toLowerCase())) {
      handleSettingChange(instanceId, 'blockedCollections', [...currentBlocked, currentInput.toLowerCase()]);
    }
    handleMetaChange(instanceId, 'newBlockedCollectionInput', '');
  };

  const handleRemoveBlockedCollection = (instanceId: string, colToRemove: string) => {
    const currentBlocked: string[] = activeBlockedCollectionsList;
    handleSettingChange(
      instanceId,
      'blockedCollections',
      currentBlocked.filter((c) => c.toLowerCase() !== colToRemove.toLowerCase())
    );
  };

  const handleRestoreDefaultBlocklist = (instanceId: string) => {
    handleSettingChange(instanceId, 'blockedCollections', [
      'system_metadata',
      'services_config',
      'users_access',
      'user_sessions',
      'sessions',
      'audit_logs',
    ]);
  };

  // Add Tag to PII Exclusions
  const handleAddTag = (instanceId: string, fieldKey: 'excludedFields' | 'maskedFields') => {
    const currentInput = localMeta[instanceId]?.newTagInput?.trim();
    if (!currentInput) return;

    let currentTags: string[] = [];
    const val = localSettings[instanceId]?.[fieldKey];
    if (Array.isArray(val)) {
      currentTags = [...val];
    } else if (typeof val === 'string') {
      currentTags = val.split(',').map((t) => t.trim()).filter(Boolean);
    }

    if (!currentTags.includes(currentInput)) {
      handleSettingChange(instanceId, fieldKey, [...currentTags, currentInput]);
    }
    handleMetaChange(instanceId, 'newTagInput', '');
  };

  const handleRemoveTag = (instanceId: string, fieldKey: 'excludedFields' | 'maskedFields', tagToRemove: string) => {
    let currentTags: string[] = [];
    const val = localSettings[instanceId]?.[fieldKey];
    if (Array.isArray(val)) {
      currentTags = [...val];
    } else if (typeof val === 'string') {
      currentTags = val.split(',').map((t) => t.trim()).filter(Boolean);
    }

    handleSettingChange(
      instanceId,
      fieldKey,
      currentTags.filter((t) => t !== tagToRemove)
    );
  };

  // Slack OAuth Scopes Handlers
  const handleShiftSlackScopeToBlocked = (instanceId: string, scopeToBlock: string) => {
    const nextAllowed = activeSlackAllowedScopes.filter((s) => s.toLowerCase() !== scopeToBlock.toLowerCase());
    handleSettingChange(instanceId, 'scopes', nextAllowed.join(','));
  };

  const handleShiftSlackScopeToAllowed = (instanceId: string, scopeToAllow: string) => {
    const nextAllowed = activeSlackAllowedScopes.map((s) => s.toLowerCase()).includes(scopeToAllow.toLowerCase())
      ? activeSlackAllowedScopes
      : [...activeSlackAllowedScopes, scopeToAllow];
    handleSettingChange(instanceId, 'scopes', nextAllowed.join(','));
  };

  const handleSelectAllSlackScopes = (instanceId: string) => {
    handleSettingChange(instanceId, 'scopes', ALL_SLACK_SCOPES.map((s) => s.scope).join(','));
  };

  const handleResetDefaultSlackScopes = (instanceId: string) => {
    handleSettingChange(instanceId, 'scopes', DEFAULT_ALLOWED_SLACK_SCOPES.join(','));
  };

  const handleSelectPublicSlackScopesOnly = (instanceId: string) => {
    const publicOnly = ALL_SLACK_SCOPES
      .filter((s) => !s.scope.includes('.private') && !s.scope.includes('.im') && !s.scope.includes('.mpim') && !s.scope.includes('im:') && !s.scope.includes('mpim:') && !s.scope.includes('groups:'))
      .map((s) => s.scope);
    handleSettingChange(instanceId, 'scopes', publicOnly.join(','));
  };

  const handleSelectSearchSlackScopesOnly = (instanceId: string) => {
    const searchOnly = ALL_SLACK_SCOPES.filter((s) => s.category === 'SEARCH').map((s) => s.scope);
    handleSettingChange(instanceId, 'scopes', searchOnly.join(','));
  };

  // Save changes & Close focused modal
  const handleSave = async (instanceId: string) => {
    try {
      setSavingInstance(instanceId);
      const settings = localSettings[instanceId] || {};
      const meta = localMeta[instanceId] || {};

      await onUpdateConfig(instanceId, settings, {
        name: meta.name,
        customerName: meta.customerName,
        description: meta.description,
      });

      setActiveConfigInstanceId(null);
    } finally {
      setSavingInstance(null);
    }
  };

  const handleTest = async (instanceId: string) => {
    try {
      setTestingInstance(instanceId);
      await onTestConnection(instanceId);
    } finally {
      setTestingInstance(null);
    }
  };

  const activeCount = services.filter((s) => s.enabled).length;
  const totalTools = services.reduce((acc, s) => acc + s.toolCount, 0);

  // Active configuration instance object
  const activeService = services.find((s) => s.instanceId === activeConfigInstanceId);
  const activeSettings = activeConfigInstanceId ? (localSettings[activeConfigInstanceId] || activeService?.settings || {}) : {};
  const activeMeta = activeConfigInstanceId
    ? localMeta[activeConfigInstanceId] || {
        name: activeService?.name || '',
        customerName: activeService?.customerName || '',
        description: activeService?.description || '',
        newTableInput: '',
        newCollectionInput: '',
        newBlockedCollectionInput: '',
        newTagInput: '',
      }
    : null;

  const getActiveTags = (fieldKey: 'excludedFields' | 'maskedFields') => {
    const val = activeSettings[fieldKey];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') return val.split(',').map((t) => t.trim()).filter(Boolean);
    return [];
  };

  const activeTablesList: string[] = activeSettings.tables || (activeSettings.allowedTables && activeSettings.allowedTables !== '*' ? activeSettings.allowedTables.split(',').map((t: string) => t.trim()).filter(Boolean) : []);

  const activeBlockedCollectionsList: string[] = activeSettings.blockedCollections
    ? (Array.isArray(activeSettings.blockedCollections)
        ? activeSettings.blockedCollections
        : String(activeSettings.blockedCollections).split(',').map((c: string) => c.trim()).filter(Boolean))
    : ['system_metadata', 'services_config', 'users_access', 'user_sessions', 'sessions', 'audit_logs'];

  const activeCollectionsList: string[] = activeSettings.collections !== undefined
    ? (Array.isArray(activeSettings.collections)
        ? activeSettings.collections
        : String(activeSettings.collections).split(',').map((c: string) => c.trim()).filter(Boolean))
    : (activeSettings.allowedCollections !== undefined
        ? (Array.isArray(activeSettings.allowedCollections)
            ? activeSettings.allowedCollections
            : String(activeSettings.allowedCollections).split(',').map((c: string) => c.trim()).filter(Boolean))
        : []);

  // Current bytes for active BigQuery instance
  const currentBytesBilled = activeSettings.maxBytesBilled ?? 1073741824;

  const { allowed: activeAllowedSqlClauses, blocked: activeBlockedSqlClauses } =
    resolveSqlClauses(activeSettings.allowedSqlClauses, activeSettings.blockedSqlClauses);

  const activeGuardrailMode: 'STRICT_READ_ONLY' | 'GRANULAR_CUSTOM' =
    activeSettings.sqlGuardrailMode || 'STRICT_READ_ONLY';

  const { allowed: activeFirestoreAllowedOps, blocked: activeFirestoreBlockedOps } =
    resolveFirestoreOperations(activeSettings.allowedOperations, activeSettings.blockedOperations);

  const activeFirestoreGuardrailMode: 'STRICT_READ_ONLY' | 'GRANULAR_CUSTOM' =
    activeSettings.firestoreGuardrailMode || 'STRICT_READ_ONLY';

  const { allowed: activeSlackAllowedScopes, blocked: activeSlackBlockedScopes } =
    resolveSlackScopes(activeSettings.scopes);

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <ThemeIcon name="services" size={24} />
            <h2>Services Config</h2>
          </div>
          <p>
            Service categories with horizontally expanding instance tracks. Click <strong>Configure & Edit</strong> on any card to enter focused configuration mode with field requirement badges.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {onOpenAddInstanceModal && (
            <button className="btn btn-primary" onClick={() => onOpenAddInstanceModal()}>
              <ThemeIcon name="plus" size={14} />
              <span>Add Customer Instance</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-icon emerald">
            <ThemeIcon name="check" size={20} />
          </div>
          <div className="stat-info">
            <div className="stat-value">{activeCount} / {services.length}</div>
            <div className="stat-label">ACTIVE CONNECTOR INSTANCES</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon cyan">
            <ThemeIcon name="lightning" size={20} />
          </div>
          <div className="stat-info">
            <div className="stat-value">{totalTools} Tools</div>
            <div className="stat-label">BOUND MCP RPC METHODS</div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ width: '100%', maxWidth: '380px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search instances by customer, title, or ID..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />
        </div>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Showing {services.length} instances across {SERVICE_GROUPS.length} connector categories
        </div>
      </div>

      {/* =========================================================================
          COLLAPSIBLE SERVICE CATEGORY SECTIONS with HORIZONTAL CARD RIBBONS
          ========================================================================= */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {SERVICE_GROUPS.map((group) => {
          const groupServices = services.filter(
            (s) =>
              s.serviceId === group.id &&
              (s.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
                (s.customerName || '').toLowerCase().includes(searchFilter.toLowerCase()) ||
                s.description.toLowerCase().includes(searchFilter.toLowerCase()) ||
                s.instanceId.toLowerCase().includes(searchFilter.toLowerCase()))
          );

          if (groupServices.length === 0 && searchFilter) return null;
          const isCollapsed = Boolean(collapsedGroups[group.id]);
          const groupActiveCount = groupServices.filter((s) => s.enabled).length;
          const groupDisabledCount = groupServices.length - groupActiveCount;

          return (
            <div key={group.id} className="service-section-container">
              {/* Section Header */}
              <div className="service-section-header" onClick={() => toggleGroupCollapse(group.id)}>
                <div className="service-section-title-area">
                  <div className={`collapse-indicator ${isCollapsed ? 'collapsed' : ''}`}>
                    ▾
                  </div>
                  <div className="service-icon-box" style={{ width: '34px', height: '34px' }}>
                    <ThemeIcon name={group.icon || group.id} size={18} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                        {group.title}
                      </h3>
                      <span className="badge badge-cyan" style={{ fontSize: '0.65rem', padding: '2px 7px' }}>
                        {groupServices.length} {groupServices.length === 1 ? 'INSTANCE' : 'INSTANCES'}
                      </span>
                      {groupServices.length === 0 ? (
                        <span className="badge badge-muted" style={{ fontSize: '0.65rem', padding: '2px 7px' }}>
                          NO INSTANCES
                        </span>
                      ) : groupActiveCount === groupServices.length ? (
                        <span className="badge badge-emerald" style={{ fontSize: '0.65rem', padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span className="pulse-dot" />
                          <span>{groupServices.length === 1 ? 'ACTIVE' : 'ALL ACTIVE'}</span>
                        </span>
                      ) : groupActiveCount === 0 ? (
                        <span className="badge badge-rose" style={{ fontSize: '0.65rem', padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span>{groupServices.length === 1 ? 'DISABLED' : 'ALL DISABLED'}</span>
                        </span>
                      ) : (
                        <>
                          <span className="badge badge-emerald" style={{ fontSize: '0.65rem', padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span className="pulse-dot" />
                            <span>{groupActiveCount} ACTIVE</span>
                          </span>
                          <span className="badge badge-rose" style={{ fontSize: '0.65rem', padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span>{groupDisabledCount} DISABLED</span>
                          </span>
                        </>
                      )}
                    </div>
                    <p style={{ fontSize: '0.785rem', color: 'var(--text-muted)', margin: 0, marginTop: '2px' }}>
                      {group.subtitle}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                  {/* Scroll Helper Buttons */}
                  {groupServices.length > 2 && (
                    <div style={{ display: 'flex', gap: '0.25rem', marginRight: '0.25rem' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.35rem 0.55rem', fontSize: '0.85rem' }}
                        onClick={() => handleScrollRibbon(group.id, 'left')}
                        title="Scroll left"
                      >
                        ◀
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.35rem 0.55rem', fontSize: '0.85rem' }}
                        onClick={() => handleScrollRibbon(group.id, 'right')}
                        title="Scroll right"
                      >
                        ▶
                      </button>
                    </div>
                  )}

                  {onOpenAddInstanceModal && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => onOpenAddInstanceModal(group.id)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <ThemeIcon name="plus" size={12} />
                      <span>Add {group.id === 'bigquery' ? 'BigQuery' : group.id === 'xero' ? 'Xero' : group.id === 'firestore' ? 'Firestore' : group.id === 'slack' ? 'Slack' : 'Sage HR'} Instance</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Horizontal Card Ribbon */}
              {!isCollapsed && (
                <div
                  className="service-cards-ribbon"
                  ref={(el) => {
                    ribbonRefs.current[group.id] = el;
                  }}
                >
                  {groupServices.map((service) => {
                    const settings = localSettings[service.instanceId] || service.settings || {};
                    const isTesting = testingInstance === service.instanceId;
                    const isDefault = ['xero', 'bigquery', 'firestore', 'sagehr', 'slack'].includes(service.instanceId);

                    const getTags = (fieldKey: 'excludedFields' | 'maskedFields') => {
                      const val = settings[fieldKey];
                      if (Array.isArray(val)) return val;
                      if (typeof val === 'string') return val.split(',').map((t) => t.trim()).filter(Boolean);
                      return [];
                    };

                    const tablesList: string[] = settings.tables || (settings.allowedTables && settings.allowedTables !== '*' ? settings.allowedTables.split(',').map((t: string) => t.trim()).filter(Boolean) : []);
                    const collectionsList: string[] = settings.collections || (settings.allowedCollections && settings.allowedCollections !== '*' ? settings.allowedCollections.split(',').map((c: string) => c.trim()).filter(Boolean) : []);

                    return (
                      <div
                        key={service.instanceId}
                        className={`service-card-item glass-card ${service.enabled ? 'card-active' : 'card-disabled'}`}
                      >
                        {/* Customer Badge & Domain */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.65rem', minWidth: 0 }}>
                          <span
                            className="badge badge-cyan"
                            style={{
                              fontSize: '0.65rem',
                              padding: '2px 8px',
                              maxWidth: '55%',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={service.customerName || 'Customer Instance'}
                          >
                            {service.customerName || 'Customer Instance'}
                          </span>
                          <span
                            style={{
                              fontSize: '0.685rem',
                              color: 'var(--text-muted)',
                              fontFamily: 'var(--font-mono)',
                              maxWidth: '45%',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              textAlign: 'right',
                            }}
                            title={`Instance ID: ${service.instanceId}`}
                          >
                            ID: {service.instanceId}
                          </span>
                        </div>

                        {/* Card Header */}
                        <div className="card-header" style={{ marginBottom: '0.85rem' }}>
                          <div className="card-title-group">
                            <div className="service-icon-box">
                              <ThemeIcon name={service.serviceId as any} size={20} />
                            </div>
                            <div>
                              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>{service.name}</h3>
                              <p style={{ margin: 0, marginTop: '2px', fontSize: '0.75rem' }}>
                                {service.toolCount} Tools &bull; {service.serviceId.toUpperCase()}
                              </p>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button
                              onClick={() => onToggle(service.instanceId, !service.enabled)}
                              className={`badge ${service.enabled ? 'badge-emerald' : 'badge-rose'}`}
                              style={{ cursor: 'pointer', border: 'none', padding: '0.3rem 0.6rem' }}
                              title="Click to toggle status"
                            >
                              <span className="pulse-dot" />
                              <span>{service.enabled ? 'ACTIVE' : 'DISABLED'}</span>
                            </button>

                            <label className="switch-container">
                              <input
                                type="checkbox"
                                className="switch-input"
                                checked={service.enabled}
                                onChange={(e) => onToggle(service.instanceId, e.target.checked)}
                              />
                              <span className="switch-slider" />
                            </label>
                          </div>
                        </div>

                        {/* Description (2-line clamp) */}
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '34px' }}>
                          {service.description}
                        </p>

                        {/* Structured Metrics Highlight Box */}
                        <div style={{ background: 'var(--bg-input)', padding: '0.75rem 0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--border-subtle)' }}>
                          {service.serviceId === 'bigquery' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.775rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Location / Region:</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{settings.location || 'EU'}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Bound Tables / URLs:</span>
                                <span style={{ fontWeight: 600, color: 'var(--accent-bright)' }}>{tablesList.length} Tables Bound</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Query Scan Cap:</span>
                                <span style={{ fontWeight: 600, color: settings.maxBytesBilled === 0 ? 'var(--text-muted)' : 'var(--emerald-bright)' }}>
                                  {renderBytesLimit(settings.maxBytesBilled)}
                                </span>
                              </div>
                            </div>
                          )}

                          {service.serviceId === 'firestore' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.775rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Database ID:</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{settings.databaseId || '(default)'}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Permitted Collections:</span>
                                <span style={{ fontWeight: 600, color: 'var(--accent-bright)' }}>{collectionsList.length} Collections</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>PII Field Exclusions:</span>
                                <span style={{ fontWeight: 600, color: 'var(--amber-bright)' }}>{getTags('excludedFields').length} Protected Fields</span>
                              </div>
                            </div>
                          )}

                          {service.serviceId === 'xero' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.775rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Tenant Status:</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{settings.tenantId ? 'Custom UUID Bound' : 'Auto-Resolved'}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Rate Limit Cap:</span>
                                <span style={{ fontWeight: 600, color: 'var(--emerald-bright)' }}>{settings.rateLimitMaxPerMin || 60} req/min</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Secret Vault Keys:</span>
                                <span style={{ fontWeight: 600, color: 'var(--accent-bright)' }}>{service.requiredSecrets?.length || 2} Secret Keys</span>
                              </div>
                            </div>
                          )}

                          {service.serviceId === 'sagehr' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.775rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Subdomain:</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{settings.subdomain || 'acme'}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Privacy Masks:</span>
                                <span style={{ fontWeight: 600, color: 'var(--rose-bright)' }}>{getTags('maskedFields').length} PII Attributes Masked</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Write Policy:</span>
                                <span style={{ fontWeight: 600, color: 'var(--emerald-bright)' }}>{settings.allowWrites ? 'Read & Write' : 'Read-Only'}</span>
                              </div>
                            </div>
                          )}

                          {service.serviceId === 'slack' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.775rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Max Results:</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{settings.maxResults || 10} msgs/query</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>Search Inclusions:</span>
                                <span style={{ fontWeight: 600, color: 'var(--accent-bright)' }}>{settings.includeDMs !== false ? 'Channels & DMs' : 'Channels Only'}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-muted)' }}>User Access Policy:</span>
                                <span style={{ fontWeight: 600, color: settings.allowAllUsers !== false ? 'var(--emerald-bright)' : 'var(--amber-bright)' }}>
                                  {settings.allowAllUsers !== false ? 'All Connected Users' : 'Strict IAM Allowlist'}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ flex: 1 }}
                            onClick={() => setActiveConfigInstanceId(service.instanceId)}
                          >
                            <ThemeIcon name="cog" size={13} />
                            <span>Configure & Edit</span>
                          </button>

                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleTest(service.instanceId)}
                            disabled={isTesting}
                            title="Run live diagnostic test"
                          >
                            <ThemeIcon name="lightning" size={13} />
                            <span>{isTesting ? 'Testing...' : 'Test'}</span>
                          </button>

                          {!isDefault && onDeleteInstance && (
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => {
                                if (window.confirm(`Delete connector instance "${service.name}"?`)) {
                                  onDeleteInstance(service.instanceId);
                                }
                              }}
                              title="Delete instance"
                            >
                              <ThemeIcon name="trash" size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* =========================================================================
          FOCUSED CONFIGURATION MODAL (WITH LIGHTER TRANSLUCENT FADE BACKDROP)
          ========================================================================= */}
      {activeService && activeMeta && (
        <div
          className="config-focus-backdrop"
          onClick={() => setActiveConfigInstanceId(null)}
        >
          <div
            className="config-focus-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Header Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setActiveConfigInstanceId(null)}
                  title="Close and return to overview"
                >
                  ↩ Return to Overview
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ThemeIcon name={activeService.serviceId as any} size={22} />
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {activeMeta.name}
                    </h3>
                    {activeService.serviceId === 'slack' && (
                      <p style={{ margin: 0, marginTop: '3px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Federated user-delegated search across authorized Slack channels and DMs with automated Token Rotation.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span className="badge badge-cyan">
                  {activeMeta.customerName || 'Customer Instance'}
                </span>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => handleSave(activeService.instanceId)}
                  disabled={savingInstance === activeService.instanceId}
                >
                  <span>{savingInstance === activeService.instanceId ? 'Saving Changes...' : 'Save & Apply Configuration'}</span>
                </button>
              </div>
            </div>

            {/* Dedicated BigQuery Studio vs Standard 3-Column Grid */}
            {activeService.serviceId === 'bigquery' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* ROW 1: DUAL COLUMN (LEFT: NAMING & METADATA; RIGHT: PROJECT LEVEL RESOURCE ACCESS) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }} className="bigquery-top-grid">
                  {/* COLUMN 1: NAMING CONVENTIONS & INSTANCE METADATA */}
                  <div className="config-section-box" style={{ border: '1px solid var(--border-active)', boxShadow: 'var(--shadow-md)', background: 'var(--bg-card)' }}>
                    <div className="config-section-header">
                      <ThemeIcon name="users" size={15} />
                      <span>1. Customer Identity & Infrastructure Details</span>
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Customer / Org Name
                        <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '1px 5px', marginLeft: '6px' }}>REQUIRED</span>
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        value={activeMeta.customerName}
                        onChange={(e) => handleMetaChange(activeService.instanceId, 'customerName', e.target.value)}
                        placeholder="e.g. primary-tenant or finance-dept"
                        required
                      />
                      <div className="form-hint">Partitions configuration, rate quotas, and secret vault keys.</div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Display Title
                        <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '1px 5px', marginLeft: '6px' }}>REQUIRED</span>
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        value={activeMeta.name}
                        onChange={(e) => handleMetaChange(activeService.instanceId, 'name', e.target.value)}
                        placeholder="e.g. Primary Billing Export"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        GCP Project ID Override
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>(Optional / Auto-resolved)</span>
                      </label>
                      <input
                        type="text"
                        className="form-input code-font"
                        placeholder="e.g. your-gcp-project-id"
                        value={activeSettings.projectId || ''}
                        onChange={(e) => handleSettingChange(activeService.instanceId, 'projectId', e.target.value)}
                      />
                      <div className="form-hint">Target GCP project hosting BigQuery tables & datasets.</div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Default Dataset ID
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>(Optional)</span>
                      </label>
                      <input
                        type="text"
                        className="form-input code-font"
                        placeholder="e.g. analytics_dataset"
                        value={activeSettings.defaultDataset || ''}
                        onChange={(e) => handleSettingChange(activeService.instanceId, 'defaultDataset', e.target.value)}
                      />
                      <div className="form-hint">Default dataset used when table names are unqualified in queries.</div>
                    </div>

                    {/* Dataset Location / Region - Read Only FYI Badge */}
                    <div className="form-group">
                      <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>GCP Dataset Location / Region</span>
                        <span className="badge badge-cyan" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>READ-ONLY FYI</span>
                      </label>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.55rem 0.75rem',
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <ThemeIcon name="globe" size={15} />
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                            {activeSettings.location || 'EU'}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            ({(activeSettings.location || 'EU') === 'EU' ? 'Multi-Region Europe' : (activeSettings.location || 'EU') === 'US' ? 'Multi-Region United States' : 'Regional Zone'})
                          </span>
                        </div>
                        <span className="badge badge-muted" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                          INHERITED
                        </span>
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">
                        Instance Description
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>(Optional)</span>
                      </label>
                      <textarea
                        className="form-textarea"
                        rows={2}
                        value={activeMeta.description}
                        onChange={(e) => handleMetaChange(activeService.instanceId, 'description', e.target.value)}
                        placeholder="Describes purpose, permissions, or billing notes..."
                      />
                    </div>
                  </div>

                  {/* COLUMN 2: PROJECT LEVEL BQ ACCESS & RESOURCE REGISTRY */}
                  <div className="config-section-box" style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border-active)', boxShadow: 'var(--shadow-md)', background: 'var(--bg-card)' }}>
                    <div className="config-section-header">
                      <ThemeIcon name="lightning" size={15} />
                      <span>2. Project, Dataset & Table Level Access</span>
                    </div>

                    {(() => {
                      const BQ_PAGE_SIZE = 15;
                      const bqCurrentPage = bqResourcePage[activeService.instanceId] || 1;
                      const bqTotalPages = Math.max(1, Math.ceil(activeTablesList.length / BQ_PAGE_SIZE));
                      const bqSafeCurrentPage = Math.min(bqCurrentPage, bqTotalPages);
                      const bqPaginatedTables = activeTablesList.slice((bqSafeCurrentPage - 1) * BQ_PAGE_SIZE, bqSafeCurrentPage * BQ_PAGE_SIZE);

                      return (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                            <label className="form-label" style={{ margin: 0 }}>
                              Allowed Target Resources ({activeTablesList.length})
                            </label>
                            <span className={`badge ${activeTablesList.length === 0 ? 'badge-muted' : 'badge-emerald'}`} style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                              {activeTablesList.length === 0 ? 'PROJECT-WIDE (UNRESTRICTED)' : `${activeTablesList.length} TARGETS CONFIGURED`}
                            </span>
                          </div>

                          {activeTablesList.length === 0 ? (
                            <div style={{ padding: '0.75rem 0.85rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)', marginBottom: '0.65rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              🔓 <strong>Project-Wide Access Enabled:</strong> All datasets and tables inside the project are accessible to AI tools. To enforce a strict least-privilege boundary, add specific table, view, or dataset IDs below.
                            </div>
                          ) : (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.5rem' }}>
                                {bqPaginatedTables.map((tbl) => {
                                  const raw = tbl.trim().replace(':', '.');
                                  const parts = raw.split('.').filter(Boolean);
                                  const isTableScope = parts.length >= 3;
                                  const isDatasetScope = parts.length === 2;
                                  const itemRegion = activeSettings.location || 'EU';

                                  return (
                                    <div key={tbl} className="resource-input-row" style={{ alignItems: 'center', gap: '0.35rem' }}>
                                      <span
                                        className={`badge ${isTableScope ? 'badge-emerald' : isDatasetScope ? 'badge-cyan' : 'badge-amber'}`}
                                        style={{ fontSize: '0.625rem', padding: '2px 5px', whiteSpace: 'nowrap', minWidth: '55px', textAlign: 'center' }}
                                      >
                                        {isTableScope ? 'TABLE' : isDatasetScope ? 'DATASET' : 'PROJECT'}
                                      </span>
                                      <span className="badge badge-muted" style={{ fontSize: '0.625rem', padding: '2px 5px', whiteSpace: 'nowrap' }} title="Region FYI">
                                        {itemRegion}
                                      </span>
                                      <input
                                        type="text"
                                        className="form-input code-font"
                                        style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem', flex: 1 }}
                                        value={tbl}
                                        readOnly
                                      />
                                      <button
                                        type="button"
                                        className="btn btn-danger btn-sm"
                                        style={{ padding: '0.35rem 0.55rem' }}
                                        onClick={() => handleRemoveTable(activeService.instanceId, tbl)}
                                        title="Remove resource"
                                      >
                                        &times;
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* 15-Item Pagination Controls */}
                              {bqTotalPages > 1 && (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginTop: 'auto',
                                    marginBottom: '0.65rem',
                                    padding: '0.35rem 0.65rem',
                                    background: 'var(--bg-input)',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border-subtle)',
                                    fontSize: '0.725rem',
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                                    disabled={bqSafeCurrentPage <= 1}
                                    onClick={() => setBqResourcePage((prev) => ({ ...prev, [activeService.instanceId]: bqSafeCurrentPage - 1 }))}
                                  >
                                    ◀ Prev
                                  </button>
                                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                                    Page {bqSafeCurrentPage} of {bqTotalPages} ({activeTablesList.length} total resources)
                                  </span>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                                    disabled={bqSafeCurrentPage >= bqTotalPages}
                                    onClick={() => setBqResourcePage((prev) => ({ ...prev, [activeService.instanceId]: bqSafeCurrentPage + 1 }))}
                                  >
                                    Next ▶
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="resource-input-row" style={{ alignItems: 'center' }}>
                            <input
                              type="text"
                              className="form-input code-font"
                              placeholder="e.g. my-project.analytics_dataset.invoices_table"
                              value={activeMeta.newTableInput || ''}
                              onChange={(e) => handleMetaChange(activeService.instanceId, 'newTableInput', e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddTable(activeService.instanceId)}
                            />
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleAddTable(activeService.instanceId)}
                            >
                              + Add Target
                            </button>
                          </div>

                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                            Enter <code>project.dataset.table</code> (table/view), <code>project.dataset</code> (dataset), or <code>project</code> (project-wide).
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* ROW 2: FULL-WIDTH DUAL-MODE SQL GUARDRAIL CONFIGURATOR */}
                <div className="config-section-box" style={{ border: '1px solid var(--border-active)', boxShadow: 'var(--shadow-md)', background: 'var(--bg-card)' }}>
                  <div className="config-section-header" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ThemeIcon name="shield" size={15} />
                      <span>3. SQL Query & Command Guardrails</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${activeGuardrailMode === 'STRICT_READ_ONLY' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '3px 9px', fontSize: '0.725rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        onClick={() => handleSettingChange(activeService.instanceId, 'sqlGuardrailMode', 'STRICT_READ_ONLY')}
                      >
                        <ThemeIcon name="shield" size={13} />
                        <span>Strict Whitelist (SELECT / WITH Only)</span>
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${activeGuardrailMode === 'GRANULAR_CUSTOM' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '3px 9px', fontSize: '0.725rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        onClick={() => handleSettingChange(activeService.instanceId, 'sqlGuardrailMode', 'GRANULAR_CUSTOM')}
                      >
                        <ThemeIcon name="cog" size={13} />
                        <span>Granular Keyword Dual-List</span>
                      </button>
                    </div>
                  </div>

                  {/* Multi-Statement SQL Blocking Toggle */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.65rem 0.85rem',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      marginBottom: '0.85rem',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.825rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>Block Multi-Statement SQL Queries</span>
                        <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>SECURITY INVARIANT</span>
                      </div>
                      <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Intercepts and rejects SQL queries containing semicolons (<code>;</code>) to prevent multi-command injection chains.
                      </div>
                    </div>
                    <label className="switch-container" style={{ margin: 0 }}>
                      <input
                        type="checkbox"
                        className="switch-input"
                        checked={activeSettings.blockMultiStatement !== false}
                        onChange={(e) => handleSettingChange(activeService.instanceId, 'blockMultiStatement', e.target.checked)}
                      />
                      <span className="switch-slider" />
                    </label>
                  </div>

                  {activeGuardrailMode === 'STRICT_READ_ONLY' ? (
                    <div
                      style={{
                        padding: '1rem 1.25rem',
                        background: 'var(--bg-input)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                      }}
                    >
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(16, 185, 129, 0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--emerald-bright)',
                          flexShrink: 0,
                        }}
                      >
                        <ThemeIcon name="check" size={20} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '2px' }}>
                          Strict Read-Only Mode Active (Recommended Invariant)
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          Queries whose first executable statement is <strong>SELECT</strong> or <strong>WITH</strong> are allowed. All multi-statement SQL chains (containing <code>;</code>), mutations (<code>DELETE</code>, <code>UPDATE</code>, <code>INSERT</code>), and DDL operations are unconditionally rejected with constructive AI feedback.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* Quick Preset Action Bar - Positioned at TOP */}
                      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.85rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '0.25rem' }}>
                          Quick Presets:
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.725rem', padding: '3px 8px' }}
                          onClick={() => handleResetDefaultSqlGuardrails(activeService.instanceId)}
                        >
                          Reset to Recommended Defaults
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.725rem', padding: '3px 8px' }}
                          onClick={() => handleBlockAllMutations(activeService.instanceId)}
                        >
                          Block All Row Mutations
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.725rem', padding: '3px 8px' }}
                          onClick={() => handleBlockAllDdl(activeService.instanceId)}
                        >
                          Block All DDL & Procedures
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.725rem', padding: '3px 8px' }}
                          onClick={() => handleAllowAllReadMethods(activeService.instanceId)}
                        >
                          Allow All Read Methods
                        </button>
                      </div>

                      <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                        Click any keyword tag to <strong>shift it between the Allowed and Blocked lists</strong>. All queries containing any token from the Blocked list will be intercepted before BigQuery execution.
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }} className="guardrails-dual-grid">
                        {/* ALLOWED KEYWORDS LIST */}
                        <div style={{ padding: '0.75rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--emerald-bright)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              🟢 Permitted Methods ({activeAllowedSqlClauses.length})
                            </span>
                            <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)' }}>Click to block ➔</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                            {activeAllowedSqlClauses.map((kw) => {
                              const item = ALL_SQL_KEYWORDS.find((k) => k.keyword.toUpperCase() === kw.toUpperCase());
                              return (
                                <button
                                  key={kw}
                                  type="button"
                                  className="badge badge-emerald"
                                  style={{
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.725rem',
                                    padding: '3px 7px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    fontFamily: 'var(--font-mono)',
                                    fontWeight: 700,
                                  }}
                                  onClick={() => handleShiftToBlocked(activeService.instanceId, kw)}
                                  title={item?.description ? `${kw} (${item.description}) - Click to shift to Blocked list` : `Click to shift '${kw}' to Blocked list`}
                                >
                                  <span>✓</span>
                                  <span>{kw}</span>
                                  {item?.description && (
                                    <span style={{ fontSize: '0.625rem', opacity: 0.85, fontWeight: 400, fontFamily: 'var(--font-sans)' }}>
                                      ({item.description})
                                    </span>
                                  )}
                                  <span style={{ opacity: 0.6 }}>➔</span>
                                </button>
                              );
                            })}
                            {activeAllowedSqlClauses.length === 0 && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--accent-rose)', padding: '0.5rem 0' }}>
                                ⚠️ No methods permitted! All SQL queries will be blocked.
                              </div>
                            )}
                          </div>
                        </div>

                        {/* BLOCKED KEYWORDS LIST */}
                        <div style={{ padding: '0.75rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--rose-bright)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              🔴 Blocked Commands & DDL ({activeBlockedSqlClauses.length})
                            </span>
                            <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)' }}>Click to permit ⬅</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                            {activeBlockedSqlClauses.map((kw) => {
                              const item = ALL_SQL_KEYWORDS.find((k) => k.keyword.toUpperCase() === kw.toUpperCase());
                              return (
                                <button
                                  key={kw}
                                  type="button"
                                  className="badge badge-rose"
                                  style={{
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.725rem',
                                    padding: '3px 7px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    fontFamily: 'var(--font-mono)',
                                    fontWeight: 700,
                                  }}
                                  onClick={() => handleShiftToAllowed(activeService.instanceId, kw)}
                                  title={item?.description ? `${kw} (${item.description}) - Click to shift to Allowed list` : `Click to shift '${kw}' to Allowed list`}
                                >
                                  <span style={{ opacity: 0.6 }}>⬅</span>
                                  <span>✕</span>
                                  <span>{kw}</span>
                                  {item?.description && (
                                    <span style={{ fontSize: '0.625rem', opacity: 0.85, fontWeight: 400, fontFamily: 'var(--font-sans)' }}>
                                      ({item.description})
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ROW 3: QUOTAS, SCAN CAP & 5 CLEVER CONTROLS */}
                <div className="config-section-box" style={{ border: '1px solid var(--border-active)', boxShadow: 'var(--shadow-md)', background: 'var(--bg-card)' }}>
                  <div className="config-section-header">
                    <ThemeIcon name="shield" size={15} />
                    <span>4. Query Scan Budget, Row Caps & Clever Cost Controls</span>
                  </div>

                  {/* Top Subgrid: Hard Scan Cap & Row Limit */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle)' }}>
                    {/* Scan Cap */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                        <label className="form-label" style={{ margin: 0 }}>
                          Maximum Bytes Billed Cap
                        </label>
                        <div style={{ display: 'flex', gap: '0.2rem', background: 'var(--bg-card)', padding: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                          {(['MB', 'GB', 'TB'] as const).map((unit) => (
                            <button
                              key={unit}
                              type="button"
                              className={`btn btn-sm ${scanCapUnit === unit ? 'btn-primary' : 'btn-secondary'}`}
                              style={{ padding: '1px 6px', fontSize: '0.65rem', borderRadius: 'var(--radius-xs)', minWidth: '30px' }}
                              onClick={() => setScanCapUnit(unit)}
                            >
                              {unit}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input
                          type="text"
                          className="form-input"
                          style={{
                            width: '110px',
                            fontSize: currentBytesBilled === -1 || currentBytesBilled === null || currentBytesBilled === undefined ? '1.25rem' : '0.85rem',
                            fontWeight: 700,
                            textAlign: 'center',
                            color: currentBytesBilled === -1 || currentBytesBilled === null || currentBytesBilled === undefined ? 'var(--cyan-bright)' : 'var(--text-primary)',
                          }}
                          value={
                            currentBytesBilled === -1 || currentBytesBilled === null || currentBytesBilled === undefined
                              ? '∞'
                              : currentBytesBilled === 0
                              ? '0'
                              : (currentBytesBilled / UNIT_MULTIPLIERS[scanCapUnit]).toString()
                          }
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            if (raw === '∞' || raw === '-1' || raw.toLowerCase() === 'inf' || raw.toLowerCase() === 'infinity') {
                              handleSettingChange(activeService.instanceId, 'maxBytesBilled', -1);
                              return;
                            }
                            const val = parseFloat(raw);
                            if (isNaN(val) || val <= 0) {
                              handleSettingChange(activeService.instanceId, 'maxBytesBilled', 0);
                            } else {
                              handleSettingChange(activeService.instanceId, 'maxBytesBilled', Math.round(val * UNIT_MULTIPLIERS[scanCapUnit]));
                            }
                          }}
                        />
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                          {scanCapUnit}
                        </span>

                        <div style={{ marginLeft: 'auto' }}>
                          {currentBytesBilled === 0 ? (
                            <span className="badge badge-muted" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                              OFF (Disabled)
                            </span>
                          ) : currentBytesBilled === -1 || currentBytesBilled === null || currentBytesBilled === undefined ? (
                            <span className="badge badge-cyan" title="Infinity" style={{ fontSize: '0.9rem', padding: '1px 8px', cursor: 'help', display: 'inline-flex', alignItems: 'center' }}>
                              ∞
                            </span>
                          ) : (
                            <span className="badge badge-emerald" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                              {formatBytesLimit(currentBytesBilled)}
                            </span>
                          )}
                        </div>
                      </div>

                      <input
                        type="range"
                        min="0"
                        max="10.5"
                        step="0.5"
                        value={
                          currentBytesBilled === -1 || currentBytesBilled === null || currentBytesBilled === undefined
                            ? 10.5
                            : currentBytesBilled === 0
                            ? 0
                            : Math.min(Math.max(currentBytesBilled / UNIT_MULTIPLIERS[scanCapUnit], 0.1), 10)
                        }
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (val <= 0) {
                            handleSettingChange(activeService.instanceId, 'maxBytesBilled', 0);
                          } else if (val >= 10.2) {
                            handleSettingChange(activeService.instanceId, 'maxBytesBilled', -1);
                          } else {
                            handleSettingChange(activeService.instanceId, 'maxBytesBilled', Math.round(val * UNIT_MULTIPLIERS[scanCapUnit]));
                          }
                        }}
                        style={{ width: '100%', accentColor: 'var(--accent-primary)', marginBottom: '0.5rem' }}
                      />

                      {/* Quick Presets */}
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                          onClick={() => handleSettingChange(activeService.instanceId, 'maxBytesBilled', 0)}
                        >
                          OFF (0)
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                          onClick={() => {
                            setScanCapUnit('GB');
                            handleSettingChange(activeService.instanceId, 'maxBytesBilled', 1 * UNIT_MULTIPLIERS.GB);
                          }}
                        >
                          1.0 GB
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                          onClick={() => {
                            setScanCapUnit('GB');
                            handleSettingChange(activeService.instanceId, 'maxBytesBilled', 2.5 * UNIT_MULTIPLIERS.GB);
                          }}
                        >
                          2.5 GB
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                          onClick={() => {
                            setScanCapUnit('GB');
                            handleSettingChange(activeService.instanceId, 'maxBytesBilled', 5 * UNIT_MULTIPLIERS.GB);
                          }}
                        >
                          5.0 GB
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                          onClick={() => {
                            setScanCapUnit('GB');
                            handleSettingChange(activeService.instanceId, 'maxBytesBilled', 10 * UNIT_MULTIPLIERS.GB);
                          }}
                        >
                          10.0 GB
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                          title="Infinity"
                          onClick={() => handleSettingChange(activeService.instanceId, 'maxBytesBilled', -1)}
                        >
                          ∞
                        </button>
                      </div>
                    </div>

                    {/* Max Rows Returned */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                        <label className="form-label" style={{ margin: 0 }}>
                          Max Rows Returned
                        </label>
                        <span className="badge badge-cyan" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                          {activeSettings.maxRowsReturned || 100} ROWS
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: '110px', fontSize: '0.85rem', fontWeight: 700, textAlign: 'center' }}
                          min={1}
                          max={1000}
                          value={activeSettings.maxRowsReturned || 100}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            handleSettingChange(activeService.instanceId, 'maxRowsReturned', isNaN(val) ? 100 : Math.min(Math.max(val, 1), 1000));
                          }}
                        />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          Rows per query (Hard max: 1,000)
                        </span>
                      </div>

                      <input
                        type="range"
                        min="10"
                        max="1000"
                        step="10"
                        value={activeSettings.maxRowsReturned || 100}
                        onChange={(e) => handleSettingChange(activeService.instanceId, 'maxRowsReturned', parseInt(e.target.value, 10))}
                        style={{ width: '100%', accentColor: 'var(--accent-primary)', marginBottom: '0.5rem' }}
                      />
                    </div>
                  </div>

                  {/* 5 Clever Cost & Security Controls */}
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <ThemeIcon name="lightning" size={14} />
                      <span>Intelligent BigQuery Billing & Performance Controls</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                      {/* Control 1: Zero-Cost Dry Run Gate */}
                      <div style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                            1. Zero-Cost Pre-Flight Dry Run Gate
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.35 }}>
                            Runs <code>dryRun: true</code> in ~50ms for <strong>$0.00</strong> to inspect exact bytes scanned. Rejects if query exceeds scan cap.
                          </div>
                        </div>
                        <label className="switch-container" style={{ margin: 0 }}>
                          <input
                            type="checkbox"
                            className="switch-input"
                            checked={activeSettings.enableDryRunPreFlight !== false}
                            onChange={(e) => handleSettingChange(activeService.instanceId, 'enableDryRunPreFlight', e.target.checked)}
                          />
                          <span className="switch-slider" />
                        </label>
                      </div>

                      {/* Control 2: Mandatory Partition Filter Enforcer */}
                      <div style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                            2. Mandatory Partition Filter Enforcer
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.35 }}>
                            Requires queries on partitioned tables to filter by date (<code>_PARTITIONDATE</code> / timestamp), cutting scan costs by up to 99%.
                          </div>
                        </div>
                        <label className="switch-container" style={{ margin: 0 }}>
                          <input
                            type="checkbox"
                            className="switch-input"
                            checked={Boolean(activeSettings.requirePartitionFilter)}
                            onChange={(e) => handleSettingChange(activeService.instanceId, 'requirePartitionFilter', e.target.checked)}
                          />
                          <span className="switch-slider" />
                        </label>
                      </div>

                      {/* Control 3: SELECT * Wildcard Interceptor */}
                      <div style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                            3. SELECT * Wildcard Interceptor
                          </div>
                          <div style={{ display: 'flex', gap: '0.2rem', background: 'var(--bg-card)', padding: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                            {(['ALLOW', 'WARN', 'BLOCK'] as const).map((policy) => (
                              <button
                                key={policy}
                                type="button"
                                className={`btn btn-sm ${(activeSettings.selectAllPolicy || 'WARN') === policy ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ padding: '1px 6px', fontSize: '0.625rem', borderRadius: 'var(--radius-xs)' }}
                                onClick={() => handleSettingChange(activeService.instanceId, 'selectAllPolicy', policy)}
                              >
                                {policy}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                          Columnar scan protection: warns or restricts <code>SELECT *</code> to encourage projecting only needed columns.
                        </div>
                      </div>

                      {/* Control 4: Query Execution Timeout */}
                      <div style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                            4. Query Execution Timeout (Slot Cap)
                          </div>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--emerald-bright)' }}>
                            {activeSettings.queryTimeoutSeconds || 30}s
                          </span>
                        </div>
                        <input
                          type="range"
                          min="5"
                          max="300"
                          step="5"
                          value={activeSettings.queryTimeoutSeconds || 30}
                          onChange={(e) => handleSettingChange(activeService.instanceId, 'queryTimeoutSeconds', parseInt(e.target.value, 10))}
                          style={{ width: '100%', accentColor: 'var(--accent-primary)', marginBottom: '0.35rem' }}
                        />
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                          Sets <code>jobTimeoutMs</code> to terminate runaway queries before exhausting project slot quotas.
                        </div>
                      </div>

                      {/* Control 5: Automatic Query Cache Enforcement */}
                      <div style={{ gridColumn: '1 / -1', padding: '0.65rem 0.85rem', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                            5. Automatic Query Cache Enforcement (useQueryCache: true)
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.35 }}>
                            Enforces 24-hour deterministic BigQuery caching. Repeated analytical queries return in milliseconds at <strong>$0.00</strong>.
                          </div>
                        </div>
                        <label className="switch-container" style={{ margin: 0 }}>
                          <input
                            type="checkbox"
                            className="switch-input"
                            checked={activeSettings.useQueryCache !== false}
                            onChange={(e) => handleSettingChange(activeService.instanceId, 'useQueryCache', e.target.checked)}
                          />
                          <span className="switch-slider" />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeService.serviceId === 'firestore' ? (
              /* Dedicated Cloud Firestore Elaborate Studio */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* ROW 1: DUAL COLUMN (LEFT: IDENTITY & DATABASE METADATA; RIGHT: 15-ITEM PAGINATED COLLECTION REGISTRY) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }} className="firestore-top-grid">
                  {/* COLUMN 1: IDENTITY & DATABASE DETAILS */}
                  <div className="config-section-box" style={{ border: '1px solid var(--border-active)', boxShadow: 'var(--shadow-md)', background: 'var(--bg-card)' }}>
                    <div className="config-section-header">
                      <ThemeIcon name="users" size={15} />
                      <span>1. Customer Identity & Firestore Database</span>
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Customer / Org Name
                        <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '1px 5px', marginLeft: '6px' }}>REQUIRED</span>
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        value={activeMeta.customerName}
                        onChange={(e) => handleMetaChange(activeService.instanceId, 'customerName', e.target.value)}
                        placeholder="e.g. production-crm or DCA"
                        required
                      />
                      <div className="form-hint">Partitions configuration, rate quotas, and secret vault keys.</div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Display Title
                        <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '1px 5px', marginLeft: '6px' }}>REQUIRED</span>
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        value={activeMeta.name}
                        onChange={(e) => handleMetaChange(activeService.instanceId, 'name', e.target.value)}
                        placeholder="e.g. Cloud Firestore CRM Instance"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        GCP Project ID Override
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>(Optional / Auto-resolved)</span>
                      </label>
                      <input
                        type="text"
                        className="form-input code-font"
                        placeholder="e.g. your-gcp-project-id"
                        value={activeSettings.projectId || ''}
                        onChange={(e) => handleSettingChange(activeService.instanceId, 'projectId', e.target.value)}
                      />
                      <div className="form-hint">Target GCP project hosting Cloud Firestore database.</div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Firestore Database ID
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>(Default: '(default)')</span>
                      </label>
                      <input
                        type="text"
                        className="form-input code-font"
                        placeholder="(default)"
                        value={activeSettings.databaseId || '(default)'}
                        onChange={(e) => handleSettingChange(activeService.instanceId, 'databaseId', e.target.value)}
                      />
                      <div className="form-hint">Named Firestore database ID or '(default)'.</div>
                    </div>

                    {/* Database Region FYI Tag */}
                    <div className="form-group">
                      <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>GCP Database Location / Region</span>
                        <span className="badge badge-cyan" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>READ-ONLY FYI</span>
                      </label>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.55rem 0.75rem',
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <ThemeIcon name="globe" size={15} />
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                            {activeSettings.location || 'EU'}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            ({(activeSettings.location || 'EU') === 'EU' ? 'Multi-Region Europe' : (activeSettings.location || 'EU') === 'US' ? 'Multi-Region United States' : 'Regional Zone'})
                          </span>
                        </div>
                        <span className="badge badge-muted" style={{ fontSize: '0.65rem', padding: '1px 5px' }}>
                          INHERITED
                        </span>
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">
                        Instance Description
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>(Optional)</span>
                      </label>
                      <textarea
                        className="form-textarea"
                        rows={2}
                        value={activeMeta.description}
                        onChange={(e) => handleMetaChange(activeService.instanceId, 'description', e.target.value)}
                        placeholder="Describes purpose, schema version, or permissions..."
                      />
                    </div>
                  </div>

                  {/* COLUMN 2: 15-ITEM PAGINATED COLLECTION REGISTRY */}
                  <div className="config-section-box" style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border-active)', boxShadow: 'var(--shadow-md)', background: 'var(--bg-card)' }}>
                    <div className="config-section-header">
                      <ThemeIcon name="lightning" size={15} />
                      <span>2. Permitted Collections & Hierarchy Registry</span>
                    </div>

                    {(() => {
                      const FS_PAGE_SIZE = 15;
                      const fsCurrentPage = firestoreResourcePage[activeService.instanceId] || 1;
                      const isAllowAll = activeCollectionsList.includes('allow_all') || activeCollectionsList.includes('*');
                      const displayCollections = isAllowAll ? ['* (allow_all)'] : activeCollectionsList;
                      const fsTotalPages = Math.max(1, Math.ceil(displayCollections.length / FS_PAGE_SIZE));
                      const fsSafeCurrentPage = Math.min(fsCurrentPage, fsTotalPages);
                      const fsPaginated = displayCollections.slice((fsSafeCurrentPage - 1) * FS_PAGE_SIZE, fsSafeCurrentPage * FS_PAGE_SIZE);

                      return (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                            <label className="form-label" style={{ margin: 0 }}>
                              Allowed Collection Paths ({activeCollectionsList.length})
                            </label>
                            <span
                              className={`badge ${
                                activeCollectionsList.length === 0
                                  ? 'badge-rose'
                                  : isAllowAll
                                  ? 'badge-cyan'
                                  : 'badge-emerald'
                              }`}
                              style={{ fontSize: '0.65rem', padding: '1px 5px' }}
                            >
                              {activeCollectionsList.length === 0
                                ? 'ZERO-TRUST (LOCKED)'
                                : isAllowAll
                                ? 'ALLOW-ALL (WILDCARD)'
                                : `${activeCollectionsList.length} TARGETS CONFIGURED`}
                            </span>
                          </div>

                          {activeCollectionsList.length === 0 ? (
                            <div
                              style={{
                                padding: '0.75rem 0.85rem',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                marginBottom: '0.65rem',
                                fontSize: '0.75rem',
                                color: 'var(--accent-rose)',
                              }}
                            >
                              🔒 <strong>Zero-Trust Default Active:</strong> Allowlist is empty. LLM agents cannot query or discover any collections. Add specific collections below, or click <code>+ Enable allow_all</code>.
                            </div>
                          ) : isAllowAll ? (
                            <div
                              style={{
                                padding: '0.75rem 0.85rem',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: 'rgba(6, 182, 212, 0.08)',
                                border: '1px solid rgba(6, 182, 212, 0.25)',
                                marginBottom: '0.65rem',
                                fontSize: '0.75rem',
                                color: 'var(--accent-cyan)',
                              }}
                            >
                              🔓 <strong>Allow-All Wildcard Mode Active:</strong> All collections in the Firestore database are queryable <em>except</em> collections in the Blocklist below.
                            </div>
                          ) : (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.5rem' }}>
                                {fsPaginated.map((col) => {
                                  const isSubcollection = col.includes('/');
                                  const itemRegion = activeSettings.location || 'EU';

                                  return (
                                    <div key={col} className="resource-input-row" style={{ alignItems: 'center', gap: '0.35rem' }}>
                                      <span
                                        className={`badge ${isSubcollection ? 'badge-cyan' : 'badge-emerald'}`}
                                        style={{ fontSize: '0.625rem', padding: '2px 5px', whiteSpace: 'nowrap', minWidth: '70px', textAlign: 'center' }}
                                      >
                                        {isSubcollection ? 'SUBCOLLECTION' : 'ROOT_COLLECTION'}
                                      </span>
                                      <span className="badge badge-muted" style={{ fontSize: '0.625rem', padding: '2px 5px', whiteSpace: 'nowrap' }} title="Region FYI">
                                        {itemRegion}
                                      </span>
                                      <input
                                        type="text"
                                        className="form-input code-font"
                                        style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem', flex: 1 }}
                                        value={col}
                                        readOnly
                                      />
                                      <button
                                        type="button"
                                        className="btn btn-danger btn-sm"
                                        style={{ padding: '0.35rem 0.55rem' }}
                                        onClick={() => handleRemoveCollection(activeService.instanceId, col)}
                                        title="Remove collection"
                                      >
                                        &times;
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* 15-Item Pagination Controls */}
                              {fsTotalPages > 1 && (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginTop: 'auto',
                                    marginBottom: '0.65rem',
                                    padding: '0.35rem 0.65rem',
                                    background: 'var(--bg-input)',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border-subtle)',
                                    fontSize: '0.725rem',
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                                    disabled={fsSafeCurrentPage <= 1}
                                    onClick={() => setFirestoreResourcePage((prev) => ({ ...prev, [activeService.instanceId]: fsSafeCurrentPage - 1 }))}
                                  >
                                    ◀ Prev
                                  </button>
                                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                                    Page {fsSafeCurrentPage} of {fsTotalPages} ({displayCollections.length} collections)
                                  </span>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                                    disabled={fsSafeCurrentPage >= fsTotalPages}
                                    onClick={() => setFirestoreResourcePage((prev) => ({ ...prev, [activeService.instanceId]: fsSafeCurrentPage + 1 }))}
                                  >
                                    Next ▶
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="resource-input-row" style={{ alignItems: 'center' }}>
                            <input
                              type="text"
                              className="form-input code-font"
                              placeholder="e.g. invoices or customers/cust_123/orders"
                              value={activeMeta.newCollectionInput || ''}
                              onChange={(e) => handleMetaChange(activeService.instanceId, 'newCollectionInput', e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddCollection(activeService.instanceId)}
                            />
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleAddCollection(activeService.instanceId)}
                            >
                              + Add Target
                            </button>
                          </div>

                          <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className={`btn btn-sm ${
                                isAllowAll ? 'btn-danger' : 'btn-secondary'
                              }`}
                              style={{ fontSize: '0.725rem', padding: '3px 8px' }}
                              onClick={() => handleToggleAllowAll(activeService.instanceId)}
                            >
                              {isAllowAll ? 'Disable allow_all' : '+ Enable allow_all'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.725rem', padding: '3px 8px' }}
                              onClick={() => {
                                handleMetaChange(activeService.instanceId, 'newCollectionInput', 'invoices');
                              }}
                            >
                              Insert Example (invoices)
                            </button>
                            {activeCollectionsList.length > 0 && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                style={{ fontSize: '0.725rem', padding: '3px 8px', color: 'var(--accent-rose)' }}
                                onClick={() => {
                                  handleSettingChange(activeService.instanceId, 'collections', []);
                                  handleSettingChange(activeService.instanceId, 'allowedCollections', '');
                                }}
                              >
                                Clear Allowlist
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* ROW 2: FULL-WIDTH DUAL-MODE FIRESTORE OPERATION PERMISSIONS */}
                <div className="config-section-box" style={{ border: '1px solid var(--border-active)', boxShadow: 'var(--shadow-md)', background: 'var(--bg-card)' }}>
                  <div className="config-section-header" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ThemeIcon name="shield" size={15} />
                      <span>3. Firestore Operation Permissions & Policy Mode</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${activeFirestoreGuardrailMode === 'STRICT_READ_ONLY' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '3px 9px', fontSize: '0.725rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        onClick={() => {
                          handleSettingChange(activeService.instanceId, 'firestoreGuardrailMode', 'STRICT_READ_ONLY');
                          handleSettingChange(activeService.instanceId, 'allowWrites', false);
                        }}
                      >
                        <ThemeIcon name="shield" size={13} />
                        <span>Strict Read-Only Mode (Zero-Trust)</span>
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${activeFirestoreGuardrailMode === 'GRANULAR_CUSTOM' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '3px 9px', fontSize: '0.725rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        onClick={() => handleSettingChange(activeService.instanceId, 'firestoreGuardrailMode', 'GRANULAR_CUSTOM')}
                      >
                        <ThemeIcon name="cog" size={13} />
                        <span>Granular Operation Dual-List</span>
                      </button>
                    </div>
                  </div>

                  {activeFirestoreGuardrailMode === 'STRICT_READ_ONLY' ? (
                    <div
                      style={{
                        padding: '1rem 1.25rem',
                        background: 'var(--bg-input)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                      }}
                    >
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(16, 185, 129, 0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--emerald-bright)',
                          flexShrink: 0,
                        }}
                      >
                        <ThemeIcon name="check" size={20} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '2px' }}>
                          Strict Read-Only Mode Active (Recommended Invariant)
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          All write and merge operations (<code>firestore-set-document</code>) are unconditionally disabled. AI agents can only perform read discovery (<code>list-collections</code>, <code>get-collection-schema</code>, <code>list-subcollections</code>) and document queries on allowlisted paths.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* Quick Presets */}
                      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.85rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '0.25rem' }}>
                          Quick Presets:
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.725rem', padding: '3px 8px' }}
                          onClick={() => handleResetDefaultFirestoreGuardrails(activeService.instanceId)}
                        >
                          Reset to Recommended Defaults
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.725rem', padding: '3px 8px' }}
                          onClick={() => handleBlockAllFirestoreWrites(activeService.instanceId)}
                        >
                          Block All Writes & Merges
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.725rem', padding: '3px 8px' }}
                          onClick={() => handleAllowAllFirestoreReads(activeService.instanceId)}
                        >
                          Allow All Read & Discovery
                        </button>
                      </div>

                      <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                        Click any operation tag to <strong>shift it between Allowed and Blocked lists</strong>. All attempts to invoke a blocked operation are intercepted before hitting Firestore.
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }} className="guardrails-dual-grid">
                        {/* ALLOWED OPERATIONS */}
                        <div style={{ padding: '0.75rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--emerald-bright)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              🟢 Permitted Methods ({activeFirestoreAllowedOps.length})
                            </span>
                            <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)' }}>Click to block ➔</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                            {activeFirestoreAllowedOps.map((opKey) => {
                              const item = ALL_FIRESTORE_OPERATIONS.find((o) => o.operation.toLowerCase() === opKey.toLowerCase());
                              return (
                                <button
                                  key={opKey}
                                  type="button"
                                  className="badge badge-emerald"
                                  style={{
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.725rem',
                                    padding: '3px 7px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    fontFamily: 'var(--font-mono)',
                                    fontWeight: 700,
                                  }}
                                  onClick={() => handleShiftToBlockedFirestoreOp(activeService.instanceId, opKey)}
                                  title={item?.description ? `${opKey} - ${item.description} (Click to shift to Blocked list)` : `Click to shift '${opKey}' to Blocked list`}
                                >
                                  <span>✓</span>
                                  <span>{opKey}</span>
                                  {item?.description && (
                                    <span style={{ fontSize: '0.625rem', opacity: 0.85, fontWeight: 400, fontFamily: 'var(--font-sans)' }}>
                                      ({item.description})
                                    </span>
                                  )}
                                  <span style={{ opacity: 0.6 }}>➔</span>
                                </button>
                              );
                            })}
                            {activeFirestoreAllowedOps.length === 0 && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--accent-rose)', padding: '0.5rem 0' }}>
                                ⚠️ No operations permitted! All Firestore operations will be blocked.
                              </div>
                            )}
                          </div>
                        </div>

                        {/* BLOCKED OPERATIONS */}
                        <div style={{ padding: '0.75rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--rose-bright)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              🔴 Blocked Operations ({activeFirestoreBlockedOps.length})
                            </span>
                            <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)' }}>Click to permit ⬅</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                            {activeFirestoreBlockedOps.map((opKey) => {
                              const item = ALL_FIRESTORE_OPERATIONS.find((o) => o.operation.toLowerCase() === opKey.toLowerCase());
                              return (
                                <button
                                  key={opKey}
                                  type="button"
                                  className="badge badge-rose"
                                  style={{
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.725rem',
                                    padding: '3px 7px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    fontFamily: 'var(--font-mono)',
                                    fontWeight: 700,
                                  }}
                                  onClick={() => handleShiftToAllowedFirestoreOp(activeService.instanceId, opKey)}
                                  title={item?.description ? `${opKey} - ${item.description} (Click to shift to Permitted list)` : `Click to shift '${opKey}' to Permitted list`}
                                >
                                  <span style={{ opacity: 0.6 }}>⬅</span>
                                  <span>✕</span>
                                  <span>{opKey}</span>
                                  {item?.description && (
                                    <span style={{ fontSize: '0.625rem', opacity: 0.85, fontWeight: 400, fontFamily: 'var(--font-sans)' }}>
                                      ({item.description})
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ROW 3: DEDICATED DUAL-COLUMN DATA PROTECTION (COLLECTION SHIELD & PII REDACTION) */}
                <div className="config-section-box" style={{ border: '1px solid var(--border-active)', boxShadow: 'var(--shadow-md)', background: 'var(--bg-card)' }}>
                  <div className="config-section-header" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ThemeIcon name="shield" size={15} />
                      <span>4. Data Protection: Collection Shield & PII Masking</span>
                    </div>
                    <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                      HIGH-PRECEDENCE DEFENSE
                    </span>
                  </div>

                  {/* Context Banner */}
                  <div
                    style={{
                      padding: '0.6rem 0.85rem',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                    }}
                  >
                    <ThemeIcon name="info" size={15} />
                    <span>
                      <strong>Defense-in-Depth:</strong> <em>Collection Shield</em> operates at the <strong>path level</strong> (denying sensitive collections), while <em>PII Redaction</em> operates at the <strong>field payload level</strong> (masking JSON attributes as <code>[REDACTED]</code>).
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }} className="shield-pii-dual-grid">
                    {/* COLUMN 1: COLLECTION SHIELD (HIGH PRECEDENCE BLOCKLIST) */}
                    <div style={{ padding: '0.85rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontSize: '0.775rem', fontWeight: 700, color: 'var(--rose-bright)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            🛡️ Collection Shield
                          </span>
                          <span className="badge badge-rose" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                            {activeBlockedCollectionsList.length} PROTECTED
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                          onClick={() => handleRestoreDefaultBlocklist(activeService.instanceId)}
                          title="Restore platform defaults"
                        >
                          Reset Shield
                        </button>
                      </div>

                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.6rem', lineHeight: 1.35 }}>
                        Target paths strictly denied at runtime, overriding allowlists.
                      </div>

                      {/* Styled Rose Tag Container */}
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '0.35rem',
                          padding: '0.5rem',
                          background: 'var(--bg-card)',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-subtle)',
                          minHeight: '76px',
                          alignContent: 'flex-start',
                          marginBottom: '0.65rem',
                        }}
                      >
                        {activeBlockedCollectionsList.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-full)',
                              background: 'rgba(244, 63, 94, 0.12)',
                              border: '1px solid rgba(244, 63, 94, 0.35)',
                              color: 'var(--rose-bright, #FB7185)',
                              fontSize: '0.725rem',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 600,
                            }}
                          >
                            <span>🛡️</span>
                            <span>{tag}</span>
                            <button
                              type="button"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--rose-bright, #FB7185)',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                lineHeight: 1,
                                padding: '0 2px',
                                opacity: 0.8,
                              }}
                              onClick={() => handleRemoveBlockedCollection(activeService.instanceId, tag)}
                              title={`Remove '${tag}' from Shield`}
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                        {activeBlockedCollectionsList.length === 0 && (
                          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', padding: '0.25rem' }}>
                            No protected collection tags. Add sensitive paths below.
                          </div>
                        )}
                      </div>

                      {/* Input Row */}
                      <div className="resource-input-row" style={{ alignItems: 'center', marginBottom: '0.5rem' }}>
                        <input
                          type="text"
                          className="form-input code-font"
                          placeholder="e.g. audit_logs or salaries"
                          style={{ fontSize: '0.775rem', padding: '0.35rem 0.55rem' }}
                          value={activeMeta.newBlockedCollectionInput || ''}
                          onChange={(e) => handleMetaChange(activeService.instanceId, 'newBlockedCollectionInput', e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddBlockedCollection(activeService.instanceId)}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                          onClick={() => handleAddBlockedCollection(activeService.instanceId)}
                        >
                          + Shield Tag
                        </button>
                      </div>

                      {/* Quick Add Suggestions */}
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: 'auto' }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', alignSelf: 'center' }}>Suggestions:</span>
                        {['audit_logs', 'users_access', 'salaries', 'secrets', 'billing'].map((sug) => {
                          if (activeBlockedCollectionsList.includes(sug)) return null;
                          return (
                            <button
                              key={sug}
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.625rem', padding: '1px 5px', fontFamily: 'var(--font-mono)' }}
                              onClick={() => {
                                const current = activeSettings.blockedCollections || ['system_metadata', 'services_config', 'users_access', 'user_sessions', 'sessions', 'audit_logs'];
                                if (!current.includes(sug)) {
                                  handleSettingChange(activeService.instanceId, 'blockedCollections', [...current, sug]);
                                }
                              }}
                            >
                              + {sug}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* COLUMN 2: PII ATTRIBUTE REDACTION */}
                    <div style={{ padding: '0.85rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontSize: '0.775rem', fontWeight: 700, color: 'var(--cyan-bright)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            🔒 PII Attribute Redaction
                          </span>
                          <span className="badge badge-cyan" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                            {getActiveTags('excludedFields').length} FIELDS
                          </span>
                        </div>
                        {getActiveTags('excludedFields').length > 0 && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.65rem', padding: '2px 6px', color: 'var(--accent-rose)' }}
                            onClick={() => handleSettingChange(activeService.instanceId, 'excludedFields', [])}
                            title="Clear all PII tags"
                          >
                            Clear Tags
                          </button>
                        )}
                      </div>

                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.6rem', lineHeight: 1.35 }}>
                        Matching JSON keys are masked as <code>[REDACTED]</code> in document results.
                      </div>

                      {/* Styled Cyan Tag Container */}
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '0.35rem',
                          padding: '0.5rem',
                          background: 'var(--bg-card)',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-subtle)',
                          minHeight: '76px',
                          alignContent: 'flex-start',
                          marginBottom: '0.65rem',
                        }}
                      >
                        {getActiveTags('excludedFields').map((tag: string) => (
                          <span
                            key={tag}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-full)',
                              background: 'rgba(6, 182, 212, 0.12)',
                              border: '1px solid rgba(6, 182, 212, 0.35)',
                              color: 'var(--cyan-bright, #38BDF8)',
                              fontSize: '0.725rem',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 600,
                            }}
                          >
                            <span>🔒</span>
                            <span>{tag}</span>
                            <button
                              type="button"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--cyan-bright, #38BDF8)',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                lineHeight: 1,
                                padding: '0 2px',
                                opacity: 0.8,
                              }}
                              onClick={() => handleRemoveTag(activeService.instanceId, 'excludedFields', tag)}
                              title={`Remove '${tag}' from Redaction`}
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                        {getActiveTags('excludedFields').length === 0 && (
                          <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', padding: '0.25rem' }}>
                            No fields masked. Add sensitive attribute names below.
                          </div>
                        )}
                      </div>

                      {/* Input Row */}
                      <div className="resource-input-row" style={{ alignItems: 'center', marginBottom: '0.5rem' }}>
                        <input
                          type="text"
                          className="form-input code-font"
                          placeholder="e.g. ssn, apiKey, creditCard"
                          style={{ fontSize: '0.775rem', padding: '0.35rem 0.55rem' }}
                          value={activeMeta.newTagInput || ''}
                          onChange={(e) => handleMetaChange(activeService.instanceId, 'newTagInput', e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddTag(activeService.instanceId, 'excludedFields')}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                          onClick={() => handleAddTag(activeService.instanceId, 'excludedFields')}
                        >
                          + Redact Field
                        </button>
                      </div>

                      {/* Quick Add Suggestions */}
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: 'auto' }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', alignSelf: 'center' }}>Common PII:</span>
                        {['password', 'ssn', 'apiKey', 'token', 'credit_card', 'pin'].map((sug) => {
                          const current = getActiveTags('excludedFields');
                          if (current.includes(sug)) return null;
                          return (
                            <button
                              key={sug}
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.625rem', padding: '1px 5px', fontFamily: 'var(--font-mono)' }}
                              onClick={() => {
                                handleSettingChange(activeService.instanceId, 'excludedFields', [...current, sug]);
                              }}
                            >
                              + {sug}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ROW 4: QUERY DOCUMENT BOUNDS & PERFORMANCE LIMITS */}
                <div className="config-section-box" style={{ border: '1px solid var(--border-active)', boxShadow: 'var(--shadow-md)', background: 'var(--bg-card)' }}>
                  <div className="config-section-header">
                    <ThemeIcon name="lightning" size={15} />
                    <span>5. Query Document Bounds & Performance Limits</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                    {/* Max Documents Returned */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                        <label className="form-label" style={{ margin: 0 }}>
                          Max Documents Returned
                        </label>
                        <span className="badge badge-cyan" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                          {activeSettings.maxDocuments || 50} DOCUMENTS
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: '110px', fontSize: '0.85rem', fontWeight: 700, textAlign: 'center' }}
                          min={1}
                          max={500}
                          value={activeSettings.maxDocuments || 50}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            handleSettingChange(activeService.instanceId, 'maxDocuments', isNaN(val) ? 50 : Math.min(Math.max(val, 1), 500));
                          }}
                        />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          Documents per query (Hard max: 500)
                        </span>
                      </div>

                      <input
                        type="range"
                        min="5"
                        max="500"
                        step="5"
                        value={activeSettings.maxDocuments || 50}
                        onChange={(e) => handleSettingChange(activeService.instanceId, 'maxDocuments', parseInt(e.target.value, 10))}
                        style={{ width: '100%', accentColor: 'var(--accent-primary)', marginBottom: '0.5rem' }}
                      />

                      {/* Quick Presets */}
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {[10, 25, 50, 100, 250, 500].map((num) => (
                          <button
                            key={num}
                            type="button"
                            className={`btn btn-sm ${(activeSettings.maxDocuments || 50) === num ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                            onClick={() => handleSettingChange(activeService.instanceId, 'maxDocuments', num)}
                          >
                            {num} docs
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Query Request Timeout */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                        <label className="form-label" style={{ margin: 0 }}>
                          Query Request Timeout
                        </label>
                        <span className="badge badge-emerald" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                          {activeSettings.requestTimeoutSeconds || 15}s TIMEOUT
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input
                          type="number"
                          className="form-input"
                          style={{ width: '110px', fontSize: '0.85rem', fontWeight: 700, textAlign: 'center' }}
                          min={5}
                          max={60}
                          value={activeSettings.requestTimeoutSeconds || 15}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            handleSettingChange(activeService.instanceId, 'requestTimeoutSeconds', isNaN(val) ? 15 : Math.min(Math.max(val, 5), 60));
                          }}
                        />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          Seconds before abort (5s - 60s)
                        </span>
                      </div>

                      <input
                        type="range"
                        min="5"
                        max="60"
                        step="5"
                        value={activeSettings.requestTimeoutSeconds || 15}
                        onChange={(e) => handleSettingChange(activeService.instanceId, 'requestTimeoutSeconds', parseInt(e.target.value, 10))}
                        style={{ width: '100%', accentColor: 'var(--accent-primary)', marginBottom: '0.5rem' }}
                      />

                      {/* Quick Presets */}
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {[5, 10, 15, 30, 60].map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            className={`btn btn-sm ${(activeSettings.requestTimeoutSeconds || 15) === sec ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                            onClick={() => handleSettingChange(activeService.instanceId, 'requestTimeoutSeconds', sec)}
                          >
                            {sec}s
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeService.serviceId === 'slack' ? (
              /* Dedicated Slack Federated Search Studio */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* ROW 1: DUAL COLUMN (LEFT: IDENTITY & ROUTING; RIGHT: QUOTAS, RATE LIMITS & SECRETS) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                  {/* BOX 1: CUSTOMER IDENTITY & ROUTING */}
                  <div className="config-section-box">
                    <div className="config-section-header">
                      <ThemeIcon name="users" size={15} />
                      <span>1. Customer Identity &amp; Routing</span>
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Customer / Org Name
                        <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '1px 5px', marginLeft: '6px' }}>REQUIRED</span>
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        value={activeMeta.customerName}
                        onChange={(e) => handleMetaChange(activeService.instanceId, 'customerName', e.target.value)}
                        required
                      />
                      <div className="form-hint">Partitions configuration, rate quotas, and secret vault keys.</div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Display Title
                        <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '1px 5px', marginLeft: '6px' }}>REQUIRED</span>
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        value={activeMeta.name}
                        onChange={(e) => handleMetaChange(activeService.instanceId, 'name', e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">
                        Instance Description
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>(Optional)</span>
                      </label>
                      <textarea
                        className="form-textarea"
                        rows={2}
                        value={activeMeta.description}
                        onChange={(e) => handleMetaChange(activeService.instanceId, 'description', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* BOX 2: QUOTAS, RATE LIMITS & VAULT BINDINGS */}
                  <div className="config-section-box">
                    <div className="config-section-header">
                      <ThemeIcon name="shield" size={15} />
                      <span>2. Quotas, Rate Limits &amp; Secrets Vault</span>
                    </div>

                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                        <label className="form-label" style={{ margin: 0 }}>
                          Max Results Per Search
                        </label>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--emerald-bright)' }}>
                          {activeSettings.maxResults || 10} messages
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        step="1"
                        value={activeSettings.maxResults || 10}
                        onChange={(e) => handleSettingChange(activeService.instanceId, 'maxResults', parseInt(e.target.value, 10))}
                        style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
                      />
                    </div>

                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                        <label className="form-label" style={{ margin: 0 }}>
                          Rate Limit (Req / Min / User)
                        </label>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-bright)' }}>
                          {activeSettings.rateLimitPerMinute || 10} req/min
                        </span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="60"
                        step="5"
                        value={activeSettings.rateLimitPerMinute || 10}
                        onChange={(e) => handleSettingChange(activeService.instanceId, 'rateLimitPerMinute', parseInt(e.target.value, 10))}
                        style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <label className="form-label" style={{ margin: 0 }}>Secrets Vault Staging</label>
                        {onNavigateToSecrets && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.7rem', padding: '2px 7px', color: '#C084FC', borderColor: 'rgba(168, 85, 247, 0.4)' }}
                            onClick={() => {
                              setActiveConfigInstanceId(null);
                              onNavigateToSecrets('Slack');
                            }}
                          >
                            Open Secrets Vault &rarr;
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--accent-bright)', fontFamily: 'var(--font-mono)' }}>
                        {(activeService.requiredSecrets || ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET', 'SLACK_REDIRECT_URI']).join(', ')}
                      </div>
                      <div className="form-hint">App credentials staged in Google Secret Manager.</div>
                    </div>
                  </div>
                </div>

                {/* ROW 2: FULL-WIDTH OAUTH SCOPES & ACCESS BOUNDARIES STUDIO */}
                <div className="config-section-box">
                  <div className="config-section-header">
                    <ThemeIcon name="lightning" size={15} />
                    <span>3. OAuth 2.0 User Scopes &amp; Access Boundaries</span>
                  </div>

                  {/* Scopes Controls & Presets */}
                  <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                          Granular OAuth 2.0 User Scopes Matrix
                          <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '1px 5px', marginLeft: '6px' }}>REQUIRED</span>
                        </div>
                        <div className="form-hint" style={{ marginTop: '2px' }}>
                          Click any scope pill to permit or exclude it. Both columns are displayed side-by-side with full visibility across the modal width.
                        </div>
                      </div>

                      {/* Quick Action Presets */}
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                          onClick={() => handleSelectAllSlackScopes(activeService.instanceId)}
                          title="Permit all 16 Slack user scopes"
                        >
                          Select All (16)
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                          onClick={() => handleResetDefaultSlackScopes(activeService.instanceId)}
                          title="Reset to recommended default 16 scopes"
                        >
                          Recommended
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                          onClick={() => handleSelectPublicSlackScopesOnly(activeService.instanceId)}
                          title="Permit public channel search only (blocks DMs & private groups)"
                        >
                          Public Only
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                          onClick={() => handleSelectSearchSlackScopesOnly(activeService.instanceId)}
                          title="Permit search scopes only"
                        >
                          Search Only
                        </button>
                      </div>
                    </div>

                    {/* DUAL COLUMN GRID: FULL MODAL WIDTH - NO HORIZONTAL OVERFLOW */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }} className="guardrails-dual-grid">
                      {/* PERMITTED SCOPES */}
                      <div style={{ padding: '0.85rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', minHeight: '140px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--emerald-bright)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <ThemeIcon name="check" size={13} />
                            <span>Permitted Scopes ({activeSlackAllowedScopes.length})</span>
                          </span>
                          <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)' }}>Click to block &rarr;</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {activeSlackAllowedScopes.map((sc) => {
                            const item = ALL_SLACK_SCOPES.find((s) => s.scope.toLowerCase() === sc.toLowerCase());
                            return (
                              <button
                                key={sc}
                                type="button"
                                className="badge badge-emerald"
                                style={{
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '0.725rem',
                                  padding: '4px 8px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 700,
                                }}
                                onClick={() => handleShiftSlackScopeToBlocked(activeService.instanceId, sc)}
                                title={item?.description ? `${sc}: ${item.description} - Click to shift to Blocked list` : `Click to shift '${sc}' to Blocked list`}
                              >
                                <ThemeIcon name="check" size={10} />
                                <span>{sc}</span>
                                {item?.category && (
                                  <span style={{ fontSize: '0.575rem', opacity: 0.85, fontWeight: 700, fontFamily: 'var(--font-sans)', padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px' }}>
                                    {item.category}
                                  </span>
                                )}
                                <span style={{ opacity: 0.6 }}>&rarr;</span>
                              </button>
                            );
                          })}
                          {activeSlackAllowedScopes.length === 0 && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--accent-rose)', padding: '0.5rem 0' }}>
                              No scopes permitted. AI agent will not be able to search Slack.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* EXCLUDED SCOPES */}
                      <div style={{ padding: '0.85rem', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', minHeight: '140px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--rose-bright)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <ThemeIcon name="xmark" size={13} />
                            <span>Excluded Scopes ({activeSlackBlockedScopes.length})</span>
                          </span>
                          <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)' }}>&larr; Click to permit</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {activeSlackBlockedScopes.map((sc) => {
                            const item = ALL_SLACK_SCOPES.find((s) => s.scope.toLowerCase() === sc.toLowerCase());
                            return (
                              <button
                                key={sc}
                                type="button"
                                className="badge badge-rose"
                                style={{
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '0.725rem',
                                  padding: '4px 8px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 700,
                                }}
                                onClick={() => handleShiftSlackScopeToAllowed(activeService.instanceId, sc)}
                                title={item?.description ? `${sc}: ${item.description} - Click to shift to Permitted list` : `Click to shift '${sc}' to Permitted list`}
                              >
                                <span style={{ opacity: 0.6 }}>&larr;</span>
                                <span>&times;</span>
                                <span>{sc}</span>
                                {item?.category && (
                                  <span style={{ fontSize: '0.575rem', opacity: 0.85, fontWeight: 700, fontFamily: 'var(--font-sans)', padding: '1px 4px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px' }}>
                                    {item.category}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                          {activeSlackBlockedScopes.length === 0 && (
                            <div style={{ fontSize: '0.725rem', color: 'var(--emerald-bright)', padding: '0.5rem 0' }}>
                              All 16 available Slack scopes are permitted.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Search Inclusions & User Policy */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
                    {/* Search Inclusions */}
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Search Inclusions</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.825rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={activeSettings.includeDMs !== false}
                          onChange={(e) => handleSettingChange(activeService.instanceId, 'includeDMs', e.target.checked)}
                        />
                        <span>Include Direct Messages &amp; Group DMs (honoring user ACLs)</span>
                      </label>
                    </div>

                    {/* User Access Security Policy */}
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">User Access Security Policy</label>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.825rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={activeSettings.allowAllUsers !== false}
                          onChange={(e) => handleSettingChange(activeService.instanceId, 'allowAllUsers', e.target.checked)}
                          style={{ marginTop: '3px' }}
                        />
                        <div>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            Allow Any Connected User to Init / Search Slack
                          </span>
                          <div className="form-hint" style={{ marginTop: '2px', lineHeight: 1.4 }}>
                            When enabled (recommended for federated delegation), any user connecting via Gemini Enterprise can search Slack using their own credentials and receive self-service connection prompts. When disabled, only users explicitly granted Slack access in Users &amp; Access (IAM) are permitted.
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* AI Search Discovery & Agent Playbook Reference Box */}
                  <div style={{ marginTop: '0.75rem', padding: '0.85rem 1rem', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.35rem' }}>
                      <ThemeIcon name="sparkles" size={15} />
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        AI Agent Discovery &amp; Sequential Search Playbook Active
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      AI agents can invoke the <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-input)', padding: '1px 5px', borderRadius: '3px', color: 'var(--accent-primary)' }}>slack-search-guide</code> tool to dynamically discover Slack query operators (<code style={{ fontFamily: 'var(--font-mono)' }}>from:@user</code>, <code style={{ fontFamily: 'var(--font-mono)' }}>in:#channel</code>, <code style={{ fontFamily: 'var(--font-mono)' }}>after:YYYY-MM-DD</code>, <code style={{ fontFamily: 'var(--font-mono)' }}>has:link</code>) and multi-step sequential search strategies.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* 3-Column Standard Grid for Xero, Sage HR */
              <div className="config-sections-grid">
                {/* SECTION 1: IDENTITY & CUSTOMER ROUTING */}
                <div className="config-section-box">
                  <div className="config-section-header">
                    <ThemeIcon name="users" size={15} />
                    <span>1. Customer Identity & Routing</span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Customer / Org Name
                      <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '1px 5px', marginLeft: '6px' }}>REQUIRED</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={activeMeta.customerName}
                      onChange={(e) => handleMetaChange(activeService.instanceId, 'customerName', e.target.value)}
                      required
                    />
                    <div className="form-hint">Partitions configuration, rate quotas, and secret vault keys.</div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Display Title
                      <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '1px 5px', marginLeft: '6px' }}>REQUIRED</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={activeMeta.name}
                      onChange={(e) => handleMetaChange(activeService.instanceId, 'name', e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">
                      Instance Description
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>(Optional)</span>
                    </label>
                    <textarea
                      className="form-textarea"
                      rows={2}
                      value={activeMeta.description}
                      onChange={(e) => handleMetaChange(activeService.instanceId, 'description', e.target.value)}
                    />
                  </div>
                </div>

                {/* SECTION 2: MULTI-RESOURCE & PATH REGISTRY */}
                <div className="config-section-box">
                  <div className="config-section-header">
                    <ThemeIcon name="lightning" size={15} />
                    <span>2. Multi-Resource & URL Registry</span>
                  </div>

                  {activeService.serviceId === 'xero' && (
                    <div>
                      <div className="form-group">
                        <label className="form-label">
                          Xero Tenant ID / Organization UUID
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>(Optional / Auto-resolved)</span>
                        </label>
                        <input
                          type="text"
                          className="form-input code-font"
                          placeholder="5b9f7a60-23a1-43e8-8d89-7cfdb2534571"
                          value={activeSettings.tenantId || ''}
                          onChange={(e) => handleSettingChange(activeService.instanceId, 'tenantId', e.target.value)}
                        />
                        <div className="form-hint">Leave empty to auto-resolve first authorized organization.</div>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">
                          Permitted OAuth Scopes
                          <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '1px 5px', marginLeft: '6px' }}>REQUIRED</span>
                        </label>
                        <input
                          type="text"
                          className="form-input code-font"
                          value={activeSettings.scopes || 'accounting.transactions accounting.contacts accounting.settings accounting.reports.read'}
                          onChange={(e) => handleSettingChange(activeService.instanceId, 'scopes', e.target.value)}
                          required
                        />
                        <div className="form-hint">Space-separated list of granted OAuth 2.0 scopes.</div>
                      </div>
                    </div>
                  )}

                  {activeService.serviceId === 'sagehr' && (
                    <div>
                      <div className="form-group">
                        <label className="form-label">
                          Sage HR Company Subdomain
                          <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '1px 5px', marginLeft: '6px' }}>REQUIRED</span>
                        </label>
                        <input
                          type="text"
                          className="form-input code-font"
                          placeholder="e.g. acme-corp"
                          value={activeSettings.subdomain || ''}
                          onChange={(e) => handleSettingChange(activeService.instanceId, 'subdomain', e.target.value)}
                          required
                        />
                        <div className="form-hint">Routes API queries to https://[subdomain].sage.hr</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* SECTION 3: QUOTAS, LOCATIONS & PRIVACY GUARDRAILS */}
                <div className="config-section-box">
                  <div className="config-section-header">
                    <ThemeIcon name="shield" size={15} />
                    <span>3. Quotas, Locations & Guardrails</span>
                  </div>

                  {activeService.serviceId === 'xero' && (
                    <div>
                      <div className="form-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                          <label className="form-label" style={{ margin: 0 }}>
                            Rate Limit (Req / Min)
                            <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '1px 5px', marginLeft: '6px' }}>GUARDRAIL</span>
                          </label>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--emerald-bright)' }}>
                            {activeSettings.rateLimitMaxPerMin || 60} req/min
                          </span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="120"
                          step="5"
                          value={activeSettings.rateLimitMaxPerMin || 60}
                          onChange={(e) => handleSettingChange(activeService.instanceId, 'rateLimitMaxPerMin', parseInt(e.target.value, 10))}
                          style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Secret Vault Bindings</label>
                        <div style={{ fontSize: '0.8rem', color: 'var(--accent-bright)', fontFamily: 'var(--font-mono)' }}>
                          {(activeService.requiredSecrets || ['XERO_CLIENT_ID', 'XERO_CLIENT_SECRET']).join(', ')}
                        </div>
                        <div className="form-hint">Managed automatically via Google Secret Manager Vault.</div>
                      </div>
                    </div>
                  )}

                  {activeService.serviceId === 'sagehr' && (
                    <div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">
                          Sensitive Attribute Masking Tags
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>({getActiveTags('maskedFields').length} tags)</span>
                        </label>
                        <div className="resource-tag-box" style={{ marginBottom: '0.4rem' }}>
                          {getActiveTags('maskedFields').map((tag) => (
                            <span key={tag} className="tag-pill">
                              <span>{tag}</span>
                              <button
                                type="button"
                                className="tag-pill-remove"
                                onClick={() => handleRemoveTag(activeService.instanceId, 'maskedFields', tag)}
                              >
                                &times;
                              </button>
                            </span>
                          ))}
                        </div>

                        <div className="resource-input-row">
                          <input
                            type="text"
                            className="form-input code-font"
                            placeholder="Add tag: e.g. national_id"
                            value={activeMeta.newTagInput || ''}
                            onChange={(e) => handleMetaChange(activeService.instanceId, 'newTagInput', e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddTag(activeService.instanceId, 'maskedFields')}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleAddTag(activeService.instanceId, 'maskedFields')}
                          >
                            + Tag
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Save and Close Bottom Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setActiveConfigInstanceId(null)}
              >
                Cancel / Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleSave(activeService.instanceId)}
                disabled={savingInstance === activeService.instanceId}
              >
                <span>{savingInstance === activeService.instanceId ? 'Saving Changes...' : 'Save & Apply Configuration'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

