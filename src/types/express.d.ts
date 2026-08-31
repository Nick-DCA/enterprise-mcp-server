import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { AccessTokenPayload } from '../auth/types.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthInfo & AccessTokenPayload;
    }
  }
}
