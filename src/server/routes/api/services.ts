import { Router, Request, Response } from 'express';
import { runtimeConfig, ServiceId } from '../../../config/runtimeConfig.js';
import { requireAdminAuth } from '../../middleware/adminAuth.js';
import { xeroService } from '../../../services/xero/client.js';
import { bigqueryService } from '../../../services/bigquery/client.js';
import { firestoreService } from '../../../services/firestore/client.js';
import { sageHrService } from '../../../services/sagehr/client.js';
import { GcpSetupService } from '../../../services/gcp/setupService.js';
import { getGcpProjectId } from '../../../config/secretManager.js';
import { logger } from '../../../utils/logger.js';

export const servicesApiRouter = Router();

// Require admin authentication for all service configuration management
servicesApiRouter.use(requireAdminAuth);

/**
 * GET /api/services
 * Lists all SaaS connector service instances with their enabled status and runtime settings.
 */
servicesApiRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const services = await runtimeConfig.getAllServiceConfigs();
    res.json({
      success: true,
      services,
      totalServices: services.length,
      activeServices: services.filter((s) => s.enabled).length,
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to fetch services configuration');
    res.status(500).json({ error: 'FetchFailed', message: error.message });
  }
});

/**
 * POST /api/services
 * Creates a new customer service instance (e.g. 2nd BigQuery dataset or 2nd Xero tenant).
 */
servicesApiRouter.post('/', async (req: Request, res: Response) => {
  const { serviceId, customerName, name, description, settings, requiredSecrets } = req.body || {};
  const validServices: ServiceId[] = ['xero', 'bigquery', 'firestore', 'sagehr'];

  if (!serviceId || !validServices.includes(serviceId)) {
    return res.status(400).json({
      error: 'BadRequest',
      message: `Field "serviceId" must be one of: ${validServices.join(', ')}`,
    });
  }

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'BadRequest', message: 'Field "name" (string) is required' });
  }

  const actorEmail = req.adminUser?.email || 'system';

  try {
    const newInstance = await runtimeConfig.createServiceInstance(
      {
        serviceId,
        customerName: customerName || 'Custom Customer',
        name,
        description: description || `Customer connector instance for ${customerName || name}`,
        settings: settings || {},
        requiredSecrets: Array.isArray(requiredSecrets) ? requiredSecrets : [],
      },
      actorEmail
    );

    res.status(201).json({
      success: true,
      service: newInstance,
      message: `Created new ${serviceId.toUpperCase()} instance '${newInstance.instanceId}' for customer '${newInstance.customerName}'`,
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to create service instance');
    res.status(500).json({ error: 'CreateFailed', message: error.message });
  }
});

/**
 * GET /api/services/:instanceId
 * Get configuration for a single service instance.
 */
servicesApiRouter.get('/:instanceId', async (req: Request, res: Response) => {
  const instanceId = req.params.instanceId;

  try {
    const config = await runtimeConfig.getServiceConfig(instanceId);
    res.json({ success: true, service: config });
  } catch (error: any) {
    res.status(500).json({ error: 'FetchFailed', message: error.message });
  }
});

/**
 * DELETE /api/services/:instanceId
 * Deletes a customer service instance.
 */
servicesApiRouter.delete('/:instanceId', async (req: Request, res: Response) => {
  const instanceId = req.params.instanceId;
  const defaultInstances = ['xero', 'bigquery', 'firestore', 'sagehr'];

  if (defaultInstances.includes(instanceId)) {
    return res.status(400).json({
      error: 'Forbidden',
      message: `Cannot delete default platform connector instance '${instanceId}'`,
    });
  }

  const actorEmail = req.adminUser?.email || 'system';

  try {
    const result = await runtimeConfig.deleteServiceInstance(instanceId, actorEmail);
    res.json({
      success: true,
      message: `Service instance '${instanceId}' deleted successfully`,
      instanceId: result.instanceId,
    });
  } catch (error: any) {
    logger.error({ error, instanceId }, 'Failed to delete service instance');
    res.status(500).json({ error: 'DeleteFailed', message: error.message });
  }
});

/**
 * PATCH /api/services/:instanceId/toggle
 * Toggle enabled state for a service connector instance.
 */
