import { signJwt, verifyJwt } from './jwt.js';
import { AuthCodePayload } from './types.js';
import { OAUTH_DEFAULTS } from './constants.js';

interface InternalAuthCodeToken extends AuthCodePayload {
  token_purpose: 'authorization_code';
}

/**
 * Generates a stateless, HMAC-signed authorization code containing OAuth handshake state.
 */
export function generateAuthCode(
  payload: AuthCodePayload,
  secret: string,
  expiresInSec: number = OAUTH_DEFAULTS.AUTH_CODE_TTL_SEC
): string {
  const tokenPayload: InternalAuthCodeToken = {
    ...payload,
    token_purpose: 'authorization_code',
  };
  return signJwt(tokenPayload, secret, expiresInSec);
}

/**
 * Verifies the signature and expiration of a stateless authorization code and decodes its payload.
 * Throws an error if invalid, expired, or purpose mismatch.
 */
export function verifyAndDecodeAuthCode(code: string, secret: string): AuthCodePayload {
  const decoded = verifyJwt<InternalAuthCodeToken>(code, secret);
  if (decoded.token_purpose !== 'authorization_code') {
    throw new Error('Invalid token purpose: expected authorization_code');
  }
  const { token_purpose, ...authCodePayload } = decoded;
  return authCodePayload;
}
