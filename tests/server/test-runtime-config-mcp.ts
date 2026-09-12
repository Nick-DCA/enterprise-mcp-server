import assert from 'assert';
import { createMcpServer } from '../../src/mcp/server.js';
import { runtimeConfig } from '../../src/config/runtimeConfig.js';
import { checkToolExecutionAccess } from '../../src/mcp/accessGuard.js';
import { bigqueryTools } from '../../src/services/bigquery/tools/index.js';
import { slackTools, slackSearchGuideTool } from '../../src/services/slack/tools/index.js';

async function runRuntimeConfigMcpTests() {
  console.log('\n--- Running Dynamic Runtime Config MCP Tool Execution Tests ---');

  // 1. Initialize MCP Server
  console.log('1. Initializing McpServer with dynamic tool registry...');
  const server = createMcpServer();
  assert.ok(server);

  const dryRunTool = bigqueryTools.find((t) => t.name === 'bigquery-dry-run-query');
  assert.ok(dryRunTool, 'bigquery-dry-run-query tool should be defined');

  // 2. Check access when BigQuery is enabled
  console.log('2. Testing access check when service is ENABLED...');
  await runtimeConfig.updateServiceToggle('bigquery', true, 'test-admin');
  const allowedCheck = await checkToolExecutionAccess(dryRunTool, 'bigquery');
  assert.strictEqual(allowedCheck.allowed, true);
  console.log('   ✓ Tool execution allowed when service is enabled');

  // 3. Dynamically disable BigQuery service
  console.log('3. Dynamically disabling BigQuery service in runtimeConfig...');
  await runtimeConfig.updateServiceToggle('bigquery', false, 'test-admin');

  const blockedCheck = await checkToolExecutionAccess(dryRunTool, 'bigquery');
  assert.strictEqual(blockedCheck.allowed, false);
  assert.ok(blockedCheck.reason?.includes('BIGQUERY'));
  assert.ok(blockedCheck.reason?.includes('temporarily disabled by an administrator'));
  console.log(`   ✓ Tool execution correctly blocked: "${blockedCheck.reason}"`);

  // 4. Test user-level read-only constraint
  console.log('4. Testing user-level read-only restriction...');
  await runtimeConfig.updateServiceToggle('bigquery', true, 'test-admin');

  // Create a user with readOnlyOnly: true
  await runtimeConfig.createUserAccess(
    {
      userEmail: 'readonly.user@company.com',
      isAdmin: false,
      isEnabled: true,
      allowedServices: ['bigquery'],
      readOnlyOnly: true,
    },
    'test-admin'
  );

  // Destructive/mutating tool stub
  const mutatingTool = {
    name: 'custom-write-tool',
    description: 'A write tool',
    schema: {},
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    execute: async () => {},
  };

  const userBlockedCheck = await checkToolExecutionAccess(
    mutatingTool as any,
    'bigquery',
    'readonly.user@company.com'
  );
  assert.strictEqual(userBlockedCheck.allowed, false);
  assert.ok(userBlockedCheck.reason?.includes('read-only restrictions'));
  console.log('   ✓ Mutating tool blocked for read-only user');

  // 5. Re-enable BigQuery
  await runtimeConfig.updateServiceToggle('bigquery', true, 'test-admin');
  const finalCheck = await checkToolExecutionAccess(dryRunTool, 'bigquery');
  assert.strictEqual(finalCheck.allowed, true);
  console.log('   ✓ Service re-enabled, access restored');

  // 6. Test Slack Service Dynamic Toggle & Open Access Policy
  console.log('6. Testing Slack service dynamic toggle & open delegation policy...');
  const searchTool = {
    name: 'slack-federated-search',
    description: 'Slack search',
    schema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async () => {},
  };

  // 6a. Slack is disabled by default
  await runtimeConfig.updateServiceToggle('slack', false, 'test-admin');
  const slackDisabledCheck = await checkToolExecutionAccess(searchTool as any, 'slack', 'any.user@company.com');
  assert.strictEqual(slackDisabledCheck.allowed, false);
  assert.ok(slackDisabledCheck.reason?.includes('SLACK'));
  assert.ok(slackDisabledCheck.reason?.includes('temporarily disabled by an administrator'));
  console.log(`   ✓ Slack correctly blocked when service toggle is disabled: "${slackDisabledCheck.reason}"`);

  // 6b. Slack enabled with open delegation (allowAllUsers: true)
  await runtimeConfig.updateServiceToggle('slack', true, 'test-admin');
  await runtimeConfig.updateServiceSettings('slack', { allowAllUsers: true }, 'test-admin');
  const slackOpenCheck = await checkToolExecutionAccess(searchTool as any, 'slack', 'any.user@company.com');
  assert.strictEqual(slackOpenCheck.allowed, true);
  console.log('   ✓ Unregistered user allowed when allowAllUsers is true (open delegation)');

  // 6c. Slack enabled with strict IAM policy (allowAllUsers: false)
  console.log('7. Testing Slack strict IAM mode (allowAllUsers: false)...');
  await runtimeConfig.updateServiceSettings('slack', { allowAllUsers: false }, 'test-admin');

  // Unregistered user should now be blocked
  const slackStrictBlocked = await checkToolExecutionAccess(searchTool as any, 'slack', 'unlisted.user@company.com');
  assert.strictEqual(slackStrictBlocked.allowed, false);
  assert.ok(slackStrictBlocked.reason?.includes('requires an explicit administrator grant'));
  console.log(`   ✓ Unlisted user blocked in strict mode: "${slackStrictBlocked.reason}"`);

  // Register user without Slack permission
  await runtimeConfig.createUserAccess(
    {
      userEmail: 'noslack.user@company.com',
      isAdmin: false,
      isEnabled: true,
      allowedServices: ['bigquery', 'xero'],
    },
    'test-admin'
  );
  const slackStrictNoPerm = await checkToolExecutionAccess(searchTool as any, 'slack', 'noslack.user@company.com');
  assert.strictEqual(slackStrictNoPerm.allowed, false);
  assert.ok(slackStrictNoPerm.reason?.includes('does not have permission to access \'SLACK\' tools'));
  console.log(`   ✓ User without slack permission blocked in strict mode: "${slackStrictNoPerm.reason}"`);

  // Register user WITH Slack permission
  await runtimeConfig.createUserAccess(
    {
      userEmail: 'slack.approved@company.com',
      isAdmin: false,
      isEnabled: true,
      allowedServices: ['bigquery', 'slack'],
    },
    'test-admin'
  );
  const slackStrictApproved = await checkToolExecutionAccess(searchTool as any, 'slack', 'slack.approved@company.com');
  assert.strictEqual(slackStrictApproved.allowed, true);
  console.log('   ✓ User with slack permission approved in strict mode');

  // Disabled user account is blocked regardless of policy
  await runtimeConfig.toggleUserAccess('slack.approved@company.com', false, 'test-admin');
  const slackDisabledUser = await checkToolExecutionAccess(searchTool as any, 'slack', 'slack.approved@company.com');
  assert.strictEqual(slackDisabledUser.allowed, false);
  assert.ok(slackDisabledUser.reason?.includes('disabled by an administrator'));
  console.log('   ✓ Disabled account blocked even if allowedServices includes slack');

  // Restore open policy
  await runtimeConfig.updateServiceSettings('slack', { allowAllUsers: true }, 'test-admin');

  // 6. Test Slack Search Guide Tool & Scopes
  console.log('6. Testing slack-search-guide tool & 16 scopes configuration...');
  assert.strictEqual(slackTools.length, 5, 'Slack tools bundle should export exactly 5 tools');
  assert.ok(slackTools.some((t) => t.name === 'slack-federated-search'));
  assert.ok(slackTools.some((t) => t.name === 'slack-search-guide'));
  assert.ok(slackTools.some((t) => t.name === 'slack-get-thread-replies'));
  assert.ok(slackTools.some((t) => t.name === 'slack-get-channel-context'));
  assert.ok(slackTools.some((t) => t.name === 'slack-get-file-content'));

  const guideResultAll: any = await slackSearchGuideTool.execute({ topic: 'all' });
  assert.strictEqual(guideResultAll.status, 'success');
  assert.ok(guideResultAll.guide.includes('Slack Query Operators'));
  assert.ok(guideResultAll.guide.includes('Sequential Search Strategies'));
  assert.ok(guideResultAll.guide.includes('from:@username'));
  assert.ok(guideResultAll.guide.includes('in:#channel-name'));
  console.log('   ✓ slack-search-guide tool executes and returns full operator cheat sheet');

  const guideResultOps: any = await slackSearchGuideTool.execute({ topic: 'operators' });
  assert.strictEqual(guideResultOps.status, 'success');
  assert.ok(guideResultOps.guide.includes('from:@username'));
  console.log('   ✓ slack-search-guide tool filters by topic successfully');

  const slackConfig = await runtimeConfig.getServiceConfig('slack');
  const configuredScopes = (slackConfig?.settings?.scopes as string) || '';
  const parsedScopes = configuredScopes.split(',').map((s) => s.trim()).filter(Boolean);
  assert.strictEqual(parsedScopes.length, 16, 'Slack service config should include all 16 user scopes');
  assert.ok(parsedScopes.includes('search:read.public'));
  assert.ok(parsedScopes.includes('search:read.private'));
  assert.ok(parsedScopes.includes('search:read.im'));
  assert.ok(parsedScopes.includes('search:read.mpim'));
  assert.ok(parsedScopes.includes('search:read.files'));
  assert.ok(parsedScopes.includes('search:read.users'));
  assert.ok(parsedScopes.includes('users:read'));
  assert.ok(parsedScopes.includes('channels:read'));
  assert.ok(parsedScopes.includes('groups:read'));
  assert.ok(parsedScopes.includes('im:read'));
  assert.ok(parsedScopes.includes('mpim:read'));
  assert.ok(parsedScopes.includes('channels:history'));
  assert.ok(parsedScopes.includes('groups:history'));
  assert.ok(parsedScopes.includes('im:history'));
  assert.ok(parsedScopes.includes('mpim:history'));
  assert.ok(parsedScopes.includes('files:read'));
  console.log('   ✓ Slack service config verified with all 16 granular OAuth user scopes');

  // 12. Test getAuditLogs robustness
  console.log('12. Testing getAuditLogs retrieval and sorting...');
  const auditLogs = await runtimeConfig.getAuditLogs(50);
  assert.ok(Array.isArray(auditLogs), 'getAuditLogs should return an array');
  assert.ok(auditLogs.length >= 1, 'getAuditLogs should return at least the initialization audit log');
  console.log(`   ✓ getAuditLogs successfully returned ${auditLogs.length} logs`);

  console.log('--- All Dynamic Runtime Config MCP Tests Passed! ---\n');
}

runRuntimeConfigMcpTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Runtime Config MCP Test Failed:', err);
    process.exit(1);
  });
