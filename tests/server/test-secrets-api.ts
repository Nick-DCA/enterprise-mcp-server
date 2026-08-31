import assert from 'assert';
import { createApp } from '../../src/server/app.js';
import { runtimeConfig } from '../../src/config/runtimeConfig.js';
import { SESSION_COOKIE_NAME } from '../../src/server/middleware/adminAuth.js';
import { getSecretValue } from '../../src/config/secretManager.js';

async function runSecretsApiTests() {
  console.log('\n--- Running Secrets Vault API Tests ---');

  const app = createApp();
  let server: any;
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Create admin user & session
    await runtimeConfig.createUserAccess({
      userEmail: 'admin@company.com',
      fullName: 'Admin User',
      isAdmin: true,
      isEnabled: true,
      allowedServices: ['xero', 'bigquery', 'firestore', 'sagehr'],
      readOnlyOnly: false,
    }, 'test-init');

    const session = await runtimeConfig.createSession({
      sessionId: 'test_session_secrets_123',
      userEmail: 'admin@company.com',
      fullName: 'Admin User',
      role: 'ADMIN',
    });

    const authHeaders = {
      Cookie: `${SESSION_COOKIE_NAME}=${session.sessionId}`,
      'Content-Type': 'application/json',
    };

    // 1. GET /api/secrets/status
    console.log('1. Testing GET /api/secrets/status checklist...');
    const statusRes = await fetch(`${baseUrl}/api/secrets/status`, { headers: authHeaders });
    assert.strictEqual(statusRes.status, 200);
    const statusBody = (await statusRes.json()) as any;
    assert.strictEqual(statusBody.success, true);
    assert.ok(statusBody.totalCount >= 14, 'Should contain full secret inventory');
    assert.ok(Array.isArray(statusBody.secrets));

    // Zero-Exposure Verification: Verify no secret item contains any plaintext value
    for (const secret of statusBody.secrets) {
      assert.strictEqual(secret.value, undefined, 'Secret value must never be exposed');
      assert.strictEqual(secret.secretValue, undefined, 'Secret value must never be exposed');
      assert.strictEqual(secret.payload, undefined, 'Secret payload must never be exposed');
    }
    console.log('   ✓ Secret status matrix returned with zero-exposure security verified');

    // 2. POST /api/secrets/update -> Update SAGE_HR_SUBDOMAIN
    console.log('2. Testing POST /api/secrets/update...');
    const updateRes = await fetch(`${baseUrl}/api/secrets/update`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        secretKey: 'SAGE_HR_SUBDOMAIN',
        secretValue: 'testcompanycorp',
      }),
    });

    assert.strictEqual(updateRes.status, 200);
    const updateBody = (await updateRes.json()) as any;
    assert.strictEqual(updateBody.success, true);
    assert.strictEqual(updateBody.secretKey, 'SAGE_HR_SUBDOMAIN');

    // Verify secret value is loaded in backend
    const resolvedVal = await getSecretValue('SAGE_HR_SUBDOMAIN');
    assert.strictEqual(resolvedVal, 'testcompanycorp');
    console.log('   ✓ Secret updated and verified in backend secret loader');

    // 3. Test rejection of invalid secret key
    console.log('3. Testing invalid secret key rejection...');
    const invalidRes = await fetch(`${baseUrl}/api/secrets/update`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        secretKey: 'RANDOM_MALICIOUS_KEY',
        secretValue: 'some_value',
      }),
    });
    assert.strictEqual(invalidRes.status, 400);
    console.log('   ✓ Invalid key correctly rejected with HTTP 400');

    console.log('--- All Secrets Vault Tests Passed! ---\n');
  } finally {
    server.close();
  }
}

runSecretsApiTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Secrets API Test Failed:', err);
    process.exit(1);
  });
