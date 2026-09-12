import { Firestore, Timestamp } from '@google-cloud/firestore';
import { setCustomDatabaseId } from '../services/firestore/config.js';
import { getGcpProjectId } from './secretManager.js';
import { cleanObject } from '../utils/clean.js';
import { logger } from '../utils/logger.js';

export type ServiceId = 'xero' | 'bigquery' | 'firestore' | 'sagehr' | 'slack';

export interface InstallationMetadataDocument {
  version: string;
  schemaVersion: number;
  initializationStatus: 'UNINITIALIZED' | 'IN_PROGRESS' | 'CORE_COMPLETED' | 'FULLY_CONFIGURED';
  gcpProjectId: string;
  region: string;
  firestoreDatabaseId: string;
  installedAt: string;
  initializedBy: string;
  lastVerifiedAt: string;
  setupMode?: 'QUICKSTART_CORE' | 'CUSTOM_MODULAR';
  configuredServices?: string[];
  pendingServices?: string[];
}

export interface ServiceConfigDocument {
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
  updatedAt: string; // ISO string
}

export interface UserAccessDocument {
  userEmail: string;
  fullName: string;
  isAdmin: boolean;
  isEnabled: boolean;
  allowedServices: ServiceId[];
  readOnlyOnly: boolean;
  customDeniedTools: string[];
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface SessionDocument {
  sessionId: string;
  userEmail: string;
  fullName: string;
  role: 'ADMIN' | 'USER';
  ipAddress: string;
  userAgent: string;
  createdAt: string; // ISO string
  lastActiveAt: string; // ISO string
  expiresAt: string; // ISO string
}

export interface AuditLogDocument {
  logId: string;
  timestamp: string; // ISO string
  actorEmail: string;
  action:
    | 'CONFIG_CHANGE'
    | 'SECRET_UPDATE'
    | 'USER_TOGGLE'
    | 'SERVICE_TOGGLE'
    | 'USER_CREATE'
    | 'USER_DELETE'
    | 'PERMISSIONS_UPDATE'
    | 'SESSION_REVOKE'
    | 'INITIALIZATION_STEP'
    | 'ADMIN_LOGIN'
    | 'SLACK_CONNECT'
    | 'SLACK_DISCONNECT'
    | 'SLACK_SEARCH'
    | (string & {});
  target: string;
  details: Record<string, any>;
}

// In-Memory fallback store for offline/local development or before Firestore is initialized
interface InMemoryStore {
  installation: InstallationMetadataDocument | null;
  services: Map<string, ServiceConfigDocument>;
  users: Map<string, UserAccessDocument>;
  sessions: Map<string, SessionDocument>;
  auditLogs: AuditLogDocument[];
}

const DEFAULT_SERVICE_CONFIGS: Record<ServiceId, { name: string; description: string; toolCount: number; settings: Record<string, any> }> = {
  xero: {
    name: 'Xero Accounting',
    description: 'Chart of accounts, invoices, manual journals, credit notes, payments, and financial reports.',
    toolCount: 36,
    settings: {
      scopes: 'accounting.transactions accounting.contacts accounting.settings accounting.reports.read',
      rateLimitMaxPerMin: 60,
      autoSyncTenants: true,
    },
  },
  bigquery: {
    name: 'Google BigQuery',
    description: 'Dataset catalog discovery, table schema inspection, dry-run cost estimation, and read-only GoogleSQL.',
    toolCount: 5,
    settings: {
      location: 'EU',
      defaultDataset: '',
      allowedTables: '*',
      maxBytesBilled: 1073741824, // 1 GB
      maxRowsReturned: 100,
      sqlGuardrailMode: 'STRICT_READ_ONLY',
      blockMultiStatement: true,
      enableDryRunPreFlight: true,
      requirePartitionFilter: false,
      selectAllPolicy: 'WARN',
      queryTimeoutSeconds: 30,
      useQueryCache: true,
      allowedSqlClauses: 'SELECT,WITH,FROM,JOIN,LEFT JOIN,RIGHT JOIN,FULL JOIN,INNER JOIN,UNION,UNION ALL,WHERE,GROUP BY,HAVING,ORDER BY,LIMIT,OFFSET,DISTINCT,EXPLAIN',
      blockedSqlClauses: 'CROSS JOIN,DELETE,UPDATE,INSERT,MERGE,TRUNCATE,TRUNCATE TABLE,DROP,DROP TABLE,DROP VIEW,DROP SCHEMA,CREATE OR REPLACE TABLE,CREATE OR REPLACE VIEW,REPLACE,ALTER,ALTER TABLE,ALTER SCHEMA,CREATE,CREATE TABLE,CREATE VIEW,CREATE MATERIALIZED VIEW,CREATE FUNCTION,CREATE PROCEDURE,CALL,EXPORT,EXPORT DATA,LOAD,LOAD DATA',
    },
  },
  firestore: {
    name: 'Cloud Firestore',
    description: 'Hierarchical document querying, schema sampling, subcollection navigation, and guarded updates.',
    toolCount: 6,
    settings: {
      databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)',
      allowedCollections: '', // Default empty: Zero-trust default-deny (query nothing until explicitly allowed)
      blockedCollections: 'system_metadata,services_config,users_access,user_sessions,sessions,audit_logs',
      firestoreGuardrailMode: 'STRICT_READ_ONLY',
      allowedOperations: 'get,list,query,where,orderBy,limit,offset,count,collectionGroup,get document,get documents,list documents,query collection,query collection group,startAt,startAfter,endAt,endBefore,count aggregation',
      blockedOperations: 'create,set,update,delete,batchWrite,transaction,increment,arrayUnion,arrayRemove,deleteField,create document,set document,update document,delete document,batch write',
      allowWrites: false,
      excludedFields: 'password,token,apikey,ssn',
      maxDocuments: 50,
      requestTimeoutSeconds: 15,
    },
  },
  sagehr: {
    name: 'Sage HR',
    description: 'Employee directory, leave balance tracking, time-off requests, and expense submissions with privacy shielding.',
    toolCount: 12,
    settings: {
      allowWrites: true,
      maskedFields: 'id_number,national_id,passport_number,ssn,nin,salary,hourly_rate,bank_account,iban,medical_notes,emergency_phone',
      blockedFields: '',
      safeAttributes: '*',
      allowedTeams: '*',
      blockedPositions: '',
      maxResults: 50,
    },
  },
  slack: {
    name: 'Slack Federated Search',
    description: 'User-delegated message search across Slack channels and direct messages with Token Rotation and zero shared bot privilege.',
    toolCount: 5,
    settings: {
      scopes: 'search:read.public,search:read.private,search:read.im,search:read.mpim,search:read.files,search:read.users,users:read,channels:read,groups:read,im:read,mpim:read,channels:history,groups:history,im:history,mpim:history,files:read',
      maxResults: 10,
      defaultResults: 5,
      rateLimitPerMinute: 10,
      includeDMs: true,
      maxSnippetLength: 500,
      allowAllUsers: true,
    },
  },
};

