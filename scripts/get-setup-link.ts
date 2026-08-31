import { execSync } from 'child_process';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { getGcpProjectId } from '../src/config/secretManager.js';
import { gcpSetupService } from '../src/services/gcp/setupService.js';

const secretClient = new SecretManagerServiceClient();

async function main() {
  const projectId = (await getGcpProjectId()) || process.env.GCP_PROJECT_ID || 'your-gcp-project-id';
  const serviceName = process.env.CLOUD_RUN_SERVICE || process.env.K_SERVICE || 'enterprise-mcp-server';
  const region = (await gcpSetupService.getCloudRunRegion()) || process.env.GCP_REGION || 'europe-west1';

  console.log('\n' + '='.repeat(80));
  console.log('⚡ Generating 1-Click Production Setup Magic Link...');
  console.log('='.repeat(80));

  // 1. Get Cloud Run Service URL dynamically from gcloud
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
    // Fallback to local or configured port
  }

  // 2. Fetch MCP_SETUP_TOKEN from Secret Manager
  let token = '';
  try {
    const name = `projects/${projectId}/secrets/MCP_SETUP_TOKEN/versions/latest`;
    const [version] = await secretClient.accessSecretVersion({ name });
    token = version.payload?.data?.toString()?.trim() || '';
  } catch (err: any) {
    console.log(`⚠️ Note: Could not fetch MCP_SETUP_TOKEN from Secret Manager (${err.message})`);
  }

  if (!token) {
    console.log('\n❌ No active bootstrap setup token found.');
    console.log('If the gateway has already been initialized, the setup token is destroyed.');
    console.log(`To open the Admin Portal, visit: ${serviceUrl}/admin/\n`);
    return;
  }

  const magicUrl = `${serviceUrl}/admin/setup?token=${token}`;

  console.log(`\n  Project:         ${projectId}`);
  console.log(`  Target Host URL: ${serviceUrl}`);
  console.log(`  Bootstrap Token: ${token}`);
  console.log('\n' + '='.repeat(80));
  console.log('👉 1-CLICK MAGIC SETUP LINK:');
  console.log(`   ${magicUrl}`);
  console.log('='.repeat(80) + '\n');

  // Attempt to open in default browser on Windows/Mac/Linux
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
    // Ignore if auto-open is not supported
  }
}

main().catch((err) => {
  console.error('Error generating setup link:', err);
});
