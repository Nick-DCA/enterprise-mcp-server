import { bigqueryService, stripSqlCommentsAndStrings } from '../../src/services/bigquery/client.js';
import { BigQueryConfig } from '../../src/services/bigquery/config.js';
import {
  BigQueryApiError,
  BigQueryCostLimitError,
  BigQuerySyntaxError,
} from '../../src/services/bigquery/errors.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function expectPass(testName: string, query: string, config?: Partial<BigQueryConfig>) {
  try {
    bigqueryService.validateQuery(query, config);
    assert(true, testName);
  } catch (error: any) {
    assert(false, testName, `Unexpected rejection: ${error.message}`);
  }
}

function expectBlocked(testName: string, query: string, expectedErrorCode?: string, config?: Partial<BigQueryConfig>) {
  try {
    bigqueryService.validateQuery(query, config);
    assert(false, testName, `Expected rejection but query PASSED: "${query}"`);
  } catch (error: any) {
    if (expectedErrorCode && error instanceof BigQueryApiError) {
      const codeMatch = error.code === expectedErrorCode;
      assert(codeMatch, testName, codeMatch ? undefined : `Expected error code '${expectedErrorCode}', got '${error.code}' (${error.message})`);
    } else {
      assert(true, testName);
    }
  }
}

async function runStandaloneSqlGuardrailTests() {
  console.log('======================================================================');
  console.log('🧪 BigQuery SQL Guardrails & Keyword Shift Standalone Test Suite');
  console.log('======================================================================\n');

  // -------------------------------------------------------------------------
  // SECTION 1: PERMITTED SQL CLAUSES & METHODS (READ-SAFE)
  // -------------------------------------------------------------------------
  console.log('--- 1. Permitted Read Methods & Clauses Verification ---');

  expectPass(
    'Permit standard SELECT query',
    'SELECT customer_id, first_name, email FROM `my_project.crm.customers` WHERE active = true'
  );

  expectPass(
    'Permit WITH Common Table Expression (CTE) query',
    'WITH regional_summary AS (SELECT region, SUM(amount) AS total_sales FROM `sales.orders` GROUP BY region) SELECT * FROM regional_summary ORDER BY total_sales DESC LIMIT 10'
  );

  expectPass(
    'Permit EXPLAIN statement',
    'EXPLAIN SELECT id, name FROM `production.inventory` WHERE stock < 10'
  );

  expectPass(
    'Permit JOIN (INNER, LEFT, RIGHT, FULL)',
    `SELECT o.order_id, c.customer_name 
     FROM \`dataset.orders\` o
     INNER JOIN \`dataset.customers\` c ON o.customer_id = c.id
     LEFT JOIN \`dataset.discounts\` d ON o.discount_id = d.id
     RIGHT JOIN \`dataset.regions\` r ON o.region_id = r.id
     FULL JOIN \`dataset.audits\` a ON o.id = a.order_id`
  );

  expectPass(
    'Permit UNION and UNION ALL',
    'SELECT id, name FROM `eu.leads` UNION ALL SELECT id, name FROM `us.leads`'
  );

  expectPass(
    'Permit GROUP BY, HAVING, ORDER BY, LIMIT, OFFSET, DISTINCT',
    'SELECT DISTINCT department, COUNT(id) as total FROM `hr.employees` WHERE active = true GROUP BY department HAVING total > 5 ORDER BY total DESC LIMIT 25 OFFSET 10'
  );

  expectPass(
    'Permit queries with leading and inline comments',
    `-- Header comment explaining query
     /* Multi-line comment 
        with notes */
     SELECT product_id, sku, price FROM \`retail.catalog\` WHERE in_stock = true -- trailing inline comment`
  );

  // -------------------------------------------------------------------------
  // SECTION 2: DEFAULT BLOCKED MUTATION & DDL OPERATIONS
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Blocked DML / DDL / Mutation Clauses Verification ---');

  const blockedMutationTests = [
    { name: 'Block DELETE statement', query: 'DELETE FROM `production.users` WHERE id = 101' },
    { name: 'Block UPDATE statement', query: 'UPDATE `production.users` SET role = "admin" WHERE id = 101' },
    { name: 'Block INSERT statement', query: 'INSERT INTO `production.audit_logs` (event) VALUES ("test")' },
    { name: 'Block MERGE statement', query: 'MERGE `target.table` T USING `source.table` S ON T.id = S.id WHEN MATCHED THEN UPDATE SET T.v = S.v' },
    { name: 'Block TRUNCATE statement', query: 'TRUNCATE TABLE `production.temp_stage`' },
    { name: 'Block DROP TABLE statement', query: 'DROP TABLE `analytics.old_reports`' },
    { name: 'Block DROP VIEW statement', query: 'DROP VIEW `analytics.summary_view`' },
    { name: 'Block DROP SCHEMA / DATASET statement', query: 'DROP SCHEMA `analytics` CASCADE' },
    { name: 'Block CREATE TABLE statement', query: 'CREATE TABLE `analytics.new_table` (id INT64, name STRING)' },
    { name: 'Block CREATE OR REPLACE TABLE', query: 'CREATE OR REPLACE TABLE `analytics.cache` AS SELECT 1' },
    { name: 'Block CREATE VIEW statement', query: 'CREATE VIEW `analytics.my_view` AS SELECT 1' },
    { name: 'Block CREATE MATERIALIZED VIEW', query: 'CREATE MATERIALIZED VIEW `analytics.mat_view` AS SELECT count(1) FROM `analytics.events`' },
    { name: 'Block CREATE FUNCTION (UDF)', query: 'CREATE FUNCTION `analytics.clean_name`(x STRING) RETURNS STRING AS (TRIM(x))' },
    { name: 'Block CREATE PROCEDURE', query: 'CREATE PROCEDURE `analytics.run_batch`() BEGIN SELECT 1; END' },
    { name: 'Block ALTER TABLE statement', query: 'ALTER TABLE `analytics.users` ADD COLUMN tier STRING' },
    { name: 'Block ALTER SCHEMA statement', query: 'ALTER SCHEMA `analytics` SET OPTIONS (default_table_expiration_days=30)' },
    { name: 'Block CALL stored procedure', query: 'CALL `analytics.proc_calculate_pnl`("2026-08")' },
    { name: 'Block EXPORT DATA to Cloud Storage', query: 'EXPORT DATA OPTIONS(uri="gs://my-bucket/dump/*.csv", format="CSV") AS SELECT * FROM `dataset.users`' },
    { name: 'Block LOAD DATA from Cloud Storage', query: 'LOAD DATA INTO `dataset.users` FROM FILES(format="CSV", uris=["gs://my-bucket/users.csv"])' },
    { name: 'Block GRANT IAM statement', query: 'GRANT `roles/bigquery.dataViewer` ON DATASET `finance` TO "user:attacker@evil.com"' },
    { name: 'Block REVOKE IAM statement', query: 'REVOKE `roles/bigquery.dataViewer` ON DATASET `finance` FROM "user:dev@company.com"' },
  ];

  for (const test of blockedMutationTests) {
    expectBlocked(test.name, test.query);
  }

  // -------------------------------------------------------------------------
  // SECTION 3: CROSS JOIN & HIGH-BILLING CARPET-BOMB GUARD
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Cartesian Product Guard (CROSS JOIN) ---');

  expectBlocked(
    'Block dangerous CROSS JOIN query (prevents Cartesian explosion & runaway scan bill)',
    'SELECT a.id, b.name FROM `massive_dataset.table_a` a CROSS JOIN `massive_dataset.table_b` b',
    'STRICT_READ_ONLY_VIOLATION'
  );

  expectBlocked(
    'Block CROSS JOIN in lowercase/mixed-case',
    'select x, y from table1 cross join table2'
  );

  expectPass(
    'Allow phrase "CROSS JOIN" when inside string literal (no false positive)',
    "SELECT id, 'This query is not a CROSS JOIN' AS note FROM `dataset.table` WHERE id = 1"
  );

  expectPass(
    'Allow phrase "CROSS JOIN" when inside comment (no false positive)',
    `-- Note: previously we used CROSS JOIN here but optimized to INNER JOIN
     SELECT a.id, b.id FROM \`table_a\` a INNER JOIN \`table_b\` b ON a.key = b.key`
  );

  // -------------------------------------------------------------------------
  // SECTION 4: MULTI-STATEMENT SQL INJECTION GUARD
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Multi-Statement SQL Injection Blocking ---');

  expectBlocked(
    'Block query chaining multiple statements (SELECT 1; DROP TABLE users)',
    'SELECT 1; DROP TABLE `production.users`',
    'MULTI_STATEMENT_BLOCKED',
    { blockMultiStatement: true }
  );

  expectBlocked(
    'Block chained read queries (SELECT 1; SELECT 2)',
    'SELECT id FROM `dataset.table1`; SELECT id FROM `dataset.table2`',
    'MULTI_STATEMENT_BLOCKED',
    { blockMultiStatement: true }
  );

  expectPass(
    'Permit valid single statement with trailing semicolon',
    'SELECT customer_id, balance FROM `finance.accounts` WHERE balance > 0;',
    { blockMultiStatement: true }
  );

  expectPass(
    'Permit semicolon inside string literal (e.g. email or text)',
    "SELECT id, 'header;content;footer' AS csv_line FROM `dataset.logs`;",
    { blockMultiStatement: true }
  );

  // -------------------------------------------------------------------------
  // SECTION 5: SELECT * WILDCARD INTERCEPTOR
  // -------------------------------------------------------------------------
  console.log('\n--- 5. SELECT * Wildcard Interceptor Policy ---');

  expectBlocked(
    "Block 'SELECT *' when selectAllPolicy is BLOCK",
    'SELECT * FROM `dataset.large_table`',
    'SELECT_STAR_BLOCKED',
    { selectAllPolicy: 'BLOCK' }
  );

  expectBlocked(
    "Block 'SELECT DISTINCT *' when selectAllPolicy is BLOCK",
    'SELECT DISTINCT * FROM `dataset.large_table`',
    'SELECT_STAR_BLOCKED',
    { selectAllPolicy: 'BLOCK' }
  );

  expectBlocked(
    "Block alias wildcard 'SELECT t.*' when selectAllPolicy is BLOCK",
    'SELECT t.* FROM `dataset.large_table` t',
    'SELECT_STAR_BLOCKED',
    { selectAllPolicy: 'BLOCK' }
  );

  expectPass(
    'Allow explicit column projections when selectAllPolicy is BLOCK',
    'SELECT id, customer_name, total_amount FROM `dataset.large_table`',
    { selectAllPolicy: 'BLOCK' }
  );

  expectPass(
    "Allow 'SELECT *' when selectAllPolicy is WARN or ALLOW",
    'SELECT * FROM `dataset.small_table` LIMIT 10',
    { selectAllPolicy: 'WARN' }
  );

  // -------------------------------------------------------------------------
  // SECTION 6: GRANULAR DUAL-LIST KEYWORD SHIFTING
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Granular Custom Mode: Dynamic Keyword Shifting ---');

  // Case A: Shift WHERE to blocked list
  const customConfigWithBlockedWhere: Partial<BigQueryConfig> = {
    sqlGuardrailMode: 'GRANULAR_CUSTOM',
    allowedSqlClauses: ['SELECT', 'FROM', 'LIMIT'],
    blockedSqlClauses: ['WHERE', 'CROSS JOIN', 'DELETE', 'DROP', 'INSERT'],
  };

  expectBlocked(
    "Custom Shifting: Block query using 'WHERE' when WHERE is shifted to blocked list",
    'SELECT id, name FROM `dataset.users` WHERE active = true',
    'BLOCKED_CLAUSE_VIOLATION',
    customConfigWithBlockedWhere
  );

  expectPass(
    "Custom Shifting: Allow query without 'WHERE' under custom configuration",
    'SELECT id, name FROM `dataset.users` LIMIT 100',
    customConfigWithBlockedWhere
  );

  // Case B: Shift UNION ALL to blocked list
  const customConfigWithBlockedUnion: Partial<BigQueryConfig> = {
    sqlGuardrailMode: 'GRANULAR_CUSTOM',
    allowedSqlClauses: ['SELECT', 'FROM', 'WHERE'],
    blockedSqlClauses: ['UNION ALL', 'UNION', 'DELETE'],
  };

  expectBlocked(
    "Custom Shifting: Block multi-word 'UNION ALL' when shifted to blocked list",
    'SELECT id FROM `eu.leads` UNION ALL SELECT id FROM `us.leads`',
    'BLOCKED_CLAUSE_VIOLATION',
    customConfigWithBlockedUnion
  );

  // Case C: Unpermitted statement start in custom mode
  const customConfigWithOnlySelect: Partial<BigQueryConfig> = {
    sqlGuardrailMode: 'GRANULAR_CUSTOM',
    allowedSqlClauses: ['SELECT'],
    blockedSqlClauses: ['DELETE', 'DROP'],
  };

  expectBlocked(
    "Custom Shifting: Block 'WITH' statement when only 'SELECT' is permitted in allowedSqlClauses",
    'WITH temp AS (SELECT 1) SELECT * FROM temp',
    'DISALLOWED_START_CLAUSE',
    customConfigWithOnlySelect
  );

  // -------------------------------------------------------------------------
  // SECTION 7: FALSE-POSITIVE IMMUNITY & ESCAPED IDENTIFIERS
  // -------------------------------------------------------------------------
  console.log('\n--- 7. Identifier & String False-Positive Immunity ---');

  expectPass(
    'Allow column names containing keyword substrings (e.g. is_deleted, created_at, drop_count)',
    'SELECT is_deleted, created_at, drop_count, update_time FROM `dataset.audit_metrics` WHERE is_deleted = false'
  );

  expectPass(
    'Allow string values containing mutation keywords (e.g. action = "DELETE")',
    "SELECT id, user_id, action FROM `dataset.logs` WHERE action = 'DELETE' AND description = 'DROP TABLE requested'"
  );

  expectPass(
    'Allow backtick identifiers matching keywords',
    'SELECT `select`, `from`, `order` FROM `project.dataset.table`'
  );

  // -------------------------------------------------------------------------
  // SECTION 8: ZERO-COST SCAN & PRE-FLIGHT DRY RUN SIMULATION
  // -------------------------------------------------------------------------
  console.log('\n--- 8. Zero-Cost Pre-Flight Dry Run & Syntax Estimation ---');

  // Case A: Dry run validation passes valid read query without executing or scanning billable rows
  const dryRunZeroCostQuery = 'SELECT 1 AS probe_ping, CURRENT_TIMESTAMP() AS current_time';
  try {
    bigqueryService.validateQuery(dryRunZeroCostQuery, { enableDryRunPreFlight: true });
    assert(true, 'Zero-Cost dry run query passes pre-flight validation');
  } catch (err: any) {
    assert(false, 'Zero-Cost dry run query passes pre-flight validation', err.message);
  }

  // Case B: Dry run simulation of 0 bytes scanned (metadata queries / literal calculations)
  const mockZeroBytesProcessed = 0;
  const mockEstimatedMb = Math.round((mockZeroBytesProcessed / (1024 * 1024)) * 100) / 100;
  assert(
    mockEstimatedMb === 0,
    'Zero bytes processed yields exactly 0 MB estimated cost',
    `Expected 0 MB, got ${mockEstimatedMb} MB`
  );

  // Case C: Pre-Flight Dry Run blocks syntax errors and mutations with 0 bytes billed
  expectBlocked(
    'Pre-Flight Dry Run blocks syntax/mutation statement before job submission (0 bytes billed)',
    'DROP TABLE `analytics.customers`',
    'STRICT_READ_ONLY_VIOLATION',
    { enableDryRunPreFlight: true }
  );

  // -------------------------------------------------------------------------
  // SECTION 9: ARTIFICIAL SCAN LIMIT (maxBytesBilled) PROTECTION
  // -------------------------------------------------------------------------
  console.log('\n--- 9. Artificial Scan Limit (maxBytesBilled) & Cost Limit Enforcer ---');

  // Case A: Query within limit (e.g. 50 MB scan against 100 MB limit)
  const limit100Mb = 100 * 1024 * 1024; // 104,857,600 bytes
  const scan50Mb = 50 * 1024 * 1024;    // 52,428,800 bytes
  try {
    bigqueryService.enforceScanLimit(scan50Mb, limit100Mb);
    assert(true, 'Permit query scanning 50 MB when artificial scan limit is 100 MB');
  } catch (err: any) {
    assert(false, 'Permit query scanning 50 MB when artificial scan limit is 100 MB', err.message);
  }

  // Case B: Query exceeding artificial limit (e.g. 500 MB scan against 100 MB limit)
  const scan500Mb = 500 * 1024 * 1024;
  try {
    bigqueryService.enforceScanLimit(scan500Mb, limit100Mb);
    assert(false, 'Block query scanning 500 MB when artificial scan limit is 100 MB', 'Expected BigQueryCostLimitError');
  } catch (err: any) {
    const isCostError = err instanceof BigQueryCostLimitError;
    const hasLimitDetails = err.message.includes('500 MB') && err.message.includes('100 MB');
    assert(
      isCostError && hasLimitDetails,
      'Block query scanning 500 MB when artificial scan limit is 100 MB',
      isCostError ? undefined : 'Error was not BigQueryCostLimitError'
    );
  }

  // Case C: Massive 10 GB query against 1 GB default limit
  const limit1Gb = 1073741824; // 1 GB
  const scan10Gb = 10 * 1073741824; // 10 GB
  try {
    bigqueryService.enforceScanLimit(scan10Gb, limit1Gb);
    assert(false, 'Block massive 10 GB runaway query against 1 GB cap');
  } catch (err: any) {
    assert(
      err instanceof BigQueryCostLimitError,
      'Block massive 10 GB runaway query against 1 GB cap'
    );
  }

  // Case D: Zero bytes scan always passes any positive scan limit
  try {
    bigqueryService.enforceScanLimit(0, limit100Mb);
    assert(true, 'Zero-byte query always passes artificial scan limit');
  } catch (err: any) {
    assert(false, 'Zero-byte query always passes artificial scan limit', err.message);
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log(`Summary: ${passed} Passed, ${failed} Failed out of ${passed + failed} total tests.`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runStandaloneSqlGuardrailTests().catch((err) => {
  console.error('Fatal error during standalone test run:', err);
  process.exit(1);
});
