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
