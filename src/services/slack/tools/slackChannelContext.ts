import { z } from 'zod';
import { ToolDefinition } from '../../../mcp/types.js';
import { RequestContext } from '../../../server/context.js';
import { slackService, SlackNotConnectedError } from '../client.js';
import { SlackTokenRevokedError } from '../tokenManager.js';
import { getSecretValue } from '../../../config/secretManager.js';

export const slackChannelContextTool: ToolDefinition = {
  name: 'slack-get-channel-context',
  description:
    'Retrieves surrounding channel timeline messages immediately preceding and succeeding a specific Slack message using the authenticated corporate user\'s delegated credentials. ' +
    'Requires the channel ID (channelId) and target message timestamp (messageTs) discovered via "slack-federated-search". ' +
    'Returns a unified, chronologically ordered timeline centered around the target message with authors, timestamps, sanitized message text, and attached file IDs. ' +
    'Use this tool when a search result is not part of a thread, but you need the surrounding conversation window in the channel to understand decisions, agreements, or context.',
  schema: {
    channelId: z
      .string()
      .min(1, 'Channel ID is required')
      .describe('The Slack channel ID (e.g. "C01234567"), obtained from slack-federated-search.'),
    messageTs: z
      .string()
      .min(1, 'Message timestamp is required')
      .describe('The raw epoch timestamp of the focal message (e.g. "1704220740.012345"), obtained from slack-federated-search (messageTs).'),
    before: z
      .coerce
      .number()
      .int()
      .min(0)
      .max(20)
      .optional()
      .default(5)
      .describe('Number of preceding messages to retrieve before the focal message (default: 5, max: 20).'),
    after: z
      .coerce
      .number()
      .int()
      .min(0)
      .max(20)
      .optional()
      .default(5)
      .describe('Number of succeeding messages to retrieve after the focal message (default: 5, max: 20).'),
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  execute: async (args: { channelId: string; messageTs: string; before?: number; after?: number }) => {
    const userEmail = RequestContext.getUserEmail();

    if (!userEmail) {
      return {
        status: 'error',
        message:
          'Could not resolve authenticated user identity from the incoming request. Please ensure you are authenticated in Gemini Enterprise.',
      };
    }

    try {
      const result = await slackService.getChannelContext(
        args.channelId,
        args.messageTs,
        args.before,
        args.after,
        userEmail
      );
      return result;
    } catch (err: any) {
      if (err instanceof SlackNotConnectedError || err instanceof SlackTokenRevokedError) {
        const redirectSecret = (await getSecretValue('SLACK_REDIRECT_URI')) || process.env.SLACK_REDIRECT_URI;
        let connectBaseUrl = '';
        if (redirectSecret) {
          try {
            const parsed = new URL(redirectSecret);
            connectBaseUrl = `${parsed.protocol}//${parsed.host}`;
          } catch {
            connectBaseUrl = '';
          }
        }

        const connectUrl = connectBaseUrl
          ? `${connectBaseUrl}/api/connectors/slack/connect?userEmail=${encodeURIComponent(userEmail)}`
          : `/api/connectors/slack/connect?userEmail=${encodeURIComponent(userEmail)}`;

        const isRevoked = err instanceof SlackTokenRevokedError;
        const headline = isRevoked
          ? 'Your Slack authorization has expired or was revoked.'
          : "You haven't connected your Slack account to Gemini Enterprise yet.";

        return {
          status: 'unlinked',
          actionRequired: 'CONNECT_SLACK_ACCOUNT',
          message: [
            `[Action Required] **${headline}**`,
            '',
            'To access Slack channel history, you must authorize this gateway using your corporate Slack account.',
            '',
            `**[Click here to connect your Slack Account](${connectUrl})**`,
            '',
            '*(Once authorized in your browser, re-run your request in Gemini Enterprise).*',
          ].join('\n'),
        };
      }

      throw err;
    }
  },
};
