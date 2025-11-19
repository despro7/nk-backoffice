/**
 * DilovodCacheService
 * 
 * Сервіс для кешування довідників Dilovod у таблиці settings_base.
 * Зменшує навантаження на Dilovod API, зберігаючи дані локально.
 * 
 * Ключі в settings_base:
 * - dilovod.cache.firms - JSON масив фірм
 * - dilovod.cache.accounts - JSON масив рахунків
 * - dilovod.cache.storages - JSON масив складів
 * - dilovod.cache.paymentForms - JSON масив форм оплати
 * - dilovod.cache.tradeChanels - JSON масив каналів продажів
 * - dilovod.cache.firms.lastUpdate - дата останнього оновлення фірм (ISO string)
 * - dilovod.cache.accounts.lastUpdate - дата останнього оновлення рахунків
 * - dilovod.cache.storages.lastUpdate - дата останнього оновлення складів
 * - dilovod.cache.paymentForms.lastUpdate - дата останнього оновлення форм оплати
 * - dilovod.cache.tradeChanels.lastUpdate - дата останнього оновлення каналів продажів
 */

import { PrismaClient } from '@prisma/client';
import { logServer } from '../../lib/utils.js';

const prisma = new PrismaClient();

// Wrapper для логування з timestamp
const logWithTimestamp = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  logServer(`[${timestamp}] ${message}`, data);
};

export type CacheType = 'firms' | 'accounts' | 'storages' | 'paymentForms' | 'tradeChanels' | 'deliveryMethods';

interface CacheMetadata {
  lastUpdate: Date | null;
  recordsCount: number;
  isValid: boolean;
}

export class DilovodCacheService {
  private readonly CACHE_TTL_HOURS = 24; // Кеш дійсний 24 години
  private readonly CATEGORY = 'dilovod';

  /**
   * Отримати ключ для даних кешу
   */
  private getDataKey(type: CacheType): string {
    return `dilovod.cache.${type}`;
  }

  /**
   * Отримати ключ для метаданих кешу (дата оновлення)
   */
  private getMetadataKey(type: CacheType): string {
    return `dilovod.cache.${type}.lastUpdate`;
  }

