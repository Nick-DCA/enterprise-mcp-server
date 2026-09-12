import { z } from 'zod';

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  [key: string]: any;
}

export interface ToolDefinition<T extends z.ZodRawShape = any> {
  name: string;
  description: string;
  schema: T;
  annotations: ToolAnnotations;
  execute: (args: any) => Promise<any>;
}

export type DomainName =
  | 'xero'
  | 'bigquery'
  | 'firestore'
  | 'sagehr'
  | 'slack'
  | 'accounting'
  | 'contacts'
  | 'payroll'
  | 'reports'
  | (string & {});

export interface ServiceModule {
  name: string;
  tools: ToolDefinition[];
  initialize?: () => Promise<void>;
  healthCheck?: () => Promise<{ healthy: boolean; details?: any }>;
}
