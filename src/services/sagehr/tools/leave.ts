import { z } from 'zod';
import { ToolDefinition } from '../../../mcp/types.js';
import { sageHrService } from '../client.js';

export const leaveTools: ToolDefinition[] = [
  {
    name: 'sagehr-list-out-of-office-today',
    description:
      'Retrieve list of employees currently out of the office or on approved leave today from Sage HR for scheduling and availability checks.',
    schema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    execute: async () => {
      const result = await sageHrService.listOutOfOfficeToday();
      return JSON.stringify(result, null, 2);
    },
  },
  {
    name: 'sagehr-list-time-off-requests',
    description:
      'Retrieve employee time-off and leave requests (dates, policy name, approval status) from Sage HR. Automatically sanitizes medical and personal notes.',
    schema: {
      fromDate: z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
      toDate: z.string().optional().describe('End date filter (YYYY-MM-DD)'),
      status: z.enum(['approved', 'pending', 'rejected', 'cancelled']).optional().describe('Filter by request approval status'),
      employeeId: z.string().optional().describe('Filter by specific Employee ID'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    execute: async (args: { fromDate?: string; toDate?: string; status?: string; employeeId?: string }) => {
      const result = await sageHrService.listTimeOffRequests(args);
      return JSON.stringify(result, null, 2);
    },
  },
  {
    name: 'sagehr-get-time-off-balances',
    description:
      'Retrieve remaining leave entitlement balances (annual leave allowance, sick days taken, TOIL, remaining days) for an employee in Sage HR.',
    schema: {
      employeeId: z.string().optional().describe('The Sage HR Employee ID (optional if checking all/self)'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    execute: async (args: { employeeId?: string }) => {
      const result = await sageHrService.getTimeOffBalances(args.employeeId);
      return JSON.stringify(result, null, 2);
    },
  },
  {
    name: 'sagehr-list-time-off-policies',
    description:
      'Retrieve list of configured company time-off and leave policy types (Annual Leave, Sick Leave, Parental, Unpaid) from Sage HR.',
    schema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    execute: async () => {
      const result = await sageHrService.listTimeOffPolicies();
      return JSON.stringify(result, null, 2);
    },
  },
  {
    name: 'sagehr-create-time-off-request',
    description:
      'Submit a time-off or leave request for an employee in Sage HR with start/end dates, policy ID, and optional comments. Active when SAGE_HR_ALLOW_WRITES=true.',
    schema: {
      employeeId: z.string().describe('Target Employee ID requesting leave'),
      policyId: z.string().describe('Time-off policy ID (e.g. Annual Leave, Sick Leave)'),
      fromDate: z.string().describe('Start date of leave (YYYY-MM-DD)'),
      toDate: z.string().describe('End date of leave (YYYY-MM-DD)'),
      details: z.string().optional().describe('Optional comments or leave notes'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    execute: async (args: {
      employeeId: string;
      policyId: string;
      fromDate: string;
      toDate: string;
      details?: string;
    }) => {
      const result = await sageHrService.createTimeOffRequest(args);
      return JSON.stringify(result, null, 2);
    },
  },
  {
    name: 'sagehr-cancel-time-off-request',
    description:
      'Cancel or delete an existing time-off request in Sage HR by Request ID. Marked as destructive to require confirmation before deletion.',
    schema: {
      requestId: z.string().describe('The unique Sage HR Time-Off Request ID to cancel or delete'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
    },
    execute: async (args: { requestId: string }) => {
      const result = await sageHrService.cancelTimeOffRequest(args.requestId);
      return JSON.stringify(result, null, 2);
    },
  },
];
