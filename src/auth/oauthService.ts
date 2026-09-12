import { timingSafeEqual } from 'node:crypto';
import {
  AuthorizeRequestParams,
  TokenRequestParams,
  TokenResponse,
  McpAuthConfig,
  AuthCodePayload,
  AccessTokenPayload,
  RefreshTokenPayload,
} from './types.js';
import { OAuthErrorCodes, OAuthErrorCode, OAUTH_DEFAULTS } from './constants.js';
import { verifyCodeVerifier } from './pkce.js';
import { generateAuthCode, verifyAndDecodeAuthCode } from './code.js';
import { signJwt, verifyJwt } from './jwt.js';
import { logger } from '../utils/logger.js';
import { isValidUserEmail, cleanUserEmail } from '../utils/identity.js';

export class OAuthError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: OAuthErrorCode;
  public readonly errorDescription?: string;

  constructor(statusCode: number, errorCode: OAuthErrorCode, errorDescription?: string) {
    super(errorDescription || errorCode);
    this.name = 'OAuthError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.errorDescription = errorDescription;
  }
}

export class OAuthService {
  constructor(private readonly config: McpAuthConfig) {}

  /**
   * Validates an incoming /oauth/authorize request and generates a redirect URL with a signed code.
   */
  public processAuthorize(params: AuthorizeRequestParams, userEmail?: string): { redirectUrl: string } {
    const clientId = (params.client_id || '').trim();
    const redirectUri = (params.redirect_uri || '').trim();
    const configClientId = this.config.clientId.trim();

    logger.info({ clientId, redirectUri }, 'Processing OAuth authorize request');

    // 1. Validate response_type
    if (params.response_type !== 'code') {
      throw new OAuthError(
        400,
        OAuthErrorCodes.UNSUPPORTED_RESPONSE_TYPE,
        'Invalid response_type. Only "code" is supported.'
      );
    }

    // 2. Validate client_id
    if (!clientId || clientId !== configClientId) {
      throw new OAuthError(
        400,
        OAuthErrorCodes.INVALID_CLIENT,
        `Unknown or invalid client_id: ${params.client_id}`
      );
    }

    // 3. Validate redirect_uri
    if (!redirectUri) {
      throw new OAuthError(400, OAuthErrorCodes.INVALID_REQUEST, 'Missing redirect_uri parameter.');
    }

    const isAllowedRedirect = this.config.allowedRedirectUris.some((allowed) => {
      const trimmedAllowed = allowed.trim();
      if (trimmedAllowed === '*' || trimmedAllowed === redirectUri) {
        return true;
      }
      try {
        const allowedUrl = new URL(trimmedAllowed);
        const targetUrl = new URL(redirectUri);
        return allowedUrl.origin === targetUrl.origin && allowedUrl.pathname === targetUrl.pathname;
      } catch {
        return false;
      }
    });

    if (!isAllowedRedirect) {
      throw new OAuthError(
        400,
        OAuthErrorCodes.INVALID_REQUEST,
        `redirect_uri is not authorized: ${params.redirect_uri}`
      );
    }

    // 4. Validate PKCE code_challenge_method if challenge provided
    let method: 'S256' | 'plain' | undefined;
    if (params.code_challenge) {
      const specifiedMethod = (params.code_challenge_method || 'S256').toUpperCase().trim();
      if (specifiedMethod !== 'S256' && specifiedMethod !== 'PLAIN') {
        throw new OAuthError(
          400,
          OAuthErrorCodes.INVALID_REQUEST,
          'Invalid code_challenge_method. Supported methods: S256, plain.'
        );
      }
      method = specifiedMethod === 'PLAIN' ? 'plain' : 'S256';
    }

    // 5. Generate signed stateless authorization code
    const safeUserEmail = userEmail && isValidUserEmail(userEmail) ? userEmail.trim().toLowerCase() : undefined;
    const authCodePayload: AuthCodePayload = {
      clientId,
      redirectUri,
      codeChallenge: params.code_challenge ? params.code_challenge.trim() : undefined,
      codeChallengeMethod: method,
      scope: params.scope ? params.scope.trim() : OAUTH_DEFAULTS.DEFAULT_SCOPE,
      userEmail: safeUserEmail,
    };

    const code = generateAuthCode(authCodePayload, this.config.jwtSecret.trim(), this.config.codeTtlSec);

    // 6. Construct redirect URL
    const targetUrl = new URL(redirectUri);
    targetUrl.searchParams.set('code', code);
    if (params.state) {
      targetUrl.searchParams.set('state', params.state);
    }

    logger.info({ redirectUrl: targetUrl.origin + targetUrl.pathname }, 'OAuth authorize request successful, redirecting');
    return { redirectUrl: targetUrl.toString() };
  }

