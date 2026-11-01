/** Скасування замовлення через чат-бот: статуси SalesDrive і дефолти налаштувань. */

export const ORDER_CANCEL_TARGET_STATUS = '6';
export const ORDER_CANCEL_TARGET_STATUS_TEXT = 'Відмова';

/** Статуси SalesDrive, які бот бере до уваги (id → назва). */
export const ORDER_CANCEL_STATUS_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: '1', label: 'Новий' },
  { id: '2', label: 'Підтверджено' },
  { id: '3', label: 'На відправку' },
  { id: '4', label: 'Відправлено' },
  { id: '9', label: 'На утриманні' },
];

/**
 * Продаж, Відмова, Повернення — завершені, скасовувати нічого; Видалений — не замовлення клієнта.
 * Такі замовлення бот навіть не пропонує клієнту на вибір.
 */
export const ORDER_CANCEL_EXCLUDED_STATUSES: readonly string[] = ['5', '6', '7', '8'];

export const DEFAULT_ORDER_CANCEL_AUTO_STATUSES: readonly string[] = ['1', '2'];
export const DEFAULT_ORDER_CANCEL_SEMI_AUTO_STATUSES: readonly string[] = ['3', '4', '9'];

/** Лише відомі статуси, без завершених; автоматичне має пріоритет над напівавтоматичним. */
export function normalizeOrderCancelStatuses(
  raw: unknown,
  fallback: readonly string[],
  exclude: readonly string[] = [],
): string[] {
  const allowed = new Set(ORDER_CANCEL_STATUS_OPTIONS.map((o) => o.id));
  const list = Array.isArray(raw) ? raw : fallback;
  return [
    ...new Set(list.map((v) => String(v).trim()).filter((v) => allowed.has(v) && !exclude.includes(v))),
  ];
}
