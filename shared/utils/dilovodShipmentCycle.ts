import { parseKyivDateTime } from './kyivDateTime.js';

/**
 * Цикли відвантаження замовлення в Dilovod (чисті правила, спільні для server і client).
 *
 * Одне замовлення (saleOrder) може мати кілька циклів: відвантаження (sale) →
 * повернення (saleReturn) → повторне відвантаження (sale) → ...
 * Легітимний стан: кількість sale = кількість saleReturn або на 1 більше.
 */

export type ShipmentCycleDecision =
  /** Відвантаження ще не було: звичайний перший export. */
  | 'first'
  /** Відвантаження є, повернення після нього немає: нічого не робимо. */
  | 'already_shipped'
  /** Після відвантаження було повернення: можливо, потрібне повторне відвантаження (перевірка в Dilovod). */
  | 'repeat_candidate';

export function resolveShipmentCycle(state: {
  saleExportDate: Date | string | null | undefined;
  returnDate: Date | string | null | undefined;
}): ShipmentCycleDecision {
  if (!state.saleExportDate) return 'first';
  if (!state.returnDate) return 'already_shipped';
  // Дати лише відсіюють кандидатів; рішення приймається за кількістю документів у Dilovod.
  return 'repeat_candidate';
}

/** Чи всі попередні відвантаження повернуті (тобто потрібен новий sale). */
export function needsNewSaleDoc(saleCount: number, returnCount: number): boolean {
  return saleCount <= returnCount;
}

/** Справжній дублікат: відвантажень більше, ніж повернень + 1. */
export function isSaleDuplicate(
  saleCount: number | null | undefined,
  returnCount: number | null | undefined,
): boolean {
  return (saleCount ?? 0) > (returnCount ?? 0) + 1;
}

/** Найпізніша дата серед документів Dilovod (поле `date`, Europe/Kyiv). */
export function latestDocDate(docs: Array<{ date?: unknown }>): Date | null {
  let latest: Date | null = null;
  for (const doc of docs) {
    const date = parseKyivDateTime(doc?.date);
    if (date && (!latest || date.getTime() > latest.getTime())) latest = date;
  }
  return latest;
}

/** Дублікат повернення: повернень більше, ніж відвантажень. */
export function isReturnDuplicate(
  returnCount: number | null | undefined,
  saleCount: number | null | undefined,
): boolean {
  return (returnCount ?? 0) > Math.max(saleCount ?? 0, 1);
}

/** Повторне відвантаження вже зроблено: останнє відвантаження пізніше за повернення. */
export function isReshippedAfterReturn(
  saleExportDate: Date | string | null | undefined,
  returnDate: Date | string | null | undefined,
): boolean {
  if (!saleExportDate || !returnDate) return false;
  return new Date(saleExportDate).getTime() > new Date(returnDate).getTime();
}

/**
 * Допуск: відвантаження раніше за першу комплектацію більше ніж на 3 год – «без комплектації».
 * Покриває годинний зсув TZ у старих датах документів Dilovod (і мілісекунди).
 */
export const SHIPPED_BEFORE_PICKING_TOLERANCE_MS = 3 * 60 * 60 * 1000;

/**
 * З цієї дати `orders_history` надійно фіксує перехід у статус 3 (історія ведеться з 08.08.2026,
 * 10–12.08 – масова синхронізація старих замовлень). Раніші відвантаження не перевіряються.
 */
export const SHIPPED_WITHOUT_PICKING_SINCE = '2026-08-13T00:00:00.000Z';

/** meta_logs.title позначки «дату відвантаження перевірено» (виключає замовлення зі списку). */
export const SHIPMENT_DATE_CONFIRMED_LOG_TITLE = 'Shipment date confirmed';

/**
 * Відвантаження в Dilovod без комплектації: статус перескочив на «Відправлено» (2 → 4)
 * без «На відправку», або документ датовано раніше за першу комплектацію.
 * firstPickedAt – перший перехід у статус 3 (`orders_history`).
 */
export function isShippedWithoutPicking(
  saleExportDate: Date | string | null | undefined,
  firstPickedAt: Date | string | null | undefined,
): boolean {
  if (!saleExportDate) return false;
  if (new Date(saleExportDate).getTime() < new Date(SHIPPED_WITHOUT_PICKING_SINCE).getTime()) return false;
  if (!firstPickedAt) return true;
  return new Date(saleExportDate).getTime() < new Date(firstPickedAt).getTime() - SHIPPED_BEFORE_PICKING_TOLERANCE_MS;
}

/** Рахунок обліку монолітного набору в рядку відвантаження (`accGood`). */
export const SHIPMENT_MONOLITHIC_ACC_GOOD = '1119000000001079';

/**
 * Останнє відвантаження вже повернуте: нове повернення недоступне, доки не буде
 * повторного відвантаження. Лічильники документів мають пріоритет, дати – fallback.
 */
export function isLastShipmentReturned(state: {
  saleDocsCount?: number | null;
  saleExportDate?: Date | string | null;
  returnDocsCount?: number | null;
  returnDate?: Date | string | null;
}): boolean {
  const returns = state.returnDocsCount ?? (state.returnDate ? 1 : 0);
  if (returns <= 0 && !state.returnDate) return false;
  const sales = state.saleDocsCount ?? (state.saleExportDate ? 1 : 0);
  if (sales > returns) return false;
  return !isReshippedAfterReturn(state.saleExportDate, state.returnDate);
}

/**
 * Мінімальний проміжок між першою і повторною комплектацією.
 * Відсікає відлуння статусу 3 від SalesDrive і зсуви часових поясів у датах.
 */
export const REPEAT_PICKING_MIN_GAP_MS = 6 * 60 * 60 * 1000;

/**
 * Чи була повторна комплектація після першого відвантаження.
 * firstShipmentAt: перша комплектація (readyToShipAt) або дата відвантаження.
 */
export function isRepeatPicking(
  lastPickedAt: Date | string | null | undefined,
  firstShipmentAt: Date | string | null | undefined,
): boolean {
  if (!lastPickedAt || !firstShipmentAt) return false;
  return new Date(lastPickedAt).getTime() - new Date(firstShipmentAt).getTime() > REPEAT_PICKING_MIN_GAP_MS;
}