  /**
   * Перевірити чи кеш дійсний (не застарів)
   */
  async isCacheValid(type: CacheType): Promise<boolean> {
    try {
      const metadataKey = this.getMetadataKey(type);
      const metadata = await prisma.settingsBase.findUnique({
        where: { key: metadataKey }
      });

      if (!metadata) {
        return false;
      }

      const lastUpdate = new Date(metadata.value);
      const now = new Date();
      const hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);

      return hoursSinceUpdate < this.CACHE_TTL_HOURS;
    } catch (error) {
      logWithTimestamp(`❌ Помилка перевірки валідності кешу ${type}:`, error);
      return false;
    }
  }

  /**
   * Отримати метадані кешу
   */
  async getCacheMetadata(type: CacheType): Promise<CacheMetadata> {
    try {
      const metadataKey = this.getMetadataKey(type);
      const dataKey = this.getDataKey(type);

      const [metadataRecord, dataRecord] = await Promise.all([
        prisma.settingsBase.findUnique({ where: { key: metadataKey } }),
        prisma.settingsBase.findUnique({ where: { key: dataKey } })
      ]);

      if (!metadataRecord || !dataRecord) {
        return {
          lastUpdate: null,
          recordsCount: 0,
          isValid: false
        };
      }

      const lastUpdate = new Date(metadataRecord.value);
      const data = JSON.parse(dataRecord.value);
      const isValid = await this.isCacheValid(type);

      return {
        lastUpdate,
        recordsCount: Array.isArray(data) ? data.length : 0,
        isValid
      };
    } catch (error) {
      logWithTimestamp(`❌ Помилка отримання метаданих кешу ${type}:`, error);
      return {
        lastUpdate: null,
        recordsCount: 0,
        isValid: false
      };
    }
  }

  /**
   * Отримати дані з кешу
   */
  async getFromCache<T = any>(type: CacheType): Promise<T[] | null> {
    try {
      // logWithTimestamp(`🔍 Перевірка кешу для ${type}...`);
      
      const isValid = await this.isCacheValid(type);
      
      if (!isValid) {
        logWithTimestamp(`⏰ Кеш ${type} застарів або не існує - буде запит до API`);
        return null;
      }

      const dataKey = this.getDataKey(type);
      const record = await prisma.settingsBase.findUnique({
        where: { key: dataKey }
      });

      if (!record) {
        logWithTimestamp(`❌ Кеш ${type} не знайдено в БД - буде запит до API`);
        return null;
      }

      const data = JSON.parse(record.value);
      // logWithTimestamp(`✅ Кеш ${type} ВИКОРИСТАНО з БД: ${Array.isArray(data) ? data.length : 0} записів`);
      return data;
    } catch (error) {
      logWithTimestamp(`❌ Помилка читання кешу ${type}:`, error);
      return null;
    }
  }

  /**
   * Оновити кеш
   */
  async updateCache<T = any>(type: CacheType, data: T[]): Promise<void> {
    try {
      const dataKey = this.getDataKey(type);
      const metadataKey = this.getMetadataKey(type);
      const now = new Date();

      // Зберігаємо дані
      await prisma.settingsBase.upsert({
        where: { key: dataKey },
        create: {
          key: dataKey,
          value: JSON.stringify(data),
          description: `Кеш довідника Dilovod: ${type}`,
          category: this.CATEGORY,
          isActive: true
        },
        update: {
          value: JSON.stringify(data),
          updatedAt: now
        }
      });

      // Зберігаємо метадані
      await prisma.settingsBase.upsert({
        where: { key: metadataKey },
        create: {
          key: metadataKey,
          value: now.toISOString(),
          description: `Дата останнього оновлення кешу ${type}`,
          category: this.CATEGORY,
          isActive: true
        },
        update: {
          value: now.toISOString(),
          updatedAt: now
        }
      });

      logWithTimestamp(`✅ Кеш ${type} оновлено: ${data.length} записів`);
    } catch (error) {
      logWithTimestamp(`❌ Помилка оновлення кешу ${type}:`, error);
      throw error;
    }
  }

  /**
   * Очистити кеш певного типу
   */
  async clearCache(type: CacheType): Promise<void> {
    try {
      const dataKey = this.getDataKey(type);
      const metadataKey = this.getMetadataKey(type);

      await prisma.settingsBase.deleteMany({
        where: {
          key: {
            in: [dataKey, metadataKey]
          }
        }
      });

      logWithTimestamp(`🗑️  Кеш ${type} очищено`);
    } catch (error) {
      logWithTimestamp(`❌ Помилка очищення кешу ${type}:`, error);
      throw error;
    }
  }

  /**
   * Очистити весь кеш Dilovod
   */
  async clearAllCache(): Promise<void> {
    try {
      await prisma.settingsBase.deleteMany({
        where: {
          key: {
            startsWith: 'dilovod.cache.'
          }
        }
      });

      logWithTimestamp(`🗑️  Весь кеш Dilovod очищено`);
    } catch (error) {
      logWithTimestamp(`❌ Помилка очищення всього кешу:`, error);
      throw error;
    }
  }

  /**
   * Отримати статус всіх кешів
   */
  async getAllCacheStatus(): Promise<Record<CacheType | 'goods', CacheMetadata>> {
    const types: CacheType[] = ['firms', 'accounts', 'storages', 'paymentForms', 'tradeChanels', 'deliveryMethods'];
    const statuses: Record<string, CacheMetadata> = {};

    for (const type of types) {
      statuses[type] = await this.getCacheMetadata(type);
    }

    // Додаємо статус довідника товарів на основі products.dilovodGood
    try {
      const { DilovodService } = await import('./DilovodService.js');
      const dilovodService = new DilovodService();
      const goodsStatus = await dilovodService.getGoodsCacheStatus();
      
      statuses['goods'] = {
        lastUpdate: goodsStatus.lastSync,
        recordsCount: goodsStatus.count,
        isValid: goodsStatus.lastSync ? (new Date().getTime() - new Date(goodsStatus.lastSync).getTime()) / (1000 * 60 * 60) < this.CACHE_TTL_HOURS : false
      };
    } catch (error) {
      logWithTimestamp('❌ Помилка отримання статусу довідника товарів:', error);
      statuses['goods'] = {
        lastUpdate: null,
        recordsCount: 0,
        isValid: false
      };
    }

    return statuses as Record<CacheType | 'goods', CacheMetadata>;
  }
}

// Експортуємо singleton
export const dilovodCacheService = new DilovodCacheService();
