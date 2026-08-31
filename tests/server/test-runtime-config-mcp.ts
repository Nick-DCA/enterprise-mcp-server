import assert from 'assert';
import { createMcpServer } from '../../src/mcp/server.js';
import { runtimeConfig } from '../../src/config/runtimeConfig.js';
import { checkToolExecutionAccess } from '../../src/mcp/accessGuard.js';
import { bigqueryTools } from '../../src/services/bigquery/tools/index.js';

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
