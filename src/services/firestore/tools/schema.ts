import { z } from 'zod';
import { ToolDefinition } from '../../../mcp/types.js';
import { firestoreService } from '../client.js';

export const schemaTools: ToolDefinition[] = [
  {
    name: 'firestore-list-collections',
    description:
      'List accessible root collection IDs in the Google Cloud Firestore database. Results are filtered against the configured permit allowlist (FIRESTORE_ALLOWED_COLLECTIONS).',
    schema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    execute: async () => {
      const collections = await firestoreService.listCollections();
      return JSON.stringify({ collections }, null, 2);
    },
  },
  {
    name: 'firestore-get-collection-schema',
    description:
      'Inspect the inferred schema, field names, data types, and sample structures of a Firestore collection by sampling existing documents.',
    schema: {
      collectionPath: z.string().describe('Collection path to inspect (e.g. "customers" or "orders")'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    execute: async (args: { collectionPath: string }) => {
      const schema = await firestoreService.getCollectionSchema(args.collectionPath);
      return JSON.stringify(schema, null, 2);
    },
  },
  {
    name: 'firestore-list-subcollections',
    description:
      'List child subcollection IDs nested under a specific parent Firestore document path (e.g. \'customers/cust_123\').',
    schema: {
      documentPath: z.string().describe('Parent document path (e.g. "customers/cust_123")'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    execute: async (args: { documentPath: string }) => {
      const subcollections = await firestoreService.listSubcollections(args.documentPath);
      return JSON.stringify({ documentPath: args.documentPath, subcollections }, null, 2);
    },
  },
];
