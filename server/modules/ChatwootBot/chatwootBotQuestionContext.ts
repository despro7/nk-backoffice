import type { ChatwootBotQuestionContextDto } from '../../../shared/types/chatwootBotTopics.js';

/** Попереднє повідомлення старше за це — вже інша розмова за змістом, контекстом не вважаємо. */
const CONTEXT_MAX_GAP_MS = 3 * 60 * 60 * 1000;
const CONTEXT_MAX_CHARS = 200;

export type ContextSourceRow = {
  kind: string;
  conversationId: number | null;
  contentNorm: string | null;
  contentPreview: string | null;
  createdAt: Date;
  meta: unknown;
};

function isBotReply(row: ContextSourceRow): boolean {
  return row.kind === 'bot_action' && (row.meta as { kind?: unknown } | null)?.kind === 'reply';
}

function clip(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > CONTEXT_MAX_CHARS ? `${t.slice(0, CONTEXT_MAX_CHARS)}…` : t;
}

/**
 * Для кожного питання (contentNorm) — що було в розмові безпосередньо перед ним: відповідь бота,
 * оператора або попереднє повідомлення клієнта. Береться останнє входження питання.
 * Перше повідомлення розмови контексту не має. Рядки — за зростанням часу.
 */
export function buildQuestionContexts(rows: ContextSourceRow[]): Map<string, ChatwootBotQuestionContextDto> {
  const lastByConversation = new Map<number, { context: ChatwootBotQuestionContextDto; at: number }>();
  const result = new Map<string, ChatwootBotQuestionContextDto>();
  for (const row of rows) {
    if (row.conversationId == null || !row.contentPreview?.trim()) continue;
    const at = row.createdAt.getTime();
    if (row.kind === 'customer_message') {
      const prev = lastByConversation.get(row.conversationId);
      if (row.contentNorm) {
        if (prev && at - prev.at <= CONTEXT_MAX_GAP_MS) result.set(row.contentNorm, prev.context);
        else result.delete(row.contentNorm);
      }
      lastByConversation.set(row.conversationId, { context: { by: 'client', text: clip(row.contentPreview) }, at });
    } else if (isBotReply(row)) {
      lastByConversation.set(row.conversationId, { context: { by: 'bot', text: clip(row.contentPreview) }, at });
    } else if (row.kind === 'agent_message') {
      lastByConversation.set(row.conversationId, { context: { by: 'agent', text: clip(row.contentPreview) }, at });
    }
  }
  return result;
}
