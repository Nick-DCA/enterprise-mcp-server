import { ToolDefinition } from '../../../mcp/types.js';
import { slackFederatedSearchTool } from './slackFederatedSearch.js';
import { slackThreadRepliesTool } from './slackThreadReplies.js';
import { slackChannelContextTool } from './slackChannelContext.js';
import { slackFileContentTool } from './slackFileContent.js';
import { slackSearchGuideTool } from './slackSearchGuide.js';

export const slackTools: ToolDefinition[] = [
  slackFederatedSearchTool,
  slackThreadRepliesTool,
  slackChannelContextTool,
  slackFileContentTool,
  slackSearchGuideTool,
];

export {
  slackFederatedSearchTool,
  slackThreadRepliesTool,
  slackChannelContextTool,
  slackFileContentTool,
  slackSearchGuideTool,
};
