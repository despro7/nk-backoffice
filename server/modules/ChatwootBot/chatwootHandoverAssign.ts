import { ChatwootApiClient } from './ChatwootApiClient.js';

function isBotAssignUnauthorized(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('not authorized for bots') ||
    lower.includes('http 401') ||
    lower.includes('invalid access token')
  );
}

/**
 * Chatwoot: POST /assignments з assignee_id (User).
 * На сучасних інстансах дозволено Agent Bot token (access_token_auth_helper).
 * Інакше — fallback на User PAT.
 *
 * @see https://github.com/chatwoot/chatwoot/pull/8639 (bot_handoff via toggle_status)
 * @see https://github.com/chatwoot/chatwoot/commit/35a5f33 (assign human clears bot owner)
 */
export type AssignHumanAgentResult = {
  assigneeId: number | null;
  via: 'bot' | 'pat';
};

export async function assignHumanAgentWithBotFallback(
  conversationId: number,
  assigneeId: number,
  botClient: ChatwootApiClient,
  patClient: ChatwootApiClient | null,
): Promise<AssignHumanAgentResult> {
  let via: AssignHumanAgentResult['via'] = 'bot';
  try {
    await botClient.assignConversation(conversationId, assigneeId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!patClient) {
      throw new Error(
        `assign: бот не має права на /assignments (оновіть Chatwoot або додайте User PAT). ${message}`,
      );
    }
    if (!isBotAssignUnauthorized(message)) {
      throw err;
    }
    via = 'pat';
    await patClient.assignConversation(conversationId, assigneeId);
  }

  const assigneeIdVerified =
    (await botClient.getConversationAssigneeId(conversationId)) ??
    (patClient ? await patClient.getConversationAssigneeId(conversationId) : null);

  return { assigneeId: assigneeIdVerified, via };
}
