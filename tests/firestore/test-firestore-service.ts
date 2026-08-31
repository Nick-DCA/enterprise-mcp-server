import { firestoreService } from '../../src/services/firestore/client.js';
import {
  FirestoreWriteDisabledError,
  FirestorePermissionError,
  formatFirestoreError,
} from '../../src/services/firestore/errors.js';
import { firestoreTools } from '../../src/services/firestore/tools/index.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Testing Firestore Service & Security Guardrails');
  console.log('====================================================\n');

  // Test 1: Collection & Document Path Allowlist Matching
  console.log('--- Test 1: Collection Allowlist Matching ---');
  const allowlist = ['customers', 'orders', 'invoices_cache'];

  assert(
    firestoreService.isCollectionAllowed('customers', allowlist),
    'Root collection "customers" permitted'
  );
  assert(
    firestoreService.isCollectionAllowed('customers/cust_123', allowlist),
    'Document path "customers/cust_123" matches root collection'
  );
  assert(
    firestoreService.isCollectionAllowed('orders/ord_456/items/item_1', allowlist),
    'Nested subcollection "orders/ord_456/items/item_1" permitted under parent'
  );
  assert(
    !firestoreService.isCollectionAllowed('system_credentials', allowlist),
    'Blocked non-permitted collection "system_credentials"'
  );
  assert(
    !firestoreService.isCollectionAllowed('admin_users/adm_1', allowlist),
    'Blocked non-permitted document "admin_users/adm_1"'
  );
  assert(
    firestoreService.isCollectionAllowed('anything', ['*']),
    'Wildcard allowlist permits all collections'
  );
  assert(
    !firestoreService.isCollectionAllowed('anything', []),
    'Empty allowlist blocks all collections (Zero-Trust Default-Deny)'
  );

  // Test 2: Sensitive Field Redaction Sanitizer
  console.log('\n--- Test 2: Sensitive Field Redaction ---');
  const sensitiveDoc = {
    id: 'user_123',
    name: 'Alice',
    email: 'alice@example.com',
    password: 'supersecretpassword',
    apiKey: 'sk_live_123456789',
    nestedProfile: {
      ssn: '123-45-6789',
      token: 'jwt_bearer_token',
      address: {
        city: 'London',
        secret: 'admin_pass',
      },
    },
    tags: ['admin', 'customer'],
  };

  const excluded = ['password', 'apikey', 'ssn', 'token', 'secret'];
  const sanitized = firestoreService.sanitizeDocumentData(sensitiveDoc, excluded);

  assert(sanitized.name === 'Alice', 'Preserves public fields (name)');
  assert(sanitized.email === 'alice@example.com', 'Preserves public fields (email)');
  assert(sanitized.password === '[REDACTED]', 'Redacts top-level password');
  assert(sanitized.apiKey === '[REDACTED]', 'Redacts top-level apiKey');
  assert(sanitized.nestedProfile.ssn === '[REDACTED]', 'Redacts nested ssn');
  assert(sanitized.nestedProfile.token === '[REDACTED]', 'Redacts nested token');
  assert(sanitized.nestedProfile.address.city === 'London', 'Preserves nested city');
  assert(sanitized.nestedProfile.address.secret === '[REDACTED]', 'Redacts deeply nested secret');

  // Test 3: Write Protection Lock
  console.log('\n--- Test 3: Write Protection Lock ---');
  const writeErr = new FirestoreWriteDisabledError('Mutation blocked');
  const formattedWriteErr = formatFirestoreError(writeErr);
  assert(
    formattedWriteErr.includes('Mutation Blocked') && formattedWriteErr.includes('FIRESTORE_ALLOW_WRITES=false'),
    'Write disabled error formatted with policy explanation'
  );

  // Test 4: Error Formatters for LLM Self-Correction
  console.log('\n--- Test 4: Firestore Error Formatter ---');
  const notFoundErr = new Error('NOT_FOUND: No document found at path');
  const formattedNotFound = formatFirestoreError(notFoundErr);
  assert(
    formattedNotFound.includes('Not Found') && formattedNotFound.includes('Firestore'),
    'Not found error guides LLM on discovery'
  );

  const permErr = new FirestorePermissionError('Collection "admin" blocked');
  const formattedPerm = formatFirestoreError(permErr);
  assert(
    formattedPerm.includes('Access Denied') && formattedPerm.includes('permit-listed'),
    'Permission error identifies allowlist restrictions'
  );

  // Test 5: Tool Definitions Schema Check
  console.log('\n--- Test 5: Firestore MCP Tools Catalog ---');
  assert(firestoreTools.length === 6, `Registered 6 Firestore tools (Found: ${firestoreTools.length})`);

  const expectedTools = [
    { name: 'firestore-list-collections', readOnly: true },
    { name: 'firestore-get-collection-schema', readOnly: true },
    { name: 'firestore-list-subcollections', readOnly: true },
    { name: 'firestore-get-document', readOnly: true },
    { name: 'firestore-query-documents', readOnly: true },
    { name: 'firestore-set-document', readOnly: false },
  ];

  for (const exp of expectedTools) {
    const tool = firestoreTools.find((t) => t.name === exp.name);
    assert(!!tool, `Tool '${exp.name}' is registered`);
    if (tool) {
      assert(tool.description.length > 20, `Tool '${exp.name}' has detailed description`);
      assert(tool.annotations.readOnlyHint === exp.readOnly, `Tool '${exp.name}' readOnlyHint is ${exp.readOnly}`);
    }
  }

  console.log('\n====================================================');
  console.log(`Summary: ${passed} Passed, ${failed} Failed out of ${passed + failed} total assertions.`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
