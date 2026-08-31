import { BigQuery } from '@google-cloud/bigquery';
import { getBigQueryConfig, BigQueryConfig } from './config.js';
import { BigQueryApiError, BigQueryCostLimitError, BigQuerySyntaxError } from './errors.js';
import { logger } from '../../utils/logger.js';

export interface TableSummary {
  id: string;
  tableId: string;
  datasetId: string;
  type: string; // TABLE, VIEW, MATERIALIZED_VIEW, EXTERNAL
}

export interface ColumnSchema {
  name: string;
  type: string;
  mode?: string; // NULLABLE, REQUIRED, REPEATED
  description?: string;
}

export interface TableInfo {
  id: string;
  datasetId: string;
  tableId: string;
  type: string;
  description?: string;
  numRows?: string;
  numBytes?: string;
  creationTime?: string;
  lastModifiedTime?: string;
  schema: ColumnSchema[];
}

export interface QueryDryRunResult {
  valid: boolean;
  totalBytesProcessed: number;
  estimatedCostMb: number;
  statementType?: string;
}

export interface QueryExecutionResult {
  rows: Record<string, any>[];
  rowCount: number;
  totalRows?: number;
  jobId?: string;
  totalBytesProcessed?: number;
  executionDurationMs: number;
}

export interface BigQueryResourceScope {
  raw: string;
  scopeLevel: 'project' | 'dataset' | 'table';
  projectId: string;
  datasetId?: string;
  tableId?: string;
  displayName: string;
}

export interface ViewDependencyInfo {
  isViewDependencyError: boolean;
  missingProject?: string;
  missingDataset?: string;
  missingTable?: string;
  formattedTarget?: string;
  rawMessage: string;
}

export interface GranularIamCommands {
  scopeLevel: 'project' | 'dataset' | 'table';
  targetResource: string;
  gcloudCommand: string;
  sqlCommand: string;
  plainEnglishDescription: string;
  scopeBadge: string;
}

/**
 * Strips comments (line & block), string literals, and backtick identifiers
 * to ensure SQL keyword scanning does not trigger on comments, string values, or column aliases.
 */
