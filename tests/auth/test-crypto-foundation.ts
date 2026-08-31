import { signJwt, verifyJwt, decodeJwt } from '../../src/auth/jwt.js';
import { computeCodeChallenge, verifyCodeVerifier } from '../../src/auth/pkce.js';
import { generateAuthCode, verifyAndDecodeAuthCode } from '../../src/auth/code.js';
import { getMcpAuthConfig, clearAuthConfigCache } from '../../src/config/authConfig.js';
import { AuthCodePayload } from '../../src/auth/types.js';

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
  console.log('🧪 Testing Gate 1: Cryptographic Foundation & Auth Config');
  console.log('====================================================\n');

  const testSecret = 'super-secret-test-jwt-key-minimum-32-chars-long!';

  // 1. JWT Signing & Verification
  console.log('--- 1. JWT Signing & Verification ---');
  try {
    const payload = { sub: 'gemini-client-123', scope: 'xero:readwrite' };
    const token = signJwt(payload, testSecret, 3600);
    assert(typeof token === 'string' && token.split('.').length === 3, 'JWT is generated in 3-part format');

    const decoded = verifyJwt<typeof payload>(token, testSecret);
    assert(decoded.sub === 'gemini-client-123', 'Decoded JWT sub matches original');
    assert(decoded.scope === 'xero:readwrite', 'Decoded JWT scope matches original');

    const unverifiedDecoded = decodeJwt<typeof payload>(token);
    assert(unverifiedDecoded?.sub === 'gemini-client-123', 'decodeJwt extracts payload without secret');

    let tamperedFailed = false;
    try {
      verifyJwt(token, 'wrong-secret-key-that-should-fail!');
    } catch {
      tamperedFailed = true;
    }
    assert(tamperedFailed, 'verifyJwt throws on invalid secret');
  } catch (err: any) {
    assert(false, 'JWT tests encountered error', err.message);
  }

  // 2. PKCE RFC 7636 Verification
  console.log('\n--- 2. PKCE RFC 7636 Verification ---');
  try {
    // RFC 7636 Appendix B test vector:
    // verifier: dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
    // S256 challenge: E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
    const rfcVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const rfcChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

    const computed = computeCodeChallenge(rfcVerifier, 'S256');
    assert(computed === rfcChallenge, 'computeCodeChallenge matches RFC 7636 Appendix B test vector');

    const isValidS256 = verifyCodeVerifier(rfcVerifier, rfcChallenge, 'S256');
    assert(isValidS256, 'verifyCodeVerifier returns true for valid S256 verifier');

    const isInvalidS256 = verifyCodeVerifier('wrong-verifier-at-least-43-characters-long-1234567890', rfcChallenge, 'S256');
    assert(!isInvalidS256, 'verifyCodeVerifier returns false for mismatched S256 verifier');

    // Plain method
    const plainVerifier = 'plain-verifier-string-must-be-at-least-43-chars-long!!';
    const isValidPlain = verifyCodeVerifier(plainVerifier, plainVerifier, 'plain');
    assert(isValidPlain, 'verifyCodeVerifier returns true for plain method');

    // Length check (< 43 chars)
    const tooShortVerifier = 'short-verifier';
    assert(!verifyCodeVerifier(tooShortVerifier, tooShortVerifier, 'plain'), 'verifyCodeVerifier rejects verifier < 43 chars');
  } catch (err: any) {
    assert(false, 'PKCE tests encountered error', err.message);
  }

  // 3. Stateless Signed Authorization Codes
  console.log('\n--- 3. Stateless Authorization Codes ---');
  try {
    const authCodePayload: AuthCodePayload = {
      clientId: 'gemini-enterprise-mcp',
      redirectUri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
      codeChallenge: 'E9Melhoa2OwvFrGMTJguCH5rtG6At3ZXAoM_ttlHKWU',
      codeChallengeMethod: 'S256',
      scope: 'xero:readwrite',
    };

    const code = generateAuthCode(authCodePayload, testSecret, 300);
    assert(typeof code === 'string' && code.length > 50, 'generateAuthCode returns signed JWT string');

    const decodedCode = verifyAndDecodeAuthCode(code, testSecret);
    assert(decodedCode.clientId === authCodePayload.clientId, 'Decoded auth code clientId matches');
    assert(decodedCode.codeChallenge === authCodePayload.codeChallenge, 'Decoded auth code codeChallenge matches');
    assert(decodedCode.redirectUri === authCodePayload.redirectUri, 'Decoded auth code redirectUri matches');

    let badSecretFailed = false;
    try {
      verifyAndDecodeAuthCode(code, 'wrong-secret');
    } catch {
      badSecretFailed = true;
    }
    assert(badSecretFailed, 'verifyAndDecodeAuthCode rejects code signed with wrong secret');
  } catch (err: any) {
    assert(false, 'Auth code tests encountered error', err.message);
  }

  // 4. Configuration Loading
  console.log('\n--- 4. Auth Configuration Loading ---');
  try {
    process.env.MCP_CLIENT_ID = 'test-client-id';
    process.env.MCP_CLIENT_SECRET = 'test-client-secret';
    process.env.MCP_JWT_SECRET = 'test-jwt-secret-minimum-32-characters-long';
    clearAuthConfigCache();

    const config = await getMcpAuthConfig();
    assert(typeof config.clientId === 'string' && config.clientId.length > 0, 'getMcpAuthConfig loads non-empty clientId');
    assert(typeof config.clientSecret === 'string' && config.clientSecret.length > 0, 'getMcpAuthConfig loads non-empty clientSecret');
    assert(typeof config.jwtSecret === 'string' && config.jwtSecret.length > 0, 'getMcpAuthConfig loads non-empty jwtSecret');
    assert(config.allowedRedirectUris.includes('https://vertexaisearch.cloud.google.com/oauth-redirect'), 'Default allowed redirect URI is set');
  } catch (err: any) {
    assert(false, 'Config tests encountered error', err.message);
  }

  console.log('\n====================================================');
  const allPassed = results.every((r) => r.passed);
  if (allPassed) {
    console.log(`🎉 ALL ${results.length} Phase 1 tests PASSED!`);
  } else {
    const failed = results.filter((r) => !r.passed);
    console.error(`💥 ${failed.length} Phase 1 tests FAILED!`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
