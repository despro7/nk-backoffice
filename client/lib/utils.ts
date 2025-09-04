import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatTimeOnly } from './formatUtils.js';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Глобальная переменная для отслеживания времени старта приложения
const appStartTime = Date.now();

/**
 * Функция для логирования с временными метками
 * @param message - сообщение для логирования
 * @param data - дополнительные данные (опционально)
 */
export const log = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const timeFromStart = (Date.now() - appStartTime) / 1000;
  console.log(`═══════ [${formatTimeOnly(timestamp)}] ═══════ [${timeFromStart.toFixed(2)}s] ═══════\n${message}`, data || '');
};

export const logServer = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const timeFromStart = (Date.now() - appStartTime) / 1000;
  console.log(`[${formatTimeOnly(timestamp)}] [${timeFromStart.toFixed(2)}s] ${message}`, data || '');
};