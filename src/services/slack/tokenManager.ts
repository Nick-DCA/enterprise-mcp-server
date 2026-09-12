import { getSecretValue, writeSecretValue } from '../../config/secretManager.js';
import { runtimeConfig } from '../../config/runtimeConfig.js';
import { logger } from '../../utils/logger.js';
import { SlackStoredToken } from './types.js';

export class SlackTokenRevokedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlackTokenRevokedError';
  }
}

export class SlackTokenMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlackTokenMissingError';
  }
}

/**
 * Manages user-delegated Slack tokens, Secret Manager caching, and automated Token Rotation.
 */
export class SlackTokenManager {
  /**
   * Retrieves a valid Slack access token for a given user.
   * If the token is near expiration (within 5 minutes) and a refresh token exists,
   * it executes automated proactive token rotation.
   */
  public async getValidUserToken(slackUserId: string, userEmail: string): Promise<string> {
    const secretKey = `slack-user-${slackUserId}`;
    const rawSecret = await getSecretValue(secretKey);

    if (!rawSecret) {
      throw new SlackTokenMissingError(
        `No credentials found in Secret Manager for Slack user ${slackUserId} (${userEmail}).`
      );
    }

    let tokenData: SlackStoredToken;
    try {
      tokenData = JSON.parse(rawSecret);
    } catch {
      // If legacy plain-text token
      return rawSecret;
    }

    const now = Date.now();
    const safetyBufferMs = 5 * 60 * 1000; // 5-minute proactive safety window
    const isNearExpiry = tokenData.expiresAt && now >= tokenData.expiresAt - safetyBufferMs;

    if (!isNearExpiry) {
      return tokenData.accessToken;
    }

    // Token is expiring soon or expired; attempt token refresh
    if (!tokenData.refreshToken) {
      logger.warn({ slackUserId, userEmail }, 'Slack token expiring but no refresh token is stored. Using existing token.');
      return tokenData.accessToken;
    }

    logger.info({ slackUserId, userEmail }, 'Proactive token rotation triggered for Slack user (<5m to expiry)');

    const clientId = (await getSecretValue('SLACK_CLIENT_ID')) || process.env.SLACK_CLIENT_ID;
    const clientSecret = (await getSecretValue('SLACK_CLIENT_SECRET')) || process.env.SLACK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      logger.warn('SLACK_CLIENT_ID or SLACK_CLIENT_SECRET missing during refresh; returning cached access token');
      return tokenData.accessToken;
    }

    try {
      const refreshResponse = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: tokenData.refreshToken,
        }),
      });

      const data: any = await refreshResponse.json();

      if (!data.ok) {
        logger.error({ error: data.error, slackUserId, userEmail }, 'Slack token rotation refresh failed');

        if (data.error === 'invalid_grant' || data.error === 'token_revoked') {
          // Token lapsed (>90d inactive) or revoked upstream
          const firestore = await runtimeConfig.getFirestore();
          if (firestore) {
            await firestore.collection('user_connections').doc(`${userEmail}_slack`).set(
              {
                status: 'REVOKED',
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );
          }
          throw new SlackTokenRevokedError(
            'Your Slack authorization has expired due to inactivity (>90 days) or has been revoked. Please reconnect.'
          );
        }

        // Return current token as fallback if temporary error
        return tokenData.accessToken;
      }

      // Single-use rotation: Slack issues a new access token AND a new refresh token
      const newAccessToken = data.access_token;
      const newRefreshToken = data.refresh_token;
      const expiresIn = data.expires_in ? Number(data.expires_in) : 43200; // 12 hours
      const newExpiresAt = Date.now() + expiresIn * 1000;

      const updatedPayload: SlackStoredToken = {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenType: 'user',
        scope: data.scope || tokenData.scope,
        expiresAt: newExpiresAt,
        updatedAt: new Date().toISOString(),
      };

      // 1. Atomically write new secret version in GSM
      await writeSecretValue(secretKey, JSON.stringify(updatedPayload));

      // 2. Update Firestore user_connections record
      const firestore = await runtimeConfig.getFirestore();
      if (firestore) {
        await firestore.collection('user_connections').doc(`${userEmail}_slack`).set(
          {
            expiresAt: new Date(newExpiresAt).toISOString(),
            lastRefreshedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      logger.info({ slackUserId, userEmail }, 'Slack token rotated successfully (new 12h access / 90d refresh window)');
      return newAccessToken;
    } catch (refreshErr: any) {
      if (refreshErr instanceof SlackTokenRevokedError) {
        throw refreshErr;
      }
      logger.warn({ error: refreshErr.message }, 'Unexpected error during Slack token rotation, falling back to cached token');
      return tokenData.accessToken;
    }
  }
}

export const slackTokenManager = new SlackTokenManager();
