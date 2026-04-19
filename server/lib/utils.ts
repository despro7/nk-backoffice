import { PrismaClient } from '@prisma/client';
import { UserType } from '../types/auth.js';

// Глобальна змінна для відстеження часу старту додатка
const appStartTime = Date.now();

// === ФУНКЦІЇ ДЛЯ РОБОТИ З ДЖЕРЕЛАМИ ЗАМОВЛЕНЬ ===

/**
 * Детальне відображення джерел для модального вікна (за джерелами)
 */
const SOURCE_MAP_DETAILED: Record<string, string> = Object.fromEntries([
  ['19', 'nk-food.shop'],
  ...['22', '39'].map(k => [k, 'rozetka']),
  ...['24', '28'].map(k => [k, 'prom.ua']),
  ['31', 'інше']
]);

/**
 * Укрупнені категорії джерел для загальної таблиці
 */
const SOURCE_CATEGORY_MAP: Record<string, string> = Object.fromEntries([
  ['19', 'сайт'],
  ...['22', '24', '28'].map(k => [k, 'маркетплейси']),
  ['31', 'інше'] // інші джерела
]);

/**
 * Отримати детальне джерело замовлення для модального вікна
 * @param sajt - код джерела
 * @returns детальна назва джерела
 */
export function getOrderSourceDetailed(sajt: string): string {
  return sajt ? (SOURCE_MAP_DETAILED[sajt] || 'інше') : 'інше';
}

/**
 * Отримати категорію джерела замовлення для загальної таблиці
 * @param sajt - код джерела
 * @returns укрупнена категорія джерела
 */
export function getOrderSourceCategory(sajt: string): string {
  return sajt ? SOURCE_CATEGORY_MAP[sajt] : 'інше';
}

/**
 * Універсальна функція для отримання джерела з вибором рівня деталізації
 * @param sajt - код джерела
 * @param detailed - true для детального відображення, false для категорії
 * @returns джерело або категорія
 */
export function getOrderSourceByLevel(sajt: string, detailed: boolean = false): string {
  return detailed ? getOrderSourceDetailed(sajt) : getOrderSourceCategory(sajt);
}

// Централізована ініціалізація Prisma клієнта з оптимізованими налаштуваннями
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

/**
 * Форматує час у форматі HH:MM:SS
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
 * Функція для логування сервера з часовими відмітками
 * @param message - повідомлення для логування
 * @param data - додаткові дані (опціонально)
 */
export const logServer = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const timeFromStart = (Date.now() - appStartTime) / 1000;
  console.log(`[${formatTimeOnly(timestamp)}] [${timeFromStart.toFixed(2)}s] ${message}`, data || '');
};

/**
 * Отримує час початку звітного дня з налаштувань
 * @returns час початку звітного дня (0-23), за замовчуванням 0 (північ)
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
 * - end: 17.10 15:59:59 (сьогодні о 15:59:59)
 * 
 * @param reportingDate - звітна дата у форматі YYYY-MM-DD
 * @param dayStartHour - година початку звітного дня (0-23)
 * @returns об'єкт з початком та кінцем діапазону дат
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


/**
 * Функція для правильного відмінювання слів у залежності від числа (українська мова)
 * @param n - число
 * @param one - форма для 1 (наприклад, "поле")
 * @param few - форма для 2-4 (наприклад, "поля")
 * @param many - форма для 5 і більше (наприклад, "полів")
 */
export function pluralize(n, one, few, many) {
  const mod100 = n % 100;
  const mod10 = n % 10;

  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}


/**
 * Отримуємо користувача за його ID
 * @param id - ID користувача
 * @param fields - масив полів, які потрібно отримати
 * @returns об'єкт користувача або null, якщо користувача не знайдено
 */
export async function getUserById<T extends keyof UserType = "name" | "email">(id: string, fields?: T[]): Promise<Pick<UserType, T> | null> {
  if (!id) return null;

  // Якщо поля не вказані, вибираємо дефолтний набір
  const defaultFields: (keyof UserType)[] = ['name', 'email'];
  const selectFields = fields && fields.length > 0 ? fields : defaultFields;
  
  const user = await prisma.user.findUnique({
    where: { id: parseInt(id, 10) },
    select: selectFields.reduce((acc, field) => {
      acc[field] = true;
      return acc;
    }, {} as Record<keyof UserType, boolean>)
  });

  return user ? (user as Pick<UserType, T>) : null;
}

/**
 * Резолвить імена авторів для списку записів з полем createdBy (number | null).
 * Повертає копію масиву з доданим полем createdByName: string | null.
 *
 * @example
 * const sessions = await resolveAuthorNames(rawSessions);
 * // session.createdByName → 'Іван Іванов' | null
 */
export async function resolveAuthorNames<T extends { createdBy: number | null }>(
  items: T[]
): Promise<(T & { createdByName: string | null })[]> {
  const ids = [...new Set(items.map((i) => i.createdBy).filter((id): id is number => id !== null))];

  const users =
    ids.length > 0
      ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];

  const namesMap = new Map(users.map((u) => [u.id, u.name]));

  return items.map((item) => ({
    ...item,
    createdByName: item.createdBy != null ? (namesMap.get(item.createdBy) ?? null) : null,
  }));
}