// Глобальная переменная для отслеживания времени старта приложения
const appStartTime = Date.now();

import { PrismaClient } from '@prisma/client';

// === ФУНКЦИИ ДЛЯ РАБОТЫ С ИСТОЧНИКАМИ ЗАКАЗОВ ===

/**
 * Детальное отображение источников для модального окна (По джерелах)
 */
const SOURCE_MAP_DETAILED: Record<string, string> = {
  '19': 'nk-food.shop',
  '22': 'rozetka',
  '24': 'prom.ua',
  '28': 'prom.ua',
  '31': 'інше'
};

/**
 * Укрупненные категории источников для общей таблицы
 */
const SOURCE_CATEGORY_MAP: Record<string, string> = {
  '19': 'сайт',           // nk-food.shop - собственный сайт
  '22': 'маркетплейси',   // rozetka - маркетплейс Rozetka
  '24': 'маркетплейси',   // prom.ua - маркетплейс Prom.ua
  '28': 'маркетплейси',   // prom.ua - маркетплейс Prom.ua (альтернативный код)
  '31': 'інше'            // інші джерела
};

/**
 * Получить детальный источник заказа для модального окна
 * @param sajt - код источника
 * @returns детальное название источника
 */
export function getOrderSourceDetailed(sajt: string): string {
  return sajt ? (SOURCE_MAP_DETAILED[sajt] || 'не визначено') : 'не визначено';
}

/**
 * Получить категорию источника заказа для общей таблицы
 * @param sajt - код источника
 * @returns укрупненная категория источника
 */
export function getOrderSourceCategory(sajt: string): string {
  return sajt ? SOURCE_CATEGORY_MAP[sajt] : 'інше';
}

/**
 * Универсальная функция для получения источника с выбором уровня детализации
 * @param sajt - код источника
 * @param detailed - true для детального отображения, false для категории
 * @returns источник или категория
 */
export function getOrderSourceByLevel(sajt: string, detailed: boolean = false): string {
  return detailed ? getOrderSourceDetailed(sajt) : getOrderSourceCategory(sajt);
}

// Централизованная инициализация Prisma клиента с оптимизированными настройками
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

/**
 * Форматирует время в формате HH:MM:SS
 */
export function formatTimeOnly(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('ru-RU', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Функция для логирования сервера с временными метками
 * @param message - сообщение для логирования
 * @param data - дополнительные данные (опционально)
 */
export const logServer = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const timeFromStart = (Date.now() - appStartTime) / 1000;
  console.log(`[${formatTimeOnly(timestamp)}] [${timeFromStart.toFixed(2)}s] ${message}`, data || '');
};

/**
 * Отримує час початку звітного дня з налаштувань
 * @returns час початку звітного дня (0-23), за замовчуванням 0 (полунічь)
 */
export async function getReportingDayStartHour(): Promise<number> {
  try {
    const setting = await prisma.settingsBase.findUnique({
      where: { key: 'reporting_day_start_hour' }
    });
    return setting ? parseInt(setting.value) || 0 : 0;
  } catch (error) {
    console.error('Error getting reporting day start hour:', error);
    return 0; // Fallback to midnight
  }
}

/**
 * Розраховує звітну дату для замовлення з урахуванням години початку звітного дня
 * 
 * Приклад: якщо dayStartHour = 16:
 * - Замовлення о 16.10 15:59 → звіт за 16.10
 * - Замовлення о 16.10 16:00 → звіт за 17.10
 * - Замовлення о 17.10 15:59 → звіт за 17.10
 * - Замовлення о 17.10 16:00 → звіт за 18.10
 * 
 * @param orderDate - дата замовлення
 * @param dayStartHour - година початку звітного дня (0-23)
 * @returns дата звітного дня у форматі YYYY-MM-DD
 */
export function getReportingDate(orderDate: Date, dayStartHour: number = 0): string {
  const date = new Date(orderDate);
  const hour = date.getHours();
  
  // Якщо час замовлення >= dayStartHour, то це належить до наступного звітного дня
  if (hour >= dayStartHour) {
    date.setDate(date.getDate() + 1);
  }
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Розраховує діапазон дат для фільтру звітів з урахуванням години початку звітного дня
 * 
 * Для звітної дати 17.10 з dayStartHour = 16:
 * - start: 16.10 16:00:00 (попередній день о 16:00!)
 * - end: 17.10 15:59:59 (сьогодня о 15:59:59)
 * 
 * @param reportingDate - звітна дата у форматі YYYY-MM-DD
 * @param dayStartHour - година початку звітного дня (0-23)
 * @returns об'єкт з началом та кінцем діапазону дат
 */
export function getReportingDateRange(reportingDate: string, dayStartHour: number = 0): { start: Date; end: Date } {
  const [year, month, day] = reportingDate.split('-').map(Number);
  
  // Початок звітного дня - це dayStartHour ПОПЕРЕДНЬОЇ дати (тобто 16.10 16:00)
  const startDate = new Date(year, month - 1, day - 1, dayStartHour, 0, 0, 0);
  
  // Кінець звітного дня - це dayStartHour поточної дати мінус 1 секунда
  // (тобто 17.10 15:59:59 для dayStartHour=16)
  const endDate = new Date(year, month - 1, day, dayStartHour, 0, 0, 0);
  endDate.setSeconds(endDate.getSeconds() - 1);
  
  return { start: startDate, end: endDate };
}

