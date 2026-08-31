export type ServiceId = 'xero' | 'bigquery' | 'firestore' | 'sagehr';

export interface ServiceConfig {
  instanceId: string;
  serviceId: ServiceId;
  name: string;
  customerName?: string;
  description: string;
  enabled: boolean;
  toolCount: number;
  settings: Record<string, any>;
  requiredSecrets?: string[];
  updatedBy: string;
  updatedAt: string;
}

export interface SecretItem {
  key: string;
  category: 'Platform' | 'Xero' | 'BigQuery' | 'Firestore' | 'Sage HR' | 'Google Workspace Auth';
  description: string;
  required: boolean;
  isConfigured: boolean;
  status: 'SECRET_MANAGER' | 'ENVIRONMENT' | 'MISSING';
  lastUpdated?: string;
  isCustomInstance?: boolean;
  customerName?: string;
}

export interface SecretsStatusResponse {
  success: boolean;
  secrets: SecretItem[];
  totalCount: number;
  configuredCount: number;
  missingCount: number;
  requiredMissingCount: number;
}

export interface UserAccessItem {
  userEmail: string;
  fullName: string;
  isAdmin: boolean;
  isEnabled: boolean;
  allowedServices: ServiceId[];
  readOnlyOnly: boolean;
  customDeniedTools: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogItem {
  logId: string;
  timestamp: string;
  actorEmail: string;
  action: string;
  target: string;
  details: Record<string, any>;
}

export interface AuthProfile {
  email: string;
  fullName: string;
  isAdmin: boolean;
  isEnabled: boolean;
  allowedServices: string[];
  readOnlyOnly: boolean;
  sessionId: string;
  sessionExpiresAt: string;
}

export interface ServicePermissionProbe {
  id: string;
  name: string;
  role: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  description: string;
  error?: string;
  fixCommand?: string;
}

export interface DiagnosticTestResult {
  success: boolean;
  serviceId: ServiceId;
  instanceId?: string;
  status: 'HEALTHY' | 'WARNING' | 'ERROR';
  latencyMs: number;
  timestamp: string;
  permissions?: ServicePermissionProbe[];
  remediationCommands?: string[];
  details?: Record<string, any>;
  error?: string;
  code?: string;
}

export interface FirestoreDatabaseInfo {
  databaseId: string;
  locationId: string;
  type: string;
}

export interface GeminiEnterpriseConfig {
  serverBaseUrl: string;
  mcpEndpoint: string;
  authType: string;
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
}

export interface GeminiEnterpriseSetupResponse {
  success: boolean;
  message?: string;
  geminiConfig: GeminiEnterpriseConfig;
  variables?: {
    name: string;
    description: string;
    source: 'SECRET_MANAGER' | 'ENVIRONMENT';
    value: string;
  }[];
  secretManagerStatus: {
    hasAccess: boolean;
    permissionDenied: boolean;
    iamFixCommand: string;
    serviceAccountEmail: string;
  };
}

export interface GeminiBlueprint {
  serverBaseUrl: string;
  mcpEndpoint: string;
  authType: string;
  grantType: string;
  responseType: string;
  codeChallengeMethod: string;
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  isClientSecretSet: boolean;
  scopes: string;
}

export interface SetupStatusResponse {
  success: boolean;
  isCompleted: boolean;
  isDev?: boolean;
  devBootstrapToken?: string;
  installationStatus: 'UNINITIALIZED' | 'IN_PROGRESS' | 'CORE_COMPLETED' | 'FULLY_CONFIGURED';
  detectedProjectId: string;
  detectedRegion?: string;
  serviceAccountEmail: string;
  activeGoogleAccount?: string | null;
  callbackUri: string;
  currentDatabaseId: string;
  existingDatabases?: FirestoreDatabaseInfo[];
  googleOAuthConfigured: boolean;
  jwtSecretConfigured: boolean;
}

export interface PermissionCheckItem {
  role: string;
  name: string;
  category: 'Firestore' | 'Secret Manager' | 'Cloud Run' | 'Monitoring' | 'Service Usage' | 'BigQuery';
  status: 'PASS' | 'FAIL' | 'UNKNOWN';
  description: string;
  error?: string;
}

export interface GcpDiagnosticsResponse {
  success: boolean;
  diagnostics: {
    projectId: string;
    serviceAccountEmail: string;
    permissions: PermissionCheckItem[];
    allPassed: boolean;
    remediationCommands: string[];
  };
  existingDatabases?: FirestoreDatabaseInfo[];
  detectedRegion?: string;
}

export interface InitFirestoreResponse {
  success: boolean;
  connected: boolean;
  isCreatedInGcp: boolean;
  permissionDenied?: boolean;
  databaseNotFound?: boolean;
  message: string;
  databaseId: string;
  detectedRegion?: string;
  gcloudCreateCommand?: string;
  iamFixCommand?: string;
  latencyMs?: number;
}

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    credentials: 'include',
  });

  // Global session-expired interceptor: if the server returns 401 or 403,
  // the session has expired or been revoked — force redirect to login.
  // This covers every page navigation, config setting, toggle, save, and edit.
  if (res.status === 401 || res.status === 403) {
    let errorData: any = {};
    try {
      errorData = await res.json();
    } catch {
      // fallback
    }
    const errorCode = errorData.error || '';
    // Only auto-redirect for session/auth errors, not for permission-denied on specific resources
    if (
      errorCode === 'Unauthorized' ||
      errorCode === 'SessionExpired' ||
      errorCode === 'AccountDisabled' ||
      errorCode === 'Forbidden' ||
      res.status === 401
    ) {
      // Dispatch a custom event so App.tsx can clear user state before redirect
      window.dispatchEvent(new CustomEvent('session-expired', { detail: { message: errorData.message || 'Session expired' } }));
      // Redirect to login after a brief delay to allow state cleanup
      setTimeout(() => {
        if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/setup')) {
          window.location.href = '/admin/login';
        }
      }, 100);
      const err = new Error(errorData.message || 'Session expired. Redirecting to login...');
      (err as any).status = res.status;
      (err as any).data = errorData;
      (err as any).isSessionExpired = true;
      throw err;
    }
  }

  if (!res.ok) {
    let errorData: any = {};
    try {
      errorData = await res.json();
    } catch {
      // fallback
    }
    const err = new Error(errorData.message || errorData.error || `HTTP ${res.status} ${res.statusText}`);
    (err as any).status = res.status;
    (err as any).data = errorData;
    throw err;
  }

  return res.json();
}

