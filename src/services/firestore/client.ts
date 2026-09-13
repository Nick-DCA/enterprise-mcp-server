import { Firestore, WhereFilterOp, OrderByDirection } from '@google-cloud/firestore';
import { getFirestoreConfig, FirestoreConfig } from './config.js';
import {
  FirestoreApiError,
  FirestorePermissionError,
  FirestoreWriteDisabledError,
  FirestoreNotFoundError,
} from './errors.js';
import { logger } from '../../utils/logger.js';
import { RequestContext } from '../../server/context.js';

export interface FieldSchema {
  name: string;
  type: string; // string, number, boolean, array, object, timestamp, null
  sampleValue?: any;
}

export interface CollectionSchema {
  collection: string;
  sampledDocumentsCount: number;
  fields: FieldSchema[];
}

export interface QueryFilter {
  field: string;
  operator: WhereFilterOp; // '==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'in' | 'array-contains-any' | 'not-in'
  value: any;
}

export interface StructuredQueryOptions {
  filters?: QueryFilter[];
  orderByField?: string;
  orderDirection?: OrderByDirection;
  limit?: number;
  startAfterDocId?: string;
}

export interface DocumentResult {
  id: string;
  path: string;
  data: Record<string, any>;
  createTime?: string;
  updateTime?: string;
}

import { DEFAULT_BLOCKED_COLLECTIONS } from './config.js';

export const SYSTEM_RESERVED_COLLECTIONS: readonly string[] = DEFAULT_BLOCKED_COLLECTIONS;

export class FirestoreService {
  private firestoreClient: Firestore | null = null;

  public resetClient(): void {
    if (this.firestoreClient) {
      try {
        this.firestoreClient.terminate().catch(() => {});
      } catch (_e) {}
      this.firestoreClient = null;
    }
  }

  public async getClient(): Promise<{ client: Firestore; config: FirestoreConfig }> {
    const config = await getFirestoreConfig();
    if (!this.firestoreClient) {
      this.firestoreClient = new Firestore({
        projectId: config.projectId,
        databaseId: config.databaseId,
        ignoreUndefinedProperties: true,
      });
    }
    return { client: this.firestoreClient, config };
  }

  /**
   * Validates if a collection or document path belongs to an allowed collection.
   * Defensive access control rules:
   * 1. Blocklist check (Highest Precedence): Deny if any path segment matches blockedCollections.
   * 2. Zero-Trust Default-Deny: If allowedCollections is empty, DENIED (query nothing).
   * 3. Wildcard: If allowedCollections contains 'allow_all' or '*', ALLOWED for non-blocked paths.
   * 4. Explicit match: Root collection must be in allowedCollections.
   */
  public isCollectionAllowed(
    path: string,
    allowedCollections: string[] = [],
    blockedCollections: string[] = []
  ): boolean {
    if (!path || typeof path !== 'string') return false;
    const cleanPath = path.trim().replace(/^\/|\/$/g, '').toLowerCase();
    if (!cleanPath) return false;

    const segments = cleanPath.split('/').filter(Boolean);
    const rootCollection = segments[0];

    // Effective blocked list: use passed blockedCollections, or fallback to DEFAULT_BLOCKED_COLLECTIONS if not provided
    const effectiveBlocked = (
      blockedCollections !== undefined && blockedCollections !== null
        ? blockedCollections
        : DEFAULT_BLOCKED_COLLECTIONS
    )
      .map((c) => c.toLowerCase().trim())
      .filter(Boolean);

    // Rule 1: High-Precedence Blocklist check against root & all path segments
    for (const seg of segments) {
      if (effectiveBlocked.includes(seg)) {
        return false;
      }
    }
    if (effectiveBlocked.includes(cleanPath)) {
      return false;
    }

    // Rule 2: Zero-Trust Default-Deny (if allowlist is empty, permit nothing)
    const normalizedAllowed = (allowedCollections || [])
      .map((c) => c.toLowerCase().trim())
      .filter((c) => c.length > 0);

    if (normalizedAllowed.length === 0) {
      return false;
    }

    // Rule 3: Wildcard allow_all
    if (normalizedAllowed.includes('allow_all') || normalizedAllowed.includes('*')) {
      return true;
    }

    // Rule 4: Explicit root collection or exact path allowlist match
    return normalizedAllowed.includes(rootCollection) || normalizedAllowed.includes(cleanPath);
  }

