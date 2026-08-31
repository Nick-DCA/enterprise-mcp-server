import { z } from 'zod';
import { ToolDefinition } from '../../../mcp/types.js';
import { xeroService } from '../client.js';

export const reportsTools: ToolDefinition[] = [
  // 1. xero-get-profit-and-loss
  {
    name: 'xero-get-profit-and-loss',
    description:
      'Generate the Profit and Loss (Income Statement) financial report from Xero for a date range (fromDate, toDate), with optional comparative periods and timeframe (MONTH, QUARTER, YEAR).',
    schema: {
      fromDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      toDate: z.string().optional().describe('End date (YYYY-MM-DD)'),
      periods: z.coerce.number().optional().describe('Number of comparison periods'),
      timeframe: z.enum(['MONTH', 'QUARTER', 'YEAR']).optional().describe('Timeframe grouping'),
      paymentsOnly: z.coerce.boolean().optional().describe('Cash-basis reporting flag'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async (params) => {
      return xeroService.listProfitAndLoss(params);
    },
  },

  // 2. xero-get-balance-sheet
  {
    name: 'xero-get-balance-sheet',
    description:
      'Generate the Balance Sheet financial report from Xero as of a specific date, displaying Assets, Liabilities, and Equity balances with optional cash-basis reporting.',
    schema: {
      date: z.string().optional().describe('As-of date (YYYY-MM-DD)'),
      paymentsOnly: z.coerce.boolean().optional().describe('Cash-basis reporting flag'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async (params) => {
      return xeroService.listBalanceSheet(params.date, params.paymentsOnly);
    },
  },

  // 3. xero-get-trial-balance
  {
    name: 'xero-get-trial-balance',
    description:
      'Generate the Trial Balance financial report from Xero as of a specific date to verify general ledger debit and credit equilibrium across all accounts.',
    schema: {
      date: z.string().optional().describe('As-of date (YYYY-MM-DD)'),
      paymentsOnly: z.coerce.boolean().optional().describe('Cash-basis reporting flag'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async (params) => {
      return xeroService.listTrialBalance(params.date, params.paymentsOnly);
    },
  },

  // 4. xero-get-organisation-details
  {
    name: 'xero-get-organisation-details',
    description:
      'Retrieve Xero organisation profile metadata including legal organization name, base currency code (e.g. USD, EUR, GBP), tax registration numbers, and financial year end date.',
    schema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async () => {
      return xeroService.listOrganisationDetails();
    },
  },
];
