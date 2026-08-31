import 'dotenv/config';
import { createApp } from './server/app.js';
import { logSetupBanner } from './config/setupToken.js';
import { logger } from './utils/logger.js';

const app = createApp();
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  logger.info(`Xero MCP Server running on http://localhost:${PORT}`);
  logger.info(`Admin Portal: http://localhost:${PORT}/admin/`);
  logger.info(`MCP Endpoint: http://localhost:${PORT}/mcp`);
  logger.info(`Health Check: http://localhost:${PORT}/healthz`);

  // Check and display initial setup banner if uninitialized
  await logSetupBanner(PORT);
});
