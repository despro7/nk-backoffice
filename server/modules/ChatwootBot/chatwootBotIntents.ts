import type { ChatwootBotIntentKind, ChatwootBotIntentPart } from '../../../shared/types/chatwootBotTopics.js';

/**
 * Розбір повідомлень клієнтів LLM: кожне повідомлення → частини з типом.
 * Чисті функції (промпт і парсинг відповіді); виклик моделі й БД — у ChatwootBotIntentService.
 */

const KINDS: readonly ChatwootBotIntentKind[] = ['question', 'action', 'answer', 'noise'];
const PART_TEXT_MAX = 300;

export const INTENT_SYSTEM_PROMPT = [
  'Ти розбираєш повідомлення клієнтів інтернет-магазину готової їжі «Нова Кухня» для статистики.',
  'Для кожного повідомлення поверни частини (parts), кожна з типом kind:',
  '- question — питання до магазину. Переформулюй коротко, без привітань, імен і телефонів, мовою оригіналу («Чи можна дізнатися ціни на продукцію?»).',
  '- action — прохання щось зробити: скасувати чи змінити замовлення, надіслати прайс, передзвонити, повернути гроші тощо. Коротко у формі дії: «Скасувати замовлення», «Надіслати прайс».',
  '- answer — відповідь клієнта на питання бота або ствердження: «Замовлю пізніше», «Передумала», номер замовлення, прізвище й імʼя, телефон, адреса, дата.',
  '- noise — привітання, подяка, емодзі, нерозбірливе.',
  'Враховуй context — попереднє повідомлення в розмові: коротке уточнення («А орієнтовно?») — це question, переформульований з урахуванням контексту («Орієнтовні терміни доставки?»).',
  'Одне повідомлення може мати кілька частин: «Можна ціни? Надішліть прайс» → question + action.',
  'Відповідай лише JSON без пояснень: {"items":[{"id":1,"parts":[{"kind":"question","text":"..."}]}]}.',
].join('\n');

export type IntentInput = { id: number; text: string; context?: string | null };

export function buildIntentUserMessage(items: IntentInput[]): string {
  return JSON.stringify({
    items: items.map(({ id, text, context }) => (context ? { id, text, context } : { id, text })),
  });
}

/** Вміст першого JSON-обʼєкта у відповіді (модель інколи загортає в ```json). */
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeParts(raw: unknown): ChatwootBotIntentPart[] {
  if (!Array.isArray(raw)) return [];
  const parts: ChatwootBotIntentPart[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const kind = String((item as { kind?: unknown }).kind ?? '').trim() as ChatwootBotIntentKind;
    if (!KINDS.includes(kind)) continue;
    const text = String((item as { text?: unknown }).text ?? '').replace(/\s+/g, ' ').trim().slice(0, PART_TEXT_MAX);
    if (!text && kind !== 'noise') continue;
    parts.push({ kind, text });
  }
  return parts;
}

/** id → частини; повідомлення, яких немає у відповіді або без жодної частини, пропускаються. */
export function parseIntentResponse(text: string): Map<number, ChatwootBotIntentPart[]> {
  const result = new Map<number, ChatwootBotIntentPart[]>();
  const json = extractJson(text) as { items?: unknown } | null;
  if (!json || !Array.isArray(json.items)) return result;
  for (const item of json.items) {
    if (!item || typeof item !== 'object') continue;
    const id = Number((item as { id?: unknown }).id);
    if (!Number.isInteger(id)) continue;
    const parts = normalizeParts((item as { parts?: unknown }).parts);
    if (parts.length > 0) result.set(id, parts);
  }
  return result;
}

/** Частини JSON з БД → типізовані (некоректні відкидаються). */
export function readIntentParts(raw: unknown): ChatwootBotIntentPart[] {
  return normalizeParts(raw);
}

/** Текст питань повідомлення для тем; null — питань немає (дія, відповідь, шум). */
export function intentQuestionText(parts: ChatwootBotIntentPart[]): string | null {
  const questions = parts.filter((p) => p.kind === 'question').map((p) => p.text);
  return questions.length > 0 ? questions.join(' ') : null;
}
