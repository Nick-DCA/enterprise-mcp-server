import { execSync, spawn } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load local .env if available
dotenv.config();

function runCommandSilent(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function runCommandStream(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: true });
    child.on('close', (code) => resolve(code ?? 0));
    child.on('error', (err) => reject(err));
  });
}

function parseCliArg(prefix: string): string | null {
  const arg = process.argv.find((a) => a.startsWith(`--${prefix}=`));
  if (arg) {
    return arg.split('=')[1].trim();
  }
  return null;
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('⚡ SEAMLESS CLOUD RUN DEPLOYMENT PIPELINE');
  console.log('='.repeat(80));

  // 1. Verify gcloud CLI presence
  const gcloudVer = runCommandSilent('gcloud version');
  if (!gcloudVer) {
    console.error('❌ Error: `gcloud` CLI was not found in PATH.');
    console.error('Please install Google Cloud SDK: https://cloud.google.com/sdk/docs/install\n');
    process.exit(1);
  }

  // 2. Auto-detect Project ID
  const cliProject = parseCliArg('project');
  const envProject = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const gcloudProject = runCommandSilent('gcloud config get-value project');
  const projectId = cliProject || envProject || gcloudProject;

  if (!projectId || projectId === '(unset)') {
    console.error('❌ Error: Target GCP Project ID could not be determined.');
    console.error('Set it via `gcloud config set project <PROJECT_ID>` or `GCP_PROJECT_ID` in `.env`.\n');
    process.exit(1);
  }

  // 3. Service Name
  const cliService = parseCliArg('service');
  const envService = process.env.CLOUD_RUN_SERVICE || process.env.K_SERVICE;
  const serviceName = cliService || envService || 'enterprise-mcp-server';

  // 4. Auto-detect Region
  const cliRegion = parseCliArg('region');
  const envRegion = process.env.GCP_REGION;
  const gcloudRegion = runCommandSilent('gcloud config get-value run/region');

  // Try to inspect existing Cloud Run service region if deployed
  let detectedServiceRegion = '';
  if (!cliRegion && !envRegion && (!gcloudRegion || gcloudRegion === '(unset)')) {
    try {
      const describeJson = runCommandSilent(
        `gcloud run services list --project=${projectId} --filter="metadata.name=${serviceName}" --format="value(region)"`
      );
      if (describeJson) {
        detectedServiceRegion = describeJson.trim().split(/\s+/)[0];
      }
    } catch {
      // Ignore
    }
  }

  const rawRegion = cliRegion || envRegion || (gcloudRegion && gcloudRegion !== '(unset)' ? gcloudRegion : '') || detectedServiceRegion || 'europe-west1';
  const region = rawRegion.trim().split(/\s+/)[0] || 'europe-west1';

  // 5. Database ID
  const cliDb = parseCliArg('database');
  const envDb = process.env.FIRESTORE_DATABASE_ID;
  const databaseId = cliDb || envDb || '(default)';

  console.log(`\n📦 Deployment Target Configuration:`);
  console.log(`   • GCP Project:       \x1b[36m${projectId}\x1b[0m`);
  console.log(`   • Cloud Run Region:  \x1b[36m${region}\x1b[0m`);
  console.log(`   • Service Name:      \x1b[36m${serviceName}\x1b[0m`);
  console.log(`   • Firestore DB:      \x1b[36m${databaseId}\x1b[0m`);
  console.log(`   • Source Code Path:  ${process.cwd()}`);
  console.log('─'.repeat(80));

  console.log('\n🔨 [1/2] Running local build check (backend + frontend)...');
  const buildExitCode = await runCommandStream('npm', ['run', 'build']);
  if (buildExitCode !== 0) {
    console.error(`\n❌ Local build failed with exit code ${buildExitCode}. Aborting deployment.`);
    process.exit(buildExitCode);
  }
  console.log('✓ Local build passed successfully.');

  console.log('\n🚀 [2/2] Triggering Google Cloud Build & Cloud Run revision rollout...\n');

  const envPairs = `GCP_PROJECT_ID=${projectId},FIRESTORE_DATABASE_ID=${databaseId},GCP_REGION=${region},NODE_ENV=production`;

  const deployArgs = [
    'run',
    'deploy',
    serviceName,
    '--source',
    '.',
    `--region=${region}`,
    `--project=${projectId}`,
    `--update-env-vars=${envPairs}`,
    '--memory=512Mi',
    '--cpu=1',
    '--allow-unauthenticated',
    '--clear-base-image',
  ];

  const exitCode = await runCommandStream('gcloud', deployArgs);

  if (exitCode !== 0) {
    console.error(`\n❌ Cloud Run deployment failed with exit code ${exitCode}.`);
    process.exit(exitCode);
  }

  // Fetch Live URL
  const deployedUrl = runCommandSilent(
    `gcloud run services describe ${serviceName} --region=${region} --project=${projectId} --format="value(status.url)"`
  );

  console.log('\n' + '='.repeat(80));
  console.log('🎉 REVISION DEPLOYED SUCCESSFULLY TO CLOUD RUN');
  console.log('='.repeat(80));

  if (deployedUrl) {
    console.log(`\n  🌐 Live Gateway URL:    \x1b[32m${deployedUrl}\x1b[0m`);
    console.log(`  🔌 MCP Protocol URL:    \x1b[36m${deployedUrl}/mcp\x1b[0m`);
    console.log(`  ⚙️  Admin Portal URL:    \x1b[36m${deployedUrl}/admin/\x1b[0m`);
    console.log(`  🩺 Health Endpoint:     ${deployedUrl}/health\n`);
  }

  console.log('='.repeat(80) + '\n');
}

main().catch((err) => {
  console.error('Fatal deployment error:', err);
  process.exit(1);
});
