import { ToolDefinition } from '../../../mcp/types.js';
import { schemaTools } from './schema.js';
import { queryTools } from './queries.js';

export const bigqueryTools: ToolDefinition[] = [
  ...schemaTools,
  ...queryTools,
];

export { schemaTools, queryTools };
