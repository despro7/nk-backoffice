// Утилиты для работы с куками
import { LoggingService } from '../services/LoggingService';

/**
 * Устанавливает куку с указанным именем, значением и опциями
 */
export function setCookie(name: string, value: string, options: {
  expires?: number; // количество дней
  path?: string;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
} = {}): void {
  const { expires, path = '/', secure = false, sameSite = 'lax' } = options;
  
  let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
  
  if (expires) {
    const date = new Date();
    date.setTime(date.getTime() + (expires * 24 * 60 * 60 * 1000));
    cookieString += `; expires=${date.toUTCString()}`;
  }
  
  if (path) {
    cookieString += `; path=${path}`;
  }
  
  if (secure) {
    cookieString += '; secure';
  }
  
  if (sameSite) {
    cookieString += `; samesite=${sameSite}`;
  }
  
  document.cookie = cookieString;
  LoggingService.cookieLog(`🍪 Cookie встановлено: ${name}=${value}`, { expires, path, secure, sameSite });
}

/**
 * Получает значение куки по имени
 */
export function getCookie(name: string): string | null {
  const nameEQ = encodeURIComponent(name) + '=';
  const cookies = document.cookie.split(';');
  
  for (let i = 0; i < cookies.length; i++) {
    let cookie = cookies[i];
    while (cookie.charAt(0) === ' ') {
      cookie = cookie.substring(1, cookie.length);
    }
    if (cookie.indexOf(nameEQ) === 0) {
      const value = decodeURIComponent(cookie.substring(nameEQ.length, cookie.length));
      LoggingService.cookieLog(`🍪 Cookie прочитано: ${name}=${value}`);
      return value;
    }
  }
  
  LoggingService.cookieLog(`🍪 Cookie не знайдено: ${name}`);
  return null;
}

/**
 * Удаляет куку по имени
 */
export function deleteCookie(name: string, path: string = '/'): void {
  setCookie(name, '', { expires: -1, path });
  LoggingService.cookieLog(`🍪 Cookie видалено: ${name}`, { path });
}

/**
 * Проверяет, поддерживает ли браузер куки
 */
export function areCookiesEnabled(): boolean {
  try {
    setCookie('test', 'test');
    const result = getCookie('test') === 'test';
    deleteCookie('test');
    return result;
  } catch (e) {
    return false;
  }
}
