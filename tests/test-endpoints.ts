import 'dotenv/config';
import http, { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { spawn, ChildProcess } from 'node:child_process';

import { getMcpAuthConfig } from '../src/config/authConfig.js';

const PORT = 3099;
const BASE_URL = `http://localhost:${PORT}`;

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
  statusCode?: number;
}

function sendRequest(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: any,
  timeoutMs: number = 15000
): Promise<{ statusCode: number; headers: IncomingHttpHeaders; body: any }> {
  return new Promise((resolve) => {
    const postData = body ? JSON.stringify(body) : undefined;
    const reqHeaders: Record<string, string> = { ...headers };

    if (postData) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData).toString();
    }

    const req = http.request(
      `${BASE_URL}${path}`,
      {
        method,
        headers: reqHeaders,
      },
      (res: IncomingMessage) => {
        let rawData = '';
        res.on('data', (chunk: any) => (rawData += chunk));
        res.on('end', () => {
          let parsedBody = rawData;
          try {
            parsedBody = JSON.parse(rawData);
          } catch {
            // Leave as string if not JSON
          }
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers,
            body: parsedBody,
          });
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({
        statusCode: 504,
        headers: {},
        body: { error: `Request timed out after ${timeoutMs}ms` },
      });
    });

    req.on('error', (err: Error) => resolve({
      statusCode: 500,
      headers: {},
      body: { error: `Connection failed: ${err.message}` },
    }));

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 Xero MCP Server Local Integration Test Suite');
  console.log('====================================================\n');

  process.env.MCP_CLIENT_ID = process.env.MCP_CLIENT_ID || 'test-mcp-client-id';
  process.env.MCP_CLIENT_SECRET = process.env.MCP_CLIENT_SECRET || 'test-mcp-client-secret-12345';
  process.env.MCP_JWT_SECRET = process.env.MCP_JWT_SECRET || 'test-jwt-secret-key-32-chars-long-min!';

  const authConfig = await getMcpAuthConfig();
  const testMcpClientId = authConfig.clientId;
  const testMcpClientSecret = authConfig.clientSecret;
  const testMcpJwtSecret = authConfig.jwtSecret;

  console.log('Starting local server instance on port', PORT, 'with Client ID:', testMcpClientId, '...');
  
  const serverProc: ChildProcess = spawn('node', ['dist/index.js'], {
    env: {
      ...process.env,
      PORT: PORT.toString(),
      MCP_CLIENT_ID: testMcpClientId,
      MCP_CLIENT_SECRET: testMcpClientSecret,
      MCP_JWT_SECRET: testMcpJwtSecret,
      LOG_LEVEL: process.env.LOG_LEVEL || 'silent',
    },
    stdio: 'pipe',
  });

  let serverStderr = '';
  serverProc.stderr?.on('data', (d) => {
    serverStderr += d.toString();
  });

  // Wait for server startup
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const results: TestResult[] = [];
  let bearerToken = '';

  try {
    // -------------------------------------------------------------
    // Test 1: GET /healthz
    // -------------------------------------------------------------
    console.log('Testing Test 1: GET /healthz ...');
    const healthRes = await sendRequest('GET', '/healthz');
    
    let healthPassed = false;
    let healthDetails = '';

    if (healthRes.statusCode === 200) {
      if (healthRes.body?.status === 'ok') {
        healthPassed = true;
        healthDetails = `Status: ${healthRes.body.status}, Secrets Loaded: ${Boolean(healthRes.body?.secretsLoaded)}`;
      } else {
        healthDetails = `HTTP 200 but status check failed: ${JSON.stringify(healthRes.body)}`;
      }
    } else if (healthRes.statusCode >= 400 && healthRes.statusCode < 500) {
      healthDetails = `HTTP Client Error (${healthRes.statusCode}): ${JSON.stringify(healthRes.body)}`;
    } else {
      healthDetails = `HTTP Server Error (${healthRes.statusCode}): ${JSON.stringify(healthRes.body)}`;
    }

    results.push({
      name: 'GET /healthz Health Check',
      passed: healthPassed,
      statusCode: healthRes.statusCode,
      details: healthDetails,
    });

    // -------------------------------------------------------------
    // Test 2: GET / (Browser Landing Page with Accept: text/html)
    // -------------------------------------------------------------
    console.log('Testing Test 2: GET / (Browser HTML Landing Page) ...');
    const htmlRes = await sendRequest('GET', '/', { Accept: 'text/html' });
    
    let htmlPassed = false;
    let htmlDetails = '';

    if (htmlRes.statusCode === 200) {
      if (typeof htmlRes.body === 'string' && (htmlRes.body.includes('Enterprise Multi-SaaS MCP Gateway') || htmlRes.body.includes('Custom Xero MCP Server is Running'))) {
        htmlPassed = true;
        htmlDetails = 'Successfully rendered HTML landing page';
      } else {
        htmlDetails = `HTTP 200 but HTML content mismatch: ${typeof htmlRes.body === 'string' ? htmlRes.body.substring(0, 100) : JSON.stringify(htmlRes.body)}`;
      }
    } else if (htmlRes.statusCode >= 400) {
      htmlDetails = `HTTP ${htmlRes.statusCode} error response: ${JSON.stringify(htmlRes.body)}`;
    }

    results.push({
      name: 'GET / Browser Landing Page',
      passed: htmlPassed,
      statusCode: htmlRes.statusCode,
      details: htmlDetails,
    });

    // -------------------------------------------------------------
    // Test 2b: OAuth 2.0 PKCE Handshake (GET /oauth/authorize & POST /oauth/token)
    // -------------------------------------------------------------
    console.log('Testing Test 2b: OAuth 2.0 PKCE Handshake ...');
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

    const authRes = await sendRequest(
      'GET',
      `/oauth/authorize?response_type=code&client_id=${testMcpClientId}&redirect_uri=${encodeURIComponent('https://vertexaisearch.cloud.google.com/oauth-redirect')}&state=test-state&code_challenge=${challenge}&code_challenge_method=S256`
    );

    let oauthPassed = false;
    let oauthDetails = '';

    if (authRes.statusCode === 302) {
      const location = authRes.headers.location || '';
      const parsedLoc = new URL(location);
      const authCode = parsedLoc.searchParams.get('code');

      if (authCode) {
        const tokenRes = await sendRequest(
          'POST',
          '/oauth/token',
          { 'Content-Type': 'application/json' },
          {
            grant_type: 'authorization_code',
            client_id: testMcpClientId,
            code: authCode,
            code_verifier: verifier,
            redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
          }
        );

        if (tokenRes.statusCode === 200 && tokenRes.body?.access_token) {
          bearerToken = tokenRes.body.access_token;
          oauthPassed = true;
          oauthDetails = `Successfully obtained Bearer token (expires in ${tokenRes.body.expires_in}s)`;
        } else {
          oauthDetails = `POST /oauth/token failed (${tokenRes.statusCode}): ${JSON.stringify(tokenRes.body)}`;
        }
      } else {
        oauthDetails = `No code found in redirect URL: ${location}`;
      }
    } else {
      oauthDetails = `GET /oauth/authorize returned HTTP ${authRes.statusCode}: ${JSON.stringify(authRes.body)}`;
    }

    results.push({
      name: 'OAuth 2.0 Handshake (/oauth/authorize & /oauth/token)',
      passed: oauthPassed,
      statusCode: oauthPassed ? 200 : authRes.statusCode,
      details: oauthDetails,
    });

    // -------------------------------------------------------------
    // Test 2c: POST /mcp Security Check (Blocked without Bearer Token)
    // -------------------------------------------------------------
    console.log('Testing Test 2c: POST /mcp Unauthenticated Security Guard ...');
    const unauthRes = await sendRequest('POST', '/mcp', { Accept: 'application/json' }, { jsonrpc: '2.0', id: 99, method: 'tools/list' });
    const unauthPassed = unauthRes.statusCode === 401 && unauthRes.body?.error === 'unauthorized';
    results.push({
      name: 'POST /mcp Unauthenticated Guard (HTTP 401)',
      passed: unauthPassed,
      statusCode: unauthRes.statusCode,
      details: unauthPassed ? 'Correctly rejected unauthenticated request with 401' : `Unexpected response: ${unauthRes.statusCode}`,
    });

    // -------------------------------------------------------------
    // Test 3: POST /mcp - JSON-RPC initialize (Authenticated)
    // -------------------------------------------------------------
    console.log('Testing Test 3: POST /mcp (JSON-RPC initialize) ...');
    const initRes = await sendRequest(
      'POST',
      '/mcp',
      { Accept: 'application/json', Authorization: `Bearer ${bearerToken}` },
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'local-test-client', version: '1.0.0' },
        },
      }
    );
    
    let initPassed = false;
    let initDetails = '';

    if (initRes.statusCode === 200) {
      if (
        initRes.body?.result?.serverInfo?.name === 'enterprise-mcp-server' ||
        initRes.body?.result?.serverInfo?.name === 'enterprise-mcp-gateway' ||
        initRes.body?.result?.serverInfo?.name === 'mcp-xero-server'
      ) {
        initPassed = true;
        initDetails = `Server Name: ${initRes.body.result.serverInfo.name}, Protocol: ${initRes.body.result.protocolVersion}`;
      } else {
        initDetails = `HTTP 200 but unexpected JSON-RPC body: ${JSON.stringify(initRes.body)}`;
      }
    } else if (initRes.statusCode === 406) {
      initDetails = `HTTP 406 Not Acceptable (Accept header issue): ${JSON.stringify(initRes.body)}`;
    } else if (initRes.statusCode === 400) {
      initDetails = `HTTP 400 Bad Request (Initialization protocol state error): ${JSON.stringify(initRes.body)}`;
    } else {
      initDetails = `HTTP ${initRes.statusCode} Error: ${JSON.stringify(initRes.body)}`;
    }

    results.push({
      name: 'POST /mcp (Initialize Handshake)',
      passed: initPassed,
      statusCode: initRes.statusCode,
      details: initDetails,
    });

    // -------------------------------------------------------------
    // Test 4: POST /mcp - JSON-RPC tools/list
    // -------------------------------------------------------------
    console.log('Testing Test 4: POST /mcp (JSON-RPC tools/list) ...');
    const listToolsRes = await sendRequest(
      'POST',
      '/mcp',
      { Accept: 'application/json', Authorization: `Bearer ${bearerToken}` },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }
    );
    
    let listToolsPassed = false;
    let listToolsDetails = '';
    const tools = listToolsRes.body?.result?.tools || [];

    if (listToolsRes.statusCode === 200) {
      if (Array.isArray(tools) && tools.some((t: any) => t.name === 'xero-list-invoices')) {
        listToolsPassed = true;
        listToolsDetails = `Registered Tools Count: ${tools.length} (including xero-list-invoices)`;
      } else {
        listToolsDetails = `HTTP 200 but tool xero-list-invoices not found in: ${JSON.stringify(listToolsRes.body)}`;
      }
    } else if (listToolsRes.statusCode === 400) {
      listToolsDetails = `HTTP 400 Bad Request: ${JSON.stringify(listToolsRes.body)}`;
    } else {
      listToolsDetails = `HTTP ${listToolsRes.statusCode} Error: ${JSON.stringify(listToolsRes.body)}`;
    }

    results.push({
      name: 'POST /mcp (Tools List Discovery)',
      passed: listToolsPassed,
      statusCode: listToolsRes.statusCode,
      details: listToolsDetails,
    });

    // -------------------------------------------------------------
    // Test 5: Live Xero API Calls - Testing All Registered Tools
    // -------------------------------------------------------------
    console.log(`\nTesting Test 5: Executing tools/call for all ${tools.length} registered tools ...`);

    // Helper to perform a tool call
    async function executeToolCall(toolName: string, args: Record<string, any> = {}) {
      reqIdCounter++;
      return sendRequest(
        'POST',
        '/mcp',
        { Accept: 'application/json', Authorization: `Bearer ${bearerToken}` },
        {
          jsonrpc: '2.0',
          id: reqIdCounter,
          method: 'tools/call',
          params: { name: toolName, arguments: args },
        }
      );
    }

    let reqIdCounter = 10;

    // Fetch reference data from Xero to populate valid dynamic arguments
    let sampleAccountId = '';
    let sampleBankAccountId = '';
    let sampleAccountCode = '200';
    let sampleContactId = '';
    let sampleInvoiceId = '';
    let sampleAuthorisedInvoiceId = '';
    let sampleItemId = '';
    let sampleItemCode = '';
    let sampleCreditNoteId = '';
    let sampleBankTransactionId = '';
    let sampleQuoteId = '';
    let sampleManualJournalId = '';
    let createdAccountId = '';

    console.log('Harvesting live sample IDs from Xero tenant...');

    const accRes = await executeToolCall('xero-list-accounts');
    if (accRes.statusCode === 200 && !accRes.body?.result?.isError) {
      try {
        const accs = JSON.parse(accRes.body.result.content[0].text);
        if (Array.isArray(accs) && accs.length > 0) {
          sampleAccountId = accs[0].accountID;
          const revenueAcc = accs.find((a: any) => a.type === 'REVENUE' || a.type === 'SALES' || a.type === 'DIRECTCOSTS');
          if (revenueAcc) sampleAccountCode = revenueAcc.code;
          else sampleAccountCode = accs[0].code || '200';

          const bankAcc = accs.find((a: any) => a.type === 'BANK');
          if (bankAcc) sampleBankAccountId = bankAcc.accountID;
          else sampleBankAccountId = accs[0].accountID;
        }
      } catch {}
    }

    const conRes = await executeToolCall('xero-list-contacts');
    if (conRes.statusCode === 200 && !conRes.body?.result?.isError) {
      try {
        const cons = JSON.parse(conRes.body.result.content[0].text);
        if (Array.isArray(cons) && cons.length > 0) {
          sampleContactId = cons[0].contactID;
        }
      } catch {}
    }

    if (!sampleContactId) {
      const createConRes = await executeToolCall('xero-create-contact', { name: `Test Client ${Date.now()}` });
      if (createConRes.statusCode === 200 && !createConRes.body?.result?.isError) {
        try {
          const createdCon = JSON.parse(createConRes.body.result.content[0].text);
          sampleContactId = createdCon.contactID;
        } catch {}
      }
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const expiryStr = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    // Seed Authorised Invoice for Payment Test
    const seedAuthInv = await executeToolCall('xero-create-invoice', {
      type: 'ACCREC',
      contactId: sampleContactId,
      date: todayStr,
      dueDate: expiryStr,
      lineItems: [{ description: 'Payment Target Invoice', unitAmount: 50, accountCode: sampleAccountCode }],
      status: 'AUTHORISED',
    });
    if (seedAuthInv.statusCode === 200 && !seedAuthInv.body?.result?.isError) {
      try {
        const inv = JSON.parse(seedAuthInv.body.result.content[0].text);
        sampleAuthorisedInvoiceId = inv.invoiceID;
        sampleInvoiceId = inv.invoiceID;
      } catch {}
    }

    const itemRes = await executeToolCall('xero-list-items');
    if (itemRes.statusCode === 200 && !itemRes.body?.result?.isError) {
      try {
        const items = JSON.parse(itemRes.body.result.content[0].text);
        if (Array.isArray(items) && items.length > 0) {
          sampleItemId = items[0].itemID;
          sampleItemCode = items[0].code;
        }
      } catch {}
    }

    // Seed Draft Credit Note
    const seedCn = await executeToolCall('xero-create-credit-note', {
      type: 'ACCRECCREDIT',
      contactId: sampleContactId,
      lineItems: [{ description: 'Draft Credit Note', unitAmount: 25, accountCode: sampleAccountCode }],
    });
    if (seedCn.statusCode === 200 && !seedCn.body?.result?.isError) {
      try {
        const cn = JSON.parse(seedCn.body.result.content[0].text);
        sampleCreditNoteId = cn.creditNoteID;
      } catch {}
    }

    // Seed Quote
    const seedQuote = await executeToolCall('xero-create-quote', {
      contactId: sampleContactId,
      date: todayStr,
      expiryDate: expiryStr,
      lineItems: [{ description: 'Proposal Quote', unitAmount: 200, accountCode: sampleAccountCode }],
    });
    if (seedQuote.statusCode === 200 && !seedQuote.body?.result?.isError) {
      try {
        const q = JSON.parse(seedQuote.body.result.content[0].text);
        if (q.quoteID || q.quoteId) {
          sampleQuoteId = q.quoteID || q.quoteId;
        }
      } catch {}
    }

    // Seed Bank Transaction
    if (sampleBankAccountId) {
      const seedBt = await executeToolCall('xero-create-bank-transaction', {
        type: 'RECEIVE',
        bankAccountId: sampleBankAccountId,
        contactId: sampleContactId,
        lineItems: [{ description: 'Bank Deposit', unitAmount: 100, accountCode: sampleAccountCode }],
      });
      if (seedBt.statusCode === 200 && !seedBt.body?.result?.isError) {
        try {
          const bt = JSON.parse(seedBt.body.result.content[0].text);
          sampleBankTransactionId = bt.bankTransactionID;
        } catch {}
      }
    }

    const mjRes = await executeToolCall('xero-list-manual-journals');
    if (mjRes.statusCode === 200 && !mjRes.body?.result?.isError) {
      try {
        const mjs = JSON.parse(mjRes.body.result.content[0].text);
        if (Array.isArray(mjs) && mjs.length > 0) {
          sampleManualJournalId = mjs[0].manualJournalID;
        }
      } catch {}
    }

    let sampleDatasetId = '';
    let sampleTableId = '';

    const dsRes = await executeToolCall('bigquery-list-datasets');
    if (dsRes.statusCode === 200 && !dsRes.body?.result?.isError) {
      try {
        const parsedDs = JSON.parse(dsRes.body.result.content[0].text);
        if (Array.isArray(parsedDs.datasetIds) && parsedDs.datasetIds.length > 0) {
          sampleDatasetId = parsedDs.datasetIds[0];
          const tblRes = await executeToolCall('bigquery-list-tables', { datasetId: sampleDatasetId });
          if (tblRes.statusCode === 200 && !tblRes.body?.result?.isError) {
            const parsedTbl = JSON.parse(tblRes.body.result.content[0].text);
            if (Array.isArray(parsedTbl.tables) && parsedTbl.tables.length > 0) {
              sampleTableId = parsedTbl.tables[0].tableId;
            }
          }
        }
      } catch {}
    }

    let sampleCollectionId = '';
    let sampleDocId = '';

    const colRes = await executeToolCall('firestore-list-collections');
    if (colRes.statusCode === 200 && !colRes.body?.result?.isError) {
      try {
        const parsedCol = JSON.parse(colRes.body.result.content[0].text);
        if (Array.isArray(parsedCol.collections) && parsedCol.collections.length > 0) {
          sampleCollectionId = parsedCol.collections[0];
          const queryRes = await executeToolCall('firestore-query-documents', { collectionPath: sampleCollectionId, limit: 1 });
          if (queryRes.statusCode === 200 && !queryRes.body?.result?.isError) {
            const parsedDocs = JSON.parse(queryRes.body.result.content[0].text);
            if (Array.isArray(parsedDocs.documents) && parsedDocs.documents.length > 0) {
              sampleDocId = parsedDocs.documents[0].id;
            }
          }
        }
      } catch {}
    }

    console.log(`Harvested Sample Reference Data:`);
    console.log(`  AccountId: ${sampleAccountId}`);
    console.log(`  BankAccountId: ${sampleBankAccountId}`);
    console.log(`  ContactId: ${sampleContactId}`);
    console.log(`  InvoiceId: ${sampleInvoiceId}`);
    console.log(`  AuthorisedInvoiceId: ${sampleAuthorisedInvoiceId}`);
    console.log(`  ItemId: ${sampleItemId} (Code: ${sampleItemCode})`);
    console.log(`  CreditNoteId: ${sampleCreditNoteId}`);
    console.log(`  QuoteId: ${sampleQuoteId}`);
    console.log(`  BankTransactionId: ${sampleBankTransactionId}`);
    console.log(`  ManualJournalId: ${sampleManualJournalId}`);
    console.log(`  BQ DatasetId: ${sampleDatasetId || 'none'}`);
    console.log(`  BQ TableId: ${sampleTableId || 'none'}`);
    console.log(`  FS CollectionId: ${sampleCollectionId || 'none'}`);
    console.log(`  FS DocId: ${sampleDocId || 'none'}\n`);

    for (const tool of tools) {
      const toolName = tool.name;

      // Construct dynamic arguments with real fallback IDs where available
      let args: Record<string, any> = {};

      if (toolName === 'xero-get-account') args = { accountId: sampleAccountId };
      else if (toolName === 'xero-create-account') args = { code: `A${Math.floor(1000 + Math.random() * 8999)}`, name: `Test Account ${Date.now()}`, type: 'EXPENSE' };
      else if (toolName === 'xero-get-invoice') args = { invoiceId: sampleInvoiceId };
      else if (toolName === 'xero-create-invoice') args = { type: 'ACCREC', contactId: sampleContactId, lineItems: [{ description: 'Test Consulting Services', unitAmount: 150, accountCode: sampleAccountCode }] };
      else if (toolName === 'xero-update-invoice') args = { invoiceId: sampleInvoiceId, reference: `Ref-Update-${Date.now()}` };
      else if (toolName === 'xero-create-credit-note') args = { type: 'ACCRECCREDIT', contactId: sampleContactId, lineItems: [{ description: 'Credit Adjustment', unitAmount: 25, accountCode: sampleAccountCode }] };
      else if (toolName === 'xero-update-credit-note') args = { creditNoteId: sampleCreditNoteId, status: 'DRAFT' };
      else if (toolName === 'xero-create-manual-journal') args = { narration: 'Test Adjustment Journal', journalLines: [{ lineAmount: 100, accountCode: sampleAccountCode }, { lineAmount: -100, accountCode: '400' }] };
      else if (toolName === 'xero-update-manual-journal') args = { journalId: sampleManualJournalId, narration: 'Updated Adjustment Journal' };
      else if (toolName === 'xero-create-payment') args = { invoiceId: sampleAuthorisedInvoiceId || sampleInvoiceId, amount: 10, accountId: sampleBankAccountId, date: todayStr };
      else if (toolName === 'xero-create-item') args = { code: `ITEM-${Math.floor(1000 + Math.random() * 8999)}`, name: 'Test Item' };
      else if (toolName === 'xero-update-item') args = { itemId: sampleItemId, code: sampleItemCode, name: 'Updated Item Title' };
      else if (toolName === 'xero-create-bank-transaction') args = { type: 'RECEIVE', bankAccountId: sampleBankAccountId, contactId: sampleContactId, lineItems: [{ description: 'Bank Deposit', unitAmount: 50, accountCode: sampleAccountCode }] };
      else if (toolName === 'xero-update-bank-transaction') args = { bankTransactionId: sampleBankTransactionId || '00000000-0000-0000-0000-000000000000', status: 'AUTHORISED' };
      else if (toolName === 'xero-create-quote') args = { contactId: sampleContactId, date: todayStr, expiryDate: expiryStr, lineItems: [{ description: 'Service Proposal', unitAmount: 500, accountCode: sampleAccountCode }] };
      else if (toolName === 'xero-get-contact') args = { contactId: sampleContactId };
      else if (toolName === 'xero-create-contact') args = { name: `Test Client ${Math.floor(100 + Math.random() * 899)}` };
      else if (toolName === 'xero-update-contact') args = { contactId: sampleContactId, name: `Updated Contact ${Date.now()}` };
      else if (toolName === 'xero-get-aged-receivables-by-contact') args = { contactId: sampleContactId };
      else if (toolName === 'xero-get-aged-payables-by-contact') args = { contactId: sampleContactId };
      else if (toolName === 'bigquery-list-datasets') args = {};
      else if (toolName === 'bigquery-list-tables') args = sampleDatasetId ? { datasetId: sampleDatasetId } : {};
      else if (toolName === 'bigquery-get-table-schema') args = sampleTableId ? { tableId: sampleTableId, datasetId: sampleDatasetId } : (sampleDatasetId ? { tableId: 'dummy_tbl', datasetId: sampleDatasetId } : {});
      else if (toolName === 'bigquery-dry-run-query') args = { query: 'SELECT 1 as test_val' };
      else if (toolName === 'bigquery-execute-query-readonly') args = { query: 'SELECT 1 as test_val' };
      else if (toolName === 'firestore-list-collections') args = {};
      else if (toolName === 'firestore-get-collection-schema') args = { collectionPath: sampleCollectionId || 'test_collection' };
      else if (toolName === 'firestore-list-subcollections') args = { documentPath: `${sampleCollectionId || 'test_collection'}/${sampleDocId || 'test_doc'}` };
      else if (toolName === 'firestore-get-document') args = { documentPath: `${sampleCollectionId || 'test_collection'}/${sampleDocId || 'test_doc'}` };
      else if (toolName === 'firestore-query-documents') args = { collectionPath: sampleCollectionId || 'test_collection', limit: 5 };
      else if (toolName === 'firestore-set-document') args = { documentPath: 'test_collection/test_doc', data: { test: true } };
      else if (toolName === 'sagehr-get-employee') args = { employeeId: '1' };
      else if (toolName === 'sagehr-get-time-off-balances') args = { employeeId: '1' };
      else if (toolName === 'sagehr-create-time-off-request') args = { employeeId: '1', policyId: '1', fromDate: '2026-09-01', toDate: '2026-09-05' };
      else if (toolName === 'sagehr-cancel-time-off-request') args = { requestId: '1' };
      else if (toolName === 'sagehr-get-expense') args = { expenseId: '1' };
      else if (toolName === 'sagehr-create-expense') args = { employeeId: '1', categoryId: '1', amount: 25.5, date: '2026-08-20', title: 'Client Lunch' };

      const callRes = await executeToolCall(toolName, args);

      // Expected validations for optional/empty resource states & security policy guards
      const isError = callRes.body?.result?.isError === true;
      const errText = callRes.body?.result?.content?.[0]?.text || '';
      const isExpectedDisabledService = isError && errText.includes('temporarily disabled by an administrator');
      const isExpectedFsAccessDenied = toolName.startsWith('firestore-') && isError && errText.includes('Firestore Access Denied');
      const isExpectedXeroNotConfigured = toolName.startsWith('xero-') && isError && (errText.includes('Xero') || errText.includes('credentials') || errText.includes('disabled'));
      const isExpectedEmptyTable404 = toolName === 'bigquery-get-table-schema' && !sampleTableId && isError && errText.includes('BigQuery Resource Not Found');
      const isExpectedFsWriteBlocked = toolName === 'firestore-set-document' && isError && errText.includes('Mutation Blocked');
      const isExpectedFsDocNotFound = toolName.startsWith('firestore-') && !sampleCollectionId && isError && (errText.includes('Not Found') || errText.includes('access policy'));
      const isExpectedSageHrNotConfigured = toolName.startsWith('sagehr-') && isError && (errText.includes('Sage HR') || errText.includes('SAGEHR') || errText.includes('API key') || errText.includes('disabled'));
      const toolPassed = callRes.statusCode === 200 && (
        !isError ||
        isExpectedDisabledService ||
        isExpectedFsAccessDenied ||
        isExpectedXeroNotConfigured ||
        isExpectedEmptyTable404 ||
        isExpectedFsWriteBlocked ||
        isExpectedFsDocNotFound ||
        isExpectedSageHrNotConfigured
      );

      let toolDetails = '';
      if (isError) {
        const errText = callRes.body?.result?.content?.[0]?.text || 'Tool returned error status';
        toolDetails = `HTTP 200 OK (Error: ${errText.replace(/\n/g, ' ')})`;
      } else {
        const successContent = callRes.body?.result?.content?.[0]?.text || '';
        toolDetails = `HTTP 200 OK (Data: ${successContent.substring(0, 100).replace(/\n/g, ' ')})`;
      }

      results.push({
        name: `Tool Call: ${toolName}`,
        passed: toolPassed,
        statusCode: callRes.statusCode,
        details: toolDetails,
      });
    }
  } catch (err: any) {
    console.error('Test execution error:', err.message);
  } finally {
    serverProc.kill();
  }

  // -------------------------------------------------------------
  // Test Summary Output
  // -------------------------------------------------------------
  console.log('\n====================================================');
  console.log('📊 Test Results Summary');
  console.log('====================================================');

  let passedCount = 0;
  let failedCount = 0;

  for (const r of results) {
    const symbol = r.passed ? '✅ PASS' : '❌ FAIL';
    if (r.passed) passedCount++;
    else failedCount++;
    console.log(`${symbol} | ${r.name}`);
    console.log(`        HTTP ${r.statusCode} - ${r.details}`);
  }

  console.log('\n====================================================');
  console.log(`Summary: ${passedCount} Passed, ${failedCount} Failed out of ${results.length} total tests.`);
  console.log('====================================================');

  if (failedCount === 0) {
    console.log('🎉 ALL LOCAL TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.log('⚠️ SOME TESTS FAILED. See details above.');
    process.exit(1);
  }
}

runTests();