export const api = {
  // Setup Wizard
  setup: {
    async getStatus(): Promise<SetupStatusResponse> {
      return fetchJson('/api/setup/status');
    },

    async verifyToken(token: string): Promise<{ success: boolean; message: string }> {
      return fetchJson('/api/setup/verify-token', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
    },

    async runGcpDiagnostics(projectId?: string): Promise<GcpDiagnosticsResponse> {
      return fetchJson('/api/setup/gcp-diagnostics', {
        method: 'POST',
        body: JSON.stringify({ projectId }),
      });
    },

    async initFirestore(databaseId?: string, projectId?: string): Promise<InitFirestoreResponse> {
      return fetchJson('/api/setup/init-firestore', {
        method: 'POST',
        body: JSON.stringify({ databaseId, projectId }),
      });
    },

    async configureGwsOAuth(data: {
      googleClientId: string;
      googleClientSecret: string;
      allowedDomains: string;
      jwtSecret?: string;
      adminEmail: string;
      adminName?: string;
    }): Promise<{ success: boolean; message: string; adminEmail: string }> {
      return fetchJson('/api/setup/configure-gws-oauth', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async completeSetup(data: {
      adminEmail: string;
      adminName?: string;
      setupMode?: 'QUICKSTART_CORE' | 'CUSTOM_MODULAR';
      configuredServices?: string[];
      pendingServices?: string[];
    }): Promise<{ success: boolean; message: string; sessionId: string; sessionExpiresAt: string }> {
      return fetchJson('/api/setup/complete', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async getGeminiConfig(): Promise<GeminiEnterpriseSetupResponse & { clientId: string; clientSecret: string; jwtSecret: string }> {
      return fetchJson('/api/setup/gemini-config');
    },

    async configureGeminiEnterprise(data: {
      clientId?: string;
      clientSecret?: string;
      jwtSecret?: string;
    }): Promise<GeminiEnterpriseSetupResponse> {
      return fetchJson('/api/setup/gemini-config', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    async enableApis(projectId: string): Promise<{ success: boolean; message: string; enabledApis: string[] }> {
      return fetchJson('/api/setup/enable-apis', {
        method: 'POST',
        body: JSON.stringify({ projectId }),
      });
    },

    async createFirestore(
      projectId: string,
      databaseId: string,
      region: string
    ): Promise<{ success: boolean; message: string; databaseId: string; latencyMs?: number; connected?: boolean }> {
      return fetchJson('/api/setup/create-firestore', {
        method: 'POST',
        body: JSON.stringify({ projectId, databaseId, region }),
      });
    },

    async deployCloudRun(
      data: {
        projectId: string;
        region: string;
        serviceName: string;
        databaseId: string;
        allowedDomains?: string;
      },
      onLogChunk: (chunk: string) => void
    ): Promise<boolean> {
      const response = await fetch('/api/setup/deploy-cloudrun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.body) {
        throw new Error('Readable stream not supported by browser');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let success = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        onLogChunk(text);
        if (text.includes('[DEPLOY_ERROR]') || text.includes('[DEPLOY_FATAL]')) {
          success = false;
        }
      }

      return success;
    },
  },

  // Auth
  async getAuthStatus(): Promise<{
    googleOAuthConfigured: boolean;
    allowedDomains: string[];
    devModeAllowed: boolean;
    diagnostics?: {
      projectId: string;
      revision?: string;
      region?: string;
      ramMb?: number;
      instancesCount: number;
      uptimeHours: number;
      isCloudRun?: boolean;
    };
  }> {
    return fetchJson('/api/auth/config-status');
  },

  async getMe(): Promise<AuthProfile> {
    return fetchJson('/api/auth/me');
  },

  async devLogin(email?: string, fullName?: string): Promise<{ success: boolean; user: any }> {
    return fetchJson('/api/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ email, fullName }),
    });
  },

  async logout(): Promise<{ success: boolean }> {
    return fetchJson('/api/auth/logout', { method: 'POST' });
  },

  async revokeAllSessions(): Promise<{ success: boolean; revokedSessionsCount: number }> {
    return fetchJson('/api/auth/revoke-all', { method: 'POST' });
  },

  // Services & Multi-Instance Connectors
  async getServices(): Promise<{ success: boolean; services: ServiceConfig[]; totalServices: number; activeServices: number }> {
    return fetchJson('/api/services');
  },

  async createServiceInstance(instanceData: {
    serviceId: ServiceId;
    customerName?: string;
    name: string;
    description: string;
    settings?: Record<string, any>;
    requiredSecrets?: string[];
  }): Promise<{ success: boolean; service: ServiceConfig; message: string }> {
    return fetchJson('/api/services', {
      method: 'POST',
      body: JSON.stringify(instanceData),
    });
  },

  async deleteServiceInstance(instanceId: string): Promise<{ success: boolean; message: string; instanceId: string }> {
    return fetchJson(`/api/services/${encodeURIComponent(instanceId)}`, {
      method: 'DELETE',
    });
  },

  async toggleService(instanceId: string, enabled: boolean): Promise<{ success: boolean; service: ServiceConfig }> {
    return fetchJson(`/api/services/${encodeURIComponent(instanceId)}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  },

  async updateServiceConfig(
    instanceId: string,
    settings: Record<string, any>,
    meta?: { name?: string; description?: string; customerName?: string; requiredSecrets?: string[] }
  ): Promise<{ success: boolean; service: ServiceConfig }> {
    return fetchJson(`/api/services/${encodeURIComponent(instanceId)}/config`, {
      method: 'PUT',
      body: JSON.stringify({ settings, ...meta }),
    });
  },

  async testService(instanceId: string): Promise<DiagnosticTestResult> {
    return fetchJson(`/api/services/${encodeURIComponent(instanceId)}/test`, {
      method: 'POST',
    });
  },

  // Secrets
  async getSecretsStatus(): Promise<SecretsStatusResponse> {
    return fetchJson('/api/secrets/status');
  },

  async getGeminiBlueprint(): Promise<{ success: boolean; blueprint: GeminiBlueprint }> {
    return fetchJson('/api/secrets/gemini-blueprint');
  },

  async updateSecret(secretKey: string, secretValue: string): Promise<{ success: boolean; message: string }> {
    return fetchJson('/api/secrets/update', {
      method: 'POST',
      body: JSON.stringify({ secretKey, secretValue }),
    });
  },

  // Users
  async getUsers(): Promise<{ success: boolean; users: UserAccessItem[]; totalUsers: number; activeUsers: number; adminUsers: number }> {
    return fetchJson('/api/users');
  },

  async createUser(user: {
    userEmail: string;
    fullName?: string;
    isAdmin?: boolean;
    isEnabled?: boolean;
    allowedServices?: ServiceId[];
    readOnlyOnly: boolean;
    customDeniedTools?: string[];
  }): Promise<{ success: boolean; user: UserAccessItem }> {
    return fetchJson('/api/users', {
      method: 'POST',
      body: JSON.stringify(user),
    });
  },

  async toggleUser(email: string, isEnabled: boolean): Promise<{ success: boolean; user: UserAccessItem }> {
    return fetchJson(`/api/users/${encodeURIComponent(email)}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ isEnabled }),
    });
  },

  async updateUserPermissions(
    email: string,
    permissions: {
      fullName?: string;
      isAdmin?: boolean;
      allowedServices?: ServiceId[];
      readOnlyOnly?: boolean;
      customDeniedTools?: string[];
    }
  ): Promise<{ success: boolean; user: UserAccessItem }> {
    return fetchJson(`/api/users/${encodeURIComponent(email)}/permissions`, {
      method: 'PUT',
      body: JSON.stringify(permissions),
    });
  },

  async deleteUser(email: string): Promise<{ success: boolean; message: string }> {
    return fetchJson(`/api/users/${encodeURIComponent(email)}`, {
      method: 'DELETE',
    });
  },

  async revokeUserSessions(email: string): Promise<{ success: boolean; revokedCount: number; message: string }> {
    return fetchJson(`/api/users/${encodeURIComponent(email)}/revoke-sessions`, {
      method: 'POST',
    });
  },

  // Audit
  async getAuditLogs(limit = 50): Promise<{ success: boolean; logs: AuditLogItem[]; count: number }> {
    return fetchJson(`/api/audit/logs?limit=${limit}`);
  },
};
