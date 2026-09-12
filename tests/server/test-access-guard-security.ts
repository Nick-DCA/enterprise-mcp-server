import { runtimeConfig } from '../../src/config/runtimeConfig.js';
import { checkToolExecutionAccess } from '../../src/mcp/accessGuard.js';
import { ToolDefinition } from '../../src/mcp/types.js';
import { RequestContext } from '../../src/server/context.js';

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

const mockSlackSearchTool: ToolDefinition = {
  name: 'slack-federated-search',
  description: 'Searches Slack messages and direct messages across authorized channels.',
  schema: {},
  annotations: { readOnlyHint: true, destructiveHint: false },
  execute: async () => ({}),
};

const mockSlackGuideTool: ToolDefinition = {
  name: 'slack-search-guide',
  description: 'Educational syntax guide for search operators.',
  schema: {},
  annotations: { readOnlyHint: true, destructiveHint: false },
  execute: async () => ({}),
};

const mockXeroTool: ToolDefinition = {
  name: 'xero_get_invoices',
  description: 'Retrieves sales and purchase invoices from Xero.',
  schema: {},
  annotations: { readOnlyHint: true, destructiveHint: false },
  execute: async () => ({}),
};

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Testing Suite 21: Access Guard Security & Machine Identity Lockdown');
  console.log('====================================================\n');

  // Enable services for test baseline
  await runtimeConfig.updateServiceToggle('slack', true, 'test-admin');
  await runtimeConfig.updateServiceToggle('xero', true, 'test-admin');

  // 1. Machine Identity Calling Slack Search Under Open Delegation (allowAllUsers: true)
  console.log('--- 1. Machine Identity Blocked on Slack (allowAllUsers: true) ---');
  await runtimeConfig.updateServiceSettings('slack', { allowAllUsers: true }, 'test-admin');

  // Direct param check
  const machineCheck1 = await checkToolExecutionAccess(mockSlackSearchTool, 'slack', 'gemini-enterprise-mcp');
  assert(!machineCheck1.allowed, 'Direct machine identity "gemini-enterprise-mcp" is blocked on slack search');
  assert(
    machineCheck1.reason?.includes('requires an authenticated corporate user email'),
    'Rejection message clearly states corporate user email is required'
  );

  // Context-based check (when userEmail is omitted and resolved via RequestContext)
  const contextCheck1 = await RequestContext.run(
    { clientId: 'gemini-enterprise-mcp', userEmail: undefined },
    async () => {
      return checkToolExecutionAccess(mockSlackSearchTool, 'slack');
    }
  );
  assert(!contextCheck1.allowed, 'Machine identity in RequestContext is blocked on slack search');

  // Context-based check with machine ID passed into context.userEmail (should be sanitized)
  const contextCheck2 = await RequestContext.run(
    { clientId: 'gemini-enterprise-mcp', userEmail: 'gemini-enterprise-mcp' },
    async () => {
      return checkToolExecutionAccess(mockSlackSearchTool, 'slack');
    }
  );
  assert(!contextCheck2.allowed, 'Sanitized machine ID in context.userEmail is blocked on slack search');

  // 2. Machine Identity Calling Slack Search Under Strict IAM Mode (allowAllUsers: false)
  console.log('\n--- 2. Machine Identity Blocked on Slack (allowAllUsers: false) ---');
  await runtimeConfig.updateServiceSettings('slack', { allowAllUsers: false }, 'test-admin');

  const machineCheckStrict = await checkToolExecutionAccess(mockSlackSearchTool, 'slack', 'gemini-enterprise-mcp');
  assert(!machineCheckStrict.allowed, 'Machine identity is blocked in strict IAM mode');

  // 3. Human User Allowed Under Open Delegation (allowAllUsers: true)
  console.log('\n--- 3. Verified Human User Allowed on Slack (allowAllUsers: true) ---');
  await runtimeConfig.updateServiceSettings('slack', { allowAllUsers: true }, 'test-admin');

  const humanCheckOpen = await checkToolExecutionAccess(mockSlackSearchTool, 'slack', 'alice@digicloud.africa');
  assert(humanCheckOpen.allowed, 'Valid human email is allowed on slack search under open delegation');

  const humanContextCheck = await RequestContext.run(
    { clientId: 'gemini-enterprise-mcp', userEmail: 'alice@digicloud.africa' },
    async () => {
      return checkToolExecutionAccess(mockSlackSearchTool, 'slack');
    }
  );
  assert(humanContextCheck.allowed, 'Human email in RequestContext is allowed under open delegation');

  // 4. Human User in Strict IAM Mode (allowAllUsers: false)
  console.log('\n--- 4. Verified Human User in Strict IAM Mode (allowAllUsers: false) ---');
  await runtimeConfig.updateServiceSettings('slack', { allowAllUsers: false }, 'test-admin');

  // Unregistered user is denied
  const unlistedCheck = await checkToolExecutionAccess(mockSlackSearchTool, 'slack', 'bob.unlisted@digicloud.africa');
  assert(!unlistedCheck.allowed, 'Unregistered user without explicit grant is denied in strict IAM mode');
  assert(
    unlistedCheck.reason?.includes('requires an explicit administrator grant'),
    'Denial reason mentions explicit administrator grant required'
  );

  // Register user WITH slack grant
  await runtimeConfig.createUserAccess(
    {
      userEmail: 'charlie.approved@digicloud.africa',
      isAdmin: false,
      isEnabled: true,
      allowedServices: ['slack', 'xero'],
    },
    'test-admin'
  );

  const registeredCheck = await checkToolExecutionAccess(mockSlackSearchTool, 'slack', 'charlie.approved@digicloud.africa');
  assert(registeredCheck.allowed, 'Registered user with slack grant is permitted in strict IAM mode');

  // 5. Disabled User Account Blocked Regardless of Settings
  console.log('\n--- 5. Disabled User Account Blocked ---');
  await runtimeConfig.createUserAccess(
    {
      userEmail: 'disabled.user@digicloud.africa',
      isAdmin: false,
      isEnabled: false,
      allowedServices: ['slack', 'xero'],
    },
    'test-admin'
  );

  const disabledCheck = await checkToolExecutionAccess(mockSlackSearchTool, 'slack', 'disabled.user@digicloud.africa');
  assert(!disabledCheck.allowed, 'Explicitly disabled user account is blocked immediately');

  // 6. Educational Guide Tool Permitted for All Callers
  console.log('\n--- 6. Slack Search Guide Tool Allowed for All Callers ---');
  const guideMachineCheck = await checkToolExecutionAccess(mockSlackGuideTool, 'slack', 'gemini-enterprise-mcp');
  assert(guideMachineCheck.allowed, 'slack-search-guide is allowed for machine clients without user context');

  const guideUnauthCheck = await checkToolExecutionAccess(mockSlackGuideTool, 'slack', undefined);
  assert(guideUnauthCheck.allowed, 'slack-search-guide is allowed for unauthenticated callers');

  // 7. Non-Slack Services (e.g. Xero) Allowed for Machine Integrations
  console.log('\n--- 7. Non-Slack Services (Xero) Allowed for Machine Integrations ---');
  const xeroMachineCheck = await checkToolExecutionAccess(mockXeroTool, 'accounting', 'gemini-enterprise-mcp');
  assert(xeroMachineCheck.allowed, 'Xero organization-level tools continue to be allowed for machine clients');

  console.log('\n====================================================');
  const allPassed = results.every((r) => r.passed);
  if (allPassed) {
    console.log(`🎉 ALL ${results.length} Suite 21 Access Guard Security tests PASSED!`);
    process.exit(0);
  } else {
    const failed = results.filter((r) => !r.passed);
    console.error(`💥 ${failed.length} Suite 21 tests FAILED!`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
