import { ServiceModule } from '../../mcp/types.js';
import { bigqueryTools } from './tools/index.js';
import { bigqueryService } from './client.js';
import { getBigQueryConfig } from './config.js';

export * from './config.js';
export * from './client.js';
export * from './errors.js';
export * from './tools/index.js';

export const bigqueryModule: ServiceModule = {
  name: 'bigquery',
  tools: bigqueryTools,
  initialize: async () => {
    await getBigQueryConfig();
  },
};
