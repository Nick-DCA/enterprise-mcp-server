import assert from 'assert';
import { createApp } from '../../src/server/app.js';
import { runtimeConfig } from '../../src/config/runtimeConfig.js';
import { SESSION_COOKIE_NAME } from '../../src/server/middleware/adminAuth.js';

async function runServicesApiTests() {
  console.log('\n--- Running Services & Runtime Config API Tests ---');

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
      sessionId: 'test_session_services_123',
      userEmail: 'admin@company.com',
      fullName: 'Admin User',
      role: 'ADMIN',
    });

    const authHeaders = {
      Cookie: `${SESSION_COOKIE_NAME}=${session.sessionId}`,
      'Content-Type': 'application/json',
    };

    // 2. GET /api/services
    console.log('1. Testing GET /api/services...');
    const listRes = await fetch(`${baseUrl}/api/services`, { headers: authHeaders });
    assert.strictEqual(listRes.status, 200);
    const listBody = (await listRes.json()) as any;
    assert.strictEqual(listBody.success, true);
    assert.ok(listBody.totalServices >= 4, `Expected at least 4 services, received: ${listBody.totalServices}`);
    assert.ok(listBody.services.some((s: any) => s.serviceId === 'xero'));
    assert.ok(listBody.services.some((s: any) => s.serviceId === 'bigquery'));
    assert.ok(listBody.services.some((s: any) => s.serviceId === 'firestore'));
    assert.ok(listBody.services.some((s: any) => s.serviceId === 'sagehr'));
    console.log('   ✓ Successfully listed services with tool counts');

    // 3. PATCH /api/services/bigquery/toggle -> Disable BigQuery
    console.log('2. Testing PATCH /api/services/bigquery/toggle (Disable)...');
    const toggleRes = await fetch(`${baseUrl}/api/services/bigquery/toggle`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ enabled: false }),
    });
    assert.strictEqual(toggleRes.status, 200);
    const toggleBody = (await toggleRes.json()) as any;
    assert.strictEqual(toggleBody.success, true);
    assert.strictEqual(toggleBody.service.enabled, false);

    // Verify runtimeConfig reflects disabled state
    const isBqEnabled = await runtimeConfig.isServiceEnabled('bigquery');
    assert.strictEqual(isBqEnabled, false, 'BigQuery should be disabled in runtimeConfig');
    console.log('   ✓ Service toggle updated and verified in runtime state');

    // Re-enable BigQuery
    await fetch(`${baseUrl}/api/services/bigquery/toggle`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ enabled: true }),
    });

    // 4. PUT /api/services/firestore/config -> Update settings
    console.log('3. Testing PUT /api/services/firestore/config...');
    const configRes = await fetch(`${baseUrl}/api/services/firestore/config`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        settings: {
          allowedCollections: 'orders,invoices',
          allowWrites: true,
          excludedFields: 'password,token,apiKey,ssn,secret_notes',
        },
      }),
    });
    assert.strictEqual(configRes.status, 200);
    const configBody = (await configRes.json()) as any;
    assert.strictEqual(configBody.success, true);
    assert.strictEqual(configBody.service.settings.allowedCollections, 'orders,invoices');
    assert.strictEqual(configBody.service.settings.allowWrites, true);
    console.log('   ✓ Firestore runtime settings successfully updated');

    // 5. POST /api/services/firestore/test -> Connectivity Diagnostic Probe
    console.log('4. Testing POST /api/services/firestore/test...');
    const testRes = await fetch(`${baseUrl}/api/services/firestore/test`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.strictEqual(testRes.status, 200);
    const testBody = (await testRes.json()) as any;
    assert.strictEqual(testBody.serviceId, 'firestore');
    assert.ok(typeof testBody.latencyMs === 'number');
    assert.ok(testBody.status === 'HEALTHY' || testBody.status === 'WARNING' || testBody.status === 'ERROR');
    console.log(`   ✓ Service test executed (Status: ${testBody.status}, Latency: ${testBody.latencyMs}ms)`);

    console.log('--- All Services & Runtime Config Tests Passed! ---\n');
  } finally {
    server.close();
  }
}

runServicesApiTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Services API Test Failed:', err);
    process.exit(1);
  });
