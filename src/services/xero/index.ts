import { ServiceModule } from '../../mcp/types.js';
import { xeroTools } from './tools/index.js';
import { xeroService, XeroService } from './client.js';
import { getXeroSecrets, clearSecretsCache, XeroSecrets } from './config.js';
import {
  XeroApiError,
  XeroRateLimitError,
  XeroAuthError,
  extractCorrelationId,
  formatXeroValidationError,
} from './errors.js';

export {
  xeroService,
  XeroService,
  getXeroSecrets,
  clearSecretsCache,
  XeroSecrets,
  XeroApiError,
  XeroRateLimitError,
  XeroAuthError,
  extractCorrelationId,
  formatXeroValidationError,
  xeroTools,
};

export const xeroServiceModule: ServiceModule = {
  name: 'xero',
  tools: xeroTools,
};