  /**
   * Recursively sanitizes document data by redacting excluded sensitive fields.
   */
  public sanitizeDocumentData(data: any, excludedFields: string[]): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeDocumentData(item, excludedFields));
    }

    // Convert Firestore Timestamps to ISO strings if present
    if (typeof data.toDate === 'function') {
      return data.toDate().toISOString();
    }

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (excludedFields.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else if (value && typeof value === 'object') {
        sanitized[key] = this.sanitizeDocumentData(value, excludedFields);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * List accessible root collections, excluding all internal system governance collections.
   */
  public async listCollections(): Promise<string[]> {
    const { client, config } = await this.getClient();
    try {
      const normalizedAllowed = (config.allowedCollections || [])
        .map((c) => c.toLowerCase().trim())
        .filter((c) => c.length > 0);

      if (normalizedAllowed.length === 0) {
        return [];
      }

      if (process.env.MOCK_FIRESTORE === 'true' || (process.env.NODE_ENV === 'test' && !process.env.FIRESTORE_EMULATOR_HOST)) {
        return normalizedAllowed.filter((id) => this.isCollectionAllowed(id, config.allowedCollections, config.blockedCollections));
      }

      const collections = await client.listCollections();
      const collectionIds = collections
        .map((c) => c.id)
        .filter((id) => this.isCollectionAllowed(id, config.allowedCollections, config.blockedCollections));
      return collectionIds;
    } catch (error: any) {
      logger.error({ error }, 'Failed to list Firestore collections');
      throw new FirestoreApiError(error.message, error.code, 'COLLECTIONS_LIST_ERROR');
    }
  }

  /**
   * Inspect inferred schema and field archetypes by sampling representative documents.
   */
  public async getCollectionSchema(collectionPath: string): Promise<CollectionSchema> {
    const { client, config } = await this.getClient();

    if (!this.isCollectionAllowed(collectionPath, config.allowedCollections, config.blockedCollections)) {
      throw new FirestorePermissionError(
        `Collection '${collectionPath}' is not permitted by Firestore access policy.`
      );
    }

    try {
      const snapshot = await client.collection(collectionPath).limit(5).get();
      if (snapshot.empty) {
        return {
          collection: collectionPath,
          sampledDocumentsCount: 0,
          fields: [],
        };
      }

      const fieldMap = new Map<string, { type: string; sample: any }>();

      for (const doc of snapshot.docs) {
        const rawData = doc.data();
        const data = this.sanitizeDocumentData(rawData, config.excludedFields);

        for (const [k, v] of Object.entries(data)) {
          let fieldType: string = typeof v;
          if (v === null) fieldType = 'null';
          else if (Array.isArray(v)) fieldType = 'array';
          else if (v instanceof Date || typeof (v as any)?.toDate === 'function') fieldType = 'timestamp';

          if (!fieldMap.has(k)) {
            fieldMap.set(k, { type: fieldType, sample: v });
          }
        }
      }

      const fields: FieldSchema[] = Array.from(fieldMap.entries()).map(([name, meta]) => ({
        name,
        type: meta.type,
        sampleValue: meta.sample,
      }));

      return {
        collection: collectionPath,
        sampledDocumentsCount: snapshot.size,
        fields,
      };
    } catch (error: any) {
      if (error instanceof FirestorePermissionError) throw error;
      logger.error({ error, collectionPath }, 'Failed to get Firestore collection schema');
      throw new FirestoreApiError(error.message, error.code, 'COLLECTION_SCHEMA_ERROR');
    }
  }

  /**
   * Retrieve a single document by its path (e.g. "customers/cust_001").
   */
  public async getDocument(documentPath: string): Promise<DocumentResult> {
    const { client, config } = await this.getClient();

    if (!this.isCollectionAllowed(documentPath, config.allowedCollections, config.blockedCollections)) {
      throw new FirestorePermissionError(
        `Access to document path '${documentPath}' is not permitted by Firestore access policy.`
      );
    }

    const getStartTime = Date.now();
    try {
      const docRef = client.doc(documentPath);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        throw new FirestoreNotFoundError(`Document at path '${documentPath}' does not exist.`);
      }

      const data = this.sanitizeDocumentData(docSnap.data(), config.excludedFields);

      RequestContext.recordSpan({
        spanId: `span_fs_get_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        serviceId: 'firestore',
        endpoint: `getDoc ${documentPath}`,
        httpMethod: 'GET',
        httpStatus: 200,
        durationMs: Date.now() - getStartTime,
        quotaInfo: `Doc found`,
        timestamp: new Date().toISOString(),
      });

      return {
        id: docSnap.id,
        path: docSnap.ref.path,
        data,
        createTime: docSnap.createTime?.toDate().toISOString(),
        updateTime: docSnap.updateTime?.toDate().toISOString(),
      };
    } catch (error: any) {
      if (error instanceof FirestorePermissionError || error instanceof FirestoreNotFoundError) throw error;
      if (error instanceof FirestoreApiError) throw error;
      logger.error({ error, documentPath }, 'Failed to fetch Firestore document');
      throw new FirestoreApiError(error.message, error.code, 'DOCUMENT_FETCH_ERROR');
    }
  }

  /**
   * Execute structured query against a collection with filters, sort, and bounds.
   */
  public async queryDocuments(
    collectionPath: string,
    options?: StructuredQueryOptions
  ): Promise<{ documents: DocumentResult[]; count: number }> {
    const { client, config } = await this.getClient();

    if (!this.isCollectionAllowed(collectionPath, config.allowedCollections, config.blockedCollections)) {
      throw new FirestorePermissionError(
        `Collection '${collectionPath}' is not permitted by Firestore access policy.`
      );
    }

    const limit = Math.min(options?.limit || config.maxDocuments, 500);

    const queryStartTime = Date.now();
    try {
      let query: FirebaseFirestore.Query = client.collection(collectionPath);

      if (options?.filters && Array.isArray(options.filters)) {
        for (const f of options.filters) {
          query = query.where(f.field, f.operator, f.value);
        }
      }

      if (options?.orderByField) {
        query = query.orderBy(options.orderByField, options.orderDirection || 'asc');
      }

      query = query.limit(limit);

      const snapshot = await query.get();
      const documents: DocumentResult[] = snapshot.docs.map((d) => ({
        id: d.id,
        path: d.ref.path,
        data: this.sanitizeDocumentData(d.data(), config.excludedFields),
        createTime: d.createTime?.toDate().toISOString(),
        updateTime: d.updateTime?.toDate().toISOString(),
      }));

      RequestContext.recordSpan({
        spanId: `span_fs_query_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        serviceId: 'firestore',
        endpoint: `query ${collectionPath}`,
        httpMethod: 'POST',
        httpStatus: 200,
        durationMs: Date.now() - queryStartTime,
        quotaInfo: `Docs: ${documents.length}`,
        timestamp: new Date().toISOString(),
      });

      return {
        documents,
        count: documents.length,
      };
    } catch (error: any) {
      if (error instanceof FirestorePermissionError) throw error;
      if (error instanceof FirestoreApiError) throw error;
      logger.error({ error, collectionPath }, 'Failed to query Firestore documents');
      throw new FirestoreApiError(error.message, error.code, 'QUERY_DOCUMENTS_ERROR');
    }
  }

  /**
   * List subcollections nested under a specific document.
   */
  public async listSubcollections(documentPath: string): Promise<string[]> {
    const { client, config } = await this.getClient();

    if (!this.isCollectionAllowed(documentPath, config.allowedCollections, config.blockedCollections)) {
      throw new FirestorePermissionError(
        `Access to document path '${documentPath}' is not permitted by Firestore access policy.`
      );
    }

    try {
      const docRef = client.doc(documentPath);
      const subcollections = await docRef.listCollections();
      return subcollections
        .map((s) => s.id)
        .filter((subId) => this.isCollectionAllowed(`${documentPath}/${subId}`, config.allowedCollections, config.blockedCollections));
    } catch (error: any) {
      if (error instanceof FirestorePermissionError) throw error;
      logger.error({ error, documentPath }, 'Failed to list Firestore subcollections');
      throw new FirestoreApiError(error.message, error.code, 'SUBCOLLECTIONS_LIST_ERROR');
    }
  }

  /**
   * Create or update document data (guarded by FIRESTORE_ALLOW_WRITES).
   */
  public async setDocument(
    documentPath: string,
    data: Record<string, any>,
    merge: boolean = true
  ): Promise<{ success: boolean; path: string; writeTime: string }> {
    const { client, config } = await this.getClient();

    if (!config.allowWrites) {
      throw new FirestoreWriteDisabledError(
        'Mutations to Firestore are disabled. Set FIRESTORE_ALLOW_WRITES=true in environment to enable write operations.'
      );
    }

    if (!this.isCollectionAllowed(documentPath, config.allowedCollections, config.blockedCollections)) {
      throw new FirestorePermissionError(
        `Write to document path '${documentPath}' is not permitted by Firestore access policy.`
      );
    }

    try {
      const docRef = client.doc(documentPath);
      const writeResult = await docRef.set(data, { merge });

      return {
        success: true,
        path: documentPath,
        writeTime: writeResult.writeTime.toDate().toISOString(),
      };
    } catch (error: any) {
      if (error instanceof FirestoreApiError) throw error;
      logger.error({ error, documentPath }, 'Failed to set Firestore document');
      throw new FirestoreApiError(error.message, error.code, 'DOCUMENT_SET_ERROR');
    }
  }
}

export const firestoreService = new FirestoreService();
