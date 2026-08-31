import { Router, Request, Response } from 'express';
import { getXeroSecrets } from '../../services/xero/index.js';
import { getBigQueryConfig } from '../../services/bigquery/index.js';
import { getFirestoreConfig } from '../../services/firestore/index.js';
import { getSageHrConfig } from '../../services/sagehr/index.js';

export const healthRouter = Router();

healthRouter.get('/healthz', async (_req: Request, res: Response) => {
  try {
    let xeroConfigured = false;
    try {
      const xeroSecrets = await getXeroSecrets();
      xeroConfigured = !!xeroSecrets?.clientId;
    } catch {
      xeroConfigured = false;
    }

    let bqConfig: any = null;
    try {
      bqConfig = await getBigQueryConfig();
    } catch {
      bqConfig = null;
    }

    let fsConfig: any = null;
    try {
      fsConfig = await getFirestoreConfig();
    } catch {
      fsConfig = null;
    }

    let sagehrConfig: any = null;
    try {
      sagehrConfig = await getSageHrConfig();
    } catch {
      sagehrConfig = null;
    }

    res.json({
      status: 'ok',
      service: 'enterprise-mcp-server',
      uptimeSeconds: process.uptime(),
      secretsLoaded: xeroConfigured,
      services: {
        xero: {
          configured: xeroConfigured,
        },
        bigquery: {
          configured: !!bqConfig?.projectId,
          projectId: bqConfig?.projectId,
          location: bqConfig?.location,
          defaultDataset: bqConfig?.defaultDataset,
          allowedTablesCount: bqConfig?.allowedTables?.length || 0,
        },
        firestore: {
          configured: !!fsConfig?.projectId,
          projectId: fsConfig?.projectId,
          databaseId: fsConfig?.databaseId,
          allowedCollectionsCount: fsConfig?.allowedCollections?.length || 0,
          writesEnabled: fsConfig?.allowWrites || false,
        },
        sagehr: {
          configured: !!sagehrConfig?.apiKey && !!sagehrConfig?.subdomain,
          subdomain: sagehrConfig?.subdomain,
          writesEnabled: sagehrConfig?.allowWrites || false,
          maskedFieldsCount: sagehrConfig?.maskedFields?.length || 0,
          blockedFieldsCount: sagehrConfig?.blockedFields?.length || 0,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      service: 'enterprise-mcp-server',
      uptimeSeconds: process.uptime(),
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});
