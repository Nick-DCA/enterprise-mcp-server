import readline from 'readline/promises';
import { execSync, spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Helper to prompt terminal input
async function promptWithDefault(rl: readline.Interface, question: string, defaultValue: string): Promise<string> {
  const answer = await rl.question(`${question} [${defaultValue}]: `);
  return answer.trim() || defaultValue;
}

function randHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}

function runCommandStream(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: true });
    child.on('close', (code) => resolve(code ?? 0));
    child.on('error', (err) => reject(err));
  });
}

function runCommandSilent(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

async function main() {
  if (process.argv.includes('--deploy-only')) {
    const { execSync } = await import('child_process');
    execSync('npx tsx scripts/deploy.ts', { stdio: 'inherit' });
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n' + '='.repeat(80));
  console.log('🚀 ENTERPRISE MCP GATEWAY — CLOUD BOOTSTRAPPER & PROVISIONER (CLI MODE)');
  console.log('='.repeat(80));
  console.log('This wizard will provision all required GCP services (Cloud Run, Secret Manager,');
  console.log('Firestore) and deploy the agnostic MCP Gateway directly to your Google Cloud Project.\n');

  // 1. Check gcloud CLI presence
  const gcloudVersion = runCommandSilent('gcloud version');
  if (!gcloudVersion) {
    console.error('❌ Error: `gcloud` CLI was not found in your PATH.');
    console.error('Please install Google Cloud SDK: https://cloud.google.com/sdk/docs/install\n');
    rl.close();
    process.exit(1);
  }

  // 2. Detect Active Google Account (Admin Identity)
  let activeAccount = runCommandSilent('gcloud config get-value account');
  if (!activeAccount || activeAccount.includes('(unset)') || !activeAccount.includes('@')) {
    console.log('⚠️ No active Google account found in gcloud. Initiating ADC login...');
    try {
      execSync('gcloud auth application-default login', { stdio: 'inherit' });
      activeAccount = runCommandSilent('gcloud config get-value account') || 'admin@yourcompany.com';
    } catch (_e) {
      activeAccount = 'admin@yourcompany.com';
    }
  }

  console.log(`👤 Active Google Account Detected: \x1b[32m${activeAccount}\x1b[0m`);
  const defaultDomain = activeAccount.includes('@') ? activeAccount.split('@')[1] : 'yourcompany.com';

  // 3. Detect / Select GCP Project
  const currentProject = runCommandSilent('gcloud config get-value project');
  console.log('\n--- [1/4] Google Cloud Project Configuration ---');
  let projectId = await promptWithDefault(
    rl,
    'Enter Target GCP Project ID (or type new <id> to create a new project)',
    currentProject || 'my-mcp-gateway-project'
  );

  if (projectId.startsWith('new ')) {
    const newProj = projectId.replace('new ', '').trim();
    console.log(`\nCreating new GCP Project '${newProj}'...`);
    try {
      execSync(`gcloud projects create ${newProj} --set-as-default`, { stdio: 'inherit' });
      projectId = newProj;
      console.log(`✓ Project '${newProj}' created and set as active.`);
    } catch (err: any) {
      console.error(`❌ Failed to create project: ${err.message}`);
      rl.close();
      process.exit(1);
    }
  }

  // 4. Corporate Domain
  console.log('\n--- [2/4] Google Workspace Identity & Domain Authorization ---');
  const allowedDomains = await promptWithDefault(
    rl,
    'Enter Allowed Email Domains (comma-separated)',
    defaultDomain
  );

  // 5. Region Selection
  console.log('\n--- [3/4] Primary Cloud Run & Database Region ---');
  console.log('  1) europe-west1 (Belgium) [Recommended]');
  console.log('  2) us-central1 (Iowa)');
  console.log('  3) africa-south1 (Johannesburg)');
  console.log('  4) asia-east1 (Taiwan)');
  console.log('  5) Custom Region Entry');
  const regionChoice = await promptWithDefault(rl, 'Select Region (1-5)', '1');
  let selectedRegion = 'europe-west1';
  if (regionChoice === '2') selectedRegion = 'us-central1';
  else if (regionChoice === '3') selectedRegion = 'africa-south1';
  else if (regionChoice === '4') selectedRegion = 'asia-east1';
  else if (regionChoice === '5') {
    selectedRegion = await promptWithDefault(rl, 'Enter GCP Region code', 'europe-west1');
  }

  // 6. Firestore Instance Architecture
  console.log('\n--- [4/4] Firestore Database Architecture ---');
  console.log('  1) Standard Firestore Instance (\'(default)\') [Recommended for single-database]');
  console.log('  2) Enterprise Firestore Instance (Custom Named Database e.g. mcp-gateway-db)');
  const dbChoice = await promptWithDefault(rl, 'Select Firestore Mode (1-2)', '1');
  let selectedDatabase = '(default)';
  if (dbChoice === '2') {
    selectedDatabase = await promptWithDefault(rl, 'Enter Custom Firestore Database ID', `${projectId}-mcp`);
  }

  const serviceName = await promptWithDefault(rl, 'Cloud Run Service Name', 'enterprise-mcp-server');

  // Confirmation summary
  console.log('\n' + '='.repeat(80));
  console.log('📋 PROVISIONING SPECIFICATION SUMMARY');
  console.log('='.repeat(80));
  console.log(`  GCP Project ID:        ${projectId}`);
  console.log(`  Primary Region:        ${selectedRegion}`);
  console.log(`  Cloud Run Service:     ${serviceName}`);
  console.log(`  Firestore Database:    ${selectedDatabase}`);
  console.log(`  Allowed Email Domains: ${allowedDomains}`);
  console.log(`  Primary Administrator: ${activeAccount}`);
  console.log('='.repeat(80));

  const proceed = await promptWithDefault(rl, 'Proceed with Automated Cloud Provisioning & Deployment? (Y/n)', 'Y');
  if (proceed.toLowerCase() !== 'y') {
    console.log('Aborted by user.');
    rl.close();
    process.exit(0);
  }

  rl.close();

  // =========================================================================
  // EXECUTION & PROVISIONING PIPELINE
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('⚡ STEP 1/4: Enabling Required Google Cloud APIs...');
  console.log('='.repeat(80));
  const apis = [
    'run.googleapis.com',
    'secretmanager.googleapis.com',
    'firestore.googleapis.com',
    'monitoring.googleapis.com',
    'bigquery.googleapis.com',
    'iam.googleapis.com',
    'serviceusage.googleapis.com',
  ];
  try {
    execSync(`gcloud services enable ${apis.join(' ')} --project=${projectId}`, { stdio: 'inherit' });
    console.log('✓ Required Google Cloud APIs enabled successfully.');
  } catch (err: any) {
    console.error('⚠️ Warning enabling APIs via gcloud:', err.message);
  }

  console.log('\n' + '='.repeat(80));
  console.log(`⚡ STEP 2/4: Initializing Cloud Firestore Database '${selectedDatabase}' in region ${selectedRegion}...`);
  console.log('='.repeat(80));
  try {
    const dbCmd = selectedDatabase === '(default)'
      ? `gcloud firestore databases create --location=${selectedRegion} --project=${projectId}`
      : `gcloud firestore databases create --database=${selectedDatabase} --location=${selectedRegion} --project=${projectId}`;
    execSync(dbCmd, { stdio: 'inherit' });
    console.log(`✓ Firestore database '${selectedDatabase}' initialized.`);
  } catch (err: any) {
    console.log(`ℹ️ Firestore database '${selectedDatabase}' already exists or ready.`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('⚡ STEP 3/4: Generating & Provisioning Secrets to Google Secret Manager...');
  console.log('='.repeat(80));
  const mcpClientId = 'gemini-enterprise-mcp';
  const mcpClientSecret = `mcp_sec_${randHex(20)}`;
  const mcpJwtSecret = randHex(32);
  const mcpSetupToken = randHex(32);

  const secretsToCreate: Record<string, string> = {
    MCP_CLIENT_ID: mcpClientId,
    MCP_CLIENT_SECRET: mcpClientSecret,
    MCP_JWT_SECRET: mcpJwtSecret,
    MCP_SETUP_TOKEN: mcpSetupToken,
    ALLOWED_EMAIL_DOMAINS: allowedDomains,
  };

  for (const [secKey, secVal] of Object.entries(secretsToCreate)) {
    try {
      execSync(`gcloud secrets describe ${secKey} --project=${projectId}`, { stdio: ['pipe', 'pipe', 'ignore'] });
    } catch {
      runCommandSilent(`gcloud secrets create ${secKey} --replication-policy=automatic --project=${projectId}`);
      console.log(`  + Created secret container: ${secKey}`);
    }

    try {
      // Add version
      const tmpFile = path.join(process.cwd(), `.tmp_${secKey}`);
      fs.writeFileSync(tmpFile, secVal, 'utf8');
      execSync(`gcloud secrets versions add ${secKey} --data-file="${tmpFile}" --project=${projectId}`, {
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      console.log(`  ✓ Written ${secKey} to Secret Manager`);
    } catch (err: any) {
      console.error(`  ⚠️ Error persisting ${secKey}:`, err.message);
    }
  }

  // Grant Secret Manager access to Cloud Run default compute service account
  try {
    const projectNumber = runCommandSilent(`gcloud projects describe ${projectId} --format="value(projectNumber)"`);
    if (projectNumber) {
      const saEmail = `${projectNumber}-compute@developer.gserviceaccount.com`;
      execSync(
        `gcloud projects add-iam-policy-binding ${projectId} --member="serviceAccount:${saEmail}" --role="roles/secretmanager.secretAccessor"`,
        { stdio: ['pipe', 'pipe', 'ignore'] }
      );
      execSync(
        `gcloud projects add-iam-policy-binding ${projectId} --member="serviceAccount:${saEmail}" --role="roles/datastore.user"`,
        { stdio: ['pipe', 'pipe', 'ignore'] }
      );
      execSync(
        `gcloud projects add-iam-policy-binding ${projectId} --member="serviceAccount:${saEmail}" --role="roles/monitoring.viewer"`,
        { stdio: ['pipe', 'pipe', 'ignore'] }
      );
      console.log(`  ✓ Assigned secretAccessor & datastore.user IAM roles to service account ${saEmail}`);
    }
  } catch (_err) {
    // Ignore IAM warning
  }

  console.log('\n' + '='.repeat(80));
  console.log(`⚡ STEP 4/4: Building & Deploying Container to Google Cloud Run (${selectedRegion})...`);
  console.log('='.repeat(80));

  const deployArgs = [
    'run',
    'deploy',
    serviceName,
    '--source',
    '.',
    `--region=${selectedRegion}`,
    `--project=${projectId}`,
    `--set-env-vars=GCP_PROJECT_ID=${projectId},FIRESTORE_DATABASE_ID=${selectedDatabase},GCP_REGION=${selectedRegion},NODE_ENV=production`,
    `--set-secrets=MCP_CLIENT_ID=MCP_CLIENT_ID:latest,MCP_CLIENT_SECRET=MCP_CLIENT_SECRET:latest,MCP_JWT_SECRET=MCP_JWT_SECRET:latest,ALLOWED_EMAIL_DOMAINS=ALLOWED_EMAIL_DOMAINS:latest`,
    '--concurrency=80',
    '--allow-unauthenticated',
    '--clear-base-image',
  ];

  const deployCode = await runCommandStream('gcloud', deployArgs);
  if (deployCode !== 0) {
    console.error(`\n❌ Cloud Run deployment exited with error code ${deployCode}`);
    process.exit(deployCode);
  }

  // Resolve Cloud Run deployed URL
  const deployedUrl = runCommandSilent(
    `gcloud run services describe ${serviceName} --region=${selectedRegion} --project=${projectId} --format="value(status.url)"`
  );

  // Write local .env file
  const localEnvContent = `# Auto-generated by bootstrap CLI on ${new Date().toISOString()}
GCP_PROJECT_ID=${projectId}
GCP_REGION=${selectedRegion}
PORT=3000
NODE_ENV=development
FIRESTORE_DATABASE_ID=${selectedDatabase}
ALLOWED_EMAIL_DOMAINS=${allowedDomains}
MCP_CLIENT_ID=${mcpClientId}
MCP_CLIENT_SECRET=${mcpClientSecret}
MCP_JWT_SECRET=${mcpJwtSecret}
MCP_SETUP_TOKEN=${mcpSetupToken}
`;
  fs.writeFileSync(path.join(process.cwd(), '.env'), localEnvContent, 'utf8');
  console.log('✓ Created local `.env` configuration file.');

  // =========================================================================
  // SUCCESS HANDOVER
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('🎉 DEPLOYMENT COMPLETE! ENTERPRISE MCP GATEWAY IS LIVE');
  console.log('='.repeat(80));

  console.log(`\n  Live Cloud Run Service URL: \x1b[32m${deployedUrl}\x1b[0m\n`);

  console.log('─'.repeat(80));
  console.log('✨ GOOGLE GEMINI ENTERPRISE CONFIGURATION BLUEPRINT:');
  console.log('─'.repeat(80));
  console.log(`  • MCP Server URL:    ${deployedUrl}/mcp`);
  console.log(`  • Auth Type:         OAuth 2.0 (PKCE)`);
  console.log(`  • Authorization URL: ${deployedUrl}/oauth/authorize`);
  console.log(`  • Token URL:         ${deployedUrl}/oauth/token`);
  console.log(`  • Client ID:         ${mcpClientId}`);
  console.log(`  • Client Secret:     ${mcpClientSecret}`);
  console.log(`  • Scopes:            all`);
  console.log('─'.repeat(80));

  const magicSetupUrl = `${deployedUrl}/admin/setup?token=${mcpSetupToken}`;
  console.log('\n👉 1-CLICK ADMIN PORTAL SETUP LINK:');
  console.log(`   \x1b[36m${magicSetupUrl}\x1b[0m\n`);
  console.log('='.repeat(80) + '\n');
}

main().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
