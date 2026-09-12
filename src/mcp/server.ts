import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistry } from './registry.js';
import {
  accountingTools,
  contactsTools,
  payrollTools,
  reportsTools,
} from '../services/xero/tools/index.js';
import { bigqueryTools } from '../services/bigquery/tools/index.js';
import { firestoreTools } from '../services/firestore/tools/index.js';
import { sagehrTools } from '../services/sagehr/tools/index.js';
import { slackTools } from '../services/slack/tools/index.js';
import { logger } from '../utils/logger.js';

let hasLoggedStartup = false;

/**
 * Creates and configures the MCP server instance with modular service adapters registered.
 */
export function createMcpServer(): McpServer {
  const isFirstBoot = !hasLoggedStartup;
  if (isFirstBoot) {
    logger.info('Initializing Multi-Service MCP Gateway Server instance at boot...');
  } else {
    logger.debug('Creating request-scoped McpServer instance...');
  }

  const server = new McpServer({
    name: 'enterprise-mcp-server',
    version: '2.0.0',
    description: 'Enterprise Multi-Service MCP Server for Google Gemini Enterprise',
  });

  const registry = new ToolRegistry();

  // Register Xero domain tools
  registry.registerDomainTools(server, 'accounting', accountingTools);
  registry.registerDomainTools(server, 'contacts', contactsTools);
  registry.registerDomainTools(server, 'payroll', payrollTools);
  registry.registerDomainTools(server, 'reports', reportsTools);

  // Register BigQuery domain tools
  registry.registerDomainTools(server, 'bigquery', bigqueryTools);

  // Register Firestore domain tools
  registry.registerDomainTools(server, 'firestore', firestoreTools);

  // Register Sage HR domain tools
  registry.registerDomainTools(server, 'sagehr', sagehrTools);

  // Register Slack domain tools
  registry.registerDomainTools(server, 'slack', slackTools);

  const totalCount = registry.getRegisteredCount();
  if (isFirstBoot) {
    logger.info(`Registered ${totalCount} total MCP tools across enabled domains (ready to serve)`);
    hasLoggedStartup = true;
  } else {
    logger.debug(`Registered ${totalCount} MCP tools for request`);
  }

  return server;
}
