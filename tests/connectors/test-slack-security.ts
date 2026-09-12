import express from 'express';
import http, { IncomingMessage } from 'node:http';
import crypto from 'node:crypto';
import { slackConnectorRouter } from '../../src/server/routes/api/connectors/slack.js';
import { clearAuthConfigCache } from '../../src/config/authConfig.js';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];
const PORT = 3098;
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

function sendGet(path: string): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve) => {
    const req = http.request(`${BASE_URL}${path}`, { method: 'GET' }, (res: IncomingMessage) => {
      let rawData = '';
      res.on('data', (chunk) => (rawData += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 500,
          headers: res.headers,
          body: rawData,
        });
      });
    });

    req.on('error', (err) => {
      resolve({ statusCode: 500, headers: {}, body: err.message });
    });
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Testing Suite 22: Slack Connector Route & State Hardening');
  console.log('====================================================\n');

  process.env.MCP_CLIENT_ID = 'test-mcp-client-id';
  process.env.MCP_CLIENT_SECRET = 'test-mcp-client-secret';
  process.env.MCP_JWT_SECRET = 'test-signing-secret-at-least-32-chars-long!';
  process.env.SLACK_CLIENT_ID = 'test-slack-client-id';
  process.env.SLACK_CLIENT_SECRET = 'test-slack-client-secret';
  process.env.SLACK_REDIRECT_URI = 'http://localhost:3098/api/connectors/slack/callback';
  clearAuthConfigCache();

  const app = express();
  app.use('/api/connectors/slack', slackConnectorRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  try {
    // 1. Machine Identity Rejection on /connect
    console.log('--- 1. Machine Client Rejection on /connect ---');
    const machineConnectRes = await sendGet('/api/connectors/slack/connect?userEmail=gemini-enterprise-mcp');
    assert(machineConnectRes.statusCode === 400, 'GET /connect with userEmail=gemini-enterprise-mcp returns HTTP 400');
    assert(machineConnectRes.body.includes('Invalid User Email'), 'Response body indicates invalid user email');
    assert(
      machineConnectRes.body.includes('Machine client IDs and invalid formats are strictly prohibited'),
      'Response explicitly warns machine client IDs are prohibited'
    );

    // 2. Malformed / Missing Email on /connect
    console.log('\n--- 2. Malformed / Missing Email Rejection on /connect ---');
    const emptyConnectRes = await sendGet('/api/connectors/slack/connect');
    assert(emptyConnectRes.statusCode === 400, 'GET /connect without userEmail returns HTTP 400');

    const malformedConnectRes = await sendGet('/api/connectors/slack/connect?userEmail=notanemail');
    assert(malformedConnectRes.statusCode === 400, 'GET /connect with invalid email string returns HTTP 400');

    // 3. Valid Human User Email Redirect on /connect
    console.log('\n--- 3. Valid Human User Redirect on /connect ---');
    const validConnectRes = await sendGet('/api/connectors/slack/connect?userEmail=alice@digicloud.africa');
    assert(validConnectRes.statusCode === 302, 'GET /connect with valid corporate email returns HTTP 302 Redirect');

    const locationHeader = validConnectRes.headers['location'] as string;
    assert(Boolean(locationHeader), 'Location header is present in redirect');
    assert(locationHeader.startsWith('https://slack.com/oauth/v2/authorize'), 'Redirect targets official Slack OAuth v2 endpoint');

    const targetUrl = new URL(locationHeader);
    assert(targetUrl.searchParams.get('client_id') === 'test-slack-client-id', 'Client ID matches in Slack OAuth URL');
    assert(Boolean(targetUrl.searchParams.get('state')), 'Signed state parameter is generated in Slack OAuth URL');

    // Inspect the generated state payload
    const rawState = targetUrl.searchParams.get('state')!;
    const [stateData] = rawState.split('.');
    const decodedPayload = JSON.parse(Buffer.from(stateData, 'base64url').toString('utf8'));
    assert(decodedPayload.userEmail === 'alice@digicloud.africa', 'State payload cleanly preserves human user email');

    // 4. Tampered State Rejection on /callback
    console.log('\n--- 4. Tampered State Rejection on /callback ---');
    const tamperedRes = await sendGet('/api/connectors/slack/callback?code=mock_code&state=fake.tampered_signature');
    assert(tamperedRes.statusCode === 400, 'GET /callback with tampered state returns HTTP 400');
    assert(tamperedRes.body.includes('Security Verification Failed'), 'Tampered state rejected with security verification failed');

    // 5. Forged State with Machine Identity Rejection on /callback
    console.log('\n--- 5. Forged State with Machine Identity Rejection on /callback ---');
    // Craft a cryptographically valid state signature containing "gemini-enterprise-mcp"
    const forgedPayload = {
      userEmail: 'gemini-enterprise-mcp',
      nonce: '12345',
      exp: Date.now() + 600000,
    };
    const forgedData = Buffer.from(JSON.stringify(forgedPayload)).toString('base64url');
    const forgedSig = crypto
      .createHmac('sha256', process.env.MCP_JWT_SECRET)
      .update(forgedData)
      .digest('base64url');
    const forgedState = `${forgedData}.${forgedSig}`;

    const forgedCallbackRes = await sendGet(`/api/connectors/slack/callback?code=mock_code&state=${forgedState}`);
    assert(
      forgedCallbackRes.statusCode === 400,
      'GET /callback with forged machine identity state is rejected with HTTP 400'
    );
    assert(
      forgedCallbackRes.body.includes('Invalid Identity in State'),
      'Response body explicitly rejects machine client identifier in state'
    );
  } finally {
    server.close();
  }

  console.log('\n====================================================');
  const allPassed = results.every((r) => r.passed);
  if (allPassed) {
    console.log(`🎉 ALL ${results.length} Suite 22 Slack Connector Security tests PASSED!`);
    process.exit(0);
  } else {
    const failed = results.filter((r) => !r.passed);
    console.error(`💥 ${failed.length} Suite 22 tests FAILED!`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
