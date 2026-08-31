import { ServiceModule } from '../../mcp/types.js';
import { sagehrTools } from './tools/index.js';
import { sageHrService } from './client.js';

export * from './config.js';
export * from './errors.js';
export * from './client.js';
export * from './privacy.js';
export * from './tools/index.js';

export const sageHrServiceModule: ServiceModule = {
  name: 'sagehr',
  tools: sagehrTools,
  healthCheck: async () => {
    try {
      await sageHrService.listOutOfOfficeToday();
      return { healthy: true };
    } catch (e: any) {
      return { healthy: false, details: e.message };
    }
  },
};
