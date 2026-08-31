import { AttributePrivacyEngine } from '../../src/services/sagehr/privacy.js';
import { SageHrConfig } from '../../src/services/sagehr/config.js';
import {
  SageHrWriteDisabledError,
  SageHrPermissionError,
  SageHrApiError,
  formatSageHrError,
} from '../../src/services/sagehr/errors.js';
import { sagehrTools } from '../../src/services/sagehr/tools/index.js';

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
  console.log('🧪 Testing Sage HR Service & Privacy Shield Engine');
  console.log('====================================================\n');

  // Test 1: PII, ID Numbers & Salary Masking
  console.log('--- Test 1: PII, ID Numbers & Salary Masking ---');
  const baseConfig: SageHrConfig = {
    allowWrites: true,
    maskedFields: [
      'id_number',
      'national_id',
      'passport_number',
      'ssn',
      'nin',
      'salary',
      'hourly_rate',
      'bank_account',
      'iban',
      'sort_code',
      'medical_notes',
      'personal_email',
      'home_address',
      'emergency_phone',
    ],
    blockedFields: [],
    safeAttributes: ['*'],
    allowedTeams: ['*'],
    blockedPositions: [],
    maxResults: 50,
  };

  const sensitiveEmployee = {
    id: 101,
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane.doe@company.com',
    job_title: 'Senior Engineer',
    department: 'Engineering',
    id_number: 'ID-99887766',
    national_id: 'NAT-554433',
    passport_number: 'PASS-123456',
    ssn: '000-12-3456',
    nin: 'QQ123456C',
    salary: 95000,
    hourly_rate: 45.5,
    bank_account: 'GB82WEST12345678901234',
    iban: 'GB82WEST12345678901234',
    medical_notes: 'Undergoing physiotherapy for knee surgery',
    emergency_phone: '+44 7700 900077',
    nestedDetails: {
      home_address: '123 High Street, London',
      personal_email: 'jane.private@gmail.com',
      work_phone: '+44 20 7946 0991',
    },
  };

  const masked: any = AttributePrivacyEngine.sanitize(sensitiveEmployee, baseConfig);

  assert(masked.first_name === 'Jane', 'Preserves public first_name');
  assert(masked.last_name === 'Doe', 'Preserves public last_name');
  assert(masked.email === 'jane.doe@company.com', 'Preserves work email');
  assert(masked.job_title === 'Senior Engineer', 'Preserves job_title');
  assert(masked.id_number === '[REDACTED]', 'Masks id_number with [REDACTED]');
  assert(masked.national_id === '[REDACTED]', 'Masks national_id with [REDACTED]');
  assert(masked.passport_number === '[REDACTED]', 'Masks passport_number with [REDACTED]');
  assert(masked.ssn === '[REDACTED]', 'Masks ssn with [REDACTED]');
  assert(masked.nin === '[REDACTED]', 'Masks nin with [REDACTED]');
  assert(masked.salary === '[REDACTED]', 'Masks salary with [REDACTED]');
  assert(masked.hourly_rate === '[REDACTED]', 'Masks hourly_rate with [REDACTED]');
  assert(masked.bank_account === '[REDACTED]', 'Masks bank_account with [REDACTED]');
  assert(masked.medical_notes === '[REDACTED]', 'Masks medical_notes with [REDACTED]');
  assert(masked.emergency_phone === '[REDACTED]', 'Masks emergency_phone with [REDACTED]');
  assert(masked.nestedDetails.home_address === '[REDACTED]', 'Masks nested home_address with [REDACTED]');
  assert(masked.nestedDetails.personal_email === '[REDACTED]', 'Masks nested personal_email with [REDACTED]');
  assert(masked.nestedDetails.work_phone === '+44 20 7946 0991', 'Preserves nested work_phone');

  // Test 2: Blocked / Stripped Fields (Completely removed from LLM context)
  console.log('\n--- Test 2: Blocked / Stripped Fields ---');
  const blockingConfig: SageHrConfig = {
    ...baseConfig,
    blockedFields: ['salary', 'disciplinary_notes', 'performance_rating', 'id_number'],
  };

  const blockedEmployee = {
    id: 102,
    first_name: 'John',
    job_title: 'Product Manager',
    salary: 85000,
    id_number: 'ID-12345',
    performance_rating: 'Exceeds Expectations',
    disciplinary_notes: 'None',
  };

  const blockedResult = AttributePrivacyEngine.sanitize(blockedEmployee, blockingConfig);

  assert(!('salary' in blockedResult), 'Blocked field "salary" completely stripped from JSON');
  assert(!('id_number' in blockedResult), 'Blocked field "id_number" completely stripped from JSON');
  assert(!('performance_rating' in blockedResult), 'Blocked field "performance_rating" stripped from JSON');
  assert(!('disciplinary_notes' in blockedResult), 'Blocked field "disciplinary_notes" stripped from JSON');
  assert(blockedResult.first_name === 'John', 'Unblocked field "first_name" retained');

  // Test 3: Safe Attributes Mode (Strict Permit Allowlist)
  console.log('\n--- Test 3: Safe Attributes Allowlist Mode ---');
  const safeOnlyConfig: SageHrConfig = {
    ...baseConfig,
    safeAttributes: ['id', 'first_name', 'last_name', 'email', 'job_title', 'department'],
  };

  const fullEmployee = {
    id: 103,
    first_name: 'Alice',
    last_name: 'Smith',
    email: 'alice@company.com',
    job_title: 'Designer',
    department: 'Design',
    custom_field_internal: 'Confidential Internal Note',
    unapproved_attribute: 'Random data',
  };

  const safeResult = AttributePrivacyEngine.sanitize(fullEmployee, safeOnlyConfig);

  assert(safeResult.first_name === 'Alice', 'Allowed safe attribute "first_name" present');
  assert(safeResult.department === 'Design', 'Allowed safe attribute "department" present');
  assert(!('custom_field_internal' in safeResult), 'Unlisted attribute "custom_field_internal" stripped');
  assert(!('unapproved_attribute' in safeResult), 'Unlisted attribute "unapproved_attribute" stripped');

  // Test 4: Team and Position Scoping
  console.log('\n--- Test 4: Team & Position Scoping Controls ---');
  const allowedTeams = ['engineering', 'product', 'marketing'];
  assert(AttributePrivacyEngine.isTeamAllowed('Engineering', allowedTeams), 'Permits "Engineering" team');
  assert(!AttributePrivacyEngine.isTeamAllowed('Executive Leadership', allowedTeams), 'Blocks "Executive Leadership" team');

  const blockedPositions = ['chief executive officer', 'ceo', 'hr director'];
  assert(AttributePrivacyEngine.isPositionAllowed('Software Engineer', blockedPositions), 'Permits "Software Engineer" position');
  assert(!AttributePrivacyEngine.isPositionAllowed('CEO', blockedPositions), 'Blocks "CEO" position');
  assert(!AttributePrivacyEngine.isPositionAllowed('HR Director', blockedPositions), 'Blocks "HR Director" position');

  // Test 5: Error Formatting for LLM Self-Correction
  console.log('\n--- Test 5: Error Formatters for LLM Self-Correction ---');
  const writeDisabledErr = new SageHrWriteDisabledError('Creating time off blocked');
  const formattedWrite = formatSageHrError(writeDisabledErr);
  assert(formattedWrite.includes('Mutation Blocked') && formattedWrite.includes('SAGE_HR_ALLOW_WRITES=false'), 'Write disabled error formatted');

  const permErr = new SageHrPermissionError('API Token Invalid');
  const formattedPerm = formatSageHrError(permErr);
  assert(formattedPerm.includes('Sage HR Access Denied') || formattedPerm.includes('Authentication Failed'), 'Permission error formatted');

  const valErr = new SageHrApiError('Invalid date format', 422);
  const formattedVal = formatSageHrError(valErr);
  assert(formattedVal.includes('HTTP 422') && formattedVal.includes('Validation Error'), 'Validation 422 error formatted');

  // Test 6: Sage HR Tool Catalog Schema & Annotation Verification
  console.log('\n--- Test 6: Sage HR MCP Tools Catalog (12 Tools) ---');
  assert(sagehrTools.length === 12, `Registered 12 Sage HR tools (Found: ${sagehrTools.length})`);

  const expectedTools = [
    { name: 'sagehr-list-employees', readOnly: true, destructive: false },
    { name: 'sagehr-get-employee', readOnly: true, destructive: false },
    { name: 'sagehr-list-out-of-office-today', readOnly: true, destructive: false },
    { name: 'sagehr-list-time-off-requests', readOnly: true, destructive: false },
    { name: 'sagehr-get-time-off-balances', readOnly: true, destructive: false },
    { name: 'sagehr-list-time-off-policies', readOnly: true, destructive: false },
    { name: 'sagehr-create-time-off-request', readOnly: false, destructive: false },
    { name: 'sagehr-cancel-time-off-request', readOnly: false, destructive: true },
    { name: 'sagehr-list-expenses', readOnly: true, destructive: false },
    { name: 'sagehr-get-expense', readOnly: true, destructive: false },
    { name: 'sagehr-list-expense-categories', readOnly: true, destructive: false },
    { name: 'sagehr-create-expense', readOnly: false, destructive: false },
  ];

  for (const exp of expectedTools) {
    const tool = sagehrTools.find((t) => t.name === exp.name);
    assert(!!tool, `Tool '${exp.name}' is registered`);
    if (tool) {
      assert(tool.name.startsWith('sagehr-'), `Tool '${exp.name}' starts with 'sagehr-' prefix`);
      assert(tool.description.length > 20, `Tool '${exp.name}' has comprehensive discovery description`);
      assert(tool.annotations.readOnlyHint === exp.readOnly, `Tool '${exp.name}' readOnlyHint is ${exp.readOnly}`);
      assert(tool.annotations.destructiveHint === exp.destructive, `Tool '${exp.name}' destructiveHint is ${exp.destructive}`);
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
