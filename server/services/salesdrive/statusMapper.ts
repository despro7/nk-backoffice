/**
 * SalesDrive Status Mapping Utilities
 * Централізований маппінг статусів між SalesDrive API та внутрішньою системою
 */

/**
 * Маппінг статусів з SalesDrive в нашу систему
 * 
 * SalesDrive statusId -> Internal status string
 */
export const STATUS_MAPPING: { [key: number]: string } = {
  1: '1', // Новий
  2: '2', // Підтверджено
  3: '3', // На відправку
  4: '4', // Відправлено
  5: '5', // Продаж
  6: '6', // Відмова
  7: '7', // Повернення
  8: '8', // Видалений
  9: '9'  // На утриманні
};

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
 * Отримує внутрішній статус по ID з SalesDrive
 * 
 * @param salesDriveStatusId ID статусу з SalesDrive API
 * @param defaultStatus Статус за замовчуванням (якщо маппінг не знайдений)
 * @returns Внутрішній статус (string)
 */
export function mapSalesDriveStatus(salesDriveStatusId: number, defaultStatus: string = '1'): string {
  return STATUS_MAPPING[salesDriveStatusId] || defaultStatus;
}

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
