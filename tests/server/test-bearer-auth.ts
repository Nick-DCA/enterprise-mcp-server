import http, { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { createApp } from '../../src/server/app.js';
import { McpAuthConfig } from '../../src/auth/types.js';
import { signJwt } from '../../src/auth/jwt.js';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];
const PORT = 3089;
const BASE_URL = `http://localhost:${PORT}`;

function assert(condition: boolean, testName: string, failureDetails?: string) {
  if (condition) {
    results.push({ name: testName, passed: true });
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    results.push({ name: testName, passed: false, details: failureDetails });
    console.error(`  ❌ FAIL: ${testName} - ${failureDetails || 'Assertion failed'}`);
  }
}

function sendRequest(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: any
): Promise<{ statusCode: number; headers: IncomingHttpHeaders; body: any }> {
  return new Promise((resolve) => {
    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined;
    const reqHeaders: Record<string, string> = { ...headers };

    if (postData && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (postData) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData).toString();
    }

    const req = http.request(
      `${BASE_URL}${path}`,
      { method, headers: reqHeaders },
      (res: IncomingMessage) => {
        let rawData = '';
        res.on('data', (chunk: any) => (rawData += chunk));
        res.on('end', () => {
          let parsedBody = rawData;
          try {
            parsedBody = JSON.parse(rawData);
          } catch {
            // keep raw string if not JSON
          }
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers,
            body: parsedBody,
          });
        });
      }
    );

    req.on('error', (err) => {
      resolve({ statusCode: 500, headers: {}, body: { error: err.message } });
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Testing Gate 4: Bearer Authentication & Route Guards');
  console.log('====================================================\n');

  process.env.XERO_CLIENT_ID = 'test-xero-client-id';
  process.env.XERO_CLIENT_SECRET = 'test-xero-client-secret';

  const config: McpAuthConfig = {
    clientId: 'gemini-enterprise-xero-mcp',
    clientSecret: 'secret-key-12345-very-secure',
    jwtSecret: 'jwt-signing-key-for-test-32-chars-length!',
    allowedRedirectUris: ['https://vertexaisearch.cloud.google.com/oauth-redirect'],
    codeTtlSec: 300,
    tokenTtlSec: 3600,
    issuer: 'xero-mcp-server-test',
  };

  const app = createApp({ authConfig: config });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  try {
    // 1. Public Endpoint Checks
    console.log('--- 1. Public Endpoint Accessibility ---');
    const healthRes = await sendRequest('GET', '/healthz');
    assert(healthRes.statusCode === 200, 'GET /healthz returns 200 OK without Auth header');
    assert(healthRes.body.status === 'ok', 'Health check response body contains status: ok');

    const rootRes = await sendRequest('GET', '/');
    assert(rootRes.statusCode === 200, 'GET / returns 200 OK without Auth header');

    const faviconRes = await sendRequest('GET', '/favicon.ico');
    assert(faviconRes.statusCode === 200 || faviconRes.statusCode === 204, 'GET /favicon.ico is publicly accessible without Auth header');

    // 2. Protected MCP Route Rejection Checks
    console.log('\n--- 2. Protected MCP Route Unauthorized Checks ---');
    const unauthMcpRes = await sendRequest('POST', '/mcp', {}, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    assert(unauthMcpRes.statusCode === 401, 'POST /mcp without Authorization header returns 401 Unauthorized');
    assert(unauthMcpRes.body.error === 'unauthorized', 'Error body is unauthorized');
    assert(Boolean(unauthMcpRes.headers['www-authenticate']), 'Response includes WWW-Authenticate header');

    const invalidTokenRes = await sendRequest(
      'POST',
      '/mcp',
      { Authorization: 'Bearer invalid-garbage-token-string' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }
    );
    assert(invalidTokenRes.statusCode === 401, 'POST /mcp with invalid Bearer token returns 401 Unauthorized');

    // Generate expired token
    const expiredToken = signJwt({ sub: config.clientId, scope: 'xero:readwrite' }, config.jwtSecret, -10);
    const expiredTokenRes = await sendRequest(
      'POST',
      '/mcp',
      { Authorization: `Bearer ${expiredToken}` },
      { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} }
    );
    assert(expiredTokenRes.statusCode === 401, 'POST /mcp with expired Bearer token returns 401 Unauthorized');

    // 3. Authenticated MCP Route Passthrough
    console.log('\n--- 3. Authenticated MCP Route Passthrough ---');
    const validToken = signJwt(
      { sub: config.clientId, scope: 'xero:readwrite', iss: config.issuer },
      config.jwtSecret,
      3600
    );

    const authMcpRes = await sendRequest(
      'POST',
      '/mcp',
      { Authorization: `Bearer ${validToken}` },
      { jsonrpc: '2.0', id: 4, method: 'tools/list', params: {} }
    );

    assert(authMcpRes.statusCode === 200, 'POST /mcp with valid Bearer token returns 200 OK');
    assert(Array.isArray(authMcpRes.body?.result?.tools), 'MCP tools/list successfully executed and returned tools array');

    const authRootPostRes = await sendRequest(
      'POST',
      '/',
      { Authorization: `Bearer ${validToken}` },
      { jsonrpc: '2.0', id: 5, method: 'tools/list', params: {} }
    );
    assert(authRootPostRes.statusCode === 200, 'POST / with valid Bearer token returns 200 OK');

  } finally {
    server.close();
  }

  console.log('\n====================================================');
  const allPassed = results.every((r) => r.passed);
  if (allPassed) {
    console.log(`🎉 ALL ${results.length} Phase 4 tests PASSED!`);
  } else {
    const failed = results.filter((r) => !r.passed);
    console.error(`💥 ${failed.length} Phase 4 tests FAILED!`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
