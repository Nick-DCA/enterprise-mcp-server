import 'dotenv/config';
import http, { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { createApp } from '../src/server/app.js';
import { OAuthService } from '../src/auth/oauthService.js';
import { McpAuthConfig } from '../src/auth/types.js';
import { computeCodeChallenge } from '../src/auth/pkce.js';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];
const PORT = 3095;
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
  console.log('🌐 Phase 5: End-to-End Gemini Enterprise MCP OAuth Simulation');
  console.log('====================================================\n');

  process.env.XERO_CLIENT_ID = 'test-xero-client-id';
  process.env.XERO_CLIENT_SECRET = 'test-xero-client-secret';

  const authConfig: McpAuthConfig = {
    clientId: 'gemini-enterprise-xero-mcp',
    clientSecret: 'secret-key-12345-very-secure',
    jwtSecret: 'jwt-signing-key-for-test-32-chars-length!',
    allowedRedirectUris: ['https://vertexaisearch.cloud.google.com/oauth-redirect'],
    codeTtlSec: 300,
    tokenTtlSec: 3600,
    issuer: 'xero-mcp-server',
  };

  const oauthService = new OAuthService(authConfig);
  const app = createApp({ oauthService, authConfig });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  try {
    // Step 1: Gemini Enterprise Admin registers connector & clicks "Verify Auth"
    console.log('--- Step 1: Gemini Enterprise Authorization Handshake ---');
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = computeCodeChallenge(verifier, 'S256');
    const state = 'gemini-session-state-token-9988';

    const authorizeUrl = `/oauth/authorize?response_type=code&client_id=${authConfig.clientId}&redirect_uri=${encodeURIComponent('https://vertexaisearch.cloud.google.com/oauth-redirect')}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
    const authRes = await sendRequest('GET', authorizeUrl);

    assert(authRes.statusCode === 302, 'Gemini receives 302 redirect on authorization URL');
    const location = authRes.headers.location || '';
    assert(location.startsWith('https://vertexaisearch.cloud.google.com/oauth-redirect'), 'Redirects to Gemini OAuth callback URL');

    const parsedRedirect = new URL(location);
    assert(parsedRedirect.searchParams.get('state') === state, 'Gemini state parameter preserved');
    const authCode = parsedRedirect.searchParams.get('code')!;
    assert(typeof authCode === 'string' && authCode.length > 50, 'Gemini receives stateless authorization code');

    // Step 2: Gemini Enterprise exchanges Code for Access Token
    console.log('\n--- Step 2: Gemini Enterprise Token Exchange (PKCE) ---');
    const tokenPayload = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: authConfig.clientId,
      code: authCode,
      code_verifier: verifier,
      redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
    });

    const tokenRes = await sendRequest(
      'POST',
      '/oauth/token',
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      tokenPayload.toString()
    );

    assert(tokenRes.statusCode === 200, 'Token exchange returns 200 OK');
    assert(tokenRes.body.token_type === 'Bearer', 'Token type is Bearer');
    assert(tokenRes.body.expires_in === 3600, 'Token validity is 3600 seconds');
    assert(typeof tokenRes.body.refresh_token === 'string', 'Gemini receives refresh token');
    const accessToken = tokenRes.body.access_token;
    assert(typeof accessToken === 'string' && accessToken.length > 50, 'Access token JWT received');

    // Step 2b: Test Refresh Token Flow
    console.log('\n--- Step 2b: Gemini Enterprise Token Refresh ---');
    const refreshRes = await sendRequest(
      'POST',
      '/oauth/token',
      { 'Content-Type': 'application/json' },
      JSON.stringify({
        grant_type: 'refresh_token',
        client_id: authConfig.clientId,
        refresh_token: tokenRes.body.refresh_token,
      })
    );
    assert(refreshRes.statusCode === 200, 'Token refresh returns 200 OK');
    assert(typeof refreshRes.body.access_token === 'string', 'Refreshed access token received');
    assert(typeof refreshRes.body.refresh_token === 'string', 'New refresh token received');

    // Step 3: Gemini Enterprise Agent executes MCP tools/list
    console.log('\n--- Step 3: Authenticated MCP Protocol Interaction ---');
    const mcpListRes = await sendRequest(
      'POST',
      '/mcp',
      { Authorization: `Bearer ${accessToken}` },
      {
        jsonrpc: '2.0',
        id: 101,
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          },
        },
      }
    );

    assert(mcpListRes.statusCode === 200, 'Authenticated POST /mcp tools/list returns 200 OK');
    assert(mcpListRes.body?.jsonrpc === '2.0', 'JSON-RPC response matches version 2.0');
    assert(mcpListRes.body?.id === 101, 'JSON-RPC request ID echoed in response');
    const tools = mcpListRes.body?.result?.tools;
    assert(Array.isArray(tools) && tools.length > 0, `Discovered ${tools?.length} available MCP tools`);

    // Step 4: Security Verification (Reject Unauthenticated & Tampered Requests)
    console.log('\n--- Step 4: Security Guard Validations ---');
    const unauthRes = await sendRequest('POST', '/mcp', {}, {
      jsonrpc: '2.0',
      id: 102,
      method: 'tools/list',
      params: {},
    });
    assert(unauthRes.statusCode === 401, 'Unauthenticated MCP request blocked with 401');

    const tamperedRes = await sendRequest(
      'POST',
      '/mcp',
      { Authorization: `Bearer ${accessToken}tampered` },
      { jsonrpc: '2.0', id: 103, method: 'tools/list', params: {} }
    );
    assert(tamperedRes.statusCode === 401, 'Tampered Bearer token blocked with 401');

  } finally {
    server.close();
  }

  console.log('\n====================================================');
  const allPassed = results.every((r) => r.passed);
  if (allPassed) {
    console.log(`🎉 ALL ${results.length} Phase 5 E2E tests PASSED!`);
  } else {
    const failed = results.filter((r) => !r.passed);
    console.error(`💥 ${failed.length} Phase 5 E2E tests FAILED!`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('E2E Test execution failed:', err);
  process.exit(1);
});
