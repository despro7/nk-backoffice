/**
 * SalesDrive Status Mapping Utilities
 * Централізований маппінг статусів між SalesDrive API та внутрішньою системою
 */


/**
 * Маппінг внутрішніх статусів на їх текстові назви
 */
export const STATUS_TEXT_MAPPING: { [key: string]: string } = {
  '1': 'Новий',
  '2': 'Підтверджено',
  '3': 'На відправку',
  '4': 'Відправлено',
  '5': 'Продаж',
  '6': 'Відмова',
  '7': 'Повернення',
  '8': 'Видалений',
  '9': 'На утриманні'
};

/**
 * Отримує текстове представлення статусу
 * 
 * @param status Внутрішній статус (string)
 * @returns Текстова назва статусу (українською)
 */
export function getStatusText(status: string): string {
  return STATUS_TEXT_MAPPING[status] || 'Невідомий статус';
}

/**
 * Перевіряє, чи є статус "видаленим" (8)
 * 
 * @param status Внутрішній статус (string)
 * @returns true якщо статус = "8" (Видалений)
 */
export function isDeletedStatus(status: string): boolean {
  return status === '8';
}

/**
 * Перевіряє, чи є статус завершеним (Продаж, Відмова, Повернення, Видалений)
 * 
 * @param status Внутрішній статус (string)
 * @returns true якщо статус завершений
 */
export function isCompletedStatus(status: string): boolean {
  return ['5', '6', '7', '8'].includes(status);
}

/**
 * Перевіряє, чи є статус активним (в процесі обробки)
 * 
 * @param status Внутрішній статус (string)
 * @returns true якщо статус активний
 */
export function isActiveStatus(status: string): boolean {
  return ['1', '2', '3', '4', '9'].includes(status);
}

export type StatusSyncGuardInput = {
  /** Поточний локальний статус замовлення. */
  localStatus: string | number | null | undefined;
  /** Статус, який приніс webhook / sync із SalesDrive. */
  incomingStatus: string | number | null | undefined;
  /** `updateAt` замовлення в SalesDrive (момент зміни на їхньому боці). */
  incomingUpdatedAt?: Date | null;
  /** Коли локальний статус востаннє став "3" (комплектація). */
  localPickedAt?: Date | null;
};

const PRE_PICKING_STATUSES = new Set(['1', '2']);

function normalizeStatus(value: string | number | null | undefined): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

/**
 * Чи може incoming бути відкатом локальної комплектації (локально 3, з SD приходить 1/2).
 * Дешева перевірка без БД: решта переходів (4–9, повторні цикли) завжди приймаються з SD.
 */
export function isPotentialStatusRollback(
  localStatus: string | number | null | undefined,
  incomingStatus: string | number | null | undefined,
): boolean {
  return (
    normalizeStatus(localStatus) === '3' &&
    PRE_PICKING_STATUSES.has(normalizeStatus(incomingStatus))
  );
}

/**
 * Не відкатуємо локальну комплектацію (3) застарілим статусом із SalesDrive (1/2).
 *
 * Блокуємо лише якщо зміна в SD не новіша за локальну комплектацію:
 * stale webhook / sync, що "не знає" про комплектацію. Якщо менеджер у SD
 * навмисно повернув замовлення після комплектації (updateAt новіший), приймаємо.
 * Без однієї з дат блокуємо (безпечніше).
 *
 * Не залежить від readyToShipAt: він ставиться лише при першій комплектації
 * і лишається після повторних циклів (відмова, повернення, утримання).
 */
export function shouldSkipStatusSyncRollback(input: StatusSyncGuardInput): boolean {
  if (!isPotentialStatusRollback(input.localStatus, input.incomingStatus)) {
    return false;
  }
  if (!input.incomingUpdatedAt || !input.localPickedAt) {
    return true;
  }
  return input.incomingUpdatedAt.getTime() <= input.localPickedAt.getTime();
}