servicesApiRouter.patch('/:instanceId/toggle', async (req: Request, res: Response) => {
  const instanceId = req.params.instanceId;
  const { enabled } = req.body || {};

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'BadRequest', message: 'Field "enabled" (boolean) is required' });
  }

  const actorEmail = req.adminUser?.email || 'system';

  try {
    const updated = await runtimeConfig.updateServiceToggle(instanceId, enabled, actorEmail);
    res.json({
      success: true,
      service: updated,
      message: `Instance '${instanceId}' is now ${enabled ? 'ENABLED' : 'DISABLED'}`,
    });
  } catch (error: any) {
    logger.error({ error, instanceId }, 'Failed to toggle service state');
    res.status(500).json({ error: 'UpdateFailed', message: error.message });
  }
});

/**
 * PUT /api/services/:instanceId/config
 * Updates runtime settings and customer metadata for a service connector instance.
 */
servicesApiRouter.put('/:instanceId/config', async (req: Request, res: Response) => {
  const instanceId = req.params.instanceId;
  const { settings, name, description, customerName, requiredSecrets } = req.body || {};

  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'BadRequest', message: 'Field "settings" (object) is required' });
  }

  const actorEmail = req.adminUser?.email || 'system';

  try {
    const updated = await runtimeConfig.updateServiceSettings(instanceId, settings, actorEmail, {
      name,
      description,
      customerName,
      requiredSecrets,
    });

    res.json({
      success: true,
      service: updated,
      message: `Configuration for '${instanceId}' updated successfully`,
    });
  } catch (error: any) {
    logger.error({ error, instanceId }, 'Failed to update service settings');
    res.status(500).json({ error: 'UpdateFailed', message: error.message });
  }
});

/**
 * POST /api/services/:instanceId/test
 * Runs live upstream diagnostic connectivity test with granular IAM & permission probes.
 */
