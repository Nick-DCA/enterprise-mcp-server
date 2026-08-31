import { z } from 'zod';
import { ToolDefinition } from '../../../mcp/types.js';
import { bigqueryService } from '../client.js';

export const queryTools: ToolDefinition[] = [
  {
    name: 'bigquery-dry-run-query',
    description:
      'Dry run a GoogleSQL query against BigQuery without executing it to validate SQL syntax, estimate the total bytes scanned, and verify cost bounds before running.',
    schema: {
      query: z.string().describe('Standard GoogleSQL query to validate and estimate'),
      datasetId: z.string().optional().describe('Default dataset ID to use for unqualified table names'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    execute: async (args: { query: string; datasetId?: string }) => {
      const result = await bigqueryService.dryRunQuery(args.query, args.datasetId);
      return JSON.stringify(result, null, 2);
    },
  },
  {
    name: 'bigquery-execute-query-readonly',
    description:
      'Execute a read-only GoogleSQL query against BigQuery (restricted strictly to SELECT and WITH queries). Enforces cost guardrails (BIGQUERY_MAX_BYTES_BILLED) and row limits (default 100, max 1000).',
    schema: {
      query: z.string().describe('Read-only GoogleSQL query to execute (must start with SELECT or WITH)'),
      maxResults: z.coerce.number().optional().describe('Maximum rows to return (default: 100, max: 1000)'),
      datasetId: z.string().optional().describe('Default dataset ID to use for unqualified table names'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    execute: async (args: { query: string; maxResults?: number; datasetId?: string }) => {
      const result = await bigqueryService.executeQuery(args.query, {
        maxResults: args.maxResults,
        datasetId: args.datasetId,
      });
      return JSON.stringify(result, null, 2);
    },
  },
];
