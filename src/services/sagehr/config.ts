import { getGcpProjectId, fetchSecret } from '../../config/secretManager.js';
import { logger } from '../../utils/logger.js';

export interface SageHrConfig {
  apiKey?: string;
  subdomain?: string;
  allowWrites: boolean;
  maskedFields: string[];
  blockedFields: string[];
  safeAttributes: string[];
  allowedTeams: string[];
  blockedPositions: string[];
  maxResults: number;
}

let cachedSageHrConfig: SageHrConfig | null = null;

const DEFAULT_MASKED_FIELDS = [
  'id_number',
  'national_id',
  'passport_number',
  'ssn',
  'nin',
  'salary',
  'hourly_rate',
  'bank_account',
  'iban',
  'sort_code',
  'medical_notes',
  'personal_email',
  'home_address',
  'emergency_phone',
];

/**
 * Loads Sage HR configuration from GCP Secret Manager with process.env fallback.
 */
export async function getSageHrConfig(): Promise<SageHrConfig> {
  if (cachedSageHrConfig) {
    return cachedSageHrConfig;
  }

  const projectId = await getGcpProjectId();
  let apiKey: string | undefined = undefined;
  let subdomain: string | undefined = undefined;

  if (projectId) {
    const fetchedKey = await fetchSecret('SAGE_HR_API_KEY', projectId);
    const fetchedSubdomain = await fetchSecret('SAGE_HR_SUBDOMAIN', projectId);
    if (fetchedKey) apiKey = fetchedKey;
    if (fetchedSubdomain) subdomain = fetchedSubdomain;
  }

  if (!apiKey && process.env.SAGE_HR_API_KEY) {
    apiKey = process.env.SAGE_HR_API_KEY.trim();
  }

  if (!subdomain && process.env.SAGE_HR_SUBDOMAIN) {
    subdomain = process.env.SAGE_HR_SUBDOMAIN.trim();
  }

  const allowWritesEnv = process.env.SAGE_HR_ALLOW_WRITES || 'true';
  const allowWrites = allowWritesEnv.toLowerCase() === 'true' || allowWritesEnv === '1';

  const maskedFieldsEnv = process.env.SAGE_HR_MASKED_FIELDS;
  const maskedFields: string[] = maskedFieldsEnv
    ? maskedFieldsEnv.split(',').map((f: string) => f.trim().toLowerCase())
    : DEFAULT_MASKED_FIELDS;

  const blockedFieldsEnv = process.env.SAGE_HR_BLOCKED_FIELDS || '';
  const blockedFields: string[] = blockedFieldsEnv
    ? blockedFieldsEnv.split(',').map((f: string) => f.trim().toLowerCase()).filter(Boolean)
    : [];

  const safeAttributesEnv = process.env.SAGE_HR_SAFE_ATTRIBUTES || '*';
  const safeAttributes: string[] = safeAttributesEnv
    ? safeAttributesEnv.split(',').map((f: string) => f.trim().toLowerCase()).filter(Boolean)
    : ['*'];

  const allowedTeamsEnv = process.env.SAGE_HR_ALLOWED_TEAMS || '*';
  const allowedTeams: string[] = allowedTeamsEnv
    ? allowedTeamsEnv.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean)
    : ['*'];

  const blockedPositionsEnv = process.env.SAGE_HR_BLOCKED_POSITIONS || '';
  const blockedPositions: string[] = blockedPositionsEnv
    ? blockedPositionsEnv.split(',').map((p: string) => p.trim().toLowerCase()).filter(Boolean)
    : [];

  const maxResultsEnv = process.env.SAGE_HR_MAX_RESULTS || '50';
  const maxResults = Math.min(parseInt(maxResultsEnv, 10) || 50, 200);

  const config: SageHrConfig = {
    apiKey,
    subdomain,
    allowWrites,
    maskedFields,
    blockedFields,
    safeAttributes,
    allowedTeams,
    blockedPositions,
    maxResults,
  };

  cachedSageHrConfig = config;

  logger.info(
    {
      subdomain: subdomain || 'unset',
      allowWrites,
      maskedCount: maskedFields.length,
      blockedCount: blockedFields.length,
      safeAttributesCount: safeAttributes.length,
    },
    'Sage HR configuration loaded successfully'
  );

  return config;
}

export function clearSageHrConfigCache(): void {
  cachedSageHrConfig = null;
}
