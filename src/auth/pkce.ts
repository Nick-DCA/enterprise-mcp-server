import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Computes the PKCE code challenge from a code verifier.
 * For S256: BASE64URL(SHA256(verifier))
 * For plain: verifier
 */
export function computeCodeChallenge(verifier: string, method: 'S256' | 'plain' = 'S256'): string {
  if (method === 'plain') {
    return verifier;
  }
  return createHash('sha256')
    .update(verifier, 'ascii')
    .digest('base64url');
}

/**
 * Validates whether a provided PKCE code verifier matches the stored code challenge.
 * Uses timing-safe string comparison to prevent timing attacks.
 */
export function verifyCodeVerifier(
  verifier: string,
  challenge: string,
  method: 'S256' | 'plain' = 'S256'
): boolean {
  if (!verifier || !challenge) {
    return false;
  }

  // RFC 7636 Section 4.1: code_verifier length must be between 43 and 128 chars
  if (verifier.length < 43 || verifier.length > 128) {
    return false;
  }

  const expectedChallenge = computeCodeChallenge(verifier, method);

  const expectedBuffer = Buffer.from(expectedChallenge, 'utf8');
  const actualBuffer = Buffer.from(challenge, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
