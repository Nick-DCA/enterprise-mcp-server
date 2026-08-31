import { z } from 'zod';
import { ToolDefinition } from '../../../mcp/types.js';
import { firestoreService } from '../client.js';

const filterSchema = z.object({
  field: z.string().describe('Document field name to filter on'),
  operator: z
    .enum(['==', '!=', '<', '<=', '>', '>=', 'array-contains', 'in', 'array-contains-any', 'not-in'])
    .describe('Firestore query filter operator'),
  value: z.any().describe('Value to match against'),
});

export const documentTools: ToolDefinition[] = [
  {
    name: 'firestore-get-document',
    description:
      'Retrieve a single Firestore document by its hierarchical path (e.g. \'customers/cust_123\'). Automatically masks configured sensitive fields (e.g. password, token, apikey).',
    schema: {
      documentPath: z.string().describe('Path to the document (e.g. "customers/cust_123")'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    execute: async (args: { documentPath: string }) => {
      const doc = await firestoreService.getDocument(args.documentPath);
      return JSON.stringify(doc, null, 2);
    },
  },
  {
    name: 'firestore-query-documents',
    description:
      'Query documents in a Firestore collection with structured where filters (==, !=, <, <=, >, >=, in, array-contains), ordering (orderByField, orderDirection), and pagination limits (default 50, max 500).',
    schema: {
      collectionPath: z.string().describe('Collection path to query (e.g. "orders" or "customers")'),
      filters: z.array(filterSchema).optional().describe('List of where conditions'),
      orderByField: z.string().optional().describe('Field to sort by'),
      orderDirection: z.enum(['asc', 'desc']).optional().default('asc').describe('Sort direction'),
      limit: z.coerce.number().optional().describe('Maximum documents to return (default: 50, max: 500)'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    execute: async (args: {
      collectionPath: string;
      filters?: any[];
      orderByField?: string;
      orderDirection?: 'asc' | 'desc';
      limit?: number;
    }) => {
      const result = await firestoreService.queryDocuments(args.collectionPath, {
        filters: args.filters,
        orderByField: args.orderByField,
        orderDirection: args.orderDirection,
        limit: args.limit,
      });
      return JSON.stringify(result, null, 2);
    },
  },
  {
    name: 'firestore-set-document',
    description:
      'Create or merge document data in Firestore at a specific document path. Active only when write permissions are explicitly enabled (FIRESTORE_ALLOW_WRITES=true); otherwise fails safely.',
    schema: {
      documentPath: z.string().describe('Target document path (e.g. "customers/cust_123")'),
      data: z.record(z.any()).describe('JSON object data to write or merge'),
      merge: z.boolean().optional().default(true).describe('Merge with existing document data instead of overwriting'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    execute: async (args: { documentPath: string; data: Record<string, any>; merge?: boolean }) => {
      const result = await firestoreService.setDocument(args.documentPath, args.data, args.merge);
      return JSON.stringify(result, null, 2);
    },
  },
];
