import { execSync } from 'child_process';
import crypto from 'crypto';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Firestore } from '@google-cloud/firestore';
import { getGcpProjectId } from '../src/config/secretManager.js';
import { gcpSetupService } from '../src/services/gcp/setupService.js';

const secretClient = new SecretManagerServiceClient();

async function main() {
  const projectId = (await getGcpProjectId()) || process.env.GCP_PROJECT_ID || 'your-gcp-project-id';
  const serviceName = process.env.CLOUD_RUN_SERVICE || process.env.K_SERVICE || 'enterprise-mcp-server';
  const region = (await gcpSetupService.getCloudRunRegion()) || process.env.GCP_REGION || 'europe-west1';
  const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';

  console.log('\n' + '='.repeat(80));
  console.log('🔄 Re-provisioning Bootstrap Setup Token & Resetting Wizard...');
  console.log('='.repeat(80));

  // 1. Generate fresh 32-byte secure token
  const freshToken = crypto.randomBytes(32).toString('hex');

  // 2. Create or write to Secret Manager
  try {
    const parent = `projects/${projectId}`;
    const secretPath = `projects/${projectId}/secrets/MCP_SETUP_TOKEN`;

    try {
      await secretClient.getSecret({ name: secretPath });
    } catch {
      await secretClient.createSecret({
        parent,
        secretId: 'MCP_SETUP_TOKEN',
        secret: {
          replication: { automatic: {} },
          labels: { service: 'mcp-gateway', purpose: 'setup-bootstrap' },
        },
      });
      console.log('✓ Created secret MCP_SETUP_TOKEN in GCP Secret Manager');
    }

    await secretClient.addSecretVersion({
      parent: secretPath,
      payload: {
        data: Buffer.from(freshToken, 'utf8'),
      },
    });
    console.log('✓ Provisioned fresh bootstrap token in GCP Secret Manager');
  } catch (err: any) {
    console.error('⚠️ Warning updating Secret Manager:', err.message);
  }

  // 3. Reset installation metadata status in Firestore if database exists
  try {
    const db = new Firestore({ projectId, databaseId });
    await db.collection('system_metadata').doc('installation').set(
      {
        initializationStatus: 'UNINITIALIZED',
        resetAt: new Date().toISOString(),
        firestoreDatabaseId: databaseId,
      },
      { merge: true }
    );
    console.log(`✓ Reset initializationStatus to UNINITIALIZED in Firestore (${databaseId})`);
  } catch (err: any) {
    console.log(`ℹ️ Note on Firestore: ${err.message}`);
  }

  // 4. Resolve Cloud Run URL
  let serviceUrl = `http://localhost:${process.env.PORT || 3000}`;
  try {
    const output = execSync(
      `gcloud run services describe ${serviceName} --region=${region} --project=${projectId} --format="value(status.url)"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
    if (output && output.startsWith('http')) {
      serviceUrl = output;
    }
  } catch {
    // fallback
  }

  const magicUrl = `${serviceUrl}/admin/setup?token=${freshToken}`;

  console.log(`\n  Project:         ${projectId}`);
  console.log(`  Target Host URL: ${serviceUrl}`);
  console.log(`  Bootstrap Token: ${freshToken}`);
  console.log('\n' + '='.repeat(80));
  console.log('👉 FRESH 1-CLICK MAGIC SETUP LINK:');
  console.log(`   ${magicUrl}`);
  console.log('='.repeat(80) + '\n');

  // Attempt auto-open in browser
  try {
    if (process.platform === 'win32') {
      execSync(`start "" "${magicUrl}"`);
    } else if (process.platform === 'darwin') {
      execSync(`open "${magicUrl}"`);
    } else {
      execSync(`xdg-open "${magicUrl}"`);
    }
    console.log('🚀 Opened setup link in your default browser.\n');
  } catch {
    // Ignore
  }
}

main().catch((err) => {
  console.error('Fatal error resetting setup:', err);
});
