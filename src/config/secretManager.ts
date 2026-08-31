import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { logger } from '../utils/logger.js';

const secretClient = new SecretManagerServiceClient();

/**
 * Resolves active Google Cloud Project ID from environment or ADC metadata.
 */
export async function getGcpProjectId(): Promise<string | undefined> {
  if (process.env.GCP_PROJECT_ID) {
    return process.env.GCP_PROJECT_ID;
  }
  if (process.env.GOOGLE_CLOUD_PROJECT) {
    return process.env.GOOGLE_CLOUD_PROJECT;
  }
  try {
    const projectId = await secretClient.getProjectId();
    return projectId;
  } catch {
    return undefined;
  }
}

/**
 * Fetches a secret version payload from GCP Secret Manager.
 * Returns trimmed string if found, null otherwise.
 */
export async function fetchSecret(secretName: string, projectId: string): Promise<string | null> {
  try {
    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    logger.debug({ secretName, projectId }, 'Fetching secret from GCP Secret Manager');
    const [version] = await secretClient.accessSecretVersion({ name });
    const payload = version.payload?.data?.toString();
    return payload ? payload.trim() : null;
  } catch (error: any) {
    logger.warn({ secretName, error: error.message }, 'Could not fetch secret from GCP Secret Manager');
    return null;
  }
}

/**
 * High-level helper: Fetches secret from GSM if GCP project is available, with process.env fallback.
 */
export async function getSecretValue(secretName: string): Promise<string | null> {
  const projectId = await getGcpProjectId();
  if (projectId) {
    const val = await fetchSecret(secretName, projectId);
    if (val) return val;
  }
  return process.env[secretName] ? process.env[secretName]!.trim() : null;
}

/**
 * Checks if a secret is configured in GCP Secret Manager or in process.env without exposing its value.
 */
export async function checkSecretStatus(secretName: string): Promise<{
  configured: boolean;
  source: 'SECRET_MANAGER' | 'ENVIRONMENT' | 'MISSING';
  lastUpdated?: string;
}> {
  const projectId = await getGcpProjectId();
  if (projectId) {
    try {
      const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
      const [version] = await secretClient.getSecretVersion({ name });
      if (version.state === 'ENABLED' || version.state === 1) {
        const createTime = version.createTime?.seconds
          ? new Date(Number(version.createTime.seconds) * 1000).toISOString()
          : undefined;
        return {
          configured: true,
          source: 'SECRET_MANAGER',
          lastUpdated: createTime,
        };
      }
    } catch {
      // Secret not found or no access in GSM
    }
  }

  if (process.env[secretName] && process.env[secretName]!.trim() !== '') {
    return {
      configured: true,
      source: 'ENVIRONMENT',
    };
  }

  return {
    configured: false,
    source: 'MISSING',
  };
}

/**
 * Writes a new secret version directly to GCP Secret Manager (and updates process.env in-memory).
 */
export async function writeSecretValue(
  secretName: string,
  secretValue: string
): Promise<{ success: boolean; versionPath?: string; source: 'SECRET_MANAGER' | 'ENVIRONMENT' }> {
  const cleanVal = secretValue.trim();
  const projectId = await getGcpProjectId();

  // Always update in-memory process.env for instant process runtime visibility
  process.env[secretName] = cleanVal;

  // Strict Safety Guardrail: NEVER write to live Google Secret Manager during tests
  if (process.env.NODE_ENV === 'test' || process.env.MOCK_SECRET_MANAGER === 'true') {
    logger.debug({ secretName }, 'Test mode active: secret persisted in memory only, skipping live GSM write');
    return {
      success: true,
      versionPath: `projects/mock-test-project/secrets/${secretName}/versions/1`,
      source: 'ENVIRONMENT',
    };
  }

  if (projectId) {
    try {
      const parent = `projects/${projectId}/secrets/${secretName}`;
      
      // Try to add secret version directly
      try {
        const [version] = await secretClient.addSecretVersion({
          parent,
          payload: {
            data: Buffer.from(cleanVal, 'utf8'),
          },
        });
        logger.info({ secretName, version: version.name }, 'Successfully wrote new secret version to Secret Manager');
        return {
          success: true,
          versionPath: version.name || undefined,
          source: 'SECRET_MANAGER',
        };
      } catch (addError: any) {
        // If secret does not exist, create the secret first
        if (addError.code === 5 || addError.message?.includes('NOT_FOUND')) {
          logger.info({ secretName }, 'Secret does not exist in Secret Manager, creating secret container first');
          const [secret] = await secretClient.createSecret({
            parent: `projects/${projectId}`,
            secretId: secretName,
            secret: {
              replication: {
                automatic: {},
              },
            },
          });
          const [version] = await secretClient.addSecretVersion({
            parent: secret.name,
            payload: {
              data: Buffer.from(cleanVal, 'utf8'),
            },
          });
          return {
            success: true,
            versionPath: version.name || undefined,
            source: 'SECRET_MANAGER',
          };
        }
        throw addError;
      }
    } catch (gsmError: any) {
      logger.warn({ secretName, error: gsmError.message }, 'Failed to persist secret to GCP Secret Manager, updated environment in-memory');
      return {
        success: true,
        source: 'ENVIRONMENT',
      };
    }
  }

  return {
    success: true,
    source: 'ENVIRONMENT',
  };
}

export async function deleteSecret(secretName: string): Promise<boolean> {
  const projectId = await getGcpProjectId();
  if (projectId) {
    try {
      const name = `projects/${projectId}/secrets/${secretName}`;
      await secretClient.deleteSecret({ name });
      logger.info({ secretName }, 'Successfully deleted secret from Secret Manager');
      return true;
    } catch (err: any) {
      logger.warn({ secretName, error: err.message }, 'Could not delete secret from Secret Manager');
      return false;
    }
  }
  return false;
}

