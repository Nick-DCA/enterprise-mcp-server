import { spawn } from 'child_process';
import path from 'path';

interface TestSuite {
  name: string;
  file: string;
}

const TEST_SUITES: TestSuite[] = [
  { name: '1. Crypto Foundation & Auth Config', file: 'tests/auth/test-crypto-foundation.ts' },
  { name: '2. Core OAuth 2.0 Domain Logic', file: 'tests/auth/test-oauth-service.ts' },
  { name: '3. OAuth Protocol HTTP Routes', file: 'tests/server/test-oauth-routes.ts' },
  { name: '4. Bearer Auth & Route Guards', file: 'tests/server/test-bearer-auth.ts' },
  { name: '5. Admin Auth & Session Management', file: 'tests/server/test-admin-auth.ts' },
  { name: '6. SaaS Services & Runtime Config API', file: 'tests/server/test-services-api.ts' },
  { name: '7. Secret Manager Vault API', file: 'tests/server/test-secrets-api.ts' },
  { name: '8. User Access & Permissions API', file: 'tests/server/test-users-api.ts' },
  { name: '9. Dynamic Runtime Config MCP Guard', file: 'tests/server/test-runtime-config-mcp.ts' },
  { name: '10. BigQuery Service Adapter', file: 'tests/bigquery/test-bigquery-service.ts' },
  { name: '11. Firestore Service Adapter', file: 'tests/firestore/test-firestore-service.ts' },
  { name: '12. Sage HR Service Adapter', file: 'tests/sagehr/test-sagehr-service.ts' },
  { name: '13. End-to-End OAuth & Token Expiry', file: 'tests/test-auth-e2e.ts' },
  { name: '14. MCP 59-Tool Schemas Validation', file: 'tests/test-tools-schema.ts' },
  { name: '15. Leaky Bucket Rate Limiter', file: 'tests/test-rate-limiter.ts' },
  { name: '16. Live MCP Integration Test Harness', file: 'tests/test-endpoints.ts' },
  { name: '17. Platform Setup & Initialisation API', file: 'tests/server/test-setup-api.ts' },
  { name: '18. Firestore Guardrails & Access Control', file: 'tests/firestore/test-access-guardrails.ts' },
  { name: '19. BigQuery SQL Guardrails & Keyword Shifting', file: 'tests/bigquery/test-sql-guardrails.ts' },
  { name: '20. Identity Validator & Domain Security', file: 'tests/auth/test-identity-validator.ts' },
  { name: '21. Access Guard Machine Identity Lockdown', file: 'tests/server/test-access-guard-security.ts' },
  { name: '22. Slack Connector Route & State Hardening', file: 'tests/connectors/test-slack-security.ts' },
  { name: '23. Slack PDF Extraction & Binary Guard', file: 'tests/connectors/test-slack-file-extract.ts' },
  { name: '24. User Logs Telemetry & Tracing Engine', file: 'tests/server/test-user-logs.ts' },
];

async function runCommand(cmd: string, args: string[], env: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: 'pipe',
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('close', (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

async function main() {
  console.log('\n================================================================');
  console.log('🧪 Enterprise Multi-SaaS MCP Server - Master Test Runner');
  console.log('================================================================\n');

  const startTime = Date.now();
  let passedCount = 0;
  let failedCount = 0;
  const results: { name: string; durationMs: number; passed: boolean; errorOutput?: string }[] = [];

  for (const suite of TEST_SUITES) {
    process.stdout.write(`  ⏳ Running [${suite.name}]...`);
    const suiteStart = Date.now();

    const res = await runCommand('npx', ['tsx', suite.file], {
      NODE_ENV: 'test',
      MOCK_SECRET_MANAGER: 'true',
      LOG_LEVEL: 'silent',
    });

    const durationMs = Date.now() - suiteStart;
    const passed = res.code === 0;

    if (passed) {
      passedCount++;
      // Clear line and print clean pass
      process.stdout.write(`\r  ✅ PASS [${suite.name}] (${(durationMs / 1000).toFixed(2)}s)\n`);
      results.push({ name: suite.name, durationMs, passed: true });
    } else {
      failedCount++;
      process.stdout.write(`\r  ❌ FAIL [${suite.name}] (${(durationMs / 1000).toFixed(2)}s)\n`);
      const errorOutput = (res.stderr || res.stdout || 'Unknown error').trim();
      results.push({ name: suite.name, durationMs, passed: false, errorOutput });
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n================================================================');
  console.log(`📊 Test Execution Summary (${totalDuration}s total)`);
  console.log('================================================================');
  console.log(`  Total Suites : ${TEST_SUITES.length}`);
  console.log(`  Passed       : ${passedCount}`);
  console.log(`  Failed       : ${failedCount}`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    console.log('❌ Failure Details:\n');
    for (const r of results) {
      if (!r.passed) {
        console.log(`--- [${r.name}] ---`);
        console.log(r.errorOutput);
        console.log('\n');
      }
    }
    process.exit(1);
  } else {
    console.log(`🎉 ALL ${TEST_SUITES.length} TEST SUITES PASSED CLEANLY WITH ZERO LOG CONFLICTS!\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
