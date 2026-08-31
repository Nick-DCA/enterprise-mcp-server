import jwt from 'jsonwebtoken';

/**
 * Signs a payload into a JWT string using HMAC-SHA256 (HS256).
 */
export function signJwt(payload: object, secret: string, expiresInSec: number): string {
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: expiresInSec,
  });
}

/**
 * Verifies a JWT token signature and expiration, returning the decoded payload.
 * Throws an error if the token is invalid, tampered with, or expired.
 */
export function verifyJwt<T extends object>(token: string, secret: string): T {
  const decoded = jwt.verify(token, secret, {
    algorithms: ['HS256'],
  });
  return decoded as T;
}

/**
 * Safely decodes a JWT token without verifying the signature (useful for inspection/logging).
 */
export function decodeJwt<T extends object>(token: string): T | null {
  const decoded = jwt.decode(token);
  return (decoded as T) || null;
}
