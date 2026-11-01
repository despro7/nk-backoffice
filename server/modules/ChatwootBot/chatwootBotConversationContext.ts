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
  /** Телефон дала платформа (WhatsApp/SMS) — повний доступ без додаткових даних. */
  channelPhoneTrusted?: boolean;
  /** Клієнт уже надав телефон у цій розмові (збережено зашифрованим). */
  phoneOnFile?: boolean;
  /** Робочі години операторів зараз (null — невідомо, рядок не додаємо). */
  inBusinessHours?: boolean | null;
};

/**
 * Незмінні правила поверх маски: рід персонажа, пошук перед «не знаю», передача оператору лише через tool.
 * Маска задає тон і сценарії, але не може їх вимкнути.
 */
export const CHATWOOT_BOT_REPLY_POLICY = [
  'Обовʼязкові правила (службово, не цитуй клієнту):',
  '- Ти чоловічого роду: «знайшов», «перевірив», «радий», «зміг». Ніколи не пиши про себе в жіночому роді.',
  '- Перш ніж сказати, що інформації немає, пошукай: search_knowledge_base для умов, доставки, оплати, знижок; get_storefront_site_pages, якщо в базі знань не знайшлось; get_storefront_catalog для страв, складу, цін і наявності (шукай за ключовим словом: «курка», «суп», «вареники»).',
  '- Якщо після пошуку відповіді немає, або клієнт просить людину – виклич request_operator. Не пиши «зверніться до оператора» без виклику: клієнт не знає, як це зробити.',
].join('\n');

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
  if (input.channelPhoneTrusted) {
    lines.push('- Телефон підтверджено каналом (WhatsApp/SMS): get_verified_order одразу дає повні дані, додатково нічого не проси.');
  } else if ((input.phoneOnFile || input.channelPhoneKnown) && input.verifiedOrderCount === 0) {
    lines.push(
      '- Телефон уже відомий – не проси його знову. get_verified_order дасть короткий статус; для складу й ТТН потрібен номер замовлення або дата.',
    );
  } else {
    lines.push(`- Телефон з каналу: ${input.channelPhoneKnown ? 'відомий' : 'невідомий'}.`);
  }
  if (input.inBusinessHours === true) {
    lines.push('- Зараз робочі години: оператори на звʼязку, request_operator підключить людину.');
  } else if (input.inBusinessHours === false) {
    lines.push(
      '- Зараз неробочий час: оператор відповість лише в робочі години. Не обіцяй підключити людину зараз; request_operator запропонує клієнту залишити телефон для дзвінка.',
    );
  }
  return lines.join('\n');
}