export class RuntimeConfigManager {
  private firestoreClient: Firestore | null = null;
  private isFirestoreAvailable: boolean | null = null;
  private activeDatabaseId: string = process.env.FIRESTORE_DATABASE_ID || '(default)';

  // In-memory cache with 30-second TTL
  private cacheTTLMs = 30_000;
  private servicesCache: { data: Map<ServiceId, ServiceConfigDocument>; timestamp: number } | null = null;
  private usersCache: { data: Map<string, UserAccessDocument>; timestamp: number } | null = null;
  private sessionCache = new Map<string, { session: SessionDocument; timestamp: number }>();
  private installationCache: { data: InstallationMetadataDocument | null; timestamp: number } | null = null;

  // In-memory fallback
  private inMemoryStore: InMemoryStore;

  constructor() {
    this.inMemoryStore = {
      installation: null,
      services: new Map(),
      users: new Map(),
      sessions: new Map(),
      auditLogs: [],
    };
    this.initDefaultInMemoryData();
  }

  private initDefaultInMemoryData() {
    const now = new Date().toISOString();
    for (const [id, def] of Object.entries(DEFAULT_SERVICE_CONFIGS) as [ServiceId, typeof DEFAULT_SERVICE_CONFIGS[ServiceId]][]) {
      this.inMemoryStore.services.set(id, {
        instanceId: id,
        serviceId: id,
        name: def.name,
        customerName: 'Default Instance',
        description: def.description,
        enabled: false, // Default to disabled until explicitly configured
        toolCount: def.toolCount,
        settings: { ...def.settings },
        requiredSecrets: id === 'xero' ? ['XERO_CLIENT_ID', 'XERO_CLIENT_SECRET'] : id === 'slack' ? ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET', 'SLACK_REDIRECT_URI'] : [],
        updatedBy: 'system',
        updatedAt: now,
      });
    }

    // Default bootstrap admin (used as fallback in dev mode)
    this.inMemoryStore.users.set('admin@company.com', {
      userEmail: 'admin@company.com',
      fullName: 'System Administrator',
      isAdmin: true,
      isEnabled: true,
      allowedServices: ['xero', 'bigquery', 'firestore', 'sagehr', 'slack'],
      readOnlyOnly: false,
      customDeniedTools: [],
      createdAt: now,
      updatedAt: now,
    });

    // Seed initial startup audit log
    this.inMemoryStore.auditLogs.unshift({
      logId: `log_init_${Date.now()}`,
      timestamp: now,
      actorEmail: 'system',
      action: 'INITIALIZATION_STEP',
      target: 'system/gateway',
      details: {
        message: 'MCP Gateway initialized. Multi-SaaS services (Xero, BigQuery, Firestore, Sage HR, Slack) ready.',
        environment: process.env.NODE_ENV || 'development',
      },
    });
  }

  public setCustomDatabaseId(databaseId: string) {
    this.activeDatabaseId = databaseId.trim();
    setCustomDatabaseId(this.activeDatabaseId);
    this.firestoreClient = null;
    this.isFirestoreAvailable = null;
    this.clearCache();
  }

  public getInMemoryServiceConfig(instanceOrServiceId: string): ServiceConfigDocument | undefined {
    return (
      this.inMemoryStore.services.get(instanceOrServiceId) ||
      Array.from(this.inMemoryStore.services.values()).find((s) => s.serviceId === instanceOrServiceId)
    );
  }

  public async getFirestore(customDatabaseId?: string): Promise<Firestore | null> {
    const targetDb = customDatabaseId || this.activeDatabaseId;

    if (this.firestoreClient && this.activeDatabaseId === targetDb) {
      return this.firestoreClient;
    }

    // In unit/integration test environments, avoid outbound GCP Firestore network calls
    // unless an emulator is explicitly configured. Use the built-in in-memory store instead.
    if (process.env.MOCK_FIRESTORE === 'true' || (process.env.NODE_ENV === 'test' && !process.env.FIRESTORE_EMULATOR_HOST)) {
      return null;
    }

    try {
      const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || (await getGcpProjectId());
      if (!projectId) {
        return null;
      }
      const client = new Firestore({
        projectId,
        databaseId: targetDb,
        ignoreUndefinedProperties: true,
      });
      if (!customDatabaseId) {
        this.firestoreClient = client;
        this.isFirestoreAvailable = true;
      }
      return client;
    } catch (error: any) {
      logger.warn({ error: error?.message || error, databaseId: targetDb }, 'Firestore unavailable for RuntimeConfig, using in-memory store');
      return null;
    }
  }

  private handleFirestoreError(error: any) {
    const isNotFound =
      error?.code === 5 ||
      error?.message?.includes('NOT_FOUND') ||
      error?.message?.includes('does not exist') ||
      error?.message?.includes('5 NOT_FOUND');

    if (isNotFound) {
      logger.debug({ error: error?.message || error, databaseId: this.activeDatabaseId }, 'Firestore database uninitialized or not found in GCP, using local in-memory fallback');
    } else {
      logger.warn({ error: error?.message || error, databaseId: this.activeDatabaseId }, 'Firestore operation encountered an error, using local fallback');
    }
    this.firestoreClient = null;
    this.isFirestoreAvailable = false;
  }

  public setFirestoreClient(client: Firestore | null) {
    this.firestoreClient = client;
    this.isFirestoreAvailable = client !== null;
    this.clearCache();
  }

  public clearCache() {
    this.servicesCache = null;
    this.usersCache = null;
    this.installationCache = null;
    this.sessionCache.clear();
  }

  // ==========================================
  // INSTALLATION & SETUP METADATA (system_metadata/)
  // ==========================================

