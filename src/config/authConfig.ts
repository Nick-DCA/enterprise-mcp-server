import { logger } from '../utils/logger.js';
import { McpAuthConfig } from '../auth/types.js';
import { OAUTH_DEFAULTS } from '../auth/constants.js';
import { getGcpProjectId, fetchSecret } from './secretManager.js';

let cachedAuthConfig: McpAuthConfig | null = null;

/**
 * Retrieves MCP server OAuth credentials from GCP Secret Manager (via ADC) with process.env fallback.
 */
export async function getMcpAuthConfig(): Promise<McpAuthConfig> {
  if (cachedAuthConfig) {
    return cachedAuthConfig;
  }

  const projectId = await getGcpProjectId();
  let clientId: string | null = null;
  let clientSecret: string | null = null;
  let jwtSecret: string | null = null;

  if (projectId) {
    logger.info({ projectId }, 'Attempting to fetch MCP Auth secrets from GCP Secret Manager');
    clientId = await fetchSecret('MCP_CLIENT_ID', projectId);
    clientSecret = await fetchSecret('MCP_CLIENT_SECRET', projectId);
    jwtSecret = await fetchSecret('MCP_JWT_SECRET', projectId);
  } else {
    logger.info('No GCP Project ID detected; falling back to process.env for MCP Auth');
  }

  // Fallback to process.env
  clientId = clientId || (process.env.MCP_CLIENT_ID ? process.env.MCP_CLIENT_ID.trim() : null);
  clientSecret = clientSecret || (process.env.MCP_CLIENT_SECRET ? process.env.MCP_CLIENT_SECRET.trim() : null);
  jwtSecret = jwtSecret || (process.env.MCP_JWT_SECRET ? process.env.MCP_JWT_SECRET.trim() : null);

  if (!clientId || !clientSecret || !jwtSecret) {
    const errorMsg =
      'MCP_CLIENT_ID, MCP_CLIENT_SECRET, or MCP_JWT_SECRET not found in GCP Secret Manager or process.env. ' +
      'Ensure gcloud auth application-default login is executed or environment variables are set.';
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  const allowedRedirectUrisEnv = process.env.MCP_ALLOWED_REDIRECT_URIS;
  const allowedRedirectUris = allowedRedirectUrisEnv
    ? allowedRedirectUrisEnv.split(',').map((u) => u.trim())
    : [OAUTH_DEFAULTS.DEFAULT_REDIRECT_URI];

  const codeTtlSec = process.env.MCP_AUTH_CODE_TTL_SEC
    ? parseInt(process.env.MCP_AUTH_CODE_TTL_SEC, 10)
    : OAUTH_DEFAULTS.AUTH_CODE_TTL_SEC;

  const tokenTtlSec = process.env.MCP_TOKEN_TTL_SEC
    ? parseInt(process.env.MCP_TOKEN_TTL_SEC, 10)
    : OAUTH_DEFAULTS.ACCESS_TOKEN_TTL_SEC;

  cachedAuthConfig = {
    clientId: clientId.trim(),
    clientSecret: clientSecret.trim(),
    jwtSecret: jwtSecret.trim(),
    allowedRedirectUris,
    codeTtlSec,
    tokenTtlSec,
    issuer: process.env.MCP_ISSUER || OAUTH_DEFAULTS.ISSUER,
  };

  logger.info('MCP Auth configuration loaded successfully');
  return cachedAuthConfig;
}

/**
 * Resets cached auth config (useful for testing or secret rotation).
 */
export function clearAuthConfigCache(): void {
  cachedAuthConfig = null;
}
