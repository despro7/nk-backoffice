// Глобальная переменная для отслеживания времени старта приложения
const appStartTime = Date.now();

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