  /**
   * Exchanges an authorization code or refresh token for a signed Access Token & Refresh Token.
   */
  public processTokenExchange(params: TokenRequestParams): TokenResponse {
    logger.info(
      {
        grantType: params.grant_type,
        clientId: params.client_id,
        hasCodeVerifier: !!params.code_verifier,
        hasClientSecret: !!params.client_secret,
        hasRefreshToken: !!params.refresh_token,
      },
      'Processing OAuth token exchange request'
    );

    // Handle grant_type: refresh_token
    if (params.grant_type === 'refresh_token') {
      return this.handleRefreshTokenExchange(params);
    }

    // Handle grant_type: authorization_code
    if (params.grant_type === 'authorization_code') {
      return this.handleAuthorizationCodeExchange(params);
    }

    throw new OAuthError(
      400,
      OAuthErrorCodes.UNSUPPORTED_GRANT_TYPE,
      'Invalid grant_type. Supported grant types: "authorization_code", "refresh_token".'
    );
  }

  private handleAuthorizationCodeExchange(params: TokenRequestParams): TokenResponse {
    const paramClientId = (params.client_id || '').trim();
    const paramClientSecret = (params.client_secret || '').trim();
    const configClientId = this.config.clientId.trim();
    const configClientSecret = this.config.clientSecret.trim();
    const jwtSecret = this.config.jwtSecret.trim();

    // 1. Validate client_id
    if (!paramClientId || paramClientId !== configClientId) {
      logger.warn({ received: paramClientId, expected: configClientId }, 'Token request client_id mismatch');
      throw new OAuthError(
        401,
        OAuthErrorCodes.INVALID_CLIENT,
        'Invalid client_id provided in token request.'
      );
    }

    // 2. Verify and decode authorization code
    if (!params.code) {
      throw new OAuthError(400, OAuthErrorCodes.INVALID_REQUEST, 'Missing authorization code.');
    }

    let authCode: AuthCodePayload;
    try {
      authCode = verifyAndDecodeAuthCode(params.code.trim(), jwtSecret);
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Failed to verify authorization code');
      throw new OAuthError(
        400,
        OAuthErrorCodes.INVALID_GRANT,
        'Authorization code is invalid, malformed, or expired.'
      );
    }

    // 3. Verify client ID in code matches client ID in request
    if (authCode.clientId.trim() !== paramClientId) {
      throw new OAuthError(
        400,
        OAuthErrorCodes.INVALID_GRANT,
        'Authorization code was issued to a different client.'
      );
    }

    // 4. Verify redirect_uri if provided
    if (params.redirect_uri && params.redirect_uri.trim() !== authCode.redirectUri.trim()) {
      throw new OAuthError(
        400,
        OAuthErrorCodes.INVALID_GRANT,
        'redirect_uri does not match the redirect_uri used during authorization.'
      );
    }

    // 5. PKCE vs Client Secret verification
    // Google Vertex AI Search / Gemini Enterprise uses a hybrid confidential client flow:
    // Its web browser initiates /oauth/authorize with a PKCE code_challenge,
    // but its backend server performs the token exchange as a confidential client,
    // sending client_id + client_secret, while omitting code_verifier.
    if (params.code_verifier) {
      // PKCE was initiated and verifier was supplied
      if (authCode.codeChallenge) {
        const isVerifierValid = verifyCodeVerifier(
          params.code_verifier.trim(),
          authCode.codeChallenge,
          authCode.codeChallengeMethod || 'S256'
        );

        if (!isVerifierValid) {
          logger.warn('PKCE code_verifier failed challenge verification');
          throw new OAuthError(
            400,
            OAuthErrorCodes.INVALID_GRANT,
            'PKCE verification failed: code_verifier does not match code_challenge.'
          );
        }
      }

      // If client_secret is also supplied, validate it; if omitted (public PKCE client), allow
      if (paramClientSecret && !this.isSecretMatch(paramClientSecret, configClientSecret)) {
        logger.warn({ receivedLen: paramClientSecret.length, expectedLen: configClientSecret.length }, 'Client secret mismatch in PKCE exchange');
        throw new OAuthError(401, OAuthErrorCodes.INVALID_CLIENT, 'Invalid client_secret.');
      }
    } else {
      // code_verifier was omitted -> client MUST authenticate as a confidential client with client_secret
      if (!paramClientSecret) {
        logger.warn('Missing both code_verifier and client_secret in token exchange');
        if (authCode.codeChallenge) {
          throw new OAuthError(
            400,
            OAuthErrorCodes.INVALID_GRANT,
            'code_verifier or valid client_secret is required for authorization code exchange.'
          );
        } else {
          throw new OAuthError(
            401,
            OAuthErrorCodes.INVALID_CLIENT,
            'client_secret is required for confidential client authorization code exchange.'
          );
        }
      }

      if (!this.isSecretMatch(paramClientSecret, configClientSecret)) {
        logger.warn({ receivedLen: paramClientSecret.length, expectedLen: configClientSecret.length }, 'Invalid client_secret in confidential client exchange');
        throw new OAuthError(
          401,
          OAuthErrorCodes.INVALID_CLIENT,
          'Invalid or missing client_secret.'
        );
      }

      logger.info({ clientId: paramClientId }, 'Confidential client exchange authorized via client_secret');
    }

    // 6. Issue signed JWT access token and refresh token
    const scope = authCode.scope || OAUTH_DEFAULTS.DEFAULT_SCOPE;
    const safeUserEmail = authCode.userEmail && isValidUserEmail(authCode.userEmail) ? authCode.userEmail.trim().toLowerCase() : undefined;
    const tokenPayload: AccessTokenPayload = {
      iss: this.config.issuer,
      sub: safeUserEmail || configClientId,
      clientId: configClientId,
      email: safeUserEmail,
      userEmail: safeUserEmail,
      scope,
    };

    const accessToken = signJwt(tokenPayload, jwtSecret, this.config.tokenTtlSec);

    const refreshTokenPayload: RefreshTokenPayload = {
      iss: this.config.issuer,
      sub: configClientId,
      clientId: configClientId,
      userEmail: safeUserEmail,
      email: safeUserEmail,
      scope,
      token_purpose: 'refresh_token',
    };

    const refreshTokenTtl = this.config.refreshTokenTtlSec || OAUTH_DEFAULTS.REFRESH_TOKEN_TTL_SEC;
    const refreshToken = signJwt(refreshTokenPayload, jwtSecret, refreshTokenTtl);

    logger.info({ sub: tokenPayload.sub, userEmail: safeUserEmail, scope: tokenPayload.scope }, 'Access token and refresh token generated successfully');

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.config.tokenTtlSec,
      refresh_token: refreshToken,
      scope: tokenPayload.scope,
    };
  }

  private handleRefreshTokenExchange(params: TokenRequestParams): TokenResponse {
    const paramClientId = (params.client_id || '').trim();
    const paramClientSecret = (params.client_secret || '').trim();
    const configClientId = this.config.clientId.trim();
    const configClientSecret = this.config.clientSecret.trim();
    const jwtSecret = this.config.jwtSecret.trim();

    // 1. Validate client_id
    if (!paramClientId || paramClientId !== configClientId) {
      throw new OAuthError(
        401,
        OAuthErrorCodes.INVALID_CLIENT,
        'Invalid client_id provided in refresh token request.'
      );
    }

    // 2. Validate client_secret if provided
    if (paramClientSecret && !this.isSecretMatch(paramClientSecret, configClientSecret)) {
      throw new OAuthError(401, OAuthErrorCodes.INVALID_CLIENT, 'Invalid client_secret.');
    }

    // 3. Verify and decode refresh_token
    if (!params.refresh_token) {
      throw new OAuthError(400, OAuthErrorCodes.INVALID_REQUEST, 'Missing refresh_token parameter.');
    }

    let decodedRefresh: RefreshTokenPayload;
    try {
      decodedRefresh = verifyJwt<RefreshTokenPayload>(params.refresh_token.trim(), jwtSecret);
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Failed to verify refresh token');
      throw new OAuthError(
        400,
        OAuthErrorCodes.INVALID_GRANT,
        'Refresh token is invalid, malformed, or expired.'
      );
    }

    if (decodedRefresh.token_purpose !== 'refresh_token') {
      throw new OAuthError(
        400,
        OAuthErrorCodes.INVALID_GRANT,
        'Invalid token purpose: expected refresh_token.'
      );
    }

    const tokenClientId = (decodedRefresh.clientId || decodedRefresh.sub || '').trim();
    if (tokenClientId !== paramClientId && decodedRefresh.sub.trim() !== paramClientId) {
      throw new OAuthError(
        400,
        OAuthErrorCodes.INVALID_GRANT,
        'Refresh token was issued to a different client.'
      );
    }

    // 4. Issue new access token and refresh token preserving userEmail
    const scope = decodedRefresh.scope || OAUTH_DEFAULTS.DEFAULT_SCOPE;
    const rawUserEmail = decodedRefresh.userEmail || decodedRefresh.email || (isValidUserEmail(decodedRefresh.sub) ? decodedRefresh.sub : undefined);
    const preservedEmail = cleanUserEmail(rawUserEmail);

    const tokenPayload: AccessTokenPayload = {
      iss: this.config.issuer,
      sub: preservedEmail || configClientId,
      clientId: configClientId,
      email: preservedEmail,
      userEmail: preservedEmail,
      scope,
    };

    const accessToken = signJwt(tokenPayload, jwtSecret, this.config.tokenTtlSec);

    const refreshTokenPayload: RefreshTokenPayload = {
      iss: this.config.issuer,
      sub: configClientId,
      clientId: configClientId,
      userEmail: preservedEmail,
      email: preservedEmail,
      scope,
      token_purpose: 'refresh_token',
    };

    const refreshTokenTtl = this.config.refreshTokenTtlSec || OAUTH_DEFAULTS.REFRESH_TOKEN_TTL_SEC;
    const newRefreshToken = signJwt(refreshTokenPayload, jwtSecret, refreshTokenTtl);

    logger.info({ sub: tokenPayload.sub, userEmail: preservedEmail, scope }, 'Tokens refreshed successfully');

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.config.tokenTtlSec,
      refresh_token: newRefreshToken,
      scope,
    };
  }

  /**
   * Performs constant-time comparison between client-supplied secret and configured secret.
   */
  private isSecretMatch(candidate: string, expected: string): boolean {
    const candidateBuf = Buffer.from(candidate, 'utf8');
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (candidateBuf.length !== expectedBuf.length) {
      return false;
    }
    return timingSafeEqual(candidateBuf, expectedBuf);
  }
}
