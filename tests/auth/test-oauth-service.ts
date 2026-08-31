import { OAuthService, OAuthError } from '../../src/auth/oauthService.js';
import { McpAuthConfig } from '../../src/auth/types.js';
import { computeCodeChallenge } from '../../src/auth/pkce.js';
import { verifyJwt } from '../../src/auth/jwt.js';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, testName: string, failureDetails?: string) {
  if (condition) {
    results.push({ name: testName, passed: true });
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    results.push({ name: testName, passed: false, details: failureDetails });
    console.error(`  ❌ FAIL: ${testName} - ${failureDetails || 'Assertion failed'}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Testing Gate 2: Core OAuth 2.0 Domain Logic');
  console.log('====================================================\n');

  const config: McpAuthConfig = {
    clientId: 'gemini-enterprise-xero-mcp',
    clientSecret: 'secret-key-12345-very-secure',
    jwtSecret: 'jwt-signing-key-for-test-32-chars-length!',
    allowedRedirectUris: [
      'https://vertexaisearch.cloud.google.com/oauth-redirect',
      'http://localhost:3000/callback',
    ],
    codeTtlSec: 300,
    tokenTtlSec: 3600,
    issuer: 'xero-mcp-server-test',
  };

  const oauthService = new OAuthService(config);

  // 1. Authorize Request Tests
  console.log('--- 1. Authorize Request Tests ---');

  const rfcVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const rfcChallenge = computeCodeChallenge(rfcVerifier, 'S256');

  try {
    const authResult = oauthService.processAuthorize({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
      state: 'custom-state-123',
      code_challenge: rfcChallenge,
      code_challenge_method: 'S256',
    });

    const parsedUrl = new URL(authResult.redirectUrl);
    assert(
      parsedUrl.origin + parsedUrl.pathname === 'https://vertexaisearch.cloud.google.com/oauth-redirect',
      'Authorize redirects to the authorized redirect URI'
    );
    assert(parsedUrl.searchParams.get('state') === 'custom-state-123', 'State parameter is preserved in redirect');
    assert(typeof parsedUrl.searchParams.get('code') === 'string', 'Authorization code is attached to redirect');
  } catch (err: any) {
    assert(false, 'Authorize valid params should succeed', err.message);
  }

  // Reject unsupported response_type
  try {
    oauthService.processAuthorize({
      response_type: 'token',
      client_id: config.clientId,
      redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
    });
    assert(false, 'Should reject response_type != code');
  } catch (err: any) {
    assert(err instanceof OAuthError && err.errorCode === 'unsupported_response_type', 'Rejects response_type != code');
  }

  // Reject invalid client_id
  try {
    oauthService.processAuthorize({
      response_type: 'code',
      client_id: 'unknown-client',
      redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
    });
    assert(false, 'Should reject unknown client_id');
  } catch (err: any) {
    assert(err instanceof OAuthError && err.errorCode === 'invalid_client', 'Rejects unknown client_id');
  }

  // Reject unauthorized redirect_uri
  try {
    oauthService.processAuthorize({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: 'https://malicious-site.com/steal-code',
    });
    assert(false, 'Should reject unauthorized redirect_uri');
  } catch (err: any) {
    assert(err instanceof OAuthError && err.errorCode === 'invalid_request', 'Rejects unauthorized redirect_uri');
  }

  // 2. Token Exchange Tests (PKCE Flow)
  console.log('\n--- 2. Token Exchange Tests (PKCE Public & Confidential) ---');

  // Obtain code with PKCE
  const authRes = oauthService.processAuthorize({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
    code_challenge: rfcChallenge,
    code_challenge_method: 'S256',
  });
  const validCodeWithPkce = new URL(authRes.redirectUrl).searchParams.get('code')!;

  // 2a. Exchange with PKCE as Public Client (no client_secret, valid code_verifier)
  try {
    const tokenRes = oauthService.processTokenExchange({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code: validCodeWithPkce,
      code_verifier: rfcVerifier,
      redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
    });

    assert(tokenRes.token_type === 'Bearer', 'Token type is Bearer');
    assert(tokenRes.expires_in === 3600, 'Expires in is 3600');
    assert(typeof tokenRes.access_token === 'string', 'Access token returned');
    assert(typeof tokenRes.refresh_token === 'string', 'Refresh token returned on initial exchange');

    const decoded = verifyJwt<any>(tokenRes.access_token, config.jwtSecret);
    assert(decoded.sub === config.clientId, 'Decoded token sub matches client ID');
    assert(decoded.iss === config.issuer, 'Decoded token iss matches issuer');

    // Test Refresh Token Flow
    const refreshRes = oauthService.processTokenExchange({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      refresh_token: tokenRes.refresh_token,
    });
    assert(typeof refreshRes.access_token === 'string', 'Refreshed access token returned');
    assert(typeof refreshRes.refresh_token === 'string', 'New refresh token returned');
  } catch (err: any) {
    assert(false, 'PKCE public client exchange should succeed', err.message);
  }

  // 2b. Exchange with PKCE + wrong code_verifier
  try {
    oauthService.processTokenExchange({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code: validCodeWithPkce,
      code_verifier: 'invalid-verifier-string-must-be-43-chars-long-12345',
      redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
    });
    assert(false, 'Should reject invalid code_verifier');
  } catch (err: any) {
    assert(err instanceof OAuthError && err.errorCode === 'invalid_grant', 'Rejects invalid code_verifier with invalid_grant');
  }

  // 2c. Exchange with PKCE + invalid client_secret
  try {
    oauthService.processTokenExchange({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: 'wrong-secret',
      code: validCodeWithPkce,
      code_verifier: rfcVerifier,
      redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
    });
    assert(false, 'Should reject invalid client_secret even with PKCE');
  } catch (err: any) {
    assert(err instanceof OAuthError && err.errorCode === 'invalid_client', 'Rejects invalid client_secret with invalid_client');
  }

  // 3. Token Exchange Tests (Non-PKCE Flow / Confidential Client)
  console.log('\n--- 3. Token Exchange Tests (Confidential Client Flow) ---');

  const authResNoPkce = oauthService.processAuthorize({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
  });
  const validCodeNoPkce = new URL(authResNoPkce.redirectUrl).searchParams.get('code')!;

  // 3a. Exchange non-PKCE without client_secret -> must fail
  try {
    oauthService.processTokenExchange({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code: validCodeNoPkce,
      redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
    });
    assert(false, 'Should reject non-PKCE exchange without client_secret');
  } catch (err: any) {
    assert(err instanceof OAuthError && err.errorCode === 'invalid_client', 'Rejects missing client_secret on non-PKCE flow');
  }

  // 3b. Exchange non-PKCE with valid client_secret -> must succeed
  try {
    const tokenRes = oauthService.processTokenExchange({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: validCodeNoPkce,
      redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
    });
    assert(typeof tokenRes.access_token === 'string', 'Confidential client exchange succeeds with valid secret');
  } catch (err: any) {
    assert(false, 'Confidential client exchange should succeed with valid secret', err.message);
  }

  // 4. Token Exchange Rejection of Mismatched Redirect URI & Bad Code
  console.log('\n--- 4. Mismatched Parameters & Bad Codes ---');
  try {
    oauthService.processTokenExchange({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: validCodeNoPkce,
      redirect_uri: 'http://localhost:3000/callback', // Different from auth request
    });
    assert(false, 'Should reject mismatched redirect_uri');
  } catch (err: any) {
    assert(err instanceof OAuthError && err.errorCode === 'invalid_grant', 'Rejects mismatched redirect_uri with invalid_grant');
  }

  try {
    oauthService.processTokenExchange({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: 'malformed-or-tampered-code',
      redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
    });
    assert(false, 'Should reject tampered code');
  } catch (err: any) {
    assert(err instanceof OAuthError && err.errorCode === 'invalid_grant', 'Rejects tampered code with invalid_grant');
  }

  console.log('\n====================================================');
  const allPassed = results.every((r) => r.passed);
  if (allPassed) {
    console.log(`🎉 ALL ${results.length} Phase 2 tests PASSED!`);
  } else {
    const failed = results.filter((r) => !r.passed);
    console.error(`💥 ${failed.length} Phase 2 tests FAILED!`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
