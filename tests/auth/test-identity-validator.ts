import { isValidUserEmail, cleanUserEmail, isAllowedEmailDomain, RESERVED_MACHINE_IDS } from '../../src/utils/identity.js';

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
  console.log('🧪 Testing Suite 20: Identity Validation & Sanitization');
  console.log('====================================================\n');

  // 1. Valid Corporate Email Acceptance
  console.log('--- 1. Valid Corporate Email Formats ---');
  assert(isValidUserEmail('alice@digicloud.africa'), 'Standard corporate email is accepted');
  assert(isValidUserEmail('bob.smith@company.com'), 'Email with dot in local part is accepted');
  assert(isValidUserEmail('user+tag@domain.co.uk'), 'Email with plus tag and multi-part TLD is accepted');
  assert(isValidUserEmail('test-123@sub.domain.org'), 'Email with hyphens and subdomain is accepted');
  assert(isValidUserEmail('  Nick@DigiCloud.Africa  '), 'Email with surrounding whitespace and mixed case is accepted');
  assert(isValidUserEmail('accounts.google.com:alice@digicloud.africa'), 'Email with Google Cloud IAP accounts.google.com prefix is accepted');

  // 2. Machine Identity & Reserved Name Rejection
  console.log('\n--- 2. Reserved Machine Identity Rejection ---');
  assert(!isValidUserEmail('gemini-enterprise-mcp'), 'Reserved machine ID "gemini-enterprise-mcp" is strictly rejected');
  assert(!isValidUserEmail('gemini-enterprise'), 'Reserved machine ID "gemini-enterprise" is strictly rejected');
  assert(!isValidUserEmail('mcp-xero-server'), 'Reserved machine ID "mcp-xero-server" is strictly rejected');
  assert(!isValidUserEmail('system'), 'Reserved machine ID "system" is strictly rejected');
  assert(!isValidUserEmail('anonymous'), 'Reserved machine ID "anonymous" is strictly rejected');
  assert(!isValidUserEmail('service-account'), 'Reserved machine ID "service-account" is strictly rejected');
  assert(!isValidUserEmail('admin-cli'), 'Reserved machine ID "admin-cli" is strictly rejected');

  for (const machineId of RESERVED_MACHINE_IDS) {
    assert(!isValidUserEmail(machineId), `Reserved ID '${machineId}' is strictly rejected`);
    assert(!isValidUserEmail(machineId.toUpperCase()), `Uppercase reserved ID '${machineId.toUpperCase()}' is strictly rejected`);
  }

  // 3. OAuth Client Identifier Prefix Rejection
  console.log('\n--- 3. OAuth Client Prefix Rejection ---');
  assert(!isValidUserEmail('client-12345'), 'Client prefix ID "client-12345" is rejected');
  assert(!isValidUserEmail('client-gemini-mcp'), 'Client prefix ID "client-gemini-mcp" is rejected');

  // 4. Malformed Email Rejection
  console.log('\n--- 4. Malformed & Non-Email Input Rejection ---');
  assert(!isValidUserEmail('not-an-email'), 'Plain text without @ is rejected');
  assert(!isValidUserEmail('@nodomain.com'), 'Missing local part is rejected');
  assert(!isValidUserEmail('noat.com'), 'Domain without @ is rejected');
  assert(!isValidUserEmail('user@'), 'Missing domain part is rejected');
  assert(!isValidUserEmail('spaces in@email.com'), 'Email containing inner spaces is rejected');
  assert(!isValidUserEmail(''), 'Empty string is rejected');
  assert(!isValidUserEmail('   '), 'Whitespace-only string is rejected');
  assert(!isValidUserEmail(undefined), 'undefined is rejected');
  assert(!isValidUserEmail(null), 'null is rejected');
  assert(!isValidUserEmail(12345 as any), 'Number type is rejected');
  assert(!isValidUserEmail({} as any), 'Object type is rejected');

  // 5. cleanUserEmail Normalization Checks
  console.log('\n--- 5. cleanUserEmail Normalization & Sanitization ---');
  assert(
    cleanUserEmail('accounts.google.com:Nick@DigiCloud.Africa') === 'nick@digicloud.africa',
    'cleanUserEmail strips accounts.google.com prefix and lowercases'
  );
  assert(
    cleanUserEmail('  ALICE@Company.COM  ') === 'alice@company.com',
    'cleanUserEmail trims and lowercases valid email'
  );
  assert(cleanUserEmail('gemini-enterprise-mcp') === undefined, 'cleanUserEmail returns undefined for machine ID');
  assert(cleanUserEmail('not-an-email') === undefined, 'cleanUserEmail returns undefined for invalid string');
  assert(cleanUserEmail(undefined) === undefined, 'cleanUserEmail returns undefined for undefined input');

  // 6. Domain Whitelisting Checks (isAllowedEmailDomain)
  console.log('\n--- 6. Domain Whitelist Verification ---');
  const allowed = ['digicloud.africa', 'partner.org'];
  assert(isAllowedEmailDomain('alice@digicloud.africa', allowed), 'Allowed domain matches');
  assert(isAllowedEmailDomain('BOB@PARTNER.ORG', allowed), 'Case-insensitive domain matches');
  assert(!isAllowedEmailDomain('attacker@evil.com', allowed), 'Unauthorized domain is rejected');
  assert(!isAllowedEmailDomain('gemini-enterprise-mcp', allowed), 'Machine ID is rejected by domain check');
  assert(isAllowedEmailDomain('anyone@anywhere.com', ['*']), 'Wildcard domain whitelist allows all valid emails');
  assert(isAllowedEmailDomain('anyone@anywhere.com', []), 'Empty domain whitelist allows valid emails');

  console.log('\n====================================================');
  const allPassed = results.every((r) => r.passed);
  if (allPassed) {
    console.log(`🎉 ALL ${results.length} Suite 20 Identity Validation tests PASSED!`);
    process.exit(0);
  } else {
    const failed = results.filter((r) => !r.passed);
    console.error(`💥 ${failed.length} Suite 20 tests FAILED!`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
