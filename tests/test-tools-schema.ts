import { xeroTools } from '../src/services/xero/tools/index.js';
import { bigqueryTools } from '../src/services/bigquery/tools/index.js';
import { firestoreTools } from '../src/services/firestore/tools/index.js';
import { sagehrTools } from '../src/services/sagehr/tools/index.js';

function testSchemas() {
  console.log('====================================================');
  console.log('🧪 Running Tool Schemas Validation Test Suite');
  console.log('====================================================\n');

  const allTools = [...xeroTools, ...bigqueryTools, ...firestoreTools, ...sagehrTools];

  console.log(`Total tools loaded across all services (Xero + BigQuery + Firestore + Sage HR): ${allTools.length}`);

  let passed = true;

  for (const tool of allTools) {
    if (!tool.name || typeof tool.name !== 'string') {
      console.error(`❌ Tool missing valid name: ${JSON.stringify(tool)}`);
      passed = false;
    }

    // Verify standardized product prefix
    const hasValidPrefix =
      tool.name.startsWith('xero-') ||
      tool.name.startsWith('bigquery-') ||
      tool.name.startsWith('firestore-') ||
      tool.name.startsWith('sagehr-');

    if (!hasValidPrefix) {
      console.error(`❌ Tool '${tool.name}' does not follow standardized product prefix (xero-, bigquery-, firestore-, sagehr-)`);
      passed = false;
    }

    if (!tool.description || typeof tool.description !== 'string' || tool.description.length < 20) {
      console.error(`❌ Tool '${tool.name}' missing comprehensive discovery description (length < 20)`);
      passed = false;
    }
    if (!tool.schema || typeof tool.schema !== 'object') {
      console.error(`❌ Tool '${tool.name}' missing valid schema shape`);
      passed = false;
    }
    if (
      typeof tool.annotations?.readOnlyHint !== 'boolean' ||
      typeof tool.annotations?.destructiveHint !== 'boolean'
    ) {
      console.error(`❌ Tool '${tool.name}' missing valid annotations`);
      passed = false;
    }
    if (typeof tool.execute !== 'function') {
      console.error(`❌ Tool '${tool.name}' missing execute function`);
      passed = false;
    }
  }

  if (passed) {
    console.log(`✅ All ${allTools.length} tool definitions validated successfully across all 4 services!`);
  } else {
    console.error('❌ Schema validation failed!');
    process.exit(1);
  }
}

testSchemas();
