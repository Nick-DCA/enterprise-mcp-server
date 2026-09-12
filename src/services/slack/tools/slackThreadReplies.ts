import { z } from 'zod';
import { ToolDefinition } from '../../../mcp/types.js';
import { RequestContext } from '../../../server/context.js';
import { slackService, SlackNotConnectedError } from '../client.js';
import { SlackTokenRevokedError } from '../tokenManager.js';
import { getSecretValue } from '../../../config/secretManager.js';

export const slackThreadRepliesTool: ToolDefinition = {
  name: 'slack-get-thread-replies',
  description:
    'Retrieves the full chronological thread discussion (parent message and all replies up to 50 messages) for a specific Slack thread using the authenticated corporate user\'s delegated credentials. ' +
    'Requires the channel ID (channelId) and thread root timestamp (threadTs) discovered from "slack-federated-search". ' +
    'Returns ordered messages with authors, timestamps, sanitized message text, and any attached file IDs. ' +
    'Use this tool when search results indicate a thread discussion (replyCount > 0 or threadTs present) and you need the full conversational context to answer a question or formulate a topic summary.',
  schema: {
    channelId: z
      .string()
      .min(1, 'Channel ID is required')
      .describe('The Slack channel ID (e.g. "C01234567") where the thread is located, obtained from slack-federated-search.'),
    threadTs: z
      .string()
      .min(1, 'Thread timestamp is required')
      .describe('The raw epoch timestamp of the parent thread root message (e.g. "1704220700.000100"), obtained from slack-federated-search.'),
    limit: z
      .coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(20)
      .describe('Maximum number of thread messages to retrieve (default: 20, max: 50).'),
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  execute: async (args: { channelId: string; threadTs: string; limit?: number }) => {
    const userEmail = RequestContext.getUserEmail();

    if (!userEmail) {
      return {
        status: 'error',
        message:
          'Could not resolve authenticated user identity from the incoming request. Please ensure you are authenticated in Gemini Enterprise.',
      };
    }

    try {
      const result = await slackService.getThreadReplies(args.channelId, args.threadTs, args.limit, userEmail);
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
            'To access Slack conversations and threads, you must authorize this gateway using your corporate Slack account.',
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
