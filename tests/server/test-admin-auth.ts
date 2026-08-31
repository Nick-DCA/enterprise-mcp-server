import assert from 'assert';
import { createApp } from '../../src/server/app.js';
import { runtimeConfig } from '../../src/config/runtimeConfig.js';
import { SESSION_COOKIE_NAME } from '../../src/server/middleware/adminAuth.js';

async function runAdminAuthTests() {
  console.log('\n--- Running Admin Authentication & Session Tests ---');
  process.env.NODE_ENV = 'test';
  runtimeConfig.clearCache();
  await runtimeConfig.createUserAccess({
    userEmail: 'testadmin@company.com',
    fullName: 'Test Admin',
    isAdmin: true,
    isEnabled: true,
    allowedServices: ['xero', 'bigquery', 'firestore', 'sagehr'],
    readOnlyOnly: false,
  }, 'test-init').catch(() => {});

  const app = createApp();
  let server: any;
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Unauthenticated request to /api/auth/me should return 401
    console.log('1. Testing unauthenticated request to protected admin endpoint...');
    const unauthRes = await fetch(`${baseUrl}/api/auth/me`);
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request should return HTTP 401');
    const unauthBody = (await unauthRes.json()) as any;
    assert.strictEqual(unauthBody.error, 'Unauthorized');
    console.log('   ✓ Unauthenticated request rejected with HTTP 401');

    // 2. Dev login to create a valid admin session
    console.log('2. Testing dev-login session creation...');
    const devLoginRes = await fetch(`${baseUrl}/api/auth/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'testadmin@company.com',
        fullName: 'Test Admin',
      }),
    });

    assert.strictEqual(devLoginRes.status, 200, 'Dev login should succeed with HTTP 200');
    const devLoginBody = (await devLoginRes.json()) as any;
    assert.strictEqual(devLoginBody.success, true);
    assert.strictEqual(devLoginBody.user.email, 'testadmin@company.com');
    assert.strictEqual(devLoginBody.user.isAdmin, true);

    const setCookieHeader = devLoginRes.headers.get('set-cookie');
    assert.ok(setCookieHeader, 'Set-Cookie header should be present in login response');
    assert.ok(setCookieHeader.includes(SESSION_COOKIE_NAME), 'Session cookie name should match __session');
    console.log('   ✓ Session created and Set-Cookie issued');

    // Extract cookie value
    const cookieMatch = setCookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    assert.ok(cookieMatch, 'Should parse sessionId from cookie');
    const sessionId = cookieMatch[1];

    // 3. Authenticated request to /api/auth/me using Cookie
    console.log('3. Testing /api/auth/me with session cookie...');
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${sessionId}`,
      },
    });

    assert.strictEqual(meRes.status, 200, '/api/auth/me should return HTTP 200 with valid cookie');
    const meBody = (await meRes.json()) as any;
    assert.strictEqual(meBody.email, 'testadmin@company.com');
    assert.strictEqual(meBody.isAdmin, true);
    assert.strictEqual(meBody.sessionId, sessionId);
    console.log('   ✓ Admin user context resolved from session');

    // 4. Authenticated request using Bearer header fallback
    console.log('4. Testing authorization using Bearer header...');
    const bearerRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${sessionId}`,
      },
    });
    assert.strictEqual(bearerRes.status, 200, '/api/auth/me should accept Bearer token with sessionId');
    console.log('   ✓ Bearer header fallback accepted');

    // 5. Logout should revoke session
    console.log('5. Testing logout and session revocation...');
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${sessionId}`,
      },
    });
    assert.strictEqual(logoutRes.status, 200);

    // Verify session is now expired/revoked
    const afterLogoutRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${sessionId}`,
      },
    });
    assert.strictEqual(afterLogoutRes.status, 401, 'Revoked session should return HTTP 401');
    const afterLogoutCookie = afterLogoutRes.headers.get('set-cookie');
    assert.ok(afterLogoutCookie, 'Should issue Set-Cookie clearance header on 401');
    console.log('   ✓ Session successfully revoked and cookie cleared');

    // 5. Production dev-login block check
    console.log('5. Testing production dev-login lockout...');
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const prodDevLoginRes = await fetch(`${baseUrl}/api/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'attacker@company.com',
          fullName: 'Attacker',
        }),
      });
      assert.strictEqual(prodDevLoginRes.status, 403, 'Dev-login must return HTTP 403 in production');
      console.log('   ✓ Dev-login strictly rejected with HTTP 403 in production');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }

    console.log('--- All Admin Authentication Tests Passed! ---\n');
  } finally {
    server.close();
  }
}

runAdminAuthTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Admin Auth Test Failed:', err);
    process.exit(1);
  });
