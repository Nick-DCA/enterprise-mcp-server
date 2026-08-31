import { runtimeConfig, ServiceId } from '../config/runtimeConfig.js';
import { DomainName, ToolDefinition } from './types.js';
import { logger } from '../utils/logger.js';

export function resolveServiceIdFromDomain(domain: DomainName): ServiceId | null {
  const lower = domain.toLowerCase();
  if (['accounting', 'contacts', 'reports', 'payroll', 'xero'].includes(lower)) {
    return 'xero';
  }
  if (['bigquery'].includes(lower)) {
    return 'bigquery';
  }
  if (['firestore'].includes(lower)) {
    return 'firestore';
  }
  if (['sagehr'].includes(lower)) {
    return 'sagehr';
  }
  return null;
}

export interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Validates whether a tool invocation is permitted under current runtime configurations.
 */
export async function checkToolExecutionAccess(
  toolDef: ToolDefinition,
  domain: DomainName,
  userEmail?: string
): Promise<AccessCheckResult> {
  const serviceId = resolveServiceIdFromDomain(domain);

  // 1. Check dynamic service enablement in RuntimeConfig
  if (serviceId) {
    const isEnabled = await runtimeConfig.isServiceEnabled(serviceId);
    if (!isEnabled) {
      return {
        allowed: false,
        reason: `The '${serviceId.toUpperCase()}' integration service has been temporarily disabled by an administrator in the MCP Admin Portal.`,
      };
    }
  }

  // 2. Check user-level permissions if a specific user context was passed
  if (userEmail) {
    const userAccess = await runtimeConfig.getUserAccess(userEmail);
    if (userAccess) {
      if (!userAccess.isEnabled) {
        return {
          allowed: false,
          reason: `Platform access for user '${userEmail}' has been disabled by an administrator.`,
        };
      }

      if (serviceId && !userAccess.allowedServices.includes(serviceId)) {
        return {
          allowed: false,
          reason: `User '${userEmail}' does not have permission to access '${serviceId.toUpperCase()}' tools.`,
        };
      }

      if (userAccess.readOnlyOnly && !toolDef.annotations.readOnlyHint) {
        return {
          allowed: false,
          reason: `User '${userEmail}' has read-only restrictions. The requested tool '${toolDef.name}' performs mutating or destructive operations.`,
        };
      }

      if (userAccess.customDeniedTools.includes(toolDef.name)) {
        return {
          allowed: false,
          reason: `Tool '${toolDef.name}' is explicitly blocked for user '${userEmail}'.`,
        };
      }
    }
  }

  return { allowed: true };
}
