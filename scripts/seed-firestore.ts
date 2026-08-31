import { runtimeConfig } from '../src/config/runtimeConfig.js';
import { getGcpProjectId } from '../src/config/secretManager.js';
import { gcpSetupService } from '../src/services/gcp/setupService.js';

async function main() {
  const projectId = (await getGcpProjectId()) || process.env.GCP_PROJECT_ID || 'your-gcp-project-id';
  const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
  const region = (await gcpSetupService.getCloudRunRegion()) || process.env.GCP_REGION || 'europe-west1';
  const adminEmail = (await gcpSetupService.getActiveGcloudAccount()) || process.env.ADMIN_EMAIL || 'admin@yourcompany.com';
  const adminName = adminEmail.split('@')[0];

  console.log(`Seeding initial schema into Firestore (${databaseId}) in project ${projectId}...`);
  runtimeConfig.setCustomDatabaseId(databaseId);

  // 1. Installation Metadata
  await runtimeConfig.setInstallationMetadata({
    initializationStatus: 'CORE_COMPLETED',
    initializedBy: adminEmail,
    gcpProjectId: projectId,
    region,
    firestoreDatabaseId: databaseId,
    configuredServices: ['gws_auth', 'platform'],
    pendingServices: ['bigquery', 'xero', 'sagehr'],
  });
  console.log('✓ Seeded system_metadata/installation');

  // 2. User Access
  await runtimeConfig.createUserAccess(
    {
      userEmail: adminEmail,
      fullName: adminName,
      isAdmin: true,
      isEnabled: true,
      allowedServices: ['xero', 'bigquery', 'firestore', 'sagehr'],
      readOnlyOnly: false,
    },
    'setup-init'
  );
  console.log(`✓ Seeded users_access/${adminEmail}`);

  // 3. Service Configurations
  const services = await runtimeConfig.getAllServiceConfigs();
  for (const s of services) {
    await runtimeConfig.updateServiceToggle(s.instanceId, s.enabled, adminEmail);
    console.log(`✓ Seeded services_config/${s.instanceId}`);
  }

  // 4. Audit Log
  await runtimeConfig.logAudit('INITIALIZATION_STEP', adminEmail, 'system_metadata/installation', {
    action: 'SETUP_COMPLETED',
    database: databaseId,
    region,
  });
  console.log('✓ Seeded audit_logs entry');

  console.log(`\n🚀 ALL CORE SCHEMA COLLECTIONS WRITTEN TO FIRESTORE (${databaseId}) SUCCESSFULLY!`);
}

main().catch((err) => {
  console.error('Failed seeding Firestore:', err);
});
