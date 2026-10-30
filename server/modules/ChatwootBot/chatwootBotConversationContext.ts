import type { LlmMessage } from '../../../shared/types/llm.js';
import { CHATWOOT_WEBHOOK_PROBE_CONTENT_MARKER } from '../../../shared/types/chatwootBot.js';

/** Скільки попередніх повідомлень розмови передаємо в LLM. */
export const CHATWOOT_BOT_HISTORY_LIMIT = 20;
const HISTORY_MESSAGE_MAX_CHARS = 1500;

export type ChatwootHistorySourceMessage = {
  id: number;
  message_type?: string | number;
  private?: boolean;
  content?: string | null;
};

function historyRole(messageType: string | number | undefined): 'user' | 'assistant' | null {
  if (messageType === 0 || messageType === 'incoming') return 'user';
  if (messageType === 1 || messageType === 'outgoing') return 'assistant';
  // activity (2) / template (3) — службові, у діалог не потрапляють
  return null;
}

/**
 * Історія розмови Chatwoot → LLM messages (до поточного повідомлення, без нього).
 * Вхідні — `user`, публічні вихідні (бот і оператори) — `assistant`, приватні нотатки пропускаємо.
 * Сусідні репліки однієї ролі зливаємо, історію починаємо з `user` (вимога частини провайдерів).
 */
export function buildLlmHistory(
  messages: ChatwootHistorySourceMessage[],
  currentMessageId: number | null,
  limit: number = CHATWOOT_BOT_HISTORY_LIMIT,
): LlmMessage[] {
  const relevant = messages
    .filter((m) => currentMessageId == null || m.id < currentMessageId)
    .filter((m) => !m.private)
    .map((m) => ({ id: m.id, role: historyRole(m.message_type), content: (m.content ?? '').trim() }))
    .filter(
      (m): m is { id: number; role: 'user' | 'assistant'; content: string } =>
        m.role !== null && m.content.length > 0 && !m.content.includes(CHATWOOT_WEBHOOK_PROBE_CONTENT_MARKER),
    )
    .sort((a, b) => a.id - b.id)
    .slice(-limit);

  const merged: LlmMessage[] = [];
  for (const m of relevant) {
    const content =
      m.content.length > HISTORY_MESSAGE_MAX_CHARS ? `${m.content.slice(0, HISTORY_MESSAGE_MAX_CHARS)}…` : m.content;
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content}\n${content}`;
    } else {
      merged.push({ role: m.role, content });
    }
  }
  while (merged.length > 0 && merged[0].role !== 'user') merged.shift();
  return merged;
}

export type ConversationContextInput = {
  now: Date;
  verifiedOrderCount: number;
  verifyExpiresAt: string | null;
  /** Телефон відомий з каналу (Viber/Telegram/WhatsApp або профіль контакту). */
  channelPhoneKnown: boolean;
  /** Клієнт уже надав телефон у цій розмові (збережено зашифрованим). */
  phoneOnFile?: boolean;
};

function kyivParts(date: Date): { weekday: string; date: string; time: string } {
  const tz = 'Europe/Kyiv';
  return {
    weekday: new Intl.DateTimeFormat('uk-UA', { timeZone: tz, weekday: 'long' }).format(date),
    date: new Intl.DateTimeFormat('uk-UA', {
      timeZone: tz,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date),
    time: new Intl.DateTimeFormat('uk-UA', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(date),
  };
}

/** Динамічний блок для system prompt: дата за Києвом і стан верифікації (без PII). */
export function buildConversationContextNote(input: ConversationContextInput): string {
  const now = kyivParts(input.now);
  const lines = [
    'Контекст розмови (службово, не цитуй клієнту):',
    `- Зараз у Києві: ${now.weekday}, ${now.date}, ${now.time}. Відносні дати («вчора», «у понеділок») рахуй від цієї дати.`,
  ];
  if (input.verifiedOrderCount > 0) {
    const until = input.verifyExpiresAt ? kyivParts(new Date(input.verifyExpiresAt)) : null;
    lines.push(
      `- Верифікація: пройдена (замовлень: ${input.verifiedOrderCount})${until ? `, діє до ${until.date} ${until.time}` : ''}. Не проси дані повторно – викликай get_verified_order.`,
    );
  } else {
    lines.push('- Верифікація: не пройдена.');
  }
  if (input.phoneOnFile && input.verifiedOrderCount === 0) {
    lines.push('- Телефон клієнт уже надав у цій розмові – не проси його знову; для перевірки бракує номера замовлення або дати.');
  } else {
    lines.push(`- Телефон з каналу: ${input.channelPhoneKnown ? 'відомий' : 'невідомий'}.`);
  }
  return lines.join('\n');
}
