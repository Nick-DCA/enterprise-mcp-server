import { runtimeConfig, ServiceId } from '../config/runtimeConfig.js';
import { DomainName, ToolDefinition } from './types.js';
import { RequestContext } from '../server/context.js';
import { isValidUserEmail } from '../utils/identity.js';
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
  if (['slack'].includes(lower)) {
    return 'slack';
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

  // 2. Resolve candidate user email & machine client identity
  const candidateEmail = userEmail || RequestContext.getUserEmail();
  const effectiveEmail = isValidUserEmail(candidateEmail) ? candidateEmail.trim().toLowerCase() : undefined;
  const clientId = RequestContext.getClientId() || 'anonymous';

  // 3. Special handling for Slack: Strictly require authenticated human corporate user
  if (serviceId === 'slack') {
    // slack-search-guide is an instructional guide tool that does not access Slack API or user tokens
    if (toolDef.name !== 'slack-search-guide') {
      if (!effectiveEmail) {
        return {
          allowed: false,
          reason: `Slack federated search requires an authenticated corporate user email. Machine client '${clientId}' cannot execute user-delegated Slack operations without verified user context.`,
        };
      }

      const userAccess = await runtimeConfig.getUserAccess(effectiveEmail);

      // If user account is explicitly disabled in users_access, block immediately
      if (userAccess && !userAccess.isEnabled) {
        return {
          allowed: false,
          reason: `Platform access for user '${effectiveEmail}' has been disabled by an administrator.`,
        };
      }

      const slackConfig = await runtimeConfig.getServiceConfig('slack');
      const allowAllUsers = slackConfig?.settings?.allowAllUsers !== false; // Default: true

      if (allowAllUsers) {
        // Under open user delegation, any verified corporate user can search/init Slack
        return { allowed: true };
      } else {
        // Strict IAM Mode: Require user to exist in users_access with 'slack' in allowedServices
        if (!userAccess) {
          return {
            allowed: false,
            reason: `User '${effectiveEmail}' requires an explicit administrator grant in Users & Access to use Slack tools.`,
          };
        }
        if (!userAccess.allowedServices.includes('slack')) {
          return {
            allowed: false,
            reason: `User '${effectiveEmail}' does not have permission to access 'SLACK' tools under current security policy.`,
          };
        }
        return { allowed: true };
      }
    }
  }

  // 4. Non-Slack services: Check user-level restrictions if user context is present
  if (effectiveEmail) {
    const userAccess = await runtimeConfig.getUserAccess(effectiveEmail);

    // If user account is explicitly disabled in users_access, block immediately
    if (userAccess && !userAccess.isEnabled) {
      return {
        allowed: false,
        reason: `Platform access for user '${effectiveEmail}' has been disabled by an administrator.`,
      };
    }

    if (userAccess) {
      if (serviceId && !userAccess.allowedServices.includes(serviceId)) {
        return {
          allowed: false,
          reason: `User '${effectiveEmail}' does not have permission to access '${serviceId.toUpperCase()}' tools.`,
        };
      }

      if (userAccess.readOnlyOnly && !toolDef.annotations.readOnlyHint) {
        return {
          allowed: false,
          reason: `User '${effectiveEmail}' has read-only restrictions. The requested tool '${toolDef.name}' performs mutating or destructive operations.`,
        };
      }

      if (userAccess.customDeniedTools.includes(toolDef.name)) {
        return {
          allowed: false,
          reason: `Tool '${toolDef.name}' is explicitly blocked for user '${effectiveEmail}'.`,
        };
      }
    }
  }

  return { allowed: true };
}

