export interface SlackStoredToken {
  accessToken: string;
  refreshToken?: string | null;
  tokenType: 'user';
  scope: string;
  expiresAt: number; // Epoch ms
  updatedAt: string; // ISO string
}

export interface SlackSearchOptions {
  query: string;
  count?: number;
  sort?: 'score' | 'timestamp';
}

export interface SlackFileAttachment {
  id: string;
  name: string;
  filetype: string;
  mimetype: string;
  size: number;
  isDownloadable: boolean;
}

export interface SlackSearchMatch {
  channel: string;
  channelId: string;
  isPrivate: boolean;
  author: string;
  timestamp: string;
  messageTs: string;
  threadTs?: string;
  replyCount?: number;
  text: string;
  permalink?: string;
  files?: SlackFileAttachment[];
}

export interface SlackSearchOutput {
  status: 'success' | 'unlinked' | 'error';
  metadata: {
    query: string;
    workspace?: string;
    returnedCount: number;
    totalMatches: number;
    authenticatedUser: string;
    securityNotice: string;
  };
  results: SlackSearchMatch[];
}

export interface SlackThreadMessage {
  author: string;
  timestamp: string;
  messageTs: string;
  text: string;
  files?: SlackFileAttachment[];
}

export interface SlackThreadOutput {
  status: 'success' | 'unlinked' | 'error';
  channelId: string;
  threadTs: string;
  messageCount: number;
  messages: SlackThreadMessage[];
  securityNotice: string;
}

export interface SlackContextOutput {
  status: 'success' | 'unlinked' | 'error';
  channelId: string;
  centerMessageTs: string;
  messageCount: number;
  messages: SlackThreadMessage[];
  securityNotice: string;
}

export interface SlackFileOutput {
  status: 'success' | 'unlinked' | 'error';
  fileId: string;
  name: string;
  filetype: string;
  mimetype: string;
  sizeBytes: number;
  truncated: boolean;
  content: string;
  securityNotice: string;
}
