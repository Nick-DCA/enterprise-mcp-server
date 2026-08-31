import { z } from 'zod';
import { ToolDefinition } from '../../../mcp/types.js';
import { sageHrService } from '../client.js';

export const directoryTools: ToolDefinition[] = [
  {
    name: 'sagehr-list-employees',
    description:
      'Retrieve company employee directory from Sage HR (work email, full name, job title, department, employment status). Automatically enforces attribute privacy and excludes personal/financial data.',
    schema: {
      active: z.boolean().optional().default(true).describe('Filter by employment status (true for active staff, false for terminated)'),
      departmentId: z.coerce.number().optional().describe('Filter employees by Sage HR Department ID'),
      teamId: z.coerce.number().optional().describe('Filter employees by Sage HR Team ID'),
      page: z.coerce.number().optional().describe('Page number for pagination'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    execute: async (args: { active?: boolean; departmentId?: number; teamId?: number; page?: number }) => {
      const result = await sageHrService.listEmployees(args);
      return JSON.stringify(result, null, 2);
    },
  },
  {
    name: 'sagehr-get-employee',
    description:
      'Retrieve employee profile by Sage HR Employee ID with multi-tier attribute protection (redacting or blocking ID numbers, salary, bank details, and medical records).',
    schema: {
      employeeId: z.string().describe('The unique Sage HR Employee ID to inspect'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
    execute: async (args: { employeeId: string }) => {
      const result = await sageHrService.getEmployee(args.employeeId);
      return JSON.stringify(result, null, 2);
    },
  },
];
