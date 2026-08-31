import assert from 'assert';
import { createApp } from '../../src/server/app.js';
import { runtimeConfig } from '../../src/config/runtimeConfig.js';
import { SESSION_COOKIE_NAME } from '../../src/server/middleware/adminAuth.js';

async function runUsersApiTests() {
  console.log('\n--- Running User Access & Permissions API Tests ---');

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
      fullName: 'Master Admin',
      isAdmin: true,
      isEnabled: true,
      allowedServices: ['xero', 'bigquery', 'firestore', 'sagehr'],
      readOnlyOnly: false,
    }, 'test-init');

    const session = await runtimeConfig.createSession({
      sessionId: 'test_session_users_123',
      userEmail: 'admin@company.com',
      fullName: 'Master Admin',
      role: 'ADMIN',
    });

    const authHeaders = {
      Cookie: `${SESSION_COOKIE_NAME}=${session.sessionId}`,
      'Content-Type': 'application/json',
    };

    // 1. GET /api/users
    console.log('1. Testing GET /api/users list...');
    const listRes = await fetch(`${baseUrl}/api/users`, { headers: authHeaders });
    assert.strictEqual(listRes.status, 200);
    const listBody = (await listRes.json()) as any;
    assert.strictEqual(listBody.success, true);
    assert.ok(listBody.users.length >= 1);
    console.log(`   ✓ Found ${listBody.totalUsers} configured users in access list`);

    // 2. POST /api/users -> Add new user
    console.log('2. Testing POST /api/users (Add user)...');
    const addRes = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        userEmail: 'analyst@company.com',
        fullName: 'Alex Analyst',
        isAdmin: false,
        isEnabled: true,
        allowedServices: ['xero', 'bigquery'],
        readOnlyOnly: true,
      }),
    });

    assert.strictEqual(addRes.status, 201);
    const addBody = (await addRes.json()) as any;
    assert.strictEqual(addBody.user.userEmail, 'analyst@company.com');
    assert.strictEqual(addBody.user.readOnlyOnly, true);
    assert.deepStrictEqual(addBody.user.allowedServices, ['xero', 'bigquery']);
    console.log('   ✓ User created with custom permissions and read-only flag');

    // 3. PUT /api/users/:email/permissions -> Update permissions
    console.log('3. Testing PUT /api/users/:email/permissions...');
    const updatePermsRes = await fetch(`${baseUrl}/api/users/analyst@company.com/permissions`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({
        fullName: 'Alexander Analyst Senior',
        allowedServices: ['xero', 'bigquery', 'firestore'],
        readOnlyOnly: false,
      }),
    });

    assert.strictEqual(updatePermsRes.status, 200);
    const updatePermsBody = (await updatePermsRes.json()) as any;
    assert.strictEqual(updatePermsBody.user.fullName, 'Alexander Analyst Senior');
    assert.strictEqual(updatePermsBody.user.readOnlyOnly, false);
    assert.ok(updatePermsBody.user.allowedServices.includes('firestore'));
    console.log('   ✓ User permissions updated');

    // 4. PATCH /api/users/:email/toggle -> Disable user (and auto-evict sessions)
    console.log('4. Testing PATCH /api/users/:email/toggle (with auto session eviction)...');
    // Create an active session for analyst
    await runtimeConfig.createSession({
      sessionId: 'session_analyst_test_1',
      userEmail: 'analyst@company.com',
      fullName: 'Alex Analyst',
      role: 'USER',
    });
    const checkAnalystSessBefore = await runtimeConfig.getSession('session_analyst_test_1');
    assert.ok(checkAnalystSessBefore !== null);

    const toggleRes = await fetch(`${baseUrl}/api/users/analyst@company.com/toggle`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ isEnabled: false }),
    });

    assert.strictEqual(toggleRes.status, 200);
    const toggleBody = (await toggleRes.json()) as any;
    assert.strictEqual(toggleBody.user.isEnabled, false);
    
    // Verify session was auto-evicted upon being disabled
    const checkAnalystSessAfter = await runtimeConfig.getSession('session_analyst_test_1');
    assert.strictEqual(checkAnalystSessAfter, null);
    console.log('   ✓ User access disabled and active sessions automatically evicted');

    // 5. Verify Self-Protection: Admin cannot disable, delete, or self-demote own account
    console.log('5. Testing self-protection guardrails (disable, delete, self-demote)...');
    const selfToggleRes = await fetch(`${baseUrl}/api/users/admin@company.com/toggle`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ isEnabled: false }),
    });
    assert.strictEqual(selfToggleRes.status, 400);

    const selfDeleteRes = await fetch(`${baseUrl}/api/users/admin@company.com`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    assert.strictEqual(selfDeleteRes.status, 400);

    const selfDemoteRes = await fetch(`${baseUrl}/api/users/admin@company.com/permissions`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ isAdmin: false }),
    });
    assert.strictEqual(selfDemoteRes.status, 400);
    const selfDemoteBody = (await selfDemoteRes.json()) as any;
    assert.strictEqual(selfDemoteBody.error, 'SelfActionDisallowed');
    console.log('   ✓ Self-protection prevented administrator lockout and self-demotion');

    // 6. Test POST /api/users/:email/revoke-sessions
    console.log('6. Testing POST /api/users/:email/revoke-sessions (Targeted Kick Out)...');
    await runtimeConfig.createSession({
      sessionId: 'session_analyst_test_2',
      userEmail: 'analyst@company.com',
      fullName: 'Alex Analyst',
      role: 'USER',
    });
    const checkSess2Before = await runtimeConfig.getSession('session_analyst_test_2');
    assert.ok(checkSess2Before !== null);

    const revokeUserRes = await fetch(`${baseUrl}/api/users/analyst@company.com/revoke-sessions`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.strictEqual(revokeUserRes.status, 200);
    const revokeUserBody = (await revokeUserRes.json()) as any;
    assert.strictEqual(revokeUserBody.success, true);
    assert.ok(revokeUserBody.revokedCount >= 1);

    const checkSess2After = await runtimeConfig.getSession('session_analyst_test_2');
    assert.strictEqual(checkSess2After, null);
    console.log('   ✓ Targeted user sessions revoked successfully');

    // 7. DELETE /api/users/:email -> Delete analyst user
    console.log('7. Testing DELETE /api/users/:email...');
    const deleteRes = await fetch(`${baseUrl}/api/users/analyst@company.com`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    assert.strictEqual(deleteRes.status, 200);

    const checkDeleted = await runtimeConfig.getUserAccess('analyst@company.com');
    assert.strictEqual(checkDeleted, null);
    console.log('   ✓ User successfully removed from platform');

    console.log('--- All User Access & Permissions Tests Passed! ---\n');
  } finally {
    server.close();
  }
}

runUsersApiTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Users API Test Failed:', err);
    process.exit(1);
  });
