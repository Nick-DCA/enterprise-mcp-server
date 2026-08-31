import { logger } from '../../utils/logger.js';
import { getGcpProjectId, fetchSecret } from '../../config/secretManager.js';

export interface XeroSecrets {
  clientId: string;
  clientSecret: string;
  scopes?: string;
  tenantId?: string;
}

let cachedSecrets: XeroSecrets | null = null;

/**
 * Retrieves Xero credentials from GCP Secret Manager (via ADC) with process.env fallback.
 */
export async function getXeroSecrets(): Promise<XeroSecrets> {
  if (cachedSecrets) {
    return cachedSecrets;
  }

  const projectId = await getGcpProjectId();
  let clientId: string | null = null;
  let clientSecret: string | null = null;
  let scopes: string | null = null;
  let tenantId: string | null = null;

  if (projectId) {
    logger.info({ projectId }, 'Attempting to fetch Xero secrets from GCP Secret Manager');
    clientId = await fetchSecret('XERO_CLIENT_ID', projectId);
    clientSecret = await fetchSecret('XERO_CLIENT_SECRET', projectId);
    scopes = await fetchSecret('XERO_SCOPES', projectId);
    tenantId = await fetchSecret('XERO_TENANT_ID', projectId);
  } else {
    logger.info('No GCP Project ID detected; falling back to process.env for Xero secrets');
  }

  // Fallback to process.env if not found in GCP Secret Manager
  clientId = clientId || (process.env.XERO_CLIENT_ID ? process.env.XERO_CLIENT_ID.trim() : null);
  clientSecret = clientSecret || (process.env.XERO_CLIENT_SECRET ? process.env.XERO_CLIENT_SECRET.trim() : null);
  scopes = scopes || (process.env.XERO_SCOPES ? process.env.XERO_SCOPES.trim() : null);
  tenantId = tenantId || (process.env.XERO_TENANT_ID ? process.env.XERO_TENANT_ID.trim() : null);

  if (!clientId || !clientSecret) {
    const errorMsg =
      'XERO_CLIENT_ID or XERO_CLIENT_SECRET not found in GCP Secret Manager or process.env. ' +
      'Ensure gcloud auth application-default login is executed or environment variables are set.';
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  cachedSecrets = {
    clientId,
    clientSecret,
    scopes: scopes || undefined,
    tenantId: tenantId || undefined,
  };

  logger.info('Xero secrets loaded successfully');
  return cachedSecrets;
}

/**
 * Resets cached Xero secrets (useful for testing or dynamic rotation).
 */
export function clearSecretsCache(): void {
  cachedSecrets = null;
}
