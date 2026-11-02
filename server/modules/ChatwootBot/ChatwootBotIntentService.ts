import { logServer, prisma } from '../../lib/utils.js';
import type { ChatwootBotIntentPart } from '../../../shared/types/chatwootBotTopics.js';
import { llmService } from '../../services/llm/LlmService.js';
import { buildQuestionContexts } from './chatwootBotQuestionContext.js';
import {
  INTENT_SYSTEM_PROMPT,
  buildIntentUserMessage,
  parseIntentResponse,
  readIntentParts,
  type IntentInput,
} from './chatwootBotIntents.js';

/** Скільки повідомлень за один виклик моделі і скільки — за одну синхронізацію тем. */
const BATCH_SIZE = 20;
const MAX_PER_SYNC = 60;
/** Звідки брати контекст (попереднє повідомлення) для нових повідомлень. */
const CONTEXT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

export type PendingIntentMessage = { hash: string; contentNorm: string; text: string };

/**
 * Розбір повідомлень клієнтів на питання / дії / відповіді / шум (LLM платформи, один раз на унікальний текст).
 * Без таблиці `chatwoot_bot_message_intents` (міграцію ще не застосовано) — тихо вимикається до рестарту.
 */
export class ChatwootBotIntentService {
  private unavailable = false;

  /** hash → частини для вже розібраних повідомлень. */
  async loadIntents(hashes: string[]): Promise<Map<string, ChatwootBotIntentPart[]>> {
    const result = new Map<string, ChatwootBotIntentPart[]>();
    if (this.unavailable || hashes.length === 0) return result;
    try {
      const rows = await prisma.chatwootBotMessageIntent.findMany({
        where: { questionHash: { in: hashes } },
        select: { questionHash: true, parts: true },
      });
      for (const row of rows) result.set(row.questionHash, readIntentParts(row.parts));
    } catch (err) {
      this.markUnavailable(err);
    }
    return result;
  }

  /** Розібрати ще не розібрані повідомлення (до MAX_PER_SYNC за раз). Повертає скільки розібрано. */
  async classifyPending(messages: PendingIntentMessage[]): Promise<number> {
    if (this.unavailable || messages.length === 0) return 0;
    let known: Set<string>;
    try {
      const rows = await prisma.chatwootBotMessageIntent.findMany({
        where: { questionHash: { in: messages.map((m) => m.hash) } },
        select: { questionHash: true },
      });
      known = new Set(rows.map((r) => r.questionHash));
    } catch (err) {
      this.markUnavailable(err);
      return 0;
    }
    const pending = messages.filter((m) => !known.has(m.hash)).slice(0, MAX_PER_SYNC);
    if (pending.length === 0) return 0;

    const contexts = await this.contextsFor(pending.map((m) => m.contentNorm));
    let saved = 0;
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      const inputs: IntentInput[] = batch.map((m, index) => ({
        id: index + 1,
        text: m.text,
        context: contexts.get(m.contentNorm)?.text ?? null,
      }));
      try {
        const result = await llmService.complete({
          feature: 'topics_intents',
          system: INTENT_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildIntentUserMessage(inputs) }],
          maxOutputTokens: 2000,
        });
        const parsed = parseIntentResponse(result.text);
        const rows = batch.flatMap((m, index) => {
          const parts = parsed.get(index + 1);
          return parts
            ? [{ questionHash: m.hash, contentNorm: m.contentNorm, parts, model: result.model.slice(0, 191) }]
            : [];
        });
        if (rows.length > 0) {
          await prisma.chatwootBotMessageIntent.createMany({ data: rows, skipDuplicates: true });
          saved += rows.length;
        }
      } catch (err) {
        logServer('[ChatwootBotIntents] batch failed (non-fatal)', err);
        break;
      }
    }
    if (saved > 0) logServer(`[ChatwootBotIntents] classified ${saved} messages`);
    return saved;
  }

  private async contextsFor(norms: string[]) {
    const rows = await prisma.chatwootBotAnalyticsEvent.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - CONTEXT_LOOKBACK_MS) },
        OR: [{ kind: { in: ['customer_message', 'agent_message'] } }, { kind: 'bot_action' }],
      },
      orderBy: { createdAt: 'asc' },
      select: { kind: true, conversationId: true, contentNorm: true, contentPreview: true, createdAt: true, meta: true },
    });
    const wanted = new Set(norms);
    const all = buildQuestionContexts(rows);
    return new Map([...all].filter(([norm]) => wanted.has(norm)));
  }

  private markUnavailable(err: unknown): void {
    if (this.unavailable) return;
    this.unavailable = true;
    logServer('[ChatwootBotIntents] intents table unavailable — розбір вимкнено до рестарту (міграцію застосовано?)', err);
  }
}

export const chatwootBotIntentService = new ChatwootBotIntentService();
