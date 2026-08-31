import express, { Request, Response } from 'express';
import { OAuthService, OAuthError } from '../../auth/oauthService.js';
import { AuthorizeRequestParams, TokenRequestParams } from '../../auth/types.js';
import { OAuthErrorCodes } from '../../auth/constants.js';
import { getMcpAuthConfig } from '../../config/authConfig.js';
import { logger } from '../../utils/logger.js';

type OAuthServiceResolver = OAuthService | (() => Promise<OAuthService>) | undefined;

let defaultServiceInstance: OAuthService | null = null;

async function resolveService(resolver?: OAuthServiceResolver): Promise<OAuthService> {
  if (resolver && typeof resolver !== 'function') {
    return resolver;
  }
  if (typeof resolver === 'function') {
    return resolver();
  }
  if (!defaultServiceInstance) {
    const config = await getMcpAuthConfig();
    defaultServiceInstance = new OAuthService(config);
  }
  return defaultServiceInstance;
}

export function createOAuthRouter(serviceResolver?: OAuthServiceResolver): express.Router {
  const router = express.Router();

  /**
   * GET /oauth/authorize
   * Initiates OAuth 2.0 Authorization Code Flow
   */
  router.get('/authorize', async (req: Request, res: Response) => {
    try {
      const oauthService = await resolveService(serviceResolver);
      const params: AuthorizeRequestParams = {
        response_type: req.query.response_type as string,
        client_id: req.query.client_id as string,
        redirect_uri: req.query.redirect_uri as string,
        scope: req.query.scope as string,
        state: req.query.state as string,
        code_challenge: req.query.code_challenge as string,
        code_challenge_method: req.query.code_challenge_method as string,
      };

      const { redirectUrl } = oauthService.processAuthorize(params);
      res.redirect(302, redirectUrl);
    } catch (error: any) {
      if (error instanceof OAuthError) {
        logger.warn({ errorCode: error.errorCode, errorDescription: error.errorDescription }, 'OAuth authorization failed');
        res.status(error.statusCode).json({
          error: error.errorCode,
          error_description: error.errorDescription,
        });
      } else {
        logger.error({ error: error.message }, 'Unexpected error during OAuth authorization');
        res.status(500).json({
          error: OAuthErrorCodes.SERVER_ERROR,
          error_description: error.message || 'Internal server error during authorization.',
        });
      }
    }
  });

  /**
   * POST /oauth/token
   * Exchanges Authorization Code + PKCE Verifier for Access Token
   * Accepts both application/x-www-form-urlencoded and application/json
   */
  router.post('/token', async (req: Request, res: Response) => {
    try {
      const oauthService = await resolveService(serviceResolver);
      let clientId = req.body?.client_id;
      let clientSecret = req.body?.client_secret;

      const authHeader = req.headers.authorization;
      const isBasic = !!(authHeader && authHeader.startsWith('Basic '));
      if (isBasic) {
        const credentials = Buffer.from(authHeader!.substring(6), 'base64').toString('utf-8');
        const [basicClientId, basicClientSecret] = credentials.split(':');
        clientId = clientId || basicClientId;
        clientSecret = clientSecret || basicClientSecret;
      }

      logger.info(
        {
          contentType: req.headers['content-type'],
          grantType: req.body?.grant_type,
          clientId,
          hasSecret: !!clientSecret,
          hasCode: !!req.body?.code,
          hasVerifier: !!req.body?.code_verifier,
          hasRefreshToken: !!req.body?.refresh_token,
          isBasicAuth: isBasic,
        },
        'Incoming /oauth/token request received'
      );

      const params: TokenRequestParams = {
        grant_type: req.body?.grant_type,
        client_id: clientId,
        client_secret: clientSecret,
        code: req.body?.code,
        redirect_uri: req.body?.redirect_uri,
        code_verifier: req.body?.code_verifier,
        refresh_token: req.body?.refresh_token,
      };

      const tokenResponse = oauthService.processTokenExchange(params);

      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
      res.status(200).json(tokenResponse);
    } catch (error: any) {
      if (error instanceof OAuthError) {
        logger.warn({ errorCode: error.errorCode, errorDescription: error.errorDescription }, 'OAuth token exchange failed');
        res.status(error.statusCode).json({
          error: error.errorCode,
          error_description: error.errorDescription,
        });
      } else {
        logger.error({ error: error.message }, 'Unexpected error during OAuth token exchange');
        res.status(500).json({
          error: OAuthErrorCodes.SERVER_ERROR,
          error_description: error.message || 'Internal server error during token exchange.',
        });
      }
    }
  });

  return router;
}
