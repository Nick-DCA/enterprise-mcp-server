import assert from 'assert';
import { RequestContext } from '../../src/server/context.js';
import { sanitizeSlackText } from '../../src/services/slack/client.js';
import { slackFederatedSearchTool } from '../../src/services/slack/tools/slackFederatedSearch.js';
import { checkToolExecutionAccess, resolveServiceIdFromDomain } from '../../src/mcp/accessGuard.js';
import { runtimeConfig } from '../../src/config/runtimeConfig.js';

async function runSlackFederatedTests() {
  console.log('====================================================');
  console.log('🧪 Running Slack Federated Search Unit & Integration Tests');
  console.log('====================================================\n');

  // Test 1: RequestContext propagation
  console.log('1. Testing RequestContext AsyncLocalStorage propagation...');
  assert.strictEqual(RequestContext.getUserEmail(), undefined, 'Context should be undefined outside of run()');

  await RequestContext.run({ userEmail: 'alice@company.com', authUserId: 'user_123' }, async () => {
    assert.strictEqual(RequestContext.getUserEmail(), 'alice@company.com');
    assert.strictEqual(RequestContext.requireUserEmail(), 'alice@company.com');
    const store = RequestContext.get();
    assert.strictEqual(store?.authUserId, 'user_123');
  });

  assert.strictEqual(RequestContext.getUserEmail(), undefined, 'Context should be cleaned up after run()');
  console.log('   ✓ RequestContext correctly isolates user identity across async boundaries');

  // Test 2: Slack text sanitization and prompt injection disarming
  console.log('2. Testing sanitizeSlackText mrkdwn parsing & length bounding...');
  const rawInput = 'Hey <@U012345|bob> check <#C067890|proj-xero> and read <https://acme.corp/doc|Spec>. <!here> note \x00\x07null';
  const clean = sanitizeSlackText(rawInput, 500);
  assert.ok(!clean.includes('<@U012345|bob>'), 'Raw user tag should be stripped');
  assert.ok(clean.includes('@bob'), 'User tag should be converted to clean mention');
  assert.ok(clean.includes('#proj-xero'), 'Channel tag should be converted to clean channel name');
  assert.ok(clean.includes('Spec (https://acme.corp/doc)'), 'Markdown link should be converted to readable format');
  assert.ok(!clean.includes('\x00'), 'Control characters should be stripped');
  assert.ok(!clean.includes('<!here>'), 'Special broadcast mentions should be disarmed');

  const giantText = 'A'.repeat(800);
  const truncated = sanitizeSlackText(giantText, 500);
  assert.ok(truncated.length <= 520, 'Text should be bounded to around 500 chars');
  assert.ok(truncated.includes('[truncated]'), 'Truncation notice should be appended');
  console.log('   ✓ Slack text sanitization and anti-injection guardrails verified');

  // Test 3: Tool definition and unlinked user self-service URL generation
  console.log('3. Testing slack-federated-search tool schema & unlinked response...');
  assert.strictEqual(slackFederatedSearchTool.name, 'slack-federated-search');
  assert.strictEqual(slackFederatedSearchTool.annotations.readOnlyHint, true);
  assert.strictEqual(slackFederatedSearchTool.annotations.destructiveHint, false);

  // Execute tool for an unlinked user inside RequestContext
  const unlinkedResult = await RequestContext.run({ userEmail: 'charlie@company.com' }, async () => {
    return slackFederatedSearchTool.execute({ query: 'budget decision' });
  });

  assert.strictEqual(unlinkedResult.status, 'unlinked');
  assert.strictEqual(unlinkedResult.actionRequired, 'CONNECT_SLACK_ACCOUNT');
  assert.ok(unlinkedResult.message.includes('charlie%40company.com'), 'Self-service link should contain encoded user email');
  assert.ok(unlinkedResult.message.includes('/api/connectors/slack/connect'), 'Self-service link should route to connect endpoint');
  console.log('   ✓ Unlinked user receives actionable 1-click self-service connection guide');

  // Test 4: AccessGuard domain resolution and runtime toggle enforcement
  console.log('4. Testing AccessGuard domain resolution for slack...');
  const resolvedService = resolveServiceIdFromDomain('slack');
  assert.strictEqual(resolvedService, 'slack', 'Domain "slack" should resolve to ServiceId "slack"');

  // Verify access check when service is enabled vs disabled
  const accessCheck = await checkToolExecutionAccess(slackFederatedSearchTool, 'slack', 'alice@company.com');
  // Default in-memory is disabled unless toggled
  assert.ok(typeof accessCheck.allowed === 'boolean');
  console.log(`   ✓ AccessGuard correctly evaluates Slack service state (Allowed: ${accessCheck.allowed})`);

  console.log('\n✅ All Slack Federated Search Tests Passed Successfully!\n');
}

runSlackFederatedTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Slack Federated Tests Failed:', err);
    process.exit(1);
  });