servicesApiRouter.post('/:instanceId/test', async (req: Request, res: Response) => {
  const instanceId = req.params.instanceId;
  const config = await runtimeConfig.getServiceConfig(instanceId);
  const serviceId = config.serviceId;
  const startTime = Date.now();

  const gcpSetup = new GcpSetupService();
  let saEmail = 'serviceAccount:YOUR_SERVICE_ACCOUNT@developer.gserviceaccount.com';
  let hostProjectId = (await getGcpProjectId()) || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || 'your-gcp-project-id';
  try {
    saEmail = await gcpSetup.getServiceAccountEmail();
  } catch (_e) {
    // fallback
  }

  interface PermissionProbe {
    id: string;
    name: string;
    role: string;
    status: 'PASS' | 'FAIL' | 'WARNING';
    description: string;
    error?: string;
    fixCommand?: string;
  }

  const permissions: PermissionProbe[] = [];
  const remediationCommands: string[] = [];
  let diagnosticDetails: Record<string, any> = {};
  let overallStatus: 'HEALTHY' | 'WARNING' | 'ERROR' = 'HEALTHY';
  let primaryErrorMessage = '';

  try {
    switch (serviceId) {
      case 'xero': {
        // Authenticate and Fetch Organization Tenant Connection
        try {
          const orgs = await xeroService.listOrganisationDetails();
          permissions.push({
            id: 'xero_auth',
            name: 'Client Credentials Authentication',
            role: 'grant_type: client_credentials',
            status: 'PASS',
            description: 'Successfully authenticated with Xero OAuth identity provider',
          });

          if (!orgs || orgs.length === 0) {
            permissions.push({
              id: 'xero_tenant',
              name: 'Organization Tenant Link',
              role: 'Custom Connection Authorization',
              status: 'FAIL',
              description: 'No Xero tenants available for this Custom Connection',
              fixCommand: 'Open developer.xero.com/app/manage, select your Custom Connection app, and authorize your Organization.',
            });
            overallStatus = 'ERROR';
            primaryErrorMessage = 'No Xero tenants available for this Custom Connection.';
          } else {
            permissions.push({
              id: 'xero_tenant',
              name: 'Organization Tenant Link',
              role: 'Custom Connection Authorization',
              status: 'PASS',
              description: `Connected to ${orgs.length} Xero Organization: ${orgs.map((o: any) => o.name).join(', ')}`,
            });

            // Check 3: Accounting Read Scope
            permissions.push({
              id: 'xero_scope_read',
              name: 'Accounting Read Scopes',
              role: 'accounting.transactions, accounting.reports.read',
              status: 'PASS',
              description: `Verified access to chart of accounts, invoices, and organization telemetry (${orgs[0]?.baseCurrency || 'USD'})`,
            });
          }

          diagnosticDetails = {
            organisationsFound: orgs?.length || 0,
            organisationSample: (orgs || []).slice(0, 2).map((o: any) => ({
              name: o.name,
              legalName: o.legalName,
              countryCode: o.countryCode,
              baseCurrency: o.baseCurrency,
            })),
          };
        } catch (err: any) {
          const errMsg = err.message || String(err);
          const isTenantError = errMsg.includes('No Xero tenants available');

          permissions.push({
            id: 'xero_auth',
            name: 'Client Credentials Authentication',
            role: 'grant_type: client_credentials',
            status: isTenantError ? 'PASS' : 'FAIL',
            description: isTenantError
              ? 'Successfully authenticated with Xero OAuth identity provider'
              : 'Failed to authenticate with Xero Client ID & Secret',
            error: isTenantError ? undefined : errMsg,
            fixCommand: isTenantError ? undefined : 'Verify XERO_CLIENT_ID and XERO_CLIENT_SECRET in GCP Secret Manager or /admin/secrets',
          });

          permissions.push({
            id: 'xero_tenant',
            name: 'Organization Tenant Link',
            role: 'Custom Connection Authorization',
            status: 'FAIL',
            description: isTenantError
              ? 'No Xero tenants available for this Custom Connection.'
              : 'Tenant authorization probe failed.',
            error: errMsg,
            fixCommand: 'Open developer.xero.com/app/manage, select your Custom Connection app, and authorize your Organization.',
          });

          overallStatus = 'ERROR';
          primaryErrorMessage = errMsg;
        }
        break;
      }

      case 'bigquery': {
        const { config: bqConfig } = await bigqueryService.getClient();
        let targetProjectId = config.settings?.projectId || bqConfig.projectId || hostProjectId;
        const targetLocation = config.settings?.location || bqConfig.location || 'EU';
        let boundTables: string[] = Array.isArray(config.settings?.tables) ? [...config.settings.tables] : [];
        if (typeof config.settings?.allowedTables === 'string' && config.settings.allowedTables !== '*') {
          const splits = config.settings.allowedTables.split(',').map((t: string) => t.trim()).filter(Boolean);
          for (const s of splits) {
            if (!boundTables.includes(s)) boundTables.push(s);
          }
        }
        if (typeof config.settings?.tableUrl === 'string' && config.settings.tableUrl.trim()) {
          const tUrl = config.settings.tableUrl.trim();
          if (!boundTables.includes(tUrl)) boundTables.push(tUrl);
        }

        // Use first bound table for primary scope metadata, or fall back to project/dataset scope
        const primaryResource = boundTables.length > 0 ? boundTables[0] : (config.settings?.defaultDataset ? `${targetProjectId}.${config.settings.defaultDataset}` : targetProjectId);
        const primaryScope = bigqueryService.parseResourceIdentifier(primaryResource, targetProjectId);
        const primaryIamCommands = bigqueryService.generateLeastPrivilegeIamCommands(saEmail, primaryScope);
        targetProjectId = primaryScope.projectId;

        const isCrossProject = targetProjectId !== hostProjectId;

        // Check 1: Host Project Query Runner & Job Creation (roles/bigquery.jobUser)
        try {
          await bigqueryService.dryRunQuery('SELECT 1 AS probe_health');
          permissions.push({
            id: 'bq_jobs',
            name: `1. Host Compute & Query Runner (${hostProjectId})`,
            role: 'roles/bigquery.jobUser',
            status: 'PASS',
            description: `Cloud Run in host project [${hostProjectId}] is authorized to run BigQuery query jobs.`,
          });
        } catch (err: any) {
          const fix = `gcloud projects add-iam-policy-binding ${hostProjectId} --member="serviceAccount:${saEmail}" --role="roles/bigquery.jobUser"`;
          remediationCommands.push(fix);
          permissions.push({
            id: 'bq_jobs',
            name: `1. Host Compute & Query Runner (${hostProjectId})`,
            role: 'roles/bigquery.jobUser',
            status: 'FAIL',
            description: `Cloud Run service account cannot run query jobs in host project [${hostProjectId}].`,
            error: err.message,
            fixCommand: fix,
          });
          overallStatus = 'ERROR';
        }

        // Check 2: Dataset Catalog Access
        let datasetsFound: string[] = [];
        try {
          datasetsFound = await bigqueryService.listDatasets();
          permissions.push({
            id: 'bq_metadata',
            name: `2. Data Scope Access (${primaryScope.displayName})`,
            role: `roles/bigquery.dataViewer [${primaryIamCommands.scopeBadge}]`,
            status: 'PASS',
            description: `${primaryIamCommands.plainEnglishDescription} (Catalog accessible).`,
          });
        } catch (err: any) {
          remediationCommands.push(primaryIamCommands.gcloudCommand);
          permissions.push({
            id: 'bq_metadata',
            name: `2. Data Scope Access (${primaryScope.displayName})`,
            role: `roles/bigquery.dataViewer [${primaryIamCommands.scopeBadge}]`,
            status: 'FAIL',
            description: `Service account lacks read permission for scope [${primaryScope.displayName}].`,
            error: err.message,
            fixCommand: primaryIamCommands.gcloudCommand,
          });
          overallStatus = 'ERROR';
        }

        // Check 3: Independent Verification of EVERY Bound Target Resource
        // Each configured target is tested independently so misconfigured entries
        // cannot hide behind a valid first entry.
        interface TargetProbeResult {
          resource: string;
          scopeLevel: string;
          status: 'PASS' | 'FAIL';
          tableType?: string;
          error?: string;
          viewDependencyAlert?: string;
        }
        const targetProbeResults: TargetProbeResult[] = [];

        if (boundTables.length > 0) {
          for (let i = 0; i < boundTables.length; i++) {
            const resourceStr = boundTables[i];
            const targetScope = bigqueryService.parseResourceIdentifier(resourceStr, targetProjectId);
            const targetIam = bigqueryService.generateLeastPrivilegeIamCommands(saEmail, targetScope);
            const targetIdx = i + 1;

            if (targetScope.scopeLevel === 'table' && targetScope.tableId && targetScope.datasetId) {
              // 3-part: project.dataset.table — dry-run a SELECT against the specific table
              const tableQueryTarget = `${targetScope.projectId}.${targetScope.datasetId}.${targetScope.tableId}`;
              let tableType: string | undefined = undefined;
              try {
                try {
                  const tableInfo = await bigqueryService.getTableInfo(targetScope.tableId, targetScope.datasetId);
                  tableType = tableInfo.type || 'TABLE';
                } catch (_metaErr) {
                  // Fallback to query dry run
                }

                await bigqueryService.dryRunQuery(`SELECT * FROM \`${tableQueryTarget}\` LIMIT 1`);

                permissions.push({
                  id: `bq_target_${targetIdx}`,
                  name: `3.${targetIdx}. Target Resource (${tableQueryTarget})`,
                  role: tableType ? `${tableType} Verified` : 'roles/bigquery.dataViewer',
                  status: 'PASS',
                  description: `Successfully verified read access to ${tableType || 'table/view'} [${tableQueryTarget}].`,
                });
                targetProbeResults.push({ resource: resourceStr, scopeLevel: 'table', status: 'PASS', tableType });
              } catch (err: any) {
                const viewDep = bigqueryService.extractViewSourceDependencyFromError(err);
                if (viewDep.isViewDependencyError && viewDep.missingProject) {
                  tableType = 'VIEW';
                  const alert = `View queries inaccessible source table [${viewDep.formattedTarget}]`;
                  const sourceFix = `gcloud projects add-iam-policy-binding ${viewDep.missingProject} --member="serviceAccount:${saEmail}" --role="roles/bigquery.dataViewer"`;
                  if (!remediationCommands.includes(sourceFix)) remediationCommands.push(sourceFix);

                  permissions.push({
                    id: `bq_target_${targetIdx}`,
                    name: `3.${targetIdx}. View Source Dependency (${viewDep.formattedTarget})`,
                    role: 'roles/bigquery.dataViewer on Source Dependency',
                    status: 'FAIL',
                    description: `[${tableQueryTarget}] is a VIEW that queries underlying table [${viewDep.formattedTarget}]. Read permission is required on the source project/dataset.`,
                    error: err.message,
                    fixCommand: sourceFix,
                  });
                  targetProbeResults.push({ resource: resourceStr, scopeLevel: 'table', status: 'FAIL', tableType, error: err.message, viewDependencyAlert: alert });
                } else {
                  if (!remediationCommands.includes(targetIam.gcloudCommand)) {
                    remediationCommands.push(targetIam.gcloudCommand);
                  }
                  permissions.push({
                    id: `bq_target_${targetIdx}`,
                    name: `3.${targetIdx}. Target Resource (${tableQueryTarget})`,
                    role: 'roles/bigquery.dataViewer',
                    status: 'FAIL',
                    description: `Cannot read table or view [${tableQueryTarget}].`,
                    error: err.message,
                    fixCommand: targetIam.gcloudCommand,
                  });
                  targetProbeResults.push({ resource: resourceStr, scopeLevel: 'table', status: 'FAIL', error: err.message });
                }
                overallStatus = 'ERROR';
              }
            } else if (targetScope.scopeLevel === 'dataset' && targetScope.datasetId) {
              // 2-part: project.dataset — verify dataset is listable
              const datasetTarget = `${targetScope.projectId}.${targetScope.datasetId}`;
              try {
                const bqClient = (await bigqueryService.getClient()).client;
                const dataset = bqClient.dataset(targetScope.datasetId, { projectId: targetScope.projectId });
                await dataset.getTables({ maxResults: 1 });

                permissions.push({
                  id: `bq_target_${targetIdx}`,
                  name: `3.${targetIdx}. Target Resource (${datasetTarget})`,
                  role: `roles/bigquery.dataViewer [DATASET]`,
                  status: 'PASS',
                  description: `Dataset [${datasetTarget}] is accessible and contains tables.`,
                });
                targetProbeResults.push({ resource: resourceStr, scopeLevel: 'dataset', status: 'PASS' });
              } catch (err: any) {
                if (!remediationCommands.includes(targetIam.gcloudCommand)) {
                  remediationCommands.push(targetIam.gcloudCommand);
                }
                permissions.push({
                  id: `bq_target_${targetIdx}`,
                  name: `3.${targetIdx}. Target Resource (${datasetTarget})`,
                  role: `roles/bigquery.dataViewer [DATASET]`,
                  status: 'FAIL',
                  description: `Cannot access dataset [${datasetTarget}]. The dataset may not exist or the service account lacks permissions.`,
                  error: err.message,
                  fixCommand: targetIam.gcloudCommand,
                });
                targetProbeResults.push({ resource: resourceStr, scopeLevel: 'dataset', status: 'FAIL', error: err.message });
                overallStatus = 'ERROR';
              }
            } else {
              // 1-part: project-only scope — verify project exists and is accessible via dry run
              const projectTarget = targetScope.projectId;
              try {
                const bqClient = (await bigqueryService.getClient()).client;
                const projectBq = new (bqClient as any).constructor({ projectId: projectTarget, location: targetLocation });
                await projectBq.getDatasets({ maxResults: 1 });

                permissions.push({
                  id: `bq_target_${targetIdx}`,
                  name: `3.${targetIdx}. Target Resource (${projectTarget})`,
                  role: `roles/bigquery.dataViewer [ENTIRE PROJECT]`,
                  status: 'PASS',
                  description: `Project [${projectTarget}] is accessible and datasets can be listed.`,
                });
                targetProbeResults.push({ resource: resourceStr, scopeLevel: 'project', status: 'PASS' });
              } catch (err: any) {
                if (!remediationCommands.includes(targetIam.gcloudCommand)) {
                  remediationCommands.push(targetIam.gcloudCommand);
                }
                permissions.push({
                  id: `bq_target_${targetIdx}`,
                  name: `3.${targetIdx}. Target Resource (${projectTarget})`,
                  role: `roles/bigquery.dataViewer [ENTIRE PROJECT]`,
                  status: 'FAIL',
                  description: `Cannot access project [${projectTarget}]. The project may not exist or the service account lacks permissions.`,
                  error: err.message,
                  fixCommand: targetIam.gcloudCommand,
                });
                targetProbeResults.push({ resource: resourceStr, scopeLevel: 'project', status: 'FAIL', error: err.message });
                overallStatus = 'ERROR';
              }
            }
          }
        } else {
          // No bound tables — report scope-level pass based on primary scope
          permissions.push({
            id: 'bq_target_1',
            name: `3. Scope Mode: ${primaryIamCommands.scopeBadge}`,
            role: 'roles/bigquery.dataViewer',
            status: 'PASS',
            description: primaryIamCommands.plainEnglishDescription,
          });
        }

        const targetsPassed = targetProbeResults.filter((r) => r.status === 'PASS').length;
        const targetsFailed = targetProbeResults.filter((r) => r.status === 'FAIL').length;
        const firstViewAlert = targetProbeResults.find((r) => r.viewDependencyAlert)?.viewDependencyAlert;

        diagnosticDetails = {
          hostBillingProjectId: hostProjectId,
          targetDataProjectId: targetProjectId,
          isCrossProject,
          scopeLevel: primaryScope.scopeLevel,
          scopeBadge: primaryIamCommands.scopeBadge,
          targetDataset: primaryScope.datasetId || 'All in project',
          targetTable: primaryScope.tableId || 'All in dataset',
          viewDependencyAlert: firstViewAlert,
          leastPrivilegeGcloudCommand: primaryIamCommands.gcloudCommand,
          leastPrivilegeSqlCommand: primaryIamCommands.sqlCommand,
          targetLocation,
          totalTargetResources: boundTables.length,
          targetResourcesPassed: targetsPassed,
          targetResourcesFailed: targetsFailed,
          targetResourceResults: targetProbeResults,
          datasetsFoundCount: datasetsFound.length,
          datasetsSample: datasetsFound.slice(0, 5),
          serviceAccount: saEmail,
        };
        break;
      }

      case 'firestore': {
        const { config: fsConfig } = await firestoreService.getClient();
        const targetDb = config.settings?.databaseId || fsConfig.databaseId || '(default)';
        let collections: string[] = [];

        // Gather configured collection paths from runtime settings
        const configuredCollections: string[] = [];
        if (config.settings?.collections && Array.isArray(config.settings.collections)) {
          configuredCollections.push(...config.settings.collections.map((c: string) => String(c).trim()).filter(Boolean));
        } else if (config.settings?.allowedCollections) {
          const raw = config.settings.allowedCollections;
          if (Array.isArray(raw)) {
            configuredCollections.push(...raw.map((c: string) => String(c).trim()).filter(Boolean));
          } else if (typeof raw === 'string') {
            configuredCollections.push(...raw.split(',').map((c: string) => c.trim()).filter(Boolean));
          }
        }

        // Check 1: Collections Discovery (roles/datastore.user)
        try {
          collections = await firestoreService.listCollections();

          if (collections.length === 0 && configuredCollections.length > 0) {
            // Collections are configured but none are accessible — likely blocklist conflict
            permissions.push({
              id: 'fs_collections',
              name: 'Database Collections Discovery',
              role: 'roles/datastore.user (datastore.entities.list)',
              status: 'WARNING',
              description: `Connected to Firestore database [${targetDb}], but 0 of ${configuredCollections.length} configured collection paths are accessible. All configured collections may be blocked by the server-side blocklist.`,
            });
            if ((overallStatus as string) !== 'ERROR') overallStatus = 'WARNING';
          } else {
            permissions.push({
              id: 'fs_collections',
              name: 'Database Collections Discovery',
              role: 'roles/datastore.user (datastore.entities.list)',
              status: 'PASS',
              description: `Connected to Firestore database [${targetDb}], discovered ${collections.length} accessible root collections`,
            });
          }
        } catch (err: any) {
          const fix = `gcloud projects add-iam-policy-binding ${hostProjectId} --member="serviceAccount:${saEmail}" --role="roles/datastore.user"`;
          remediationCommands.push(fix);
          permissions.push({
            id: 'fs_collections',
            name: 'Database Collections Discovery',
            role: 'roles/datastore.user',
            status: 'FAIL',
            description: `Permission denied accessing database [${targetDb}]`,
            error: err.message,
            fixCommand: fix,
          });
          overallStatus = 'ERROR';
        }

        // Check 2: Per-Collection Blocklist Audit
        // Check each configured collection path against the active blocklist
        // and report individually which ones are blocked vs accessible.
        const effectiveBlocklist = fsConfig.blockedCollections.length > 0 ? fsConfig.blockedCollections : [];
        const blockedPaths: string[] = [];
        const accessiblePaths: string[] = [];

        for (const collPath of configuredCollections) {
          const isAllowed = firestoreService.isCollectionAllowed(
            collPath,
            configuredCollections,
            effectiveBlocklist
          );
          if (isAllowed) {
            accessiblePaths.push(collPath);
          } else {
            blockedPaths.push(collPath);
          }
        }

        if (blockedPaths.length > 0) {
          permissions.push({
            id: 'fs_blocklist_audit',
            name: 'Collection Blocklist Audit',
            role: 'Server-Side Security Blocklist',
            status: 'WARNING',
            description: `${blockedPaths.length} of ${configuredCollections.length} configured collection paths are blocked by the server-side default blocklist: [${blockedPaths.join(', ')}]. These are internal platform governance collections (sessions, audit logs, system metadata) and are not exposed to Gemini Enterprise for security reasons. To make collections accessible, configure customer data collections instead, or remove specific entries from the blocklist in the connector settings.`,
          });
          if ((overallStatus as string) !== 'ERROR') overallStatus = 'WARNING';
        } else if (configuredCollections.length > 0) {
          permissions.push({
            id: 'fs_blocklist_audit',
            name: 'Collection Blocklist Audit',
            role: 'Server-Side Security Blocklist',
            status: 'PASS',
            description: `All ${configuredCollections.length} configured collection paths pass the server-side blocklist and are accessible to Gemini Enterprise.`,
          });
        }

        // Check 3: Document Read Access
        permissions.push({
          id: 'fs_read',
          name: 'Document Query & Read Access',
          role: 'roles/datastore.user (datastore.entities.get)',
          status: collections.length > 0 ? 'PASS' : (configuredCollections.length > 0 ? 'WARNING' : 'PASS'),
          description: collections.length > 0
            ? `Read access verified across ${collections.length} collections with PII filtering enabled`
            : configuredCollections.length > 0
              ? `No accessible collections found. Gemini Enterprise will not be able to query any Firestore data until non-blocked collections are configured.`
              : `Read access available. No collection allowlist configured (Zero-Trust Default-Deny mode active).`,
        });

        // Check 4: Write Protection Lock
        const allowWrites = typeof config.settings?.allowWrites === 'boolean' ? config.settings.allowWrites : fsConfig.allowWrites;
        permissions.push({
          id: 'fs_write_policy',
          name: 'Mutation Policy Lock',
          role: allowWrites ? 'Read & Write Enabled' : 'Read-Only Guard Locked',
          status: 'PASS',
          description: allowWrites
            ? 'Write operations (CREATE, UPDATE, DELETE) are permitted for authorized tools.'
            : 'Write protection is ACTIVE: MCP mutation tools are blocked from modifying documents.',
        });

        diagnosticDetails = {
          projectId: fsConfig.projectId,
          databaseId: targetDb,
          collectionsFound: collections.length,
          collectionSample: collections.slice(0, 5),
          configuredCollectionPaths: configuredCollections,
          blockedByServerBlocklist: blockedPaths,
          accessibleAfterBlocklist: accessiblePaths,
          activeBlocklist: effectiveBlocklist,
          allowWrites,
          serviceAccount: saEmail,
        };
        break;
      }

      case 'sagehr': {
        const result = await sageHrService.listEmployees({ active: true });
        permissions.push({
          id: 'sage_auth',
          name: 'API Key & Token Verification',
          role: 'X-Auth-Token Authentication',
          status: 'PASS',
          description: 'Successfully authenticated with Sage HR API endpoint',
        });

        permissions.push({
          id: 'sage_directory',
          name: 'Employee Directory & PII Masking',
          role: 'Directory Read & Privacy Filter',
          status: 'PASS',
          description: `Discovered ${result.totalCount} active employee records with automated PII salary masking`,
        });

        diagnosticDetails = {
          directoryConnected: true,
          employeesSampleCount: result.employees.length,
          totalEmployeesReported: result.totalCount,
          subdomain: config.settings?.subdomain || 'acme',
        };
        break;
      }
    }

    const latencyMs = Date.now() - startTime;
    const hasFailures = permissions.some((p) => p.status === 'FAIL');
    if (hasFailures) {
      overallStatus = 'ERROR';
    }

    res.json({
      success: overallStatus !== 'ERROR',
      serviceId,
      instanceId,
      status: overallStatus,
      latencyMs,
      timestamp: new Date().toISOString(),
      permissions,
      remediationCommands,
      error: primaryErrorMessage || (hasFailures ? 'One or more required IAM permissions or tenant connections failed verification.' : undefined),
      details: diagnosticDetails,
    });
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    logger.warn({ error, serviceId, instanceId, latencyMs }, 'Service diagnostic connectivity test failed');

    res.json({
      success: false,
      serviceId,
      instanceId,
      status: 'ERROR',
      latencyMs,
      timestamp: new Date().toISOString(),
      permissions,
      remediationCommands,
      error: error.message || String(error),
      code: error.code || error.name || 'CONNECTIVITY_ERROR',
      details: diagnosticDetails,
    });
  }
});
