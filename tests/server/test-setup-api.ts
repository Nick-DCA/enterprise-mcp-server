import assert from 'assert';
import { createApp } from '../../src/server/app.js';
import { getOrCreateSetupToken, SETUP_SESSION_COOKIE } from '../../src/config/setupToken.js';
import { runtimeConfig } from '../../src/config/runtimeConfig.js';
import { SESSION_COOKIE_NAME } from '../../src/server/middleware/adminAuth.js';

async function runSetupApiTests() {
  console.log('\n--- Running Setup & Initialisation API Tests ---');

  // Reset runtime config to uninitialized for testing
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.MCP_CLIENT_ID;
  delete process.env.BYPASS_SETUP;
  process.env.NODE_ENV = 'test';
  runtimeConfig.clearCache();
  await runtimeConfig.setInstallationMetadata({
    initializationStatus: 'UNINITIALIZED',
    firestoreDatabaseId: 'mcp-gateway-db',
  });

  const app = createApp();
  let server: any;
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. GET /api/setup/status
    console.log('1. Testing GET /api/setup/status...');
    const statusRes = await fetch(`${baseUrl}/api/setup/status`);
    assert.strictEqual(statusRes.status, 200);
    const statusBody = (await statusRes.json()) as any;
    assert.strictEqual(statusBody.success, true);
    assert.ok(statusBody.detectedProjectId);
    assert.ok(statusBody.serviceAccountEmail);
    assert.ok(statusBody.callbackUri.includes('/api/auth/callback'));
    console.log('   ✓ Status returned detected GCP Project & Callback URI');

    // 2. POST /api/setup/verify-token with invalid token
    console.log('2. Testing POST /api/setup/verify-token with invalid token...');
    const invalidRes = await fetch(`${baseUrl}/api/setup/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'wrong-token-12345' }),
    });
    assert.strictEqual(invalidRes.status, 401);
    console.log('   ✓ Invalid token rejected with HTTP 401');

    // 3. POST /api/setup/verify-token with valid bootstrap token
    console.log('3. Testing POST /api/setup/verify-token with valid token...');
    const validToken = getOrCreateSetupToken();
    const verifyRes = await fetch(`${baseUrl}/api/setup/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: validToken }),
    });
    assert.strictEqual(verifyRes.status, 200);
    const verifyBody = (await verifyRes.json()) as any;
    assert.strictEqual(verifyBody.success, true);

    const setCookie = verifyRes.headers.get('set-cookie');
    assert.ok(setCookie && setCookie.includes(SETUP_SESSION_COOKIE));
    console.log('   ✓ Valid bootstrap token accepted and setup session cookie issued');

    // Extract setup cookie
    const cookieMatch = setCookie.match(new RegExp(`${SETUP_SESSION_COOKIE}=([^;]+)`));
    const setupCookie = cookieMatch ? cookieMatch[0] : `${SETUP_SESSION_COOKIE}=${validToken}`;

    // 4. POST /api/setup/gcp-diagnostics
    console.log('4. Testing POST /api/setup/gcp-diagnostics...');
    const diagRes = await fetch(`${baseUrl}/api/setup/gcp-diagnostics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: setupCookie,
      },
      body: JSON.stringify({ projectId: 'test-project-123' }),
    });
    assert.strictEqual(diagRes.status, 200);
    const diagBody = (await diagRes.json()) as any;
    assert.strictEqual(diagBody.success, true);
    assert.ok(Array.isArray(diagBody.diagnostics.permissions));
    assert.ok(diagBody.diagnostics.remediationCommands.length > 0);
    assert.ok(diagBody.diagnostics.remediationCommands[0].includes('gcloud projects add-iam-policy-binding'));
    console.log('   ✓ GCP IAM diagnostic probe ran and generated gcloud remediation commands');

    // 5. POST /api/setup/init-firestore
    console.log('5. Testing POST /api/setup/init-firestore with custom named database...');
    const initFsRes = await fetch(`${baseUrl}/api/setup/init-firestore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: setupCookie,
      },
      body: JSON.stringify({ databaseId: 'mcp-gateway-db' }),
    });
    assert.strictEqual(initFsRes.status, 200);
    const initFsBody = (await initFsRes.json()) as any;
    assert.strictEqual(initFsBody.success, true);
    assert.strictEqual(initFsBody.databaseId, 'mcp-gateway-db');
    console.log('   ✓ Custom named database initialized and verified');

    // 6. POST /api/setup/configure-gws-oauth
    console.log('6. Testing POST /api/setup/configure-gws-oauth...');
    const gwsRes = await fetch(`${baseUrl}/api/setup/configure-gws-oauth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: setupCookie,
      },
      body: JSON.stringify({
        googleClientId: 'test-client-id-123.apps.googleusercontent.com',
        googleClientSecret: 'test-client-secret-xyz',
        allowedDomains: 'company.com,corp.com',
        adminEmail: 'superadmin@company.com',
        adminName: 'Super Admin',
      }),
    });
    assert.strictEqual(gwsRes.status, 200);
    const gwsBody = (await gwsRes.json()) as any;
    assert.strictEqual(gwsBody.success, true);
    console.log('   ✓ Google Workspace OAuth credentials securely persisted');

    // 7. POST /api/setup/complete
    console.log('7. Testing POST /api/setup/complete...');
    const completeRes = await fetch(`${baseUrl}/api/setup/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: setupCookie,
      },
      body: JSON.stringify({
        adminEmail: 'superadmin@company.com',
        adminName: 'Super Admin',
        setupMode: 'QUICKSTART_CORE',
      }),
    });
    assert.strictEqual(completeRes.status, 200);
    const completeBody = (await completeRes.json()) as any;
    assert.strictEqual(completeBody.success, true);

    const adminCookieHeader = completeRes.headers.get('set-cookie');
    assert.ok(adminCookieHeader && adminCookieHeader.includes(SESSION_COOKIE_NAME));
    console.log('   ✓ Setup marked as COMPLETED and production admin session cookie issued');

    // Verify platform is now in completed state
    const isCompleted = await runtimeConfig.isSetupCompleted();
    assert.strictEqual(isCompleted, true);
    console.log('   ✓ runtimeConfig.isSetupCompleted() returned true');

    console.log('--- All Setup & Initialisation API Tests Passed! ---\n');
  } finally {
    server.close();
  }
}

runSetupApiTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Setup API Test Failed:', err);
    process.exit(1);
  });