export function stripSqlCommentsAndStrings(sql: string): string {
  if (!sql || typeof sql !== 'string') return '';
  return sql
    // Remove multi-line comments /* ... */
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    // Remove single-line comments -- ...
    .replace(/--.*$/gm, ' ')
    // Remove triple-quoted strings """...""" or '''...'''
    .replace(/"""[\s\S]*?"""/g, "''")
    .replace(/'''[\s\S]*?'''/g, "''")
    // Remove single and double quoted string literals '...' or "..."
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    // Replace backtick identifier contents `table_name` with ``
    .replace(/`[^`]*`/g, '``');
}

export class BigQueryService {
  private bqClient: BigQuery | null = null;

  /**
   * Parse a resource identifier into Project, Dataset, and Table components.
   * Handles:
   *  - 'projectId' (project scope)
   *  - 'projectId.datasetId' or 'projectId:datasetId' (dataset scope)
   *  - 'projectId.datasetId.tableId' or 'projectId:datasetId.tableId' (table scope)
   */
  public parseResourceIdentifier(resourceStr: string, defaultProjectId: string): BigQueryResourceScope {
    const raw = resourceStr.trim();
    if (!raw) {
      return {
        raw: '',
        scopeLevel: 'project',
        projectId: defaultProjectId,
        displayName: defaultProjectId,
      };
    }

    // Normalize colons to dots (e.g. project:dataset.table -> project.dataset.table)
    const normalized = raw.replace(':', '.');
    const parts = normalized.split('.').map((p) => p.trim()).filter(Boolean);

    if (parts.length >= 3) {
      return {
        raw,
        scopeLevel: 'table',
        projectId: parts[0],
        datasetId: parts[1],
        tableId: parts.slice(2).join('.'),
        displayName: `${parts[0]}.${parts[1]}.${parts.slice(2).join('.')}`,
      };
    } else if (parts.length === 2) {
      // If the first part matches known project naming conventions and not default project
      return {
        raw,
        scopeLevel: 'dataset',
        projectId: parts[0],
        datasetId: parts[1],
        displayName: `${parts[0]}.${parts[1]} (All Tables)`,
      };
    } else {
      return {
        raw,
        scopeLevel: 'project',
        projectId: parts[0] || defaultProjectId,
        displayName: `${parts[0] || defaultProjectId} (All Datasets & Tables)`,
      };
    }
  }

  /**
   * Generates exact, least-privilege IAM gcloud command and BigQuery SQL GRANT based on resource scope.
   */
  public generateLeastPrivilegeIamCommands(
    serviceAccountEmail: string,
    scope: BigQueryResourceScope
  ): GranularIamCommands {
    const sa = serviceAccountEmail || 'YOUR_SERVICE_ACCOUNT_EMAIL';

    if (scope.scopeLevel === 'table' && scope.datasetId && scope.tableId) {
      const gcloudCommand = `gcloud projects add-iam-policy-binding ${scope.projectId} \\
  --member="serviceAccount:${sa}" \\
  --role="roles/bigquery.dataViewer" \\
  --condition='expression=resource.name == "projects/${scope.projectId}/datasets/${scope.datasetId}/tables/${scope.tableId}",title="Table ${scope.tableId} Read Access"'`;

      const sqlCommand = `GRANT \`roles/bigquery.dataViewer\` ON TABLE \`${scope.projectId}.${scope.datasetId}.${scope.tableId}\` TO "serviceAccount:${sa}";`;

      return {
        scopeLevel: 'table',
        targetResource: `${scope.projectId}.${scope.datasetId}.${scope.tableId}`,
        gcloudCommand,
        sqlCommand,
        plainEnglishDescription: `Grants read access strictly to single table or view [${scope.tableId}] in dataset [${scope.datasetId}].`,
        scopeBadge: 'SINGLE TABLE / VIEW',
      };
    } else if (scope.scopeLevel === 'dataset' && scope.datasetId) {
      const gcloudCommand = `gcloud projects add-iam-policy-binding ${scope.projectId} \\
  --member="serviceAccount:${sa}" \\
  --role="roles/bigquery.dataViewer" \\
  --condition='expression=resource.name.startsWith("projects/${scope.projectId}/datasets/${scope.datasetId}"),title="Dataset ${scope.datasetId} Read Access"'`;

      const sqlCommand = `GRANT \`roles/bigquery.dataViewer\` ON DATASET \`${scope.projectId}.${scope.datasetId}\` TO "serviceAccount:${sa}";`;

      return {
        scopeLevel: 'dataset',
        targetResource: `${scope.projectId}.${scope.datasetId}`,
        gcloudCommand,
        sqlCommand,
        plainEnglishDescription: `Grants read access to dataset [${scope.datasetId}] (all tables and views underneath).`,
        scopeBadge: 'DATASET (ALL TABLES)',
      };
    } else {
      const gcloudCommand = `gcloud projects add-iam-policy-binding ${scope.projectId} \\
  --member="serviceAccount:${sa}" \\
  --role="roles/bigquery.dataViewer"`;

      const sqlCommand = `GRANT \`roles/bigquery.dataViewer\` ON PROJECT \`${scope.projectId}\` TO "serviceAccount:${sa}";`;

      return {
        scopeLevel: 'project',
        targetResource: scope.projectId,
        gcloudCommand,
        sqlCommand,
        plainEnglishDescription: `Grants read access across entire project [${scope.projectId}].`,
        scopeBadge: 'ENTIRE PROJECT',
      };
    }
  }

  /**
   * Parse error message to detect if an underlying view source dependency is inaccessible.
   */
  public extractViewSourceDependencyFromError(error: any): ViewDependencyInfo {
    const message = error?.message || String(error || '');

    // Pattern 1: Access Denied: Table <proj>:<dataset>.<table>: User does not have permission...
    // Pattern 2: Permission bigquery.tables.getData denied on table <proj>:<dataset>.<table>
    // Pattern 3: User does not have permission to query table `<proj>.<dataset>.<table>`
    const tableRegex = /(?:Access Denied: Table |Permission bigquery\.tables\.getData denied on table |query table [`']?)([a-zA-Z0-9_\-]+)[:.]([a-zA-Z0-9_\-]+)[:.]([a-zA-Z0-9_\-]+)/i;
    const match = message.match(tableRegex);

    if (match) {
      const missingProject = match[1];
      const missingDataset = match[2];
      const missingTable = match[3];
      return {
        isViewDependencyError: true,
        missingProject,
        missingDataset,
        missingTable,
        formattedTarget: `${missingProject}.${missingDataset}.${missingTable}`,
        rawMessage: message,
      };
    }

    // Pattern 4: Dataset level denied: Access Denied: Dataset <proj>:<dataset>
    const datasetRegex = /(?:Access Denied: Dataset |Permission .* on dataset )([a-zA-Z0-9_\-]+)[:.]([a-zA-Z0-9_\-]+)/i;
    const dsMatch = message.match(datasetRegex);
    if (dsMatch) {
      return {
        isViewDependencyError: true,
        missingProject: dsMatch[1],
        missingDataset: dsMatch[2],
        formattedTarget: `${dsMatch[1]}.${dsMatch[2]}`,
        rawMessage: message,
      };
    }

    return {
      isViewDependencyError: false,
      rawMessage: message,
    };
  }

  public async getClient(): Promise<{ client: BigQuery; config: BigQueryConfig }> {
    const config = await getBigQueryConfig();
    if (!this.bqClient) {
      this.bqClient = new BigQuery({
        projectId: config.projectId,
        location: config.location,
      });
    }
    return { client: this.bqClient, config };
  }

  /**
   * Check if a table or view is permitted under BIGQUERY_ALLOWED_TABLES.
   */
  public isTableAllowed(tableId: string, datasetId: string, allowedTables: string[]): boolean {
    if (!allowedTables || allowedTables.length === 0 || allowedTables.includes('*')) {
      return true;
    }
    const fullKey = `${datasetId}.${tableId}`.toLowerCase();
    const shortKey = tableId.toLowerCase();
    return allowedTables.includes(fullKey) || allowedTables.includes(shortKey);
  }

  /**
   * List accessible BigQuery dataset IDs.
   */
  public async listDatasets(): Promise<string[]> {
    const { client } = await this.getClient();
    try {
      const [datasets] = await client.getDatasets();
      return datasets.map((d) => d.id).filter((id): id is string => Boolean(id));
    } catch (error: any) {
      logger.error({ error }, 'Failed to list BigQuery datasets');
      throw new BigQueryApiError(error.message, error.code, 'DATASETS_LIST_ERROR');
    }
  }

  /**
   * List tables and views in a dataset (filtered against allowedTables).
   */
  public async listTables(datasetId?: string): Promise<TableSummary[]> {
    const { client, config } = await this.getClient();
    const targetDataset = datasetId || config.defaultDataset;

    if (!targetDataset) {
      throw new BigQueryApiError(
        'Dataset ID must be provided or configured in BIGQUERY_DEFAULT_DATASET.',
        400,
        'MISSING_DATASET_ID'
      );
    }

    try {
      const dataset = client.dataset(targetDataset);
      const [tables] = await dataset.getTables();

      const summaries: TableSummary[] = tables
        .map((t) => {
          const rawMetadata = t.metadata || {};
          return {
            id: t.id || `${targetDataset}.${t.id}`,
            tableId: t.id || '',
            datasetId: targetDataset,
            type: rawMetadata.type || 'TABLE',
          };
        })
        .filter((t) => this.isTableAllowed(t.tableId, targetDataset, config.allowedTables));

      return summaries;
    } catch (error: any) {
      logger.error({ error, datasetId: targetDataset }, 'Failed to list BigQuery tables');
      throw new BigQueryApiError(error.message, error.code, 'TABLES_LIST_ERROR');
    }
  }

  /**
   * Get metadata and schema for a specific table or view.
   */
  public async getTableInfo(tableId: string, datasetId?: string): Promise<TableInfo> {
    const { client, config } = await this.getClient();
    const targetDataset = datasetId || config.defaultDataset;

    if (!targetDataset) {
      throw new BigQueryApiError(
        'Dataset ID must be provided or configured in BIGQUERY_DEFAULT_DATASET.',
        400,
        'MISSING_DATASET_ID'
      );
    }

    if (!this.isTableAllowed(tableId, targetDataset, config.allowedTables)) {
      throw new BigQueryApiError(
        `Table or view '${targetDataset}.${tableId}' is not permit-listed for query access.`,
        403,
        'TABLE_NOT_PERMITTED'
      );
    }

    try {
      const dataset = client.dataset(targetDataset);
      const table = dataset.table(tableId);
      const [metadata] = await table.getMetadata();

      const fields = metadata.schema?.fields || [];
      const schema: ColumnSchema[] = fields.map((f: any) => ({
        name: f.name,
        type: f.type,
        mode: f.mode,
        description: f.description,
      }));

      return {
        id: metadata.id || `${targetDataset}.${tableId}`,
        datasetId: targetDataset,
        tableId,
        type: metadata.type || 'TABLE',
        description: metadata.description,
        numRows: metadata.numRows,
        numBytes: metadata.numBytes,
        creationTime: metadata.creationTime,
        lastModifiedTime: metadata.lastModifiedTime,
        schema,
      };
    } catch (error: any) {
      logger.error({ error, tableId, datasetId: targetDataset }, 'Failed to get BigQuery table info');
      throw new BigQueryApiError(error.message, error.code, 'TABLE_INFO_ERROR');
    }
  }

  /**
   * Validate SQL and perform a dry run to check syntax and estimated bytes scanned.
   */
  public async dryRunQuery(query: string, datasetId?: string): Promise<QueryDryRunResult> {
    const { client, config } = await this.getClient();
    this.validateQuery(query, config);
    const defaultDataset = datasetId || config.defaultDataset;

    try {
      const [job] = await client.createQueryJob({
        query,
        dryRun: true,
        defaultDataset: defaultDataset ? { datasetId: defaultDataset } : undefined,
        useQueryCache: config.useQueryCache,
      });

      const totalBytesProcessed = parseInt(job.metadata.statistics?.totalBytesProcessed || '0', 10);
      const estimatedCostMb = Math.round((totalBytesProcessed / (1024 * 1024)) * 100) / 100;
      const statementType = job.metadata.statistics?.query?.statementType;

      return {
        valid: true,
        totalBytesProcessed,
        estimatedCostMb,
        statementType,
      };
    } catch (error: any) {
      if (error instanceof BigQueryApiError) throw error;
      logger.warn({ error, query }, 'BigQuery dry run failed');
      throw new BigQuerySyntaxError(error.message);
    }
  }

  /**
   * Comprehensive BigQuery SQL Query Guardrail Validator.
   * Enforces:
   * 1. Multi-statement execution blocking (if blockMultiStatement: true).
   * 2. Wildcard SELECT * blocking (if selectAllPolicy: 'BLOCK').
   * 3. Mode STRICT_READ_ONLY: First statement must start with SELECT, WITH, or EXPLAIN; blocks all mutation/DDL/CROSS JOIN clauses.
   * 4. Mode GRANULAR_CUSTOM: Enforces custom blockedSqlClauses and allowedSqlClauses.
   */
  public validateQuery(query: string, customConfig?: Partial<BigQueryConfig>): void {
    if (!query || typeof query !== 'string') {
      throw new BigQueryApiError('SQL query string cannot be empty.', 400, 'EMPTY_QUERY');
    }

    const cleanSql = stripSqlCommentsAndStrings(query).trim();
    if (!cleanSql) {
      throw new BigQueryApiError('SQL query contains no executable statements.', 400, 'EMPTY_QUERY');
    }

    const config = customConfig || {
      sqlGuardrailMode: 'STRICT_READ_ONLY',
      blockMultiStatement: true,
      selectAllPolicy: 'WARN',
      allowedSqlClauses: ['SELECT', 'WITH', 'FROM', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'INNER JOIN', 'UNION', 'UNION ALL', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET', 'DISTINCT', 'EXPLAIN'],
      blockedSqlClauses: ['CROSS JOIN', 'DELETE', 'UPDATE', 'INSERT', 'MERGE', 'TRUNCATE', 'TRUNCATE TABLE', 'DROP', 'DROP TABLE', 'DROP VIEW', 'DROP SCHEMA', 'CREATE OR REPLACE TABLE', 'CREATE OR REPLACE VIEW', 'REPLACE', 'ALTER', 'ALTER TABLE', 'ALTER SCHEMA', 'CREATE', 'CREATE TABLE', 'CREATE VIEW', 'CREATE MATERIALIZED VIEW', 'CREATE FUNCTION', 'CREATE PROCEDURE', 'CALL', 'EXPORT', 'EXPORT DATA', 'LOAD', 'LOAD DATA'],
    };

    // 1. Multi-statement execution check
    if (config.blockMultiStatement) {
      const withoutTrailingSemicolon = cleanSql.replace(/;\s*$/, '');
      if (withoutTrailingSemicolon.includes(';')) {
        throw new BigQueryApiError(
          'Multi-statement SQL execution is blocked by BigQuery security guardrails.',
          400,
          'MULTI_STATEMENT_BLOCKED'
        );
      }
    }

    // 2. Select All Wildcard Policy
    if (config.selectAllPolicy === 'BLOCK') {
      if (/\bSELECT\s+(?:DISTINCT\s+)?(?:\w+\.)?\*/i.test(cleanSql)) {
        throw new BigQueryApiError(
          "Wildcard 'SELECT *' queries are blocked by BigQuery security guardrails. Explicitly list required column names.",
          400,
          'SELECT_STAR_BLOCKED'
        );
      }
    }

    // 3. Mode: STRICT_READ_ONLY (Default Zero-Trust)
    if (!config.sqlGuardrailMode || config.sqlGuardrailMode === 'STRICT_READ_ONLY') {
      const strictForbidden = [
        'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE',
        'MERGE', 'GRANT', 'REVOKE', 'CALL', 'EXPORT', 'LOAD', 'CROSS JOIN'
      ];

      for (const kw of strictForbidden) {
        const regex = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'i');
        if (regex.test(cleanSql)) {
          throw new BigQueryApiError(
            `Mutation / risky statement '${kw}' is prohibited in Strict Read-Only mode.`,
            400,
            'STRICT_READ_ONLY_VIOLATION'
          );
        }
      }

      const firstWordMatch = cleanSql.match(/^[a-zA-Z]+/);
      const firstWord = firstWordMatch ? firstWordMatch[0].toUpperCase() : '';
      if (firstWord !== 'SELECT' && firstWord !== 'WITH' && firstWord !== 'EXPLAIN') {
        throw new BigQueryApiError(
          `Strict Read-Only mode requires query to start with SELECT, WITH, or EXPLAIN. Received: '${firstWord}'`,
          400,
          'INVALID_STATEMENT_START'
        );
      }
      return;
    }

    // 4. Mode: GRANULAR_CUSTOM
    if (config.sqlGuardrailMode === 'GRANULAR_CUSTOM') {
      // 4a. Check blocked SQL clauses (multi-word and single-word)
      if (config.blockedSqlClauses && config.blockedSqlClauses.length > 0) {
        for (const blocked of config.blockedSqlClauses) {
          if (!blocked) continue;
          const normalized = blocked.trim().replace(/\s+/g, '\\s+');
          const regex = new RegExp(`\\b${normalized}\\b`, 'i');
          if (regex.test(cleanSql)) {
            throw new BigQueryApiError(
              `SQL clause '${blocked.trim()}' is explicitly blocked by BigQuery security guardrails.`,
              400,
              'BLOCKED_CLAUSE_VIOLATION'
            );
          }
        }
      }

      // 4b. Check allowed statement start keyword
      if (config.allowedSqlClauses && config.allowedSqlClauses.length > 0) {
        const firstWordMatch = cleanSql.match(/^[a-zA-Z]+/);
        const firstWord = firstWordMatch ? firstWordMatch[0].toUpperCase() : '';
        const allowedUpper = config.allowedSqlClauses.map((c) => c.toUpperCase().trim());
        if (!allowedUpper.includes(firstWord)) {
          throw new BigQueryApiError(
            `Statement starting with '${firstWord}' is not in the permitted SQL clauses list.`,
            400,
            'DISALLOWED_START_CLAUSE'
          );
        }
      }
    }
  }

  /**
   * Validate that SQL query is strictly read-only (SELECT / WITH / EXPLAIN).
   * Backward-compatible delegation to validateQuery.
   */
  public validateReadOnlyQuery(query: string): void {
    this.validateQuery(query);
  }

  /**
   * Enforce artificial scan size limits (maxBytesBilled).
   * Throws BigQueryCostLimitError if scanned bytes exceed configured threshold.
   */
  public enforceScanLimit(bytesProcessed: number, maxBytesBilled: number): void {
    if (maxBytesBilled > 0 && bytesProcessed > maxBytesBilled) {
      const scannedMb = Math.round((bytesProcessed / (1024 * 1024)) * 100) / 100;
      const limitMb = Math.round((maxBytesBilled / (1024 * 1024)) * 100) / 100;
      throw new BigQueryCostLimitError(
        `Query scan cap exceeded: Query requires scanning ${scannedMb} MB, which violates the safety limit of ${limitMb} MB. Refine query with partition filters or explicit column projections.`,
        undefined,
        maxBytesBilled
      );
    }
  }

  /**
   * Execute read-only SQL query with cost cap and row limits.
   */
  public async executeQuery(
    query: string,
    options?: {
      maxResults?: number;
      datasetId?: string;
      timeoutMs?: number;
    }
  ): Promise<QueryExecutionResult> {
    const { client, config } = await this.getClient();
    this.validateQuery(query, config);

    const maxResults = Math.min(
      options?.maxResults || config.maxRowsReturned,
      1000
    );
    const defaultDataset = options?.datasetId || config.defaultDataset;
    const timeoutMs = options?.timeoutMs || config.queryTimeoutMs;

    // 1. Zero-Cost Pre-Flight Dry Run Gate (if enabled)
    if (config.enableDryRunPreFlight) {
      try {
        const dryRun = await this.dryRunQuery(query, defaultDataset);
        this.enforceScanLimit(dryRun.totalBytesProcessed, config.maxBytesBilled);
      } catch (err: any) {
        if (err instanceof BigQueryCostLimitError || err instanceof BigQuerySyntaxError || err instanceof BigQueryApiError) {
          throw err;
        }
      }
    }

    const startTime = Date.now();

    try {
      const [job] = await client.createQueryJob({
        query,
        maximumBytesBilled: String(config.maxBytesBilled),
        defaultDataset: defaultDataset ? { datasetId: defaultDataset } : undefined,
        jobTimeoutMs: timeoutMs,
        useQueryCache: config.useQueryCache,
      });

      const [rows] = await job.getQueryResults({
        maxResults,
        timeoutMs,
      });

      const duration = Date.now() - startTime;
      const totalBytesProcessed = parseInt(job.metadata?.statistics?.totalBytesProcessed || '0', 10);
      const totalRows = parseInt(job.metadata?.statistics?.query?.totalRows || String(rows.length), 10);

      logger.info(
        { rowCount: rows.length, totalRows, duration, bytes: totalBytesProcessed },
        'BigQuery query executed successfully'
      );

      return {
        rows,
        rowCount: rows.length,
        totalRows,
        jobId: job.id,
        totalBytesProcessed,
        executionDurationMs: duration,
      };
    } catch (error: any) {
      if (error instanceof BigQueryCostLimitError) throw error;
      if (error.message && error.message.includes('bytes billed limit')) {
        throw new BigQueryCostLimitError(
          `Query scanned more data than the safety limit of ${Math.round(config.maxBytesBilled / (1024 * 1024))} MB. Refine your query with filters or partitions.`,
          undefined,
          config.maxBytesBilled
        );
      }
      logger.error({ error, query }, 'BigQuery query execution failed');
      throw new BigQueryApiError(error.message, error.code, 'QUERY_EXECUTION_ERROR');
    }
  }
}

export const bigqueryService = new BigQueryService();
