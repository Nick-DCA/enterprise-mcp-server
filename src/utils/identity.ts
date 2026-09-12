/**
 * Enterprise MCP Server - Identity & Email Validation Utility
 *
 * Enforces strict RFC 5322 email formatting, strips authentication proxy headers,
 * normalizes case/whitespace, and explicitly blocks reserved machine client identities.
 */

// Standard RFC 5322 compatible email regular expression
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Reserved machine identities and system names that must NEVER be treated as human user emails
export const RESERVED_MACHINE_IDS = new Set<string>([
  'gemini-enterprise-mcp',
  'gemini-enterprise',
  'mcp-xero-server',
  'system',
  'anonymous',
  'service-account',
  'admin-cli',
]);

/**
 * Strips authentication proxy prefixes (e.g. Google Cloud IAP "accounts.google.com:alice@domain.com")
 * and normalizes whitespace and casing.
 */
export function cleanUserEmail(raw?: unknown): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;

  let cleaned = raw.trim();

  // Strip Google Workspace / IAP identity header prefixes
  if (cleaned.startsWith('accounts.google.com:')) {
    cleaned = cleaned.replace(/^accounts\.google\.com:/i, '').trim();
  }

  cleaned = cleaned.toLowerCase();

  return isValidUserEmail(cleaned) ? cleaned : undefined;
}

/**
 * Validates whether a given string is a legitimate human user email address.
 * Rejects machine client identifiers, empty values, non-strings, and malformed emails.
 */
export function isValidUserEmail(email?: unknown): email is string {
  if (!email || typeof email !== 'string') return false;

  let cleaned = email.trim().toLowerCase();

  // Strip Google Workspace / IAP prefix if passed directly
  if (cleaned.startsWith('accounts.google.com:')) {
    cleaned = cleaned.replace(/^accounts\.google\.com:/i, '').trim();
  }

  // Explicitly reject empty strings
  if (cleaned.length === 0) return false;

  // Explicitly block reserved machine client IDs
  if (RESERVED_MACHINE_IDS.has(cleaned)) return false;

  // Block client-* identifier prefixes often used by OAuth machine clients
  if (cleaned.startsWith('client-')) return false;

  // Must match standard RFC 5322 email structure
  return EMAIL_REGEX.test(cleaned);
}

/**
 * Validates whether a validated email belongs to an approved domain whitelist.
 * If allowedDomains is empty, undefined, or contains '*', all domains are permitted.
 */
export function isAllowedEmailDomain(email: string, allowedDomains?: string[]): boolean {
  if (!isValidUserEmail(email)) return false;
  if (!allowedDomains || allowedDomains.length === 0 || allowedDomains.includes('*')) {
    return true;
  }

  const parts = email.split('@');
  if (parts.length !== 2) return false;

  const domain = parts[1].toLowerCase().trim();
  return allowedDomains.map((d) => d.toLowerCase().trim()).includes(domain);
}
