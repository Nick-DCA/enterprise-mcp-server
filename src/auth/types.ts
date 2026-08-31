import { OAuthErrorCode } from './constants.js';

export interface McpAuthConfig {
  clientId: string;
  clientSecret: string;
  jwtSecret: string;
  allowedRedirectUris: string[];
  codeTtlSec: number;
  tokenTtlSec: number;
  refreshTokenTtlSec?: number;
  issuer: string;
}

export interface AuthCodePayload {
  clientId: string;
  redirectUri: string;
  codeChallenge?: string;
  codeChallengeMethod?: 'S256' | 'plain';
  scope?: string;
  iat?: number;
  exp?: number;
}

export interface AccessTokenPayload {
  iss: string;
  sub: string;
  aud?: string;
  scope: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  iss: string;
  sub: string;
  scope: string;
  token_purpose: 'refresh_token';
  iat?: number;
  exp?: number;
}

export interface AuthorizeRequestParams {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
}

export interface TokenRequestParams {
  grant_type?: string;
  client_id?: string;
  client_secret?: string;
  code?: string;
  redirect_uri?: string;
  code_verifier?: string;
  refresh_token?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export interface OAuthErrorResponse {
  error: OAuthErrorCode;
  error_description?: string;
}
