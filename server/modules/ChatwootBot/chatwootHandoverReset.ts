import { CHATWOOT_BOT_ATTR_HUMAN_HANDOVER_ACTIVE, type ChatwootBotSettings } from '../../../shared/types/chatwootBot.js';
import { createChatwootApiClient } from './ChatwootApiClient.js';
import {
  botMessagingCredentials,
  handoverAssignmentCredentials,
  hasHandoverUserPat,
} from './chatwootCredentials.js';
import { sanitizeChatwootApiToken } from './chatwootHttp.js';

export type HandoverResetResult = {
  unassigned: boolean;
  humanHandoverAttrCleared: boolean;
  typingOff: 'ok' | 'fail' | 'skipped' | 'dry_run';
};

/** Зняти assignee + скинути bot_human_handover_active (+ typing off). Без публічного повідомлення. */
export async function resetHumanHandoverOnConversation(
  settings: ChatwootBotSettings,
  conversationId: number,
  dryRun: boolean,
): Promise<HandoverResetResult> {
  if (dryRun) {
    return {
      unassigned: true,
      humanHandoverAttrCleared: true,
      typingOff: 'dry_run',
    };
  }

  if (!settings.baseUrl.trim()) {
    return { unassigned: false, humanHandoverAttrCleared: false, typingOff: 'skipped' };
  }

  const canAssign =
    hasHandoverUserPat(settings) || Boolean(sanitizeChatwootApiToken(settings.apiAccessToken));
  if (!canAssign) {
    return { unassigned: false, humanHandoverAttrCleared: false, typingOff: 'skipped' };
  }

  const assignClient = createChatwootApiClient(handoverAssignmentCredentials(settings));
  await assignClient.unassignConversationOrThrow(conversationId);
  await assignClient.mergeConversationCustomAttributesBestEffort(conversationId, {
    [CHATWOOT_BOT_ATTR_HUMAN_HANDOVER_ACTIVE]: false,
  });

  let typingOff: HandoverResetResult['typingOff'] = 'skipped';
  if (sanitizeChatwootApiToken(settings.apiAccessToken)) {
    const botClient = createChatwootApiClient(botMessagingCredentials(settings));
    typingOff = (await botClient.toggleTypingStatusBestEffort(conversationId, 'off'))
      ? 'ok'
      : 'fail';
  }

  return {
    unassigned: true,
    humanHandoverAttrCleared: true,
    typingOff,
  };
}