  public async getInstallationMetadata(): Promise<InstallationMetadataDocument | null> {
    const now = Date.now();
    if (this.installationCache && now - this.installationCache.timestamp < this.cacheTTLMs) {
      return this.installationCache.data;
    }

    const firestore = await this.getFirestore();
    if (firestore) {
      try {
        const doc = await firestore.collection('system_metadata').doc('installation').get();
        if (doc.exists) {
          const data = doc.data() as any;
          const meta: InstallationMetadataDocument = {
            version: data.version || '2.0.0',
            schemaVersion: data.schemaVersion || 1,
            initializationStatus: data.initializationStatus || 'CORE_COMPLETED',
            gcpProjectId: data.gcpProjectId || 'unknown',
            region: data.region || 'europe-west1',
            firestoreDatabaseId: data.firestoreDatabaseId || this.activeDatabaseId,
            installedAt: data.installedAt?.toDate ? data.installedAt.toDate().toISOString() : (data.installedAt || new Date().toISOString()),
            initializedBy: data.initializedBy || 'system',
            lastVerifiedAt: data.lastVerifiedAt?.toDate ? data.lastVerifiedAt.toDate().toISOString() : (data.lastVerifiedAt || new Date().toISOString()),
            setupMode: data.setupMode,
            configuredServices: data.configuredServices || ['platform'],
            pendingServices: data.pendingServices || [],
          };
          this.installationCache = { data: meta, timestamp: now };
          return meta;
        }
      } catch (err: any) {
        if (err.code === 5 || err.message?.includes('NOT_FOUND') || err.message?.includes('does not exist')) {
          logger.debug('No system_metadata/installation document found in Firestore (fresh install), using initial config');
        } else {
          this.handleFirestoreError(err);
          logger.warn({ error: err?.message || err }, 'Could not load system_metadata/installation from Firestore');
        }
      }
    }

    this.installationCache = { data: this.inMemoryStore.installation, timestamp: now };
    return this.inMemoryStore.installation;
  }

  public async setInstallationMetadata(data: Partial<InstallationMetadataDocument>): Promise<InstallationMetadataDocument> {
    const existing = (await this.getInstallationMetadata()) || {
      version: '2.0.0',
      schemaVersion: 1,
      initializationStatus: 'IN_PROGRESS',
      gcpProjectId: process.env.GCP_PROJECT_ID || 'unknown',
      region: 'europe-west1',
      firestoreDatabaseId: this.activeDatabaseId,
      installedAt: new Date().toISOString(),
      initializedBy: 'admin',
      lastVerifiedAt: new Date().toISOString(),
      configuredServices: [],
      pendingServices: [],
    };

    const updated: InstallationMetadataDocument = {
      ...existing,
      ...data,
      lastVerifiedAt: new Date().toISOString(),
    };

    this.inMemoryStore.installation = updated;
    this.installationCache = { data: updated, timestamp: Date.now() };

    const firestore = await this.getFirestore();
    if (firestore) {
      try {
        const installedDate = updated.installedAt ? new Date(updated.installedAt) : new Date();
        const validInstalledDate = isNaN(installedDate.getTime()) ? new Date() : installedDate;
        const payload = cleanObject({
          ...updated,
          installedAt: Timestamp.fromDate(validInstalledDate),
          lastVerifiedAt: Timestamp.now(),
        });
        await firestore.collection('system_metadata').doc('installation').set(payload, { merge: true });
        logger.info({ status: updated.initializationStatus }, 'Updated system_metadata/installation in Firestore');
      } catch (err: any) {
        if (updated.initializationStatus === 'FULLY_CONFIGURED' || updated.initializationStatus === 'CORE_COMPLETED') {
          logger.error({ error: err }, 'Failed to persist installation metadata to Firestore');
        } else {
          logger.warn({ error: err?.message || err, databaseId: this.activeDatabaseId }, 'Could not persist intermediate setup metadata to Firestore (stored in local memory)');
        }
      }
    }

    return updated;
  }

  public async isSetupCompleted(): Promise<boolean> {
    // If explicitly bypassed in dev or test env
    if (process.env.BYPASS_SETUP === 'true') {
      return true;
    }

    // If Google Workspace OAuth or MCP auth credentials are already configured in environment/secrets, treat setup as completed
    if (process.env.GOOGLE_CLIENT_ID || process.env.MCP_CLIENT_ID) {
      const meta = await this.getInstallationMetadata();
      if (!meta || meta.initializationStatus === 'UNINITIALIZED') {
        // Auto-seed installation metadata so subsequent calls resolve immediately
        await this.setInstallationMetadata({
          initializationStatus: 'CORE_COMPLETED',
          gcpProjectId: process.env.GCP_PROJECT_ID || 'unknown',
          firestoreDatabaseId: this.activeDatabaseId,
          installedAt: new Date().toISOString(),
        }).catch(() => {});
        return true;
      }
    }

    const meta = await this.getInstallationMetadata();
    if (!meta) {
      return false;
    }
    return meta.initializationStatus === 'CORE_COMPLETED' || meta.initializationStatus === 'FULLY_CONFIGURED';
  }

  public async testFirestoreConnectivity(customDatabaseId?: string): Promise<{ success: boolean; latencyMs: number; databaseId: string; error?: string }> {
    const targetDb = customDatabaseId || this.activeDatabaseId;
    const start = Date.now();
    try {
      const firestore = await this.getFirestore(targetDb);
      if (!firestore) {
        throw new Error(`Could not connect to Firestore database '${targetDb}'`);
      }
      // Perform test write & read on a setup check document
      const testDocRef = firestore.collection('system_metadata').doc('connectivity_probe');
      await testDocRef.set({
        lastCheck: Timestamp.now(),
        testedBy: 'setup-wizard',
      });
      const readSnap = await testDocRef.get();
      if (!readSnap.exists) {
        throw new Error('Test document write succeeded but read failed.');
      }
      const latencyMs = Date.now() - start;
      return { success: true, latencyMs, databaseId: targetDb };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      // Properly terminate failed Firestore instance and reset client cache to clear backed-off gRPC subchannels
      if (this.firestoreClient) {
        try {
          await this.firestoreClient.terminate();
        } catch (_t) {
          // Ignore termination errors on already closed clients
        }
        this.firestoreClient = null;
        this.isFirestoreAvailable = false;
      }
      logger.warn({ error: err.message, databaseId: targetDb }, 'Firestore connectivity test failed');
      return { success: false, latencyMs, databaseId: targetDb, error: err.message || 'Firestore connection failure' };
    }
  }

  // ==========================================
  // SERVICE CONFIGURATIONS & MULTI-INSTANCES (services_config/)
  // ==========================================

