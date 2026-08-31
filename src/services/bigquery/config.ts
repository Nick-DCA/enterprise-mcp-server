import { getGcpProjectId } from '../../config/secretManager.js';
import { logger } from '../../utils/logger.js';

export interface BigQueryConfig {
  projectId: string;
  location?: string;
  defaultDataset?: string;
  allowedTables: string[]; // ['*'] or empty means all allowed, or ['dataset.table', 'view_name']
  maxBytesBilled: number; // default: 1 GB (1,073,741,824 bytes)
  maxRowsReturned: number; // default: 100, hard max: 1,000
  queryTimeoutMs: number; // default: 30,000 ms
  sqlGuardrailMode: 'STRICT_READ_ONLY' | 'GRANULAR_CUSTOM';
  blockMultiStatement: boolean;
  enableDryRunPreFlight: boolean;
  requirePartitionFilter: boolean;
  selectAllPolicy: 'ALLOW' | 'WARN' | 'BLOCK';
  useQueryCache: boolean;
  allowedSqlClauses: string[];
  blockedSqlClauses: string[];
}

let cachedConfig: BigQueryConfig | null = null;

export async function getBigQueryConfig(): Promise<BigQueryConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const projectId = process.env.BIGQUERY_PROJECT_ID || (await getGcpProjectId());

  if (!projectId) {
    throw new Error(
      'GCP Project ID is required for BigQuery. Set BIGQUERY_PROJECT_ID or GCP_PROJECT_ID.'
    );
  }

  // 1. Fetch dynamic settings from RuntimeConfig if initialized
  let runtimeSettings: Record<string, any> = {};
  try {
    const { runtimeConfig } = await import('../../config/runtimeConfig.js');
    const serviceDoc = await runtimeConfig.getServiceConfig('bigquery');
    if (serviceDoc?.settings) {
      runtimeSettings = serviceDoc.settings;
    }
  } catch (_e) {
    // Fallback if runtimeConfig is loading
  }

  const location = runtimeSettings.location || process.env.BIGQUERY_LOCATION || 'EU';
  const defaultDataset = runtimeSettings.defaultDataset || process.env.BIGQUERY_DEFAULT_DATASET || undefined;

  // Allowed tables/views parsing (comma-separated list or array)
  const rawAllowed = runtimeSettings.allowedTables !== undefined ? runtimeSettings.allowedTables : (process.env.BIGQUERY_ALLOWED_TABLES || '');
  const allowedTables = (Array.isArray(rawAllowed) ? rawAllowed.join(',') : String(rawAllowed))
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);

  // Cost guard: maximumBytesBilled (default 1 GB = 1073741824 bytes)
  const rawMaxBytes = runtimeSettings.maxBytesBilled || process.env.BIGQUERY_MAX_BYTES_BILLED;
  const maxBytesBilled = rawMaxBytes ? parseInt(String(rawMaxBytes), 10) : 1073741824;

  // Max rows returned limit
  const rawMaxRows = runtimeSettings.maxRowsReturned || process.env.BIGQUERY_MAX_ROWS_RETURNED;
  const maxRowsReturned = rawMaxRows ? Math.min(parseInt(String(rawMaxRows), 10), 1000) : 100;

  // Timeout ms
  const rawTimeoutSec = runtimeSettings.queryTimeoutSeconds || (runtimeSettings.queryTimeoutMs ? runtimeSettings.queryTimeoutMs / 1000 : 30);
  const queryTimeoutMs = parseInt(String(rawTimeoutSec), 10) * 1000;

  // SQL Guardrails & Controls
  const sqlGuardrailMode = (runtimeSettings.sqlGuardrailMode as 'STRICT_READ_ONLY' | 'GRANULAR_CUSTOM') || 'STRICT_READ_ONLY';
  const blockMultiStatement = runtimeSettings.blockMultiStatement !== undefined ? Boolean(runtimeSettings.blockMultiStatement) : true;
  const enableDryRunPreFlight = runtimeSettings.enableDryRunPreFlight !== undefined ? Boolean(runtimeSettings.enableDryRunPreFlight) : true;
  const requirePartitionFilter = runtimeSettings.requirePartitionFilter !== undefined ? Boolean(runtimeSettings.requirePartitionFilter) : false;
  const selectAllPolicy = (runtimeSettings.selectAllPolicy as 'ALLOW' | 'WARN' | 'BLOCK') || 'WARN';
  const useQueryCache = runtimeSettings.useQueryCache !== undefined ? Boolean(runtimeSettings.useQueryCache) : true;

  const rawAllowedClauses = runtimeSettings.allowedSqlClauses || 'SELECT,WITH,FROM,JOIN,LEFT JOIN,RIGHT JOIN,FULL JOIN,INNER JOIN,UNION,UNION ALL,WHERE,GROUP BY,HAVING,ORDER BY,LIMIT,OFFSET,DISTINCT,EXPLAIN';
  const allowedSqlClauses = (Array.isArray(rawAllowedClauses) ? rawAllowedClauses.join(',') : String(rawAllowedClauses))
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c.length > 0);

  const rawBlockedClauses = runtimeSettings.blockedSqlClauses || 'CROSS JOIN,DELETE,UPDATE,INSERT,MERGE,TRUNCATE,TRUNCATE TABLE,DROP,DROP TABLE,DROP VIEW,DROP SCHEMA,CREATE OR REPLACE TABLE,CREATE OR REPLACE VIEW,REPLACE,ALTER,ALTER TABLE,ALTER SCHEMA,CREATE,CREATE TABLE,CREATE VIEW,CREATE MATERIALIZED VIEW,CREATE FUNCTION,CREATE PROCEDURE,CALL,EXPORT,EXPORT DATA,LOAD,LOAD DATA';
  const blockedSqlClauses = (Array.isArray(rawBlockedClauses) ? rawBlockedClauses.join(',') : String(rawBlockedClauses))
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c.length > 0);

  cachedConfig = {
    projectId,
    location,
    defaultDataset,
    allowedTables,
    maxBytesBilled,
    maxRowsReturned,
    queryTimeoutMs,
    sqlGuardrailMode,
    blockMultiStatement,
    enableDryRunPreFlight,
    requirePartitionFilter,
    selectAllPolicy,
    useQueryCache,
    allowedSqlClauses,
    blockedSqlClauses,
  };

  logger.info({ projectId, location, defaultDataset, maxBytesBilled, maxRowsReturned, sqlGuardrailMode }, 'BigQuery configuration initialized');

  return cachedConfig;
}

export function clearBigQueryConfigCache(): void {
  cachedConfig = null;
}
