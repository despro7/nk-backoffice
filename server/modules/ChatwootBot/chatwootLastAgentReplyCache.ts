import type { ChatwootBotSettings } from '../../../shared/types/chatwootBot.js';
import { createChatwootApiClient } from './ChatwootApiClient.js';
import { handoverAssignmentCredentials, hasHandoverUserPat } from './chatwootCredentials.js';
import { sanitizeChatwootApiToken } from './chatwootHttp.js';

const CACHE_TTL_MS = 120_000;

type CacheEntry = {
  expiresAt: number;
  /** Unix ms останнього публічного outgoing від user; `null` = агент ще не відповідав. */
  lastAgentReplyAt: number | null;
};

const byConversation = new Map<number, CacheEntry>();

function isAgentPublicOutgoing(msg: {
  message_type?: string | number;
  private?: boolean;
  sender?: { type?: string };
}): boolean {
  if (msg.private === true) return false;
  const senderType = String(msg.sender?.type ?? '').toLowerCase();
  if (senderType !== 'user') return false;
  const mt = msg.message_type;
  if (typeof mt === 'number') return mt === 1;
  const normalized = String(mt ?? '').toLowerCase();
  return normalized === 'outgoing' || normalized === '1';
}

/**
 * Хвилини з останньої публічної відповіді агента.
 * `null` – агент жодного разу не відповідав (для OOH reclaim = ∞).
 */
export async function minutesSinceLastAgentPublicReply(
  settings: ChatwootBotSettings,
  conversationId: number,
): Promise<number | null> {
  const now = Date.now();
  const cached = byConversation.get(conversationId);
  if (cached && now < cached.expiresAt) {
    if (cached.lastAgentReplyAt == null) return null;
    return (now - cached.lastAgentReplyAt) / 60_000;
  }

  if (
    !settings.baseUrl.trim() ||
    (!hasHandoverUserPat(settings) && !sanitizeChatwootApiToken(settings.apiAccessToken))
  ) {
    return null;
  }

  const client = createChatwootApiClient(handoverAssignmentCredentials(settings));
  const messages = await client.listConversationMessages(conversationId);
  let lastAgentReplyAt: number | null = null;
  for (const msg of messages) {
    if (!isAgentPublicOutgoing(msg)) continue;
    const ts = msg.createdAt.getTime();
    if (lastAgentReplyAt == null || ts > lastAgentReplyAt) {
      lastAgentReplyAt = ts;
    }
  }

  byConversation.set(conversationId, {
    expiresAt: now + CACHE_TTL_MS,
    lastAgentReplyAt,
  });

  if (lastAgentReplyAt == null) return null;
  return (now - lastAgentReplyAt) / 60_000;
}

export function clearLastAgentReplyCacheForTests(): void {
  byConversation.clear();
}