  public async getAllServiceConfigs(): Promise<ServiceConfigDocument[]> {
    const now = Date.now();
    if (this.servicesCache && now - this.servicesCache.timestamp < this.cacheTTLMs) {
      return Array.from(this.servicesCache.data.values());
    }

    const firestore = await this.getFirestore();
    const result = new Map<string, ServiceConfigDocument>();

    // Start with in-memory instances (which includes defaults + runtime created)
    for (const [key, val] of this.inMemoryStore.services.entries()) {
      result.set(key, { ...val });
    }

    if (firestore) {
      try {
        const snapshot = await firestore.collection('services_config').get();
        for (const doc of snapshot.docs) {
          const docId = doc.id;
          const data = doc.data();
          const serviceId = (data.serviceId || docId) as ServiceId;
          const def = DEFAULT_SERVICE_CONFIGS[serviceId] || { name: serviceId, description: '', toolCount: 0, settings: {} };

          const existing = result.get(docId) || {
            instanceId: docId,
            serviceId,
            name: data.name || def.name,
            customerName: data.customerName || 'Default Instance',
            description: data.description || def.description,
            enabled: false,
            toolCount: def.toolCount,
            settings: { ...def.settings },
            requiredSecrets: data.requiredSecrets || [],
            updatedBy: 'system',
            updatedAt: new Date().toISOString(),
          };

          let mergedSettings = { ...existing.settings, ...(data.settings || {}) };
          if (serviceId === 'firestore' && mergedSettings.allowedOperations) {
            const opStr = Array.isArray(mergedSettings.allowedOperations)
              ? mergedSettings.allowedOperations.join(',')
              : String(mergedSettings.allowedOperations);
            if (opStr.includes('DISCOVERY') || opStr.includes('DOCUMENT_READ') || opStr.includes('SCHEMA_SAMPLE') || opStr.includes('DOCUMENT_WRITE_MERGE')) {
              mergedSettings.allowedOperations = def.settings.allowedOperations;
              mergedSettings.blockedOperations = def.settings.blockedOperations;
            }
          }

          result.set(docId, {
            ...existing,
            name: data.name || existing.name,
            customerName: data.customerName || existing.customerName,
            description: data.description || existing.description,
            enabled: typeof data.enabled === 'boolean' ? data.enabled : false,
            settings: mergedSettings,
            requiredSecrets: data.requiredSecrets || existing.requiredSecrets,
            updatedBy: data.updatedBy || existing.updatedBy,
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : (data.updatedAt || existing.updatedAt),
          });
        }
      } catch (err) {
        this.handleFirestoreError(err);
        logger.warn({ error: err }, 'Failed to read services_config from Firestore, falling back to local memory store');
      }
    }

    this.servicesCache = { data: result as any, timestamp: now };
    return Array.from(result.values());
  }

  public async getServiceConfig(instanceOrServiceId: string): Promise<ServiceConfigDocument> {
    const all = await this.getAllServiceConfigs();
    
    // 1. Check exact instanceId match first
    const exact = all.find((s) => s.instanceId === instanceOrServiceId);
    if (exact) return exact;

    // 2. If queried by base serviceId (e.g. 'bigquery'), prioritize an enabled instance
    const matching = all.filter((s) => s.serviceId === instanceOrServiceId);
    const enabledOne = matching.find((s) => s.enabled);
    if (enabledOne) return enabledOne;
    if (matching.length > 0) return matching[0];

    const baseServiceId = (instanceOrServiceId.split('_')[0] as ServiceId) || 'xero';
    const def = DEFAULT_SERVICE_CONFIGS[baseServiceId] || {
      name: instanceOrServiceId,
      description: '',
      toolCount: 0,
      settings: {},
    };

    return {
      instanceId: instanceOrServiceId,
      serviceId: baseServiceId,
      name: def.name,
      customerName: 'Default Instance',
      description: def.description,
      enabled: false,
      toolCount: def.toolCount,
      settings: { ...def.settings },
      requiredSecrets: [],
      updatedBy: 'system',
      updatedAt: new Date().toISOString(),
    };
  }

  public async isServiceEnabled(instanceOrServiceId: string): Promise<boolean> {
    const all = await this.getAllServiceConfigs();
    
    // 1. If checking by exact instanceId
    const exact = all.find((s) => s.instanceId === instanceOrServiceId);
    if (exact) {
      return exact.enabled;
    }

    // 2. If checking by base serviceId (e.g. 'bigquery', 'xero', 'firestore', 'sagehr'),
    // return true if ANY instance belonging to this service is currently enabled
    const matching = all.filter((s) => s.serviceId === instanceOrServiceId);
    if (matching.length > 0) {
      return matching.some((s) => s.enabled);
    }

    const config = await this.getServiceConfig(instanceOrServiceId);
    return config.enabled;
  }

  public async createServiceInstance(
    data: {
      serviceId: ServiceId;
      instanceId?: string;
      customerName?: string;
      name: string;
      description: string;
      settings?: Record<string, any>;
      requiredSecrets?: string[];
    },
    actorEmail: string
  ): Promise<ServiceConfigDocument> {
    const baseDef = DEFAULT_SERVICE_CONFIGS[data.serviceId] || { toolCount: 0, settings: {} };
    const cleanCustomer = (data.customerName || 'Custom').toLowerCase().replace(/[^a-z0-9]/g, '_');
    const instanceId = data.instanceId || `${data.serviceId}_${cleanCustomer}_${Date.now().toString(36)}`;
    const nowIso = new Date().toISOString();

    const newDoc: ServiceConfigDocument = {
      instanceId,
      serviceId: data.serviceId,
      name: data.name,
      customerName: data.customerName || 'Custom Customer',
      description: data.description,
      enabled: false, // Created instances start as disabled until explicitly activated
      toolCount: baseDef.toolCount,
      settings: { ...baseDef.settings, ...(data.settings || {}) },
      requiredSecrets: data.requiredSecrets || [],
      updatedBy: actorEmail,
      updatedAt: nowIso,
    };

    // Store in memory
    this.inMemoryStore.services.set(instanceId, newDoc);
    if (this.servicesCache) {
      this.servicesCache.data.set(instanceId as any, newDoc);
    }

    // Persist to Firestore
    const firestore = await this.getFirestore();
    if (firestore) {
      try {
        await firestore.collection('services_config').doc(instanceId).set({
          ...newDoc,
          updatedAt: Timestamp.now(),
        });
      } catch (err) {
        logger.error({ error: err, instanceId }, 'Failed to persist new service instance to Firestore');
      }
    }

    if (data.serviceId === 'firestore') {
      try {
        const { clearFirestoreConfigCache } = await import('../services/firestore/config.js');
        const { firestoreService } = await import('../services/firestore/client.js');
        clearFirestoreConfigCache();
        firestoreService.resetClient();
      } catch (_e) {}
    }

    await this.logAudit('CONFIG_CHANGE', actorEmail, `services_config/${instanceId}`, {
      action: 'CREATE_INSTANCE',
      instanceId,
      serviceId: data.serviceId,
      customerName: data.customerName,
    });

    return newDoc;
  }

