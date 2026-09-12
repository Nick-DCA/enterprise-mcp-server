import { ServiceModule } from '../../mcp/types.js';
import { slackTools } from './tools/index.js';
import { getSecretValue } from '../../config/secretManager.js';

export * from './types.js';
export * from './tokenManager.js';
export * from './client.js';
export * from './tools/index.js';

export const slackServiceModule: ServiceModule = {
  name: 'slack',
  tools: slackTools,
  healthCheck: async () => {
    try {
      const clientId = await getSecretValue('SLACK_CLIENT_ID');
      const clientSecret = await getSecretValue('SLACK_CLIENT_SECRET');

      if (!clientId || !clientSecret) {
        return { healthy: false, details: 'SLACK_CLIENT_ID or SLACK_CLIENT_SECRET not configured.' };
      }

      const res = await fetch('https://slack.com/api/api.test');
      const data: any = await res.json();
      return { healthy: Boolean(data.ok), details: data.error };
    } catch (e: any) {
      return { healthy: false, details: e.message };
    }
  },
};
