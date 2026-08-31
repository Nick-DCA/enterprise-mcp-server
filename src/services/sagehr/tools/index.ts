import { ToolDefinition } from '../../../mcp/types.js';
import { directoryTools } from './directory.js';
import { leaveTools } from './leave.js';
import { expenseTools } from './expenses.js';

export const sagehrTools: ToolDefinition[] = [
  ...directoryTools,
  ...leaveTools,
  ...expenseTools,
];

export { directoryTools, leaveTools, expenseTools };
