import { z } from 'zod';
import { ToolDefinition } from '../../../mcp/types.js';
import { bigqueryService } from '../client.js';

export const schemaTools: ToolDefinition[] = [
  {
    name: 'bigquery-list-datasets',
    description:
      'List all accessible BigQuery dataset IDs within the configured Google Cloud project for data discovery and schema exploration.',
    schema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    execute: async () => {
      const datasetIds = await bigqueryService.listDatasets();
      return JSON.stringify({ datasetIds }, null, 2);
    },
  },
  {
    name: 'bigquery-list-tables',
    description:
      'List table and view IDs within a specified BigQuery dataset. Results are filtered against the configured permit allowlist (BIGQUERY_ALLOWED_TABLES).',
    schema: {
      datasetId: z.string().optional().describe('Dataset ID (optional if BIGQUERY_DEFAULT_DATASET is configured)'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    execute: async (args: { datasetId?: string }) => {
      const tables = await bigqueryService.listTables(args.datasetId);
      return JSON.stringify({ tables }, null, 2);
    },
  },
  {
    name: 'bigquery-get-table-schema',
    description:
      'Retrieve comprehensive schema metadata for a BigQuery table or view, including column names, data types (STRING, NUMERIC, TIMESTAMP), nullability modes, and field descriptions.',
    schema: {
      tableId: z.string().describe('Table or view ID to inspect'),
      datasetId: z.string().optional().describe('Dataset ID (optional if BIGQUERY_DEFAULT_DATASET is configured)'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    execute: async (args: { tableId: string; datasetId?: string }) => {
      const tableInfo = await bigqueryService.getTableInfo(args.tableId, args.datasetId);
      return JSON.stringify(tableInfo, null, 2);
    },
  },
];
