import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolDefinition, DomainName } from './types.js';
import { checkToolExecutionAccess } from './accessGuard.js';
import { RequestContext } from '../server/context.js';
import { logger } from '../utils/logger.js';
import { formatXeroValidationError } from '../services/xero/errors.js';
import { formatBigQueryError } from '../services/bigquery/errors.js';
import { formatFirestoreError } from '../services/firestore/errors.js';
import { formatSageHrError } from '../services/sagehr/errors.js';
import type { McpExecutionStatus } from '../server/types/logs.js';

export class ToolRegistry {
  private registeredCount = 0;

  /**
   * Helper to check if a specific domain is enabled based on ENABLED_DOMAINS env var.
   * Defaults to enabling all domains if ENABLED_DOMAINS is not specified or empty.
   * Supports parent service aliases (e.g. 'xero' enables 'accounting', 'contacts', etc.)
   */
  public isDomainEnabled(domain: DomainName): boolean {
    const enabledEnv = process.env.ENABLED_DOMAINS;
    if (!enabledEnv || enabledEnv.trim() === '') {
      return true; // All domains enabled by default
    }
    const domains = enabledEnv.split(',').map((d) => d.trim().toLowerCase());
    const lowerDomain = domain.toLowerCase();

    if (domains.includes(lowerDomain)) {
      return true;
    }

    // Check parent domain matches
    const xeroDomains = ['accounting', 'contacts', 'reports', 'payroll', 'xero'];
    if (domains.includes('xero') && xeroDomains.includes(lowerDomain)) {
      return true;
    }

    return false;
  }

  /**
   * Formats tool execution errors into LLM-friendly messages.
   */
  private formatErrorMessage(error: any): string {
    if (error?.response?.body?.Elements || error?.name === 'XeroApiError' || error?.name === 'XeroRateLimitError') {
      return formatXeroValidationError(error);
    }
    if (error?.name?.startsWith('BigQuery') || error?.code === 'COST_LIMIT_EXCEEDED' || error?.code === 'READ_ONLY_VIOLATION') {
      return formatBigQueryError(error);
    }
    if (error?.name?.startsWith('Firestore') || error?.code === 'WRITE_DISABLED' || error?.code === 'COLLECTION_SCHEMA_ERROR') {
      return formatFirestoreError(error);
    }
    if (error?.name?.startsWith('SageHr') || error?.code === 'WRITE_DISABLED') {
      return formatSageHrError(error);
    }
    return error?.message || String(error);
  }

  /**
   * Registers a bundle of tool definitions for a specific domain.
   */
  public registerDomainTools(server: McpServer, domain: DomainName, tools: ToolDefinition[]): void {
    if (!this.isDomainEnabled(domain)) {
      logger.debug(`Domain '${domain}' is disabled via ENABLED_DOMAINS env setting. Skipping ${tools.length} tools.`);
      return;
    }

    for (const toolDef of tools) {
      server.tool(
        toolDef.name,
        toolDef.description,
        toolDef.schema,
        toolDef.annotations,
        async (args: any) => {
          const toolStartTime = Date.now();
          try {
            logger.info({ tool: toolDef.name, args }, `Executing tool: ${toolDef.name}`);

            // Dynamic runtime access check (service toggles & user permissions)
            const userEmail = RequestContext.getUserEmail();
            const accessCheck = await checkToolExecutionAccess(toolDef, domain, userEmail);
            if (!accessCheck.allowed) {
              const durationMs = Date.now() - toolStartTime;
              const errorText = `Access Denied: ${accessCheck.reason}`;
              logger.warn({ tool: toolDef.name, reason: accessCheck.reason }, 'Tool execution blocked by access guard');

              RequestContext.setToolExecution({
                toolName: toolDef.name,
                domain,
                arguments: args,
                status: 'BLOCKED',
                durationMs,
                responsePreview: errorText.slice(0, 500),
                responsePayload: errorText,
                responseChars: errorText.length,
                errorMessage: accessCheck.reason,
              });

              return {
                isError: true,
                content: [
                  {
                    type: 'text' as const,
                    text: errorText,
                  },
                ],
              };
            }

            const result = await toolDef.execute(args);
            const durationMs = Date.now() - toolStartTime;
            const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

            RequestContext.setToolExecution({
              toolName: toolDef.name,
              domain,
              arguments: args,
              status: 'SUCCESS',
              durationMs,
              responsePreview: resultText.slice(0, 500),
              responsePayload: resultText,
              responseChars: resultText.length,
            });

            return {
              content: [
                {
                  type: 'text' as const,
                  text: resultText,
                },
              ],
            };
          } catch (error: any) {
            const durationMs = Date.now() - toolStartTime;
            const formattedError = this.formatErrorMessage(error);
            logger.error({ tool: toolDef.name, error: error.message || error }, `Error executing tool ${toolDef.name}`);

            const isRateLimited =
              error?.name === 'XeroRateLimitError' ||
              error?.status === 429 ||
              error?.statusCode === 429 ||
              error?.code === 429;
            const errorStatus: McpExecutionStatus = isRateLimited ? 'RATE_LIMITED' : 'ERROR';
            const errorText = `Tool '${toolDef.name}' execution failed: ${formattedError}`;

            RequestContext.setToolExecution({
              toolName: toolDef.name,
              domain,
              arguments: args,
              status: errorStatus,
              durationMs,
              responsePreview: errorText.slice(0, 500),
              responsePayload: errorText,
              responseChars: errorText.length,
              errorMessage: formattedError,
            });

            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: errorText,
                },
              ],
            };
          }
        }
      );
      this.registeredCount++;
    }

    logger.debug(`Registered ${tools.length} tools for domain: '${domain}'`);
  }

  public getRegisteredCount(): number {
    return this.registeredCount;
  }
}
