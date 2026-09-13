import assert from 'assert';
import { createApp } from '../../src/server/app.js';
import { runtimeConfig } from '../../src/config/runtimeConfig.js';
import { SESSION_COOKIE_NAME } from '../../src/server/middleware/adminAuth.js';
import { RequestContext } from '../../src/server/context.js';
import { userLogService, sanitizeLogPayload } from '../../src/server/services/userLogService.js';
import type { UserLogTraceDocument, UpstreamApiCallSpan } from '../../src/server/types/logs.js';

async function runUserLogsTests() {
  console.log('\n--- Running User Logs Telemetry & Tracing Engine Tests ---');

  // =========================================================================
  // 1. Unit Tests: Context Propagation & Upstream Spans
  // =========================================================================
  console.log('1. Testing RequestContext trace isolation & upstream span recording...');
  const traceId1 = 'mcp_trace_test_001';
  await RequestContext.run(
    {
      traceId: traceId1,
      userEmail: 'alice@company.com',
      clientId: 'gemini-enterprise-mcp',
      upstreamSpans: [],
    },
    () => {
      assert.strictEqual(RequestContext.getTraceId(), traceId1);
      assert.strictEqual(RequestContext.getUserEmail(), 'alice@company.com');
      assert.strictEqual(RequestContext.isHumanUser(), true);

      const span1: UpstreamApiCallSpan = {
        spanId: 'span_xero_01',
        serviceId: 'xero',
        endpoint: 'GET /Invoices',
        httpMethod: 'GET',
        httpStatus: 200,
        durationMs: 145,
        rateLimitRemaining: 58,
        quotaInfo: 'Quota: 58/60',
        timestamp: new Date().toISOString(),
      };
      RequestContext.recordSpan(span1);

      const spans = RequestContext.getSpans();
      assert.strictEqual(spans.length, 1);
      assert.strictEqual(spans[0].spanId, 'span_xero_01');
      assert.strictEqual(spans[0].rateLimitRemaining, 58);
    }
  );

  // Assert context is cleared outside of run()
  assert.strictEqual(RequestContext.getTraceId(), undefined);
  assert.strictEqual(RequestContext.getSpans().length, 0);
  console.log('   ✓ RequestContext correctly tracks traceId and records isolated child spans');

  // =========================================================================
  // 2. Unit Tests: Zero-Token Contextual Redaction Format
  // =========================================================================
  console.log('2. Testing Zero-Token Contextual Redaction Engine [REDACTED - TOOL_NAME - TOKEN_TYPE]...');

  // A. Slack Tokens
  const slackPayload = {
    userToken: 'xoxp-1234567890-abcdefg-hijklmn',
    botToken: 'xoxb-9876543210-zyxwvut-srqponm',
    refreshToken: 'xoxr-1122334455-aabbccdd-eeffgghh',
    query: 'financial report 2026',
  };
  const redactedSlack = sanitizeLogPayload(slackPayload, 'slack-federated-search');
  assert.strictEqual(redactedSlack.userToken, '[REDACTED - slack-federated-search - xoxp]');
  assert.strictEqual(redactedSlack.botToken, '[REDACTED - slack-federated-search - xoxb]');
  assert.strictEqual(redactedSlack.refreshToken, '[REDACTED - slack-federated-search - xoxr]');
  assert.strictEqual(redactedSlack.query, 'financial report 2026'); // non-sensitive kept intact

  // B. JWT Bearer & Raw JWT
  const jwtPayload = {
    authHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFsaWNlIn0.signature_abc123',
    endpoint: 'https://api.xro/2.0/Invoices',
  };
  const redactedJwt = sanitizeLogPayload(jwtPayload, 'xero-list-invoices');
  assert.ok(redactedJwt.authHeader.includes('[REDACTED - xero-list-invoices - jwt]'));
  assert.strictEqual(redactedJwt.endpoint, 'https://api.xro/2.0/Invoices');

  // C. Key-based contextual secrets (client_secret, private_key, password, api_key)
  const secretsPayload = {
    client_secret: 'top_secret_client_secret_xyz',
    private_key: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----',
    api_key: 'sh_live_key_998877',
    password: 'SuperSecretPassword123!',
    safeConfig: 'enabled',
  };
  const redactedSecrets = sanitizeLogPayload(secretsPayload, 'system-secrets');
  assert.strictEqual(redactedSecrets.client_secret, '[REDACTED - system-secrets - client_secret]');
  assert.strictEqual(redactedSecrets.private_key, '[REDACTED - system-secrets - private_key]');
  assert.strictEqual(redactedSecrets.api_key, '[REDACTED - system-secrets - api_key]');
  assert.strictEqual(redactedSecrets.password, '[REDACTED - system-secrets - password]');
  assert.strictEqual(redactedSecrets.safeConfig, 'enabled');
  console.log('   ✓ Contextual redactions correctly formatted: [REDACTED - <TOOL_NAME> - <TOKEN_TYPE>]');

  // =========================================================================
  // 3. Unit Tests: Payload Truncation Guard
  // =========================================================================
  console.log('3. Testing 500 KB Payload Truncation Guard for Firestore Document Protection...');
  const hugeString = 'X'.repeat(600000);
  const truncated = sanitizeLogPayload(hugeString, 'bigquery-export');
  assert.ok(truncated.includes('... [TRUNCATED: Response exceeded maximum log ceiling]'));
  assert.ok(truncated.length < 505000);
  console.log('   ✓ Oversized payloads gracefully truncated with ceiling guard notice');

  // =========================================================================
  // 4. Unit Tests: In-Memory Circular Buffer Bounds (Cap 300)
  // =========================================================================
  console.log('4. Testing Circular Buffer FIFO eviction (capped at 300)...');
  userLogService.clearBuffer();

  for (let i = 1; i <= 350; i++) {
    const traceDoc: UserLogTraceDocument = {
      traceId: `mcp_trace_bulk_${i}`,
      timestamp: new Date().toISOString(),
      timestampEpochMs: Date.now() + i,
      userEmail: `user_${i % 5}@company.com`,
      clientId: 'gemini-enterprise-mcp',
      isHumanUser: true,
      jsonrpcMethod: 'tools/call',
      toolName: 'xero-list-invoices',
      domain: 'accounting',
      status: 'SUCCESS',
      durationMs: 120,
      responseChars: 500,
      upstreamSpans: [],
      upstreamCallsCount: 0,
    };
    userLogService.recordTrace(traceDoc);
  }

  const { total, traces } = await userLogService.getTraces({ limit: 350 });
  assert.strictEqual(total, 300, `Expected exactly 300 traces in buffer, got ${total}`);
  // Most recent should be bulk_350, oldest should be bulk_51 (1-50 evicted)
  assert.strictEqual(traces[0].traceId, 'mcp_trace_bulk_350');
  console.log('   ✓ Buffer strictly maintained at 300 items with FIFO eviction');

  // =========================================================================
  // 5. Integration Tests: HTTP Server Setup & Admin Authentication Gating
  // =========================================================================
  console.log('5. Testing REST API Gating (/api/logs/user/* requireAdminAuth)...');
  const app = createApp();
  let server: any;
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 5A. Unauthenticated request -> 401
    const unauthRes = await fetch(`${baseUrl}/api/logs/user`);
    assert.strictEqual(unauthRes.status, 401);

    // 5B. Non-admin user session -> 403
    await runtimeConfig.createUserAccess({
      userEmail: 'regular@company.com',
      fullName: 'Regular User',
      isAdmin: false,
      isEnabled: true,
      allowedServices: ['xero'],
      readOnlyOnly: true,
    }, 'test-init');

    const nonAdminSession = await runtimeConfig.createSession({
      sessionId: 'sess_regular_user_123',
      userEmail: 'regular@company.com',
      fullName: 'Regular User',
      role: 'USER',
    });

    const nonAdminRes = await fetch(`${baseUrl}/api/logs/user`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${nonAdminSession.sessionId}` },
    });
    assert.strictEqual(nonAdminRes.status, 403);

    // 5C. Admin user session -> 200
    await runtimeConfig.createUserAccess({
      userEmail: 'admin@company.com',
      fullName: 'Admin User',
      isAdmin: true,
      isEnabled: true,
      allowedServices: ['xero', 'bigquery', 'firestore', 'sagehr', 'slack'],
      readOnlyOnly: false,
    }, 'test-init');

    const adminSession = await runtimeConfig.createSession({
      sessionId: 'sess_admin_user_456',
      userEmail: 'admin@company.com',
      fullName: 'Admin User',
      role: 'ADMIN',
    });

    const adminHeaders = {
      Cookie: `${SESSION_COOKIE_NAME}=${adminSession.sessionId}`,
      'Content-Type': 'application/json',
    };

    const adminRes = await fetch(`${baseUrl}/api/logs/user`, { headers: adminHeaders });
    assert.strictEqual(adminRes.status, 200);
    const adminBody = (await adminRes.json()) as any;
    assert.strictEqual(adminBody.success, true);
    assert.ok(Array.isArray(adminBody.traces));
    console.log('   ✓ Protected endpoints reject unauthenticated (401) and non-admin (403), accept admin (200)');

    // =========================================================================
    // 6. Integration Tests: Filtering & Multi-Dimensional Search
    // =========================================================================
    console.log('6. Testing Query Filters (User, Service, Tool, Status, Full-text Search)...');
    userLogService.clearBuffer();

    // Seed specific traces
    userLogService.recordTrace({
      traceId: 'trace_alice_xero_ok',
      timestamp: new Date().toISOString(),
      timestampEpochMs: Date.now() - 1000,
      userEmail: 'alice@company.com',
      clientId: 'gemini-prod',
      isHumanUser: true,
      jsonrpcMethod: 'tools/call',
      toolName: 'xero-list-invoices',
      domain: 'accounting',
      status: 'SUCCESS',
      durationMs: 135,
      responsePreview: 'Found 12 invoices for ACME Corp',
      responseChars: 1200,
      arguments: { where: 'Status=="AUTHORISED"' },
      upstreamSpans: [
        {
          spanId: 'span_xero_01',
          serviceId: 'xero',
          endpoint: 'GET /Invoices',
          httpStatus: 200,
          durationMs: 120,
          timestamp: new Date().toISOString(),
        },
      ],
      upstreamCallsCount: 1,
    });

    userLogService.recordTrace({
      traceId: 'trace_bob_slack_error',
      timestamp: new Date().toISOString(),
      timestampEpochMs: Date.now() - 500,
      userEmail: 'bob@company.com',
      clientId: 'gemini-staging',
      isHumanUser: true,
      jsonrpcMethod: 'tools/call',
      toolName: 'slack-federated-search',
      domain: 'slack',
      status: 'ERROR',
      durationMs: 310,
      errorMessage: 'Slack upstream connection timed out',
      responseChars: 45,
      arguments: { query: 'budget approval 2026' },
      upstreamSpans: [
        {
          spanId: 'span_slack_01',
          serviceId: 'slack',
          endpoint: 'GET /search.messages',
          httpStatus: 504,
          durationMs: 300,
          errorMessage: 'Gateway Timeout',
          timestamp: new Date().toISOString(),
        },
      ],
      upstreamCallsCount: 1,
    });

    userLogService.recordTrace({
      traceId: 'trace_charlie_blocked',
      timestamp: new Date().toISOString(),
      timestampEpochMs: Date.now(),
      userEmail: 'charlie@company.com',
      clientId: 'gemini-prod',
      isHumanUser: true,
      jsonrpcMethod: 'tools/call',
      toolName: 'sagehr-list-employees',
      domain: 'sagehr',
      status: 'BLOCKED',
      durationMs: 12,
      errorMessage: 'Service sagehr is disabled for this user',
      responseChars: 50,
      arguments: {},
      upstreamSpans: [],
      upstreamCallsCount: 0,
    });

    // Test filter by userEmail
    const userRes = await fetch(`${baseUrl}/api/logs/user?userEmail=alice@company.com`, { headers: adminHeaders });
    const userBody = (await userRes.json()) as any;
    assert.strictEqual(userBody.total, 1);
    assert.strictEqual(userBody.traces[0].traceId, 'trace_alice_xero_ok');

    // Test filter by status
    const statusRes = await fetch(`${baseUrl}/api/logs/user?status=ERROR`, { headers: adminHeaders });
    const statusBody = (await statusRes.json()) as any;
    assert.strictEqual(statusBody.total, 1);
    assert.strictEqual(statusBody.traces[0].traceId, 'trace_bob_slack_error');

    // Test filter by service
    const serviceRes = await fetch(`${baseUrl}/api/logs/user?service=slack`, { headers: adminHeaders });
    const serviceBody = (await serviceRes.json()) as any;
    assert.strictEqual(serviceBody.total, 1);
    assert.strictEqual(serviceBody.traces[0].traceId, 'trace_bob_slack_error');

    // Test full-text search across arguments
    const searchRes = await fetch(`${baseUrl}/api/logs/user?search=budget`, { headers: adminHeaders });
    const searchBody = (await searchRes.json()) as any;
    assert.strictEqual(searchBody.total, 1);
    assert.strictEqual(searchBody.traces[0].traceId, 'trace_bob_slack_error');

    console.log('   ✓ Multi-dimensional filters and keyword search return exact trace matches');

    // =========================================================================
    // 7. Integration Tests: Single Trace Lookup & KPI Stats
    // =========================================================================
    console.log('7. Testing Single Trace Lookup & KPI Stats ribbon...');
    // Single trace lookup
    const singleRes = await fetch(`${baseUrl}/api/logs/user/trace_alice_xero_ok`, { headers: adminHeaders });
    assert.strictEqual(singleRes.status, 200);
    const singleBody = (await singleRes.json()) as any;
    assert.strictEqual(singleBody.success, true);
    assert.strictEqual(singleBody.trace.traceId, 'trace_alice_xero_ok');
    assert.strictEqual(singleBody.trace.upstreamSpans.length, 1);

    // Non-existent trace -> 404
    const notFoundRes = await fetch(`${baseUrl}/api/logs/user/non_existent_trace`, { headers: adminHeaders });
    assert.strictEqual(notFoundRes.status, 404);

    // Stats endpoint
    const statsRes = await fetch(`${baseUrl}/api/logs/user/stats`, { headers: adminHeaders });
    assert.strictEqual(statsRes.status, 200);
    const statsBody = (await statsRes.json()) as any;
    assert.strictEqual(statsBody.success, true);
    assert.strictEqual(statsBody.stats.totalInvocations, 3);
    assert.strictEqual(statsBody.stats.activeUsersCount, 3); // alice, bob, charlie
    assert.strictEqual(statsBody.stats.errorCount, 1);
    assert.strictEqual(statsBody.stats.blockedCount, 1);
    assert.strictEqual(statsBody.stats.upstreamCallsCount, 2);
    console.log('   ✓ Trace lookup returns complete nested spans; KPI stats accurately calculated');

  } finally {
    server.close();
  }

  console.log('\n--- ALL USER LOGS TELEMETRY TESTS PASSED (0 ERRORS) ---\n');
}

runUserLogsTests().catch((err) => {
  console.error('User Logs Test Failed:', err);
  process.exit(1);
});
