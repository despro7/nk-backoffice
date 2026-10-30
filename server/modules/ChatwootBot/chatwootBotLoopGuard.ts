import type { LlmMessage } from '../../../shared/types/llm.js';

/** Після скількох невдалих спроб верифікації передаємо розмову оператору. */
export const CHATWOOT_BOT_ESCALATE_AFTER_FAILED_VERIFY = 3;

/** Мінімум слів, щоб порівнювати відповіді за схожістю (короткі «Дякую!» не чіпаємо). */
const REPEAT_MIN_WORDS = 6;
const REPEAT_SIMILARITY = 0.8;

export type ChatwootBotEscalationReason = 'verify_failed' | 'verify_rate_limited' | 'repeat_reply';

function normalizeReply(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Чи бот збирається по суті повторити свою попередню відповідь. */
export function isRepeatedReply(reply: string, previous: string | null | undefined): boolean {
  if (!previous) return false;
  const a = normalizeReply(reply);
  const b = normalizeReply(previous);
  if (!a || !b) return false;
  if (a === b) return true;
  const wordsA = new Set(a.split(' '));
  const wordsB = new Set(b.split(' '));
  if (wordsA.size < REPEAT_MIN_WORDS || wordsB.size < REPEAT_MIN_WORDS) return false;
  let shared = 0;
  for (const w of wordsA) if (wordsB.has(w)) shared += 1;
  return shared / (wordsA.size + wordsB.size - shared) >= REPEAT_SIMILARITY;
}

export function lastAssistantMessage(history: LlmMessage[]): string | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].role === 'assistant') return history[i].content;
  }
  return null;
}

/** Невдала спроба в цьому повідомленні довела лічильник до порогу. */
export function shouldEscalateAfterFailedVerify(
  failedAttempts: number,
  failedInThisMessage: boolean,
  threshold: number = CHATWOOT_BOT_ESCALATE_AFTER_FAILED_VERIFY,
): boolean {
  return failedInThisMessage && failedAttempts >= threshold;
}
