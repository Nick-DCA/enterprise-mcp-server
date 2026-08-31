import { ToolDefinition } from '../../../mcp/types.js';
import { accountingTools } from './accounting.js';
import { contactsTools } from './contacts.js';
import { reportsTools } from './reports.js';
import { payrollTools } from './payroll.js';

export { accountingTools, contactsTools, reportsTools, payrollTools };

/**
 * Aggregated bundle of all Xero MCP tools across accounting, contacts, reports, and payroll domains.
 */
export const xeroTools: ToolDefinition[] = [
  ...accountingTools,
  ...contactsTools,
  ...reportsTools,
  ...payrollTools,
];
