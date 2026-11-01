import type { ChatwootBotSettings } from '../../../shared/types/chatwootBot.js';
import { ORDER_CANCEL_EXCLUDED_STATUSES } from '../../../shared/constants/chatwootBotOrderCancel.js';

export type OrderCancelMode = 'auto' | 'semi' | 'operator';

function nameTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[ʼ'’`]/g, '')
    .replace(/ё/g, 'е')
    .split(/[^\p{L}]+/u)
    .filter((t) => t.length >= 2);
}

/**
 * Сувора перевірка ПІБ / ПІ: клієнт назвав щонайменше два слова, і кожне є в імені замовлення
 * (порядок і регістр неважливі). Одне імʼя без прізвища не проходить.
 */
export function cancelNameMatches(input: string, customerName: string | null | undefined): boolean {
  const given = [...new Set(nameTokens(input))];
  if (given.length < 2 || !customerName) return false;
  const stored = new Set(nameTokens(customerName));
  return given.every((t) => stored.has(t));
}

export function hasFullName(input: string | null | undefined): boolean {
  return new Set(nameTokens(input ?? '')).size >= 2;
}

/** Завершені (Продаж, Відмова, Повернення) і видалені замовлення бот не пропонує скасувати. */
export function isCancelCandidateStatus(status: string): boolean {
  return !ORDER_CANCEL_EXCLUDED_STATUSES.includes(status);
}

export function orderCancelMode(
  settings: Pick<ChatwootBotSettings, 'orderCancelAutoStatuses' | 'orderCancelSemiAutoStatuses'>,
  status: string,
): OrderCancelMode {
  if (settings.orderCancelAutoStatuses.includes(status)) return 'auto';
  if (settings.orderCancelSemiAutoStatuses.includes(status)) return 'semi';
  return 'operator';
}

/** «SD24155», «№ 24155», «24155» — однаково. */
export function orderTokenMatches(token: string, ...values: Array<string | null | undefined>): boolean {
  const digits = token.replace(/\D/g, '');
  if (!digits) return false;
  return values.some((v) => (v ?? '').replace(/\D/g, '') === digits);
}
