import { ToolDefinition } from '../../../mcp/types.js';
import { schemaTools } from './schema.js';
import { documentTools } from './documents.js';

export const firestoreTools: ToolDefinition[] = [
  ...schemaTools,
  ...documentTools,
];

export { schemaTools, documentTools };