  public async deleteServiceInstance(instanceId: string, actorEmail: string): Promise<{ success: boolean; instanceId: string }> {
    const existing = this.inMemoryStore.services.get(instanceId);
    this.inMemoryStore.services.delete(instanceId);
    if (this.servicesCache) {
      this.servicesCache.data.delete(instanceId as any);
    }

    const firestore = await this.getFirestore();
    if (firestore) {
      try {
        await firestore.collection('services_config').doc(instanceId).delete();
      } catch (err) {
        logger.error({ error: err, instanceId }, 'Failed to delete service instance from Firestore');
      }
    }

    if (existing?.serviceId === 'firestore' || instanceId.startsWith('firestore')) {
      try {
        const { clearFirestoreConfigCache } = await import('../services/firestore/config.js');
        const { firestoreService } = await import('../services/firestore/client.js');
        clearFirestoreConfigCache();
        firestoreService.resetClient();
      } catch (_e) {}
    }

    await this.logAudit('CONFIG_CHANGE', actorEmail, `services_config/${instanceId}`, {
      action: 'DELETE_INSTANCE',
      instanceId,
    });

    return { success: true, instanceId };
  }

  public async updateServiceToggle(
    instanceOrServiceId: string,
    enabled: boolean,
    actorEmail: string
  ): Promise<ServiceConfigDocument> {
    const existing = await this.getServiceConfig(instanceOrServiceId);
    const nowIso = new Date().toISOString();
    const updated: ServiceConfigDocument = {
      ...existing,
      enabled,
      updatedBy: actorEmail,
      updatedAt: nowIso,
    };

    // Update in-memory
    this.inMemoryStore.services.set(existing.instanceId, updated);
    if (this.servicesCache) {
      this.servicesCache.data.set(existing.instanceId as any, updated);
    }

    // Persist to Firestore if connected
    const firestore = await this.getFirestore();
    if (firestore) {
      try {
        await firestore.collection('services_config').doc(existing.instanceId).set(
          {
            instanceId: existing.instanceId,
            serviceId: existing.serviceId,
            enabled,
            settings: updated.settings,
            updatedBy: actorEmail,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
      } catch (err) {
        logger.error({ error: err, instanceId: existing.instanceId }, 'Failed to persist service toggle to Firestore');
      }
    }

    if (existing.serviceId === 'firestore' || existing.instanceId.startsWith('firestore')) {
      try {
        const { clearFirestoreConfigCache } = await import('../services/firestore/config.js');
        const { firestoreService } = await import('../services/firestore/client.js');
        clearFirestoreConfigCache();
        firestoreService.resetClient();
      } catch (_e) {}
    }

    if (existing.serviceId === 'bigquery' || existing.instanceId.startsWith('bigquery')) {
      try {
        const { clearBigQueryConfigCache } = await import('../services/bigquery/config.js');
        clearBigQueryConfigCache();
      } catch (_e) {}
    }

    await this.logAudit('SERVICE_TOGGLE', actorEmail, `services_config/${existing.instanceId}`, {
      instanceId: existing.instanceId,
      serviceId: existing.serviceId,
      enabled,
      previousEnabled: existing.enabled,
    });

    return updated;
  }

  public async updateServiceSettings(
    instanceOrServiceId: string,
    settings: Record<string, any>,
    actorEmail: string,
    meta?: { name?: string; description?: string; customerName?: string; requiredSecrets?: string[] }
  ): Promise<ServiceConfigDocument> {
    const existing = await this.getServiceConfig(instanceOrServiceId);
    const nowIso = new Date().toISOString();
    const updated: ServiceConfigDocument = {
      ...existing,
      name: meta?.name || existing.name,
      customerName: meta?.customerName || existing.customerName,
      description: meta?.description || existing.description,
      requiredSecrets: meta?.requiredSecrets || existing.requiredSecrets,
      settings: { ...existing.settings, ...settings },
      updatedBy: actorEmail,
      updatedAt: nowIso,
    };

    // Update in-memory
    this.inMemoryStore.services.set(existing.instanceId, updated);
    if (this.servicesCache) {
      this.servicesCache.data.set(existing.instanceId as any, updated);
    }

    // Persist to Firestore if connected
    const firestore = await this.getFirestore();
    if (firestore) {
      try {
        await firestore.collection('services_config').doc(existing.instanceId).set(
          {
            instanceId: existing.instanceId,
            serviceId: existing.serviceId,
            name: updated.name,
            customerName: updated.customerName,
            description: updated.description,
            enabled: updated.enabled,
            settings: updated.settings,
            requiredSecrets: updated.requiredSecrets,
            updatedBy: actorEmail,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
      } catch (err) {
        logger.error({ error: err, instanceId: existing.instanceId }, 'Failed to persist service settings to Firestore');
      }
    }

    if (existing.serviceId === 'firestore' || existing.instanceId.startsWith('firestore')) {
      try {
        const { clearFirestoreConfigCache } = await import('../services/firestore/config.js');
        const { firestoreService } = await import('../services/firestore/client.js');
        clearFirestoreConfigCache();
        firestoreService.resetClient();
      } catch (_e) {}
    }

    if (existing.serviceId === 'bigquery' || existing.instanceId.startsWith('bigquery')) {
      try {
        const { clearBigQueryConfigCache } = await import('../services/bigquery/config.js');
        clearBigQueryConfigCache();
      } catch (_e) {}
    }

    await this.logAudit('CONFIG_CHANGE', actorEmail, `services_config/${existing.instanceId}`, {
      instanceId: existing.instanceId,
      serviceId: existing.serviceId,
      updatedKeys: Object.keys(settings),
    });

    return updated;
  }

  public async updateServiceConfig(
    instanceOrServiceId: string,
    settings: Record<string, any>,
    actorEmail: string,
    meta?: { name?: string; description?: string; customerName?: string; requiredSecrets?: string[] }
  ): Promise<ServiceConfigDocument> {
    return this.updateServiceSettings(instanceOrServiceId, settings, actorEmail, meta);
  }

  public async getAllCustomRegisteredSecrets(): Promise<{ key: string; category: any; description: string; required: boolean; instanceId: string; customerName?: string }[]> {
    const allServices = await this.getAllServiceConfigs();
    const customSecrets: { key: string; category: any; description: string; required: boolean; instanceId: string; customerName?: string }[] = [];

    for (const s of allServices) {
      if (s.requiredSecrets && s.requiredSecrets.length > 0) {
        for (const secKey of s.requiredSecrets) {
          const cat = s.serviceId === 'xero' ? 'Xero' : s.serviceId === 'bigquery' ? 'BigQuery' : s.serviceId === 'firestore' ? 'Firestore' : s.serviceId === 'sagehr' ? 'Sage HR' : 'Slack';
          customSecrets.push({
            key: secKey,
            category: cat,
            description: `Custom credentials for ${s.name} (${s.customerName || s.instanceId})`,
            required: false,
            instanceId: s.instanceId,
            customerName: s.customerName,
          });
        }
      }
    }

    return customSecrets;
  }

  // ==========================================
  // USER ACCESS & PERMISSIONS (users_access/)
  // ==========================================

  public async getAllUsers(): Promise<UserAccessDocument[]> {
    const now = Date.now();
    if (this.usersCache && now - this.usersCache.timestamp < this.cacheTTLMs) {
      return Array.from(this.usersCache.data.values());
    }

    const firestore = await this.getFirestore();
    const result = new Map<string, UserAccessDocument>();

    // Load in-memory users first
    for (const [email, u] of this.inMemoryStore.users.entries()) {
      result.set(email.toLowerCase(), u);
    }

    if (firestore) {
      try {
        const snapshot = await firestore.collection('users_access').get();
        for (const doc of snapshot.docs) {
          const data = doc.data();
          const email = (data.userEmail || doc.id).toLowerCase();
          result.set(email, {
            userEmail: email,
            fullName: data.fullName || email,
            isAdmin: Boolean(data.isAdmin),
            isEnabled: typeof data.isEnabled === 'boolean' ? data.isEnabled : true,
            allowedServices: Array.isArray(data.allowedServices) ? data.allowedServices : ['xero', 'bigquery', 'firestore', 'sagehr', 'slack'],
            readOnlyOnly: Boolean(data.readOnlyOnly),
            customDeniedTools: Array.isArray(data.customDeniedTools) ? data.customDeniedTools : [],
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || new Date().toISOString()),
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : (data.updatedAt || new Date().toISOString()),
          });
        }
      } catch (err) {
        logger.warn({ error: err }, 'Failed to read users_access from Firestore, using in-memory store');
      }
    }

    this.usersCache = { data: result, timestamp: now };
    return Array.from(result.values());
  }

  public async getUserAccess(email: string): Promise<UserAccessDocument | null> {
    const users = await this.getAllUsers();
    return users.find((u) => u.userEmail.toLowerCase() === email.toLowerCase()) || null;
  }

  public async createUserAccess(
    userData: {
      userEmail: string;
      fullName?: string;
      isAdmin?: boolean;
      isEnabled?: boolean;
      allowedServices?: ServiceId[];
      readOnlyOnly?: boolean;
      customDeniedTools?: string[];
    },
    actorEmail: string
  ): Promise<UserAccessDocument> {
    const email = userData.userEmail.trim().toLowerCase();
    const nowIso = new Date().toISOString();

    const user: UserAccessDocument = {
      userEmail: email,
      fullName: userData.fullName || email.split('@')[0],
      isAdmin: Boolean(userData.isAdmin),
      isEnabled: userData.isEnabled ?? true,
      allowedServices: userData.allowedServices || ['xero', 'bigquery', 'firestore', 'sagehr', 'slack'],
      readOnlyOnly: Boolean(userData.readOnlyOnly),
      customDeniedTools: userData.customDeniedTools || [],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.inMemoryStore.users.set(email, user);
    if (this.usersCache) {
      this.usersCache.data.set(email, user);
    }

    const firestore = await this.getFirestore();
    if (firestore) {
      try {
        await firestore.collection('users_access').doc(email).set({
          ...user,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      } catch (err) {
        logger.error({ error: err, email }, 'Failed to save user_access to Firestore');
      }
    }

    await this.logAudit('USER_CREATE', actorEmail, `users_access/${email}`, {
      userEmail: email,
      isAdmin: user.isAdmin,
      allowedServices: user.allowedServices,
    });

    return user;
  }

  public async toggleUserAccess(email: string, isEnabled: boolean, actorEmail: string): Promise<UserAccessDocument> {
    const user = await this.getUserAccess(email);
    if (!user) {
      throw new Error(`User '${email}' not found`);
    }

    const nowIso = new Date().toISOString();
    const updated: UserAccessDocument = {
      ...user,
      isEnabled,
      updatedAt: nowIso,
    };

    const cleanEmail = email.toLowerCase();
    this.inMemoryStore.users.set(cleanEmail, updated);
    if (this.usersCache) {
      this.usersCache.data.set(cleanEmail, updated);
    }

    const firestore = await this.getFirestore();
    if (firestore) {
      try {
        await firestore.collection('users_access').doc(cleanEmail).set(
          {
            isEnabled,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
      } catch (err) {
        logger.error({ error: err, email }, 'Failed to toggle user in Firestore');
      }
    }

    // Immediate Session Eviction: If account was disabled, revoke all active sessions immediately
    if (!isEnabled) {
      try {
        await this.revokeUserSessions(cleanEmail);
      } catch (err) {
        logger.warn({ error: err, email: cleanEmail }, 'Failed to purge sessions during user disable');
      }
    }

    await this.logAudit('USER_TOGGLE', actorEmail, `users_access/${cleanEmail}`, {
      userEmail: cleanEmail,
      isEnabled,
    });

    return updated;
  }

  public async updateUserPermissions(
    email: string,
    permissions: {
      fullName?: string;
      isAdmin?: boolean;
      allowedServices?: ServiceId[];
      readOnlyOnly?: boolean;
      customDeniedTools?: string[];
    },
    actorEmail: string
  ): Promise<UserAccessDocument> {
    const user = await this.getUserAccess(email);
    if (!user) {
      throw new Error(`User '${email}' not found`);
    }

    const nowIso = new Date().toISOString();
    const updated: UserAccessDocument = {
      ...user,
      fullName: permissions.fullName !== undefined ? permissions.fullName : user.fullName,
      isAdmin: permissions.isAdmin !== undefined ? permissions.isAdmin : user.isAdmin,
      allowedServices: permissions.allowedServices !== undefined ? permissions.allowedServices : user.allowedServices,
      readOnlyOnly: permissions.readOnlyOnly !== undefined ? permissions.readOnlyOnly : user.readOnlyOnly,
      customDeniedTools: permissions.customDeniedTools !== undefined ? permissions.customDeniedTools : user.customDeniedTools,
      updatedAt: nowIso,
    };

    const cleanEmail = email.toLowerCase();
    this.inMemoryStore.users.set(cleanEmail, updated);
    if (this.usersCache) {
      this.usersCache.data.set(cleanEmail, updated);
    }

    const firestore = await this.getFirestore();
    if (firestore) {
      try {
        await firestore.collection('users_access').doc(cleanEmail).set(
          {
            fullName: updated.fullName,
            isAdmin: updated.isAdmin,
            allowedServices: updated.allowedServices,
            readOnlyOnly: updated.readOnlyOnly,
            customDeniedTools: updated.customDeniedTools,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
      } catch (err) {
        logger.error({ error: err, email }, 'Failed to update user permissions in Firestore');
      }
    }

    await this.logAudit('PERMISSIONS_UPDATE', actorEmail, `users_access/${cleanEmail}`, {
      userEmail: cleanEmail,
      ...permissions,
    });

    return updated;
  }

  public async deleteUserAccess(email: string, actorEmail: string): Promise<void> {
    const cleanEmail = email.toLowerCase();
    this.inMemoryStore.users.delete(cleanEmail);
    if (this.usersCache) {
      this.usersCache.data.delete(cleanEmail);
    }

    const firestore = await this.getFirestore();
    if (firestore) {
      try {
        await firestore.collection('users_access').doc(cleanEmail).delete();
      } catch (err) {
        logger.error({ error: err, email }, 'Failed to delete user from Firestore');
      }
    }

    // Immediate Session Eviction: Purge all active sessions upon user deletion
    try {
      await this.revokeUserSessions(cleanEmail);
    } catch (err) {
      logger.warn({ error: err, email: cleanEmail }, 'Failed to purge sessions during user deletion');
    }

    await this.logAudit('USER_DELETE', actorEmail, `users_access/${cleanEmail}`, {
      userEmail: cleanEmail,
    });
  }

  // ==========================================
  // SESSIONS (sessions/)
  // ==========================================

  public async createSession(sessionData: {
    sessionId: string;
    userEmail: string;
    fullName: string;
    role?: 'ADMIN' | 'USER';
    ipAddress?: string;
    userAgent?: string;
    ttlHours?: number;
  }): Promise<SessionDocument> {
    const now = new Date();
    const ttlHours = sessionData.ttlHours || 8;
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

    const session: SessionDocument = {
      sessionId: sessionData.sessionId,
      userEmail: sessionData.userEmail.toLowerCase(),
      fullName: sessionData.fullName,
      role: sessionData.role || 'ADMIN',
      ipAddress: sessionData.ipAddress || '127.0.0.1',
      userAgent: sessionData.userAgent || 'Unknown',
      createdAt: now.toISOString(),
      lastActiveAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    // Store in-memory & session cache
    this.inMemoryStore.sessions.set(session.sessionId, session);
    this.sessionCache.set(session.sessionId, { session, timestamp: Date.now() });

    const firestore = await this.getFirestore();
    if (firestore) {
      try {
        await firestore.collection('sessions').doc(session.sessionId).set({
          sessionId: session.sessionId,
          userEmail: session.userEmail,
          fullName: session.fullName,
          role: session.role,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          createdAt: Timestamp.fromDate(now),
          lastActiveAt: Timestamp.fromDate(now),
          expiresAt: Timestamp.fromDate(expiresAt),
        });
        logger.debug({ sessionId: session.sessionId, email: session.userEmail }, 'Created persistent session in Firestore');
      } catch (err) {
        logger.error({ error: err, sessionId: session.sessionId }, 'Failed to create session in Firestore');
      }
    }

    return session;
  }

  public async getSession(sessionId: string): Promise<SessionDocument | null> {
    const now = Date.now();
    const cached = this.sessionCache.get(sessionId);
    if (cached && now - cached.timestamp < this.cacheTTLMs) {
      if (new Date(cached.session.expiresAt).getTime() > now) {
        return cached.session;
      }
      this.sessionCache.delete(sessionId);
      return null;
    }

    // Check memory store
    const inMem = this.inMemoryStore.sessions.get(sessionId);
    if (inMem) {
      if (new Date(inMem.expiresAt).getTime() > now) {
        this.sessionCache.set(sessionId, { session: inMem, timestamp: now });
        return inMem;
      }
      this.inMemoryStore.sessions.delete(sessionId);
      return null;
    }

    // Check Firestore
    const firestore = await this.getFirestore();
    if (firestore) {
      try {
        const doc = await firestore.collection('sessions').doc(sessionId).get();
        if (doc.exists) {
          const data = doc.data()!;
          const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate().toISOString() : data.expiresAt;
          if (new Date(expiresAt).getTime() > now) {
            const session: SessionDocument = {
              sessionId: data.sessionId || doc.id,
              userEmail: data.userEmail,
              fullName: data.fullName,
              role: data.role || 'ADMIN',
              ipAddress: data.ipAddress || '',
              userAgent: data.userAgent || '',
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
              lastActiveAt: data.lastActiveAt?.toDate ? data.lastActiveAt.toDate().toISOString() : data.lastActiveAt,
              expiresAt,
            };
            this.sessionCache.set(sessionId, { session, timestamp: now });
            return session;
          } else {
            // Expired in Firestore, delete
            await firestore.collection('sessions').doc(sessionId).delete();
          }
        }
      } catch (err) {
        logger.warn({ error: err, sessionId }, 'Failed to query session from Firestore');
      }
    }

    return null;
  }

  public async revokeSession(sessionId: string): Promise<void> {
    this.sessionCache.delete(sessionId);
    this.inMemoryStore.sessions.delete(sessionId);

    const firestore = await this.getFirestore();
    if (firestore) {
      try {
        await firestore.collection('sessions').doc(sessionId).delete();
      } catch (err) {
        logger.error({ error: err, sessionId }, 'Failed to delete session from Firestore');
      }
    }
  }

  public async revokeUserSessions(userEmail: string): Promise<number> {
    const cleanEmail = userEmail.trim().toLowerCase();
    let count = 0;

    // 1. Purge from in-memory session cache & store
    for (const [sId, sess] of this.inMemoryStore.sessions.entries()) {
      if (sess.userEmail.toLowerCase() === cleanEmail) {
        this.inMemoryStore.sessions.delete(sId);
        this.sessionCache.delete(sId);
        count++;
      }
    }

    for (const [sId, item] of this.sessionCache.entries()) {
      if (item.session.userEmail.toLowerCase() === cleanEmail) {
        this.sessionCache.delete(sId);
      }
    }

    // 2. Purge from Firestore sessions collection
    const firestore = await this.getFirestore();
    if (firestore) {
      try {
        const snapshot = await firestore
          .collection('sessions')
          .where('userEmail', '==', cleanEmail)
          .get();

        if (!snapshot.empty) {
          const batch = firestore.batch();
          for (const doc of snapshot.docs) {
            batch.delete(doc.ref);
          }
          await batch.commit();
          count = Math.max(count, snapshot.size);
          logger.info({ userEmail: cleanEmail, revokedSessions: snapshot.size }, 'Revoked and purged user sessions from Firestore');
        }
      } catch (err) {
        logger.error({ error: err, userEmail: cleanEmail }, 'Failed to revoke user sessions from Firestore');
      }
    }

    return count;
  }

  public async revokeAllSessions(): Promise<number> {
    const count = this.inMemoryStore.sessions.size;
    this.sessionCache.clear();
    this.inMemoryStore.sessions.clear();

    const firestore = await this.getFirestore();
    if (firestore) {
      try {
        const snapshot = await firestore.collection('sessions').get();
        const batch = firestore.batch();
        for (const doc of snapshot.docs) {
          batch.delete(doc.ref);
        }
        await batch.commit();
        return snapshot.size;
      } catch (err) {
        logger.error({ error: err }, 'Failed to revoke all sessions from Firestore');
      }
    }

    return count;
  }

  // ==========================================
  // AUDIT LOGS (audit_logs/)
  // ==========================================

  public async logAudit(
    action: AuditLogDocument['action'],
    actorEmail: string,
    target: string,
    details: Record<string, any>
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Sanitize details: never log secret/password/token credential values
    const sensitiveTokens = ['password', 'passwordhash', 'secret', 'token', 'apikey', 'privatekey', 'clientsecret'];
    const sanitizedDetails: Record<string, any> = {};
    for (const [k, v] of Object.entries(details || {})) {
      const lowerKey = k.toLowerCase();
      const isSensitive =
        sensitiveTokens.some((s) => lowerKey === s || lowerKey.endsWith(`_${s}`) || lowerKey.endsWith(s)) &&
        !lowerKey.startsWith('updated') &&
        !lowerKey.startsWith('required');

      if (isSensitive) {
        sanitizedDetails[k] = '[REDACTED]';
      } else {
        sanitizedDetails[k] = v;
      }
    }

    const logEntry: AuditLogDocument = {
      logId,
      timestamp: nowIso,
      actorEmail: actorEmail || 'unknown',
      action,
      target,
      details: sanitizedDetails,
    };

    // Prepend in-memory
    this.inMemoryStore.auditLogs.unshift(logEntry);
    if (this.inMemoryStore.auditLogs.length > 200) {
      this.inMemoryStore.auditLogs.pop();
    }

    const firestore = await this.getFirestore();
    if (firestore) {
      try {
        await firestore.collection('audit_logs').doc(logId).set({
          ...logEntry,
          timestamp: Timestamp.now(),
        });
      } catch (err) {
        logger.warn({ error: err, logId }, 'Failed to persist audit log to Firestore');
      }
    }

    logger.info({ audit: logEntry }, `[AUDIT] ${action} by ${actorEmail} on ${target}`);
  }

  public async recordAuditLog(
    entry: {
      logId?: string;
      timestamp?: string;
      actorEmail: string;
      action: any;
      target: string;
      details?: Record<string, any>;
    },
    _actorEmail?: string
  ): Promise<void> {
    await this.logAudit(entry.action, entry.actorEmail, entry.target, entry.details || {});
  }

  public async getAuditLogs(limitCount = 50): Promise<AuditLogDocument[]> {
    const combinedLogs = new Map<string, AuditLogDocument>();

    // Load in-memory logs first
    for (const log of this.inMemoryStore.auditLogs) {
      combinedLogs.set(log.logId, log);
    }

    const firestore = await this.getFirestore();
    if (firestore) {
      const fetchLogsFromDb = async (db: Firestore) => {
        try {
          let snapshot;
          try {
            snapshot = await db
              .collection('audit_logs')
              .orderBy('timestamp', 'desc')
              .limit(limitCount)
              .get();
          } catch (orderErr: any) {
            logger.debug({ error: orderErr?.message || orderErr }, 'orderBy timestamp query failed on audit_logs, falling back to unordered fetch');
            snapshot = await db.collection('audit_logs').limit(limitCount).get();
          }

          if (!snapshot.empty) {
            for (const d of snapshot.docs) {
              const data = d.data();
              let timestampStr = new Date().toISOString();
              if (data.timestamp?.toDate) {
                timestampStr = data.timestamp.toDate().toISOString();
              } else if (typeof data.timestamp === 'string') {
                timestampStr = data.timestamp;
              } else if (data.timestamp instanceof Date) {
                timestampStr = data.timestamp.toISOString();
              } else if (typeof data.timestamp === 'number') {
                timestampStr = new Date(data.timestamp).toISOString();
              } else if (data.createdAt) {
                if (data.createdAt?.toDate) {
                  timestampStr = data.createdAt.toDate().toISOString();
                } else if (typeof data.createdAt === 'string') {
                  timestampStr = data.createdAt;
                } else if (typeof data.createdAt === 'number') {
                  timestampStr = new Date(data.createdAt).toISOString();
                }
              }

              const logId = data.logId || d.id;
              combinedLogs.set(logId, {
                logId,
                timestamp: timestampStr,
                actorEmail: data.actorEmail || 'unknown',
                action: data.action || 'SYSTEM_EVENT',
                target: data.target || '',
                details: data.details || {},
              });
            }
          }
        } catch (err) {
          logger.warn({ error: err }, 'Failed to fetch audit logs from Firestore, using in-memory');
        }
      };

      await fetchLogsFromDb(firestore);

      // If custom database had no logs and is not '(default)', also check '(default)' database
      if (combinedLogs.size <= this.inMemoryStore.auditLogs.length && this.activeDatabaseId !== '(default)') {
        try {
          const defaultDb = await this.getFirestore('(default)');
          if (defaultDb) {
            await fetchLogsFromDb(defaultDb);
          }
        } catch {
          // Ignored
        }
      }
    }

    // Convert map to array, sort by timestamp descending, and slice to limit
    const sorted = Array.from(combinedLogs.values()).sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
    });

    return sorted.slice(0, limitCount);
  }
}

export const runtimeConfig = new RuntimeConfigManager();
