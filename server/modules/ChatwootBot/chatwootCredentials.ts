import type { ChatwootBotSettings } from '../../../shared/types/chatwootBot.js';
import type { ChatwootApiCredentials } from './ChatwootApiClient.js';
import { sanitizeChatwootApiToken } from './chatwootHttp.js';

export function botMessagingCredentials(settings: ChatwootBotSettings): ChatwootApiCredentials {
  return {
    baseUrl: settings.baseUrl.trim(),
    accountId: settings.accountId,
    apiAccessToken: sanitizeChatwootApiToken(settings.apiAccessToken),
  };
}

/** User PAT — для assign / PATCH conversation; Agent Bot token тут не підходить. */
export function handoverAssignmentCredentials(settings: ChatwootBotSettings): ChatwootApiCredentials {
  const pat = sanitizeChatwootApiToken(settings.inboxApiAccessToken);
  return {
    baseUrl: settings.baseUrl.trim(),
    accountId: settings.accountId,
    apiAccessToken: pat || sanitizeChatwootApiToken(settings.apiAccessToken),
  };
}

export function hasHandoverUserPat(settings: ChatwootBotSettings): boolean {
  return Boolean(settings.inboxApiAccessToken.trim());
}
