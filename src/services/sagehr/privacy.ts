import { SageHrConfig } from './config.js';

export class AttributePrivacyEngine {
  /**
   * Sanitizes any data payload (object, array, primitive) applying blocking, masking, and safe allowlist rules.
   * Runs server-side before response is serialized to LLM / Gemini Enterprise.
   */
  public static sanitize<T>(data: T, config: SageHrConfig): T {
    if (data === null || data === undefined) {
      return data;
    }

    if (Array.isArray(data)) {
      return data
        .map((item) => this.sanitize(item, config))
        .filter((item) => item !== undefined) as unknown as T;
    }

    if (typeof data === 'object') {
      const result: Record<string, any> = {};
      const entries = Object.entries(data as Record<string, any>);

      for (const [key, value] of entries) {
        const lowerKey = key.toLowerCase();

        // 1. Check if attribute is in BLOCKED list -> completely omit from output
        if (config.blockedFields.some((blocked) => lowerKey.includes(blocked) || lowerKey === blocked)) {
          continue;
        }

        // 2. Check if SAFE_ATTRIBUTES allowlist mode is active
        if (!config.safeAttributes.includes('*')) {
          const isExplicitlySafe = config.safeAttributes.some(
            (safe) => lowerKey === safe || lowerKey.startsWith(safe)
          );
          if (!isExplicitlySafe) {
            continue; // Drop any unapproved attribute
          }
        }

        // 3. Check if attribute is in MASKED list -> replace value with [REDACTED]
        if (config.maskedFields.some((masked) => lowerKey.includes(masked) || lowerKey === masked)) {
          result[key] = '[REDACTED]';
          continue;
        }

        // 4. Recursively sanitize nested structures
        if (value !== null && typeof value === 'object') {
          result[key] = this.sanitize(value, config);
        } else {
          result[key] = value;
        }
      }

      return result as T;
    }

    return data;
  }

  /**
   * Checks if an employee's department/team is permitted by policy.
   */
  public static isTeamAllowed(teamOrDept?: string, allowedTeams: string[] = ['*']): boolean {
    if (!allowedTeams || allowedTeams.length === 0 || allowedTeams.includes('*')) {
      return true;
    }
    if (!teamOrDept) {
      return false;
    }
    const lower = teamOrDept.toLowerCase().trim();
    return allowedTeams.some((t) => lower === t || lower.includes(t));
  }

  /**
   * Checks if an employee's job title/position is blocked by policy.
   */
  public static isPositionAllowed(position?: string, blockedPositions: string[] = []): boolean {
    if (!blockedPositions || blockedPositions.length === 0) {
      return true;
    }
    if (!position) {
      return true;
    }
    const lower = position.toLowerCase().trim();
    return !blockedPositions.some((b) => lower === b || lower.includes(b));
  }
}
