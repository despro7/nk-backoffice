import { prisma } from '../lib/utils.js';

interface AuthSetting {
  id: number;
  key: string;
  value: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AuthSettingsCache {
  [key: string]: {
    value: string;
    expires: number;
  };
}

export class AuthSettingsService {
  private static cache: AuthSettingsCache = {};
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 минут

  /**
   * Получить настройку по ключу
   */
  static async getSetting(key: string, defaultValue: string = ''): Promise<string> {
    // Проверяем кеш
    const cached = this.cache[key];
    if (cached && Date.now() < cached.expires) {
      return cached.value;
    }

    try {
      const setting = await prisma.authSettings.findUnique({
        where: { key }
      });

      const value = setting?.value || defaultValue;
      
      // Сохраняем в кеш
      this.cache[key] = {
        value,
        expires: Date.now() + this.CACHE_DURATION
      };

      return value;
    } catch (error) {
      console.error(`❌ [AuthSettings] Ошибка получения настройки ${key}:`, error);
      return defaultValue;
    }
  }

  /**
   * Установить настройку
   */
  static async setSetting(key: string, value: string, description?: string): Promise<void> {
    try {
      await prisma.authSettings.upsert({
        where: { key },
        update: { 
          value,
          description: description || undefined,
          updatedAt: new Date()
        },
        create: {
          key,
          value,
          description: description || null
        }
      });

      // Обновляем кеш
      this.cache[key] = {
        value,
        expires: Date.now() + this.CACHE_DURATION
      };

      console.log(`✅ [AuthSettings] Настройка ${key} обновлена: ${value}`);
    } catch (error) {
      console.error(`❌ [AuthSettings] Ошибка установки настройки ${key}:`, error);
      throw error;
    }
  }

  /**
   * Получить все настройки
   */
  static async getAllSettings(): Promise<AuthSetting[]> {
    try {
      return await prisma.authSettings.findMany({
        orderBy: { key: 'asc' }
      });
    } catch (error) {
      console.error('❌ [AuthSettings] Ошибка получения всех настроек:', error);
      return [];
    }
  }

  /**
   * Очистить кеш
   */
  static clearCache(): void {
    this.cache = {};
    console.log('🧹 [AuthSettings] Кеш очищен');
  }

  /**
   * Получить настройки авторизации с типизацией
   */
  static async getAuthSettings() {
    const [
      accessTokenExpiresIn,
      refreshTokenExpiresIn,
      userActivityThresholdDays,
      middlewareRefreshThresholdSeconds,
      clientRefreshThresholdMinutes,
      tokenRefreshEnabled,
      middlewareAutoRefreshEnabled,
      clientAutoRefreshEnabled
    ] = await Promise.all([
      this.getSetting('access_token_expires_in', '1h'),
      this.getSetting('refresh_token_expires_in', '30d'),
      this.getSetting('user_activity_threshold_days', '30'),
      this.getSetting('middleware_refresh_threshold_seconds', '300'),
      this.getSetting('client_refresh_threshold_minutes', '10'),
      this.getSetting('token_refresh_enabled', 'true'),
      this.getSetting('middleware_auto_refresh_enabled', 'true'),
      this.getSetting('client_auto_refresh_enabled', 'true')
    ]);

    return {
      accessTokenExpiresIn,
      refreshTokenExpiresIn,
      userActivityThresholdDays: parseInt(userActivityThresholdDays),
      middlewareRefreshThresholdSeconds: parseInt(middlewareRefreshThresholdSeconds),
      clientRefreshThresholdMinutes: parseInt(clientRefreshThresholdMinutes),
      tokenRefreshEnabled: tokenRefreshEnabled === 'true',
      middlewareAutoRefreshEnabled: middlewareAutoRefreshEnabled === 'true',
      clientAutoRefreshEnabled: clientAutoRefreshEnabled === 'true'
    };
  }

  /**
   * Парсинг времени жизни токена в секунды
   */
  static parseExpiryTime(expiryTime: string): number {
    const unit = expiryTime.slice(-1);
    const value = parseInt(expiryTime.slice(0, -1));
    
    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 24 * 60 * 60;
      default: return 3600; // 1 час по умолчанию
    }
  }

  /**
   * Парсинг времени жизни токена в миллисекунды
   */
  static parseExpiryTimeMs(expiryTime: string): number {
    return this.parseExpiryTime(expiryTime) * 1000;
  }
}
