import { z } from 'zod';
import { ToolDefinition } from '../../../mcp/types.js';
import { RequestContext } from '../../../server/context.js';
import { slackService, SlackNotConnectedError } from '../client.js';
import { SlackTokenRevokedError } from '../tokenManager.js';
import { getSecretValue } from '../../../config/secretManager.js';

export const slackFileContentTool: ToolDefinition = {
  name: 'slack-get-file-content',
  description:
    'Downloads and extracts readable text, markdown, code, log, or CSV content of a Slack file by ID using the authenticated corporate user\'s delegated credentials. ' +
    'Requires the file ID (fileId) discovered via "slack-federated-search", "slack-get-thread-replies", or "slack-get-channel-context". ' +
    'Returns file metadata (name, mimetype, size) and decoded content up to 15,000 characters with prompt injection boundary defense. ' +
    'Use this tool when a search result or conversation thread mentions an attached document, specification, snippet, or data file and you need its contents to formulate a complete answer.',
  schema: {
    fileId: z
      .string()
      .min(1, 'File ID is required')
      .describe('The Slack file ID (e.g. "F01234567") to read, obtained from search or message attachment lists.'),
    maxChars: z
      .coerce
      .number()
      .int()
      .min(500)
      .max(50000)
      .optional()
      .default(15000)
      .describe('Maximum number of characters to extract from the file (default: 15,000, max: 50,000).'),
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  execute: async (args: { fileId: string; maxChars?: number }) => {
    const userEmail = RequestContext.getUserEmail();

    if (!userEmail) {
      return {
        status: 'error',
        message:
          'Could not resolve authenticated user identity from the incoming request. Please ensure you are authenticated in Gemini Enterprise.',
      };
    }

    try {
      const result = await slackService.getFileContent(args.fileId, args.maxChars, userEmail);
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
            'To access Slack file contents, you must authorize this gateway using your corporate Slack account.',
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
