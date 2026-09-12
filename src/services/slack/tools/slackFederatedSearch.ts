import { z } from 'zod';
import { ToolDefinition } from '../../../mcp/types.js';
import { RequestContext } from '../../../server/context.js';
import { slackService, SlackNotConnectedError } from '../client.js';
import { SlackTokenRevokedError } from '../tokenManager.js';
import { getSecretValue } from '../../../config/secretManager.js';

export const slackFederatedSearchTool: ToolDefinition = {
  name: 'slack-federated-search',
  description:
    'Searches authorized Slack channels, private groups, and direct messages for conversational text matching a query using the authenticated corporate user\'s delegated credentials. ' +
    'Supports Slack query operators (e.g. from:@user, in:#channel, in:@user, with:@user, after:YYYY-MM-DD, before:YYYY-MM-DD, has:link, has:file). ' +
    'Returns matching messages with channel names, channel IDs, authors, timestamps, raw message timestamps (messageTs), thread root timestamps (threadTs), reply counts, and attached file IDs. ' +
    'AI Agent Best Practice: For comprehensive topic summaries, follow the 3-step retrieval pipeline: ' +
    '1. Call this tool to discover key messages and threads. ' +
    '2. Call "slack-get-thread-replies" or "slack-get-channel-context" to fetch full chronological conversation context. ' +
    '3. Call "slack-get-file-content" to inspect referenced documents or snippets. ' +
    'Call the companion tool "slack-search-guide" for query syntax and sequential search playbooks.',
  schema: {
    query: z
      .string()
      .min(2, 'Query must be at least 2 characters long')
      .max(200, 'Query exceeds maximum length of 200 characters')
      .describe(
        'The search query string. Supports Slack operators such as "from:@sarah", "in:#proj-billing", "in:@alex", "after:2024-06-01", "before:2024-12-31", "has:link", "has:file", or exact quotes. Call "slack-search-guide" for full operator list and sequential search strategies.'
      ),
    count: z
      .coerce
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .default(5)
      .describe('Number of matching messages to retrieve (default: 5, max: 10).'),
    sort: z
      .enum(['score', 'timestamp'])
      .optional()
      .default('score')
      .describe('Sort order: "score" for relevance or "timestamp" for chronological recency.'),
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  execute: async (args: { query: string; count?: number; sort?: 'score' | 'timestamp' }) => {
    const userEmail = RequestContext.getUserEmail();

    if (!userEmail) {
      return {
        status: 'error',
        message:
          'Could not resolve authenticated user identity from the incoming request. Please ensure you are authenticated in Gemini Enterprise.',
      };
    }

    try {
      const results = await slackService.searchMessages(args, userEmail);

      // Attach search guidance and refinement suggestions for AI agents
      const guidance =
        results.results.length === 0
          ? {
              tip: `Zero matching messages found for "${args.query}".`,
              recoverySteps: [
                '1. Relax exact phrase quotes (search individual keywords instead of "exact phrase").',
                '2. Remove channel restrictions (in:#channel) to search across all public channels and authorized DMs.',
                '3. Widen or remove temporal filters (after: / before:).',
                '4. Call "slack-search-guide" with topic: "troubleshooting" for additional query recovery strategies.',
              ],
            }
          : {
              contextExpansionTip:
                'To dive deeper into any returned message: ' +
                '1. For threads (replyCount > 0 or threadTs present), call "slack-get-thread-replies" with channelId and threadTs. ' +
                '2. For channel timeline surrounding context, call "slack-get-channel-context" with channelId and messageTs. ' +
                '3. For attached documents, call "slack-get-file-content" with fileId.',
            };

      return {
        ...results,
        guidance,
      };
    } catch (err: any) {
      if (err instanceof SlackNotConnectedError || err instanceof SlackTokenRevokedError) {
        // Resolve gateway base URL for self-service link
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
            'To search Slack channels and direct messages, you must authorize this gateway using your corporate Slack account.',
            '',
            `**[Click here to connect your Slack Account](${connectUrl})**`,
            '',
            '*(Once authorized in your browser, simply re-run your search in Gemini Enterprise).*',
          ].join('\n'),
        };
      }

      throw err;
    }
  },
};
