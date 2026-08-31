import http, { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { createApp } from '../../src/server/app.js';
import { OAuthService } from '../../src/auth/oauthService.js';
import { McpAuthConfig } from '../../src/auth/types.js';
import { computeCodeChallenge } from '../../src/auth/pkce.js';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];
const PORT = 3088;
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
  body?: string
): Promise<{ statusCode: number; headers: IncomingHttpHeaders; body: any }> {
  return new Promise((resolve) => {
    const reqHeaders: Record<string, string> = { ...headers };
    if (body) {
      reqHeaders['Content-Length'] = Buffer.byteLength(body).toString();
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

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Testing Gate 3: Express OAuth 2.0 HTTP Delivery Routes');
  console.log('====================================================\n');

  const config: McpAuthConfig = {
    clientId: 'gemini-enterprise-xero-mcp',
    clientSecret: 'secret-key-12345-very-secure',
    jwtSecret: 'jwt-signing-key-for-test-32-chars-length!',
    allowedRedirectUris: [
      'https://vertexaisearch.cloud.google.com/oauth-redirect',
    ],
    codeTtlSec: 300,
    tokenTtlSec: 3600,
    issuer: 'xero-mcp-server-test',
  };

  const oauthService = new OAuthService(config);
  const app = createApp({ oauthService });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  try {
    const rfcVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const rfcChallenge = computeCodeChallenge(rfcVerifier, 'S256');

    // 1. GET /oauth/authorize with valid query params
    console.log('--- 1. GET /oauth/authorize HTTP Tests ---');
    const authUrl = `/oauth/authorize?response_type=code&client_id=${config.clientId}&redirect_uri=${encodeURIComponent('https://vertexaisearch.cloud.google.com/oauth-redirect')}&state=xyz123&code_challenge=${rfcChallenge}&code_challenge_method=S256`;
    const authRes = await sendRequest('GET', authUrl);

    assert(authRes.statusCode === 302, 'GET /oauth/authorize returns HTTP 302 redirect');
    const location = authRes.headers.location || '';
    assert(location.startsWith('https://vertexaisearch.cloud.google.com/oauth-redirect'), 'Location header redirects to Gemini callback URL');

    const parsedLocation = new URL(location);
    assert(parsedLocation.searchParams.get('state') === 'xyz123', 'State parameter is included in redirect URL');
    const extractedCode = parsedLocation.searchParams.get('code')!;
    assert(typeof extractedCode === 'string' && extractedCode.length > 50, 'Code parameter contains signed auth code');

    // 2. GET /oauth/authorize with invalid client_id
    const badAuthRes = await sendRequest('GET', `/oauth/authorize?response_type=code&client_id=bad-client&redirect_uri=${encodeURIComponent('https://vertexaisearch.cloud.google.com/oauth-redirect')}`);
    assert(badAuthRes.statusCode === 400, 'GET /oauth/authorize returns 400 on invalid client_id');
    assert(badAuthRes.body.error === 'invalid_client', 'Error response is invalid_client');

    // 3. POST /oauth/token with application/x-www-form-urlencoded (PKCE Public Client)
    console.log('\n--- 2. POST /oauth/token URL-Encoded Form Tests ---');
    const formParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code: extractedCode,
      code_verifier: rfcVerifier,
      redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
    });

    const tokenRes = await sendRequest(
      'POST',
      '/oauth/token',
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      formParams.toString()
    );

    assert(tokenRes.statusCode === 200, 'POST /oauth/token returns HTTP 200 OK');
    assert(tokenRes.body.token_type === 'Bearer', 'Token response has token_type: Bearer');
    assert(typeof tokenRes.body.access_token === 'string', 'Token response contains access_token');
    assert(typeof tokenRes.body.refresh_token === 'string', 'Token response contains refresh_token');
    assert(tokenRes.headers['cache-control'] === 'no-store', 'Response includes Cache-Control: no-store');

    // 4. POST /oauth/token with grant_type: refresh_token
    console.log('\n--- 3. POST /oauth/token Refresh Token Grant Tests ---');
    const refreshRes = await sendRequest(
      'POST',
      '/oauth/token',
      { 'Content-Type': 'application/json' },
      JSON.stringify({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        refresh_token: tokenRes.body.refresh_token,
      })
    );
    assert(refreshRes.statusCode === 200, 'POST /oauth/token with grant_type=refresh_token returns 200 OK');
    assert(typeof refreshRes.body.access_token === 'string', 'Refreshed access token received');
    assert(typeof refreshRes.body.refresh_token === 'string', 'New refresh token received');

    // 5. POST /oauth/token with application/json (PKCE flow)
    console.log('\n--- 4. POST /oauth/token JSON Body Tests ---');
    // Get fresh auth code
    const authRes2 = await sendRequest('GET', authUrl);
    const code2 = new URL(authRes2.headers.location!).searchParams.get('code')!;

    const jsonTokenRes = await sendRequest(
      'POST',
      '/oauth/token',
      { 'Content-Type': 'application/json' },
      JSON.stringify({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        code: code2,
        code_verifier: rfcVerifier,
        redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
      })
    );

    assert(jsonTokenRes.statusCode === 200, 'POST /oauth/token accepts JSON and returns HTTP 200 OK');
    assert(typeof jsonTokenRes.body.access_token === 'string', 'JSON Token response contains access_token');
    assert(typeof jsonTokenRes.body.refresh_token === 'string', 'JSON Token response contains refresh_token');

    // 6. POST /oauth/token error cases
    console.log('\n--- 5. POST /oauth/token Error Handling Tests ---');
    const badTokenRes = await sendRequest(
      'POST',
      '/oauth/token',
      { 'Content-Type': 'application/json' },
      JSON.stringify({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        code: 'bad-code',
        code_verifier: rfcVerifier,
        redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
      })
    );
    assert(badTokenRes.statusCode === 400, 'Invalid code returns HTTP 400 Bad Request');
    assert(badTokenRes.body.error === 'invalid_grant', 'Invalid code error is invalid_grant');

  } finally {
    server.close();
  }

  console.log('\n====================================================');
  const allPassed = results.every((r) => r.passed);
  if (allPassed) {
    console.log(`🎉 ALL ${results.length} Phase 3 tests PASSED!`);
  } else {
    const failed = results.filter((r) => !r.passed);
    console.error(`💥 ${failed.length} Phase 3 tests FAILED!`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
