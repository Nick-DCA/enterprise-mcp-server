import { bigqueryService } from '../../src/services/bigquery/client.js';
import {
  BigQueryCostLimitError,
  BigQuerySyntaxError,
  formatBigQueryError,
} from '../../src/services/bigquery/errors.js';
import { bigqueryTools } from '../../src/services/bigquery/tools/index.js';

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
  console.log('🧪 Testing BigQuery Service & Security Guardrails');
  console.log('====================================================\n');

  // Test 1: Read-Only Query Validation
  console.log('--- Test 1: Read-Only SQL Safety Validation ---');
  const validQueries = [
    'SELECT * FROM `my_project.dataset.table` LIMIT 10',
    'WITH summary AS (SELECT customer_id, count(1) as total FROM `dataset.orders` GROUP BY 1) SELECT * FROM summary',
    '  SELECT id, amount FROM finance.invoices WHERE amount > 100  ',
    '-- comment\nSELECT 1',
  ];

  for (const q of validQueries) {
    try {
      bigqueryService.validateReadOnlyQuery(q);
      assert(true, `Allowed valid read-only query: ${q.substring(0, 45)}...`);
    } catch (e: any) {
      assert(false, `Unexpectedly rejected valid query: ${q} (${e.message})`);
    }
  }

  const mutatingQueries = [
    'DELETE FROM dataset.orders WHERE order_id = 123',
    'DROP TABLE dataset.customers',
    'INSERT INTO dataset.logs VALUES (1, "test")',
    'UPDATE dataset.users SET is_active = true WHERE id = 1',
    'TRUNCATE TABLE dataset.staging',
    'ALTER TABLE dataset.table ADD COLUMN x INT64',
    'CREATE TABLE dataset.new_table (id INT64)',
  ];

  for (const q of mutatingQueries) {
    try {
      bigqueryService.validateReadOnlyQuery(q);
      assert(false, `Security breach: Allowed mutation query: ${q}`);
    } catch (e: any) {
      assert(true, `Correctly blocked mutation query: ${q.substring(0, 35)}... (${e.message})`);
    }
  }

  // Test 2: Table/View Allowlist Verification
  console.log('\n--- Test 2: Table & View Allowlist Verification ---');
  const allowlist = ['invoices_summary', 'finance.daily_revenue', 'reports.q3_metrics'];

  assert(
    bigqueryService.isTableAllowed('invoices_summary', 'finance', allowlist),
    'Allowed table matched by tableId (invoices_summary)'
  );
  assert(
    bigqueryService.isTableAllowed('daily_revenue', 'finance', allowlist),
    'Allowed table matched by dataset.tableId (finance.daily_revenue)'
  );
  assert(
    !bigqueryService.isTableAllowed('raw_credit_cards', 'finance', allowlist),
    'Blocked non-permitted sensitive table (finance.raw_credit_cards)'
  );
  assert(
    bigqueryService.isTableAllowed('any_table', 'any_dataset', ['*']),
    'Wildcard allowlist [*] permits all tables'
  );
  assert(
    bigqueryService.isTableAllowed('any_table', 'any_dataset', []),
    'Empty allowlist [] permits all tables'
  );

  // Test 3: BigQuery Error Formatter for LLM Self-Correction
  console.log('\n--- Test 3: BigQuery Error Formatter ---');
  const costErr = new BigQueryCostLimitError('Query scanned 5 GB, limit is 1 GB');
  const formattedCost = formatBigQueryError(costErr);
  assert(
    formattedCost.includes('cost protection') && formattedCost.includes('5 GB'),
    'Cost error formatted with actionable explanation'
  );

  const syntaxErr = new BigQuerySyntaxError('Syntax error: Unexpected keyword WHERE at [1:15]');
  const formattedSyntax = formatBigQueryError(syntaxErr);
  assert(
    formattedSyntax.includes('SQL Syntax Error'),
    'Syntax error identified and formatted'
  );

  const notFoundErr = new Error('Not found: Table secret-project:dataset.nonexistent');
  const formattedNotFound = formatBigQueryError(notFoundErr);
  assert(
    formattedNotFound.includes('BigQuery Resource Not Found') && formattedNotFound.includes('bigquery-list-tables'),
    'Not found error directs LLM to use bigquery-list-tables'
  );

  // Test 4: Tool Definitions Schema Check
  console.log('\n--- Test 4: BigQuery MCP Tool Schema & Annotations Check ---');
  assert(bigqueryTools.length === 5, `Registered 5 BigQuery tools (Found: ${bigqueryTools.length})`);

  const expectedToolNames = [
    'bigquery-list-datasets',
    'bigquery-list-tables',
    'bigquery-get-table-schema',
    'bigquery-dry-run-query',
    'bigquery-execute-query-readonly',
  ];

  for (const name of expectedToolNames) {
    const tool = bigqueryTools.find((t) => t.name === name);
    assert(!!tool, `Tool '${name}' is registered`);
    if (tool) {
      assert(tool.description.length > 20, `Tool '${name}' has detailed description`);
      assert(tool.annotations.readOnlyHint === true, `Tool '${name}' is marked readOnlyHint: true`);
    }
  }

  // Test 5: Resource Scope Parsing & Granular IAM Command Generation
  console.log('\n--- Test 5: Resource Scope Parsing & Granular IAM Generation ---');
  const scope1 = bigqueryService.parseResourceIdentifier('finance_project', 'host-proj');
  assert(scope1.scopeLevel === 'project' && scope1.projectId === 'finance_project', 'Parsed 1-part project identifier');
  const iam1 = bigqueryService.generateLeastPrivilegeIamCommands('test-sa@host.iam.gserviceaccount.com', scope1);
  assert(iam1.scopeBadge === 'ENTIRE PROJECT', 'Generated project-wide scope badge');
  assert(iam1.gcloudCommand.includes('gcloud projects add-iam-policy-binding finance_project'), 'Generated project-wide gcloud command');

  const scope2 = bigqueryService.parseResourceIdentifier('finance_project.analytics_ds', 'host-proj');
  assert(scope2.scopeLevel === 'dataset' && scope2.projectId === 'finance_project' && scope2.datasetId === 'analytics_ds', 'Parsed 2-part dataset identifier');
  const iam2 = bigqueryService.generateLeastPrivilegeIamCommands('test-sa@host.iam.gserviceaccount.com', scope2);
  assert(iam2.scopeBadge === 'DATASET (ALL TABLES)', 'Generated dataset scope badge');
  assert(iam2.gcloudCommand.includes('projects/finance_project/datasets/analytics_ds'), 'Generated dataset IAM condition in gcloud command');
  assert(iam2.sqlCommand.includes('GRANT `roles/bigquery.dataViewer` ON DATASET `finance_project.analytics_ds`'), 'Generated BigQuery SQL GRANT for dataset');

  const scope3 = bigqueryService.parseResourceIdentifier('finance_project.analytics_ds.invoices_table', 'host-proj');
  assert(scope3.scopeLevel === 'table' && scope3.tableId === 'invoices_table', 'Parsed 3-part table identifier');
  const iam3 = bigqueryService.generateLeastPrivilegeIamCommands('test-sa@host.iam.gserviceaccount.com', scope3);
  assert(iam3.scopeBadge === 'SINGLE TABLE / VIEW', 'Generated single table scope badge');
  assert(iam3.gcloudCommand.includes('projects/finance_project/datasets/analytics_ds/tables/invoices_table'), 'Generated table IAM condition in gcloud command');
  assert(iam3.sqlCommand.includes('GRANT `roles/bigquery.dataViewer` ON TABLE `finance_project.analytics_ds.invoices_table`'), 'Generated BigQuery SQL GRANT for table');

  // Test 6: View Dependency Error Extraction
  console.log('\n--- Test 6: View Source Dependency Extraction ---');
  const viewDeniedErr = new Error('Access Denied: Table raw-project:raw_dataset.billing_source: User does not have permission to query table raw-project:raw_dataset.billing_source');
  const viewDep = bigqueryService.extractViewSourceDependencyFromError(viewDeniedErr);
  assert(viewDep.isViewDependencyError === true, 'Detected view source dependency error');
  assert(viewDep.missingProject === 'raw-project', 'Extracted missing view source project');
  assert(viewDep.missingDataset === 'raw_dataset', 'Extracted missing view source dataset');
  assert(viewDep.missingTable === 'billing_source', 'Extracted missing view source table');

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
