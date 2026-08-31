import { z } from 'zod';
import { ToolDefinition } from '../../../mcp/types.js';
import { sageHrService } from '../client.js';

export const expenseTools: ToolDefinition[] = [
  {
    name: 'sagehr-list-expenses',
    description:
      'Retrieve employee expense claims from Sage HR with status filtering (submitted, approved, paid, rejected), date bounds, and amount summaries.',
    schema: {
      status: z.enum(['submitted', 'approved', 'paid', 'rejected']).optional().describe('Filter by expense claim status'),
      fromDate: z.string().optional().describe('Filter expenses after date (YYYY-MM-DD)'),
      toDate: z.string().optional().describe('Filter expenses before date (YYYY-MM-DD)'),
      employeeId: z.string().optional().describe('Filter expenses by specific Employee ID'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    execute: async (args: { status?: string; fromDate?: string; toDate?: string; employeeId?: string }) => {
      const result = await sageHrService.listExpenses(args);
      return JSON.stringify(result, null, 2);
    },
  },
  {
    name: 'sagehr-get-expense',
    description:
      'Retrieve detailed information for a specific expense claim in Sage HR by Expense ID, including receipt metadata, merchant name, category, and approval log.',
    schema: {
      expenseId: z.string().describe('The unique Sage HR Expense ID'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    execute: async (args: { expenseId: string }) => {
      const result = await sageHrService.getExpense(args.expenseId);
      return JSON.stringify(result, null, 2);
    },
  },
  {
    name: 'sagehr-list-expense-categories',
    description:
      'Retrieve configured company expense categories (e.g. Travel, Meals, Hardware, Software, Client Entertainment) in Sage HR.',
    schema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    execute: async () => {
      const result = await sageHrService.listExpenseCategories();
      return JSON.stringify(result, null, 2);
    },
  },
  {
    name: 'sagehr-create-expense',
    description:
      'Submit an employee expense claim in Sage HR with category ID, amount, currency, transaction date, merchant title, and description.',
    schema: {
      employeeId: z.string().describe('Employee ID claiming the expense'),
      categoryId: z.string().describe('Expense category ID'),
      amount: z.coerce.number().describe('Total expense amount claimed'),
      currency: z.string().optional().default('GBP').describe('Currency code (e.g. GBP, EUR, USD)'),
      date: z.string().describe('Transaction date (YYYY-MM-DD)'),
      title: z.string().describe('Merchant or expense summary title'),
      description: z.string().optional().describe('Optional business justification notes'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    execute: async (args: {
      employeeId: string;
      categoryId: string;
      amount: number;
      currency: string;
      date: string;
      title: string;
      description?: string;
    }) => {
      const result = await sageHrService.createExpense(args);
      return JSON.stringify(result, null, 2);
    },
  },
];
