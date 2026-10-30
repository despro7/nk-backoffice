import { UA_PHONE_REGEX } from './ChatwootBotHandoverUtils.js';

const UA_MONTHS: Record<string, number> = {
  січня: 1,
  лютого: 2,
  березня: 3,
  квітня: 4,
  травня: 5,
  червня: 6,
  липня: 7,
  серпня: 8,
  вересня: 9,
  жовтня: 10,
  листопада: 11,
  грудня: 12,
};

/** Calendar day in Europe/Kyiv as YYYY-MM-DD. */
export function kyivCalendarDay(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

/** Максимальна ширина інтервалу дат для верифікації (ширший легко вгадати, знаючи лише телефон). */
export const CHATWOOT_BOT_VERIFY_MAX_RANGE_DAYS = 3;

const ISO_DAY_REGEX = /^(20\d{2})-(\d{2})-(\d{2})$/;

function isoDayToUtcMs(day: string): number | null {
  const m = day.trim().match(ISO_DAY_REGEX);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(ms);
  // Відсікаємо 2026-02-30 тощо.
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? ms : null;
}

export type VerifyDateRange =
  | { ok: true; from: string; to: string }
  | { ok: false; reason: 'invalid' | 'too_wide' };

/**
 * Інтервал календарних днів (YYYY-MM-DD, Київ) від LLM: `to` за замовчуванням = `from`,
 * перевернутий інтервал виправляємо, майбутні дні й ширші за ліміт — відхиляємо.
 */
export function normalizeVerifyDateRange(
  dateFrom: string | undefined,
  dateTo: string | undefined,
  today: string,
  maxDays: number = CHATWOOT_BOT_VERIFY_MAX_RANGE_DAYS,
): VerifyDateRange {
  const fromRaw = dateFrom?.trim() || dateTo?.trim();
  const toRaw = dateTo?.trim() || fromRaw;
  if (!fromRaw || !toRaw) return { ok: false, reason: 'invalid' };
  let fromMs = isoDayToUtcMs(fromRaw);
  let toMs = isoDayToUtcMs(toRaw);
  const todayMs = isoDayToUtcMs(today);
  if (fromMs == null || toMs == null || todayMs == null) return { ok: false, reason: 'invalid' };
  if (fromMs > toMs) [fromMs, toMs] = [toMs, fromMs];
  if (fromMs > todayMs) return { ok: false, reason: 'invalid' };
  if ((toMs - fromMs) / 86_400_000 + 1 > maxDays) return { ok: false, reason: 'too_wide' };
  const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
  return { ok: true, from: iso(fromMs), to: iso(Math.min(toMs, todayMs)) };
}

/** Чи потрапляє календарний день (YYYY-MM-DD) в інтервал включно. */
export function isDayInRange(day: string, from: string, to: string): boolean {
  return day >= from && day <= to;
}

export function parseUserOrderDate(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const dotted = trimmed.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/);
  if (dotted) {
    const dd = dotted[1].padStart(2, '0');
    const mm = dotted[2].padStart(2, '0');
    return `${dotted[3]}-${mm}-${dd}`;
  }

  const uaText = trimmed.toLowerCase().match(/\b(\d{1,2})\s+([а-яіїєґ]+)\s+(20\d{2})\b/u);
  if (uaText) {
    const month = UA_MONTHS[uaText[2]];
    if (month) {
      const dd = uaText[1].padStart(2, '0');
      const mm = String(month).padStart(2, '0');
      return `${uaText[3]}-${mm}-${dd}`;
    }
  }

  return null;
}

// JS `\b` не бачить кирилицю як word-символ, тому межі задаємо через Unicode lookaround.
const ORDER_KEYWORD_REGEX =
  /(?<![\p{L}\p{N}])(?:замовленн[яіює]|order|№|#)\s*(?:номер\s*)?[:#№]?\s*([A-Za-z0-9\-_/]*\d[A-Za-z0-9\-_/]*)(?![\p{L}\p{N}])/iu;
// SalesDrive externalId має формат `SD{id}` (id від 4 цифр); клієнт може написати `sd 9547`, `SD-9547` або кирилицею `СД`.
const SD_ORDER_NUMBER_REGEX = /(?<![\p{L}\p{N}])(?:SD|СД)\s*[-#№]?\s*(\d{3,})(?![\p{L}\p{N}])/iu;
// Номер замовлення — 5–8 цифр; довші послідовності вважаємо телефоном.
const BARE_ORDER_NUMBER_REGEX = /(?<![\p{L}\p{N}])(\d{5,8})(?![\p{L}\p{N}])/u;
const DATE_LIKE_REGEX = /20\d{2}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}(?:\.\d{2,4})?/g;

/** Прибирає телефони й дати, щоб їхні цифри не сприймались як номер замовлення. */
function stripPhonesAndDates(content: string): string {
  return content.replace(UA_PHONE_REGEX, ' ').replace(DATE_LIKE_REGEX, ' ');
}

export function extractOrderNumberToken(content: string): string | null {
  const cleaned = stripPhonesAndDates(content);
  const sd = cleaned.match(SD_ORDER_NUMBER_REGEX);
  if (sd) return `SD${sd[1]}`;
  const match = cleaned.match(ORDER_KEYWORD_REGEX);
  if (match && match[1].length >= 4) return match[1].trim();
  const bare = cleaned.match(BARE_ORDER_NUMBER_REGEX);
  return bare ? bare[1] : null;
}

/** Чи містить повідомлення дані для верифікації (номер замовлення або дату). */
export function hasVerifyCredentialToken(content: string): boolean {
  return extractOrderNumberToken(content) !== null || parseUserOrderDate(content) !== null;
}
