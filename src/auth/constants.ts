/**
 * Standard RFC 6749 OAuth 2.0 Error Codes
 */
export const OAuthErrorCodes = {
  INVALID_REQUEST: 'invalid_request',
  UNAUTHORIZED_CLIENT: 'unauthorized_client',
  ACCESS_DENIED: 'access_denied',
  UNSUPPORTED_RESPONSE_TYPE: 'unsupported_response_type',
  INVALID_SCOPE: 'invalid_scope',
  SERVER_ERROR: 'server_error',
  TEMPORARILY_UNAVAILABLE: 'temporarily_unavailable',
  INVALID_CLIENT: 'invalid_client',
  INVALID_GRANT: 'invalid_grant',
  UNSUPPORTED_GRANT_TYPE: 'unsupported_grant_type',
} as const;

export type OAuthErrorCode = (typeof OAuthErrorCodes)[keyof typeof OAuthErrorCodes];

/**
 * Default lifetimes and scopes for OAuth tokens
 */
export const OAUTH_DEFAULTS = {
  AUTH_CODE_TTL_SEC: 300, // 5 minutes
  ACCESS_TOKEN_TTL_SEC: 3600, // 1 hour
  REFRESH_TOKEN_TTL_SEC: 2592000, // 30 days
  DEFAULT_SCOPE: 'xero:readwrite',
  DEFAULT_REDIRECT_URI: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
  ISSUER: 'xero-mcp-server',
} as const;
