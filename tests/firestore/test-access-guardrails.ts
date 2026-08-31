import { firestoreService, SYSTEM_RESERVED_COLLECTIONS } from '../../src/services/firestore/client.js';
import { DEFAULT_BLOCKED_COLLECTIONS } from '../../src/services/firestore/config.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n================================================================');
  console.log('🧪 FIRESTORE ZERO-TRUST & DEFENSIVE ACCESS CONTROL TESTS');
  console.log('================================================================\n');

  const defaultBlocked = [...DEFAULT_BLOCKED_COLLECTIONS];

  // 1. Zero-Trust Default-Deny: Empty allowlist denies everything
  console.log('--- Test Suite 1: Zero-Trust Default-Deny (Empty Allowlist) ---');
  assert(
    firestoreService.isCollectionAllowed('invoices', [], defaultBlocked) === false,
    'Empty allowlist blocks "invoices"'
  );
  assert(
    firestoreService.isCollectionAllowed('customers', [], defaultBlocked) === false,
    'Empty allowlist blocks "customers"'
  );
  assert(
    firestoreService.isCollectionAllowed('audit_logs', [], defaultBlocked) === false,
    'Empty allowlist blocks "audit_logs"'
  );

  // 2. Explicit Allowlist Permits Specified Collections Only
  console.log('\n--- Test Suite 2: Explicit Allowlist Matching ---');
  const allowedInvoices = ['invoices'];
  assert(
    firestoreService.isCollectionAllowed('invoices', allowedInvoices, defaultBlocked) === true,
    'Permits "invoices" when in allowlist'
  );
  assert(
    firestoreService.isCollectionAllowed('customers', allowedInvoices, defaultBlocked) === false,
    'Denies "customers" when not in allowlist'
  );
  assert(
    firestoreService.isCollectionAllowed('invoices/inv_123', allowedInvoices, defaultBlocked) === true,
    'Permits document path "invoices/inv_123" under allowed collection'
  );

  // 3. Blocklist Takes Precedence Over Allowlist
  console.log('\n--- Test Suite 3: Blocklist Precedence Over Allowlist ---');
  const allowlistWithBlocked = ['invoices', 'audit_logs', 'system_metadata'];
  assert(
    firestoreService.isCollectionAllowed('audit_logs', allowlistWithBlocked, defaultBlocked) === false,
    'Denies "audit_logs" even when explicitly present in allowlist'
  );
  assert(
    firestoreService.isCollectionAllowed('system_metadata', allowlistWithBlocked, defaultBlocked) === false,
    'Denies "system_metadata" even when explicitly present in allowlist'
  );
  assert(
    firestoreService.isCollectionAllowed('invoices', allowlistWithBlocked, defaultBlocked) === true,
    'Permits "invoices" when in allowlist and not blocked'
  );

  // 4. Wildcard allow_all Permits Non-Blocked Collections
  console.log('\n--- Test Suite 4: Wildcard allow_all Mode ---');
  const allowAllList = ['allow_all'];
  assert(
    firestoreService.isCollectionAllowed('invoices', allowAllList, defaultBlocked) === true,
    'Permits "invoices" in allow_all mode'
  );
  assert(
    firestoreService.isCollectionAllowed('customers', allowAllList, defaultBlocked) === true,
    'Permits "customers" in allow_all mode'
  );
  assert(
    firestoreService.isCollectionAllowed('system_metadata', allowAllList, defaultBlocked) === false,
    'Blocks "system_metadata" in allow_all mode'
  );
  assert(
    firestoreService.isCollectionAllowed('services_config', allowAllList, defaultBlocked) === false,
    'Blocks "services_config" in allow_all mode'
  );
  assert(
    firestoreService.isCollectionAllowed('users_access', allowAllList, defaultBlocked) === false,
    'Blocks "users_access" in allow_all mode'
  );

  // 5. Nested and Subcollection Path Blocklist Enforcement
  console.log('\n--- Test Suite 5: Nested Path & Subcollection Guardrails ---');
  assert(
    firestoreService.isCollectionAllowed('users/usr_123/audit_logs', allowAllList, defaultBlocked) === false,
    'Blocks nested path "users/usr_123/audit_logs" because segment matches blocklist'
  );
  assert(
    firestoreService.isCollectionAllowed('system_metadata/installation', allowAllList, defaultBlocked) === false,
    'Blocks nested path "system_metadata/installation"'
  );

  // 6. Custom Blocked Collection Support
  console.log('\n--- Test Suite 6: Custom Blocked Collections ---');
  const customBlockedList = [...defaultBlocked, 'salaries', 'internal_credentials'];
  assert(
    firestoreService.isCollectionAllowed('salaries', allowAllList, customBlockedList) === false,
    'Blocks custom collection "salaries"'
  );
  assert(
    firestoreService.isCollectionAllowed('invoices/inv_1/salaries', allowAllList, customBlockedList) === false,
    'Blocks nested path with custom blocked segment "invoices/inv_1/salaries"'
  );

  // 7. Sensitive PII Field Masking
  console.log('\n--- Test Suite 7: Sensitive PII Field Redaction ---');
  const sampleDoc = {
    customerId: 'cust_999',
    customerName: 'Enterprise Client',
    password: 'supersecretpassword',
    token: 'jwt.token.here',
    apiKey: 'sk-live-12345',
    ssn: '123-45-6789',
    profile: {
      email: 'client@example.com',
      token: 'nested-token',
    },
  };
  const sanitized = firestoreService.sanitizeDocumentData(sampleDoc, ['password', 'token', 'apikey', 'ssn']);
  assert(sanitized.customerId === 'cust_999', 'Retains non-sensitive customerId');
  assert(sanitized.customerName === 'Enterprise Client', 'Retains non-sensitive customerName');
  assert(sanitized.password === '[REDACTED]', 'Redacts "password" field');
  assert(sanitized.token === '[REDACTED]', 'Redacts "token" field');
  assert(sanitized.apiKey === '[REDACTED]', 'Redacts "apiKey" field (case-insensitive)');
  assert(sanitized.ssn === '[REDACTED]', 'Redacts "ssn" field');
  assert(sanitized.profile.token === '[REDACTED]', 'Recursively redacts nested "token" in profile object');

  // 8. Customizing Blocklist (e.g. Removing audit_logs from Blocklist and Adding to Allowlist)
  console.log('\n--- Test Suite 8: Removing Collection from Blocklist and Allowing ---');
  const customizedBlocked = ['system_metadata', 'services_config', 'users_access', 'user_sessions', 'sessions']; // audit_logs removed
  const customizedAllowed = ['audit_logs'];
  assert(
    firestoreService.isCollectionAllowed('audit_logs', customizedAllowed, customizedBlocked) === true,
    'Permits "audit_logs" when admin explicitly removed it from blocklist and added to allowlist'
  );

  console.log('\n================================================================');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
