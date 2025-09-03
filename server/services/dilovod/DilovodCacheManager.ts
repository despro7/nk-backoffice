// Менеджер кеша SKU товаров

import { PrismaClient } from '@prisma/client';
import { WordPressProduct } from './DilovodTypes';
import { logWithTimestamp } from './DilovodUtils';
import { syncSettingsService } from '../syncSettingsService';

export class DilovodCacheManager {
  private prisma: PrismaClient;
  private cacheExpiryHours: number = 24; // Кеш действителен 24 часа (по умолчанию)

  constructor() {
    this.prisma = new PrismaClient();
    this.loadCacheSettings();
  }

  /**
   * Загрузить настройки кеша из БД
   */
  private async loadCacheSettings(): Promise<void> {
    try {
      const settings = await syncSettingsService.getSyncSettings();
      this.cacheExpiryHours = settings.dilovod.cacheExpiryHours;
      logWithTimestamp(`Dilovod кеш настройки загружены: ${this.cacheExpiryHours} часов`);
    } catch (error) {
      logWithTimestamp('Ошибка загрузки настроек кеша Dilovod, используем значения по умолчанию:', error);
    }
  }

  // Получение SKU товаров в наличии из WordPress
  async getInStockSkusFromWordPress(): Promise<string[]> {
    try {
      logWithTimestamp('Получаем SKU товаров в наличии из WordPress...');
      
      // Проверяем кеш
      const cachedSkus = await this.getCachedSkus();
      if (cachedSkus && cachedSkus.length > 0) {
        logWithTimestamp(`Используем кешированные SKU: ${cachedSkus.length} товаров`);
        return cachedSkus;
      }

      // Если кеш пуст или устарел, получаем новые данные
      logWithTimestamp('Кеш пуст или устарел, получаем новые данные из WordPress...');
      const freshSkus = await this.fetchFreshSkusFromWordPress();
      
      // Проверяем, что получили валидные данные
      if (!freshSkus || freshSkus.length === 0) {
        logWithTimestamp('Предупреждение: получен пустой массив SKU из WordPress');
        return [];
      }
      
      // Сохраняем в кеш
      logWithTimestamp(`Сохраняем ${freshSkus.length} SKU в кеш...`);
      await this.saveSkusToCache(freshSkus);
      
      logWithTimestamp(`Получено и сохранено в кеш ${freshSkus.length} SKU`);
      return freshSkus;
      
    } catch (error) {
      logWithTimestamp('Ошибка получения SKU из WordPress:', error);
      
      // Пытаемся использовать кеш даже если он устарел
      const cachedSkus = await this.getCachedSkus();
      if (cachedSkus && cachedSkus.length > 0) {
        logWithTimestamp(`Используем устаревший кеш: ${cachedSkus.length} товаров`);
        return cachedSkus;
      }
      
      throw error;
    }
  }

  // Получение кешированных SKU
  private async getCachedSkus(): Promise<string[]> {
    try {
      const cacheRecord = await this.prisma.settingsWpSku.findFirst({
        where: { id: 1 }
      });

      if (cacheRecord && cacheRecord.skus) {
        try {
          const parsedSkus = JSON.parse(cacheRecord.skus as string);
          if (Array.isArray(parsedSkus) && parsedSkus.length > 0) {
            logWithTimestamp(`Найден валидный кеш: ${parsedSkus.length} SKU, обновлен ${cacheRecord.lastUpdated.toISOString()}`);
            return parsedSkus;
          } else {
            logWithTimestamp('Кеш содержит невалидные данные (не массив или пустой массив)');
            return [];
          }
        } catch (parseError) {
          logWithTimestamp('Ошибка парсинга JSON из кеша:', parseError);
          return [];
        }
      }
      
      logWithTimestamp('Кеш не найден или устарел');
      return [];
    } catch (error) {
      logWithTimestamp('Ошибка получения кеша SKU:', error);
      return [];
    }
  }

  // Сохранение SKU в кеш
  private async saveSkusToCache(skus: string[]): Promise<void> {
    try {
      if (!skus || skus.length === 0) {
        logWithTimestamp('Предупреждение: попытка сохранить пустой массив SKU');
        return;
      }

      const skuListJson = JSON.stringify(skus);
      logWithTimestamp(`Подготавливаем к сохранению ${skus.length} SKU: ${skus.slice(0, 5).join(', ')}${skus.length > 5 ? '...' : ''}`);
      
      // Используем upsert для более надежного обновления
      await this.prisma.settingsWpSku.upsert({
        where: { id: 1 },
        update: {
          skus: skuListJson,
          totalCount: skus.length,
          lastUpdated: new Date()
        },
        create: {
          id: 1,
          skus: skuListJson,
          totalCount: skus.length,
          lastUpdated: new Date()
        }
      });
      
      logWithTimestamp(`Кеш SKU успешно обновлен: ${skus.length} товаров`);
    } catch (error) {
      logWithTimestamp('Ошибка сохранения кеша SKU:', error);
      throw error;
    }
  }

  // Получение свежих SKU из WordPress
  private async fetchFreshSkusFromWordPress(): Promise<string[]> {
    try {
      if (!process.env.WORDPRESS_DATABASE_URL) {
        throw new Error('WORDPRESS_DATABASE_URL не настроен в переменных окружения');
      }

      logWithTimestamp('Подключаемся к WordPress базе данных...');
      logWithTimestamp(`URL подключения: ${process.env.WORDPRESS_DATABASE_URL.replace(/\/\/.*@/, '//***@')}`);
      
      // Создаем отдельное подключение к WordPress базе данных
      const wordpressDb = new PrismaClient({
        datasources: {
          db: {
            url: process.env.WORDPRESS_DATABASE_URL
          }
        }
      });

      try {
        logWithTimestamp('Выполняем SQL запрос к WordPress базе...');
        
        // Получаем SKU товаров (пока без проверки количества, так как _stock может отсутствовать)
        const products = await wordpressDb.$queryRaw<WordPressProduct[]>`
          SELECT DISTINCT 
            pm.meta_value as sku,
            COALESCE(CAST(pm2.meta_value AS SIGNED), 1) as stock_quantity
          FROM wp_postmeta pm
          INNER JOIN wp_posts p ON pm.post_id = p.ID
          LEFT JOIN wp_postmeta pm2 ON pm.post_id = pm2.post_id AND pm2.meta_key = '_stock'
          WHERE pm.meta_key = '_sku'
            AND pm.meta_value IS NOT NULL
            AND pm.meta_value != ''
            AND p.post_type = 'product'
            AND p.post_status = 'publish'
          ORDER BY pm.meta_value
        `;

        logWithTimestamp(`SQL запрос выполнен успешно. Получено ${products.length} записей из WordPress`);
        
        if (products.length === 0) {
          logWithTimestamp('Предупреждение: SQL запрос вернул 0 записей. Возможно, структура таблиц отличается от ожидаемой.');
          return [];
        }

        // Логируем первые несколько записей для отладки (без BigInt)
        const sampleProducts = products.slice(0, 3).map(p => ({
          sku: String(p.sku),
          stock_quantity: Number(p.stock_quantity)
        }));
        logWithTimestamp(`Примеры полученных данных: ${JSON.stringify(sampleProducts)}`);

        // Фильтруем только валидные SKU (количество может быть любым)
        const validSkus = products
          .filter(product => {
            const isValid = product.sku && product.sku.trim() !== '';
            if (!isValid) {
              logWithTimestamp(`Пропускаем невалидный товар: SKU="${product.sku}"`);
            }
            return isValid;
          })
          .map(product => product.sku.trim());

        logWithTimestamp(`После фильтрации осталось ${validSkus.length} валидных SKU`);
        
        if (validSkus.length > 0) {
          logWithTimestamp(`Примеры валидных SKU: ${validSkus.slice(0, 5).join(', ')}`);
        }

        return validSkus;

      } finally {
        // Всегда закрываем соединение
        await wordpressDb.$disconnect();
        logWithTimestamp('Соединение с WordPress базой закрыто');
      }
      
    } catch (error) {
      logWithTimestamp('Ошибка получения SKU из WordPress:', error);
      throw error;
    }
  }

  // Очистка кеша SKU
  async clearSkuCache(): Promise<{ success: boolean; message: string }> {
    try {
      logWithTimestamp('Очищаем кеш SKU...');
      
      // Используем upsert для очистки кеша (устанавливаем пустой массив)
      await this.prisma.settingsWpSku.upsert({
        where: { id: 1 },
        update: {
          skus: JSON.stringify([]),
          totalCount: 0,
          lastUpdated: new Date()
        },
        create: {
          id: 1,
          skus: JSON.stringify([]),
          totalCount: 0,
          lastUpdated: new Date()
        }
      });
      
      logWithTimestamp('Кеш SKU успешно очищен');
      
      return {
        success: true,
        message: 'Кеш SKU успешно очищен'
      };
    } catch (error) {
      logWithTimestamp('Ошибка очистки кеша SKU:', error);
      
      return {
        success: false,
        message: `Ошибка очистки кеша: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
      };
    }
  }

  // Получение статистики кеша
  async getCacheStats(): Promise<{
    hasCache: boolean;
    skuCount: number;
    lastUpdated: string | null;
    isExpired: boolean;
  }> {
    try {
      const cacheRecord = await this.prisma.settingsWpSku.findFirst({
        where: { id: 1 }
      });

      if (!cacheRecord) {
        return {
          hasCache: false,
          skuCount: 0,
          lastUpdated: null,
          isExpired: true
        };
      }

      const isExpired = cacheRecord.lastUpdated < new Date(Date.now() - this.cacheExpiryHours * 60 * 60 * 1000);
    logWithTimestamp(`Dilovod кеш: проверка срока действия (${this.cacheExpiryHours} часов)`);
      
      return {
        hasCache: true,
        skuCount: cacheRecord.totalCount,
        lastUpdated: cacheRecord.lastUpdated.toISOString(),
        isExpired
      };
    } catch (error) {
      logWithTimestamp('Ошибка получения статистики кеша:', error);
      
      return {
        hasCache: false,
        skuCount: 0,
        lastUpdated: null,
        isExpired: true
      };
    }
  }

  // Принудительное обновление кеша
  async forceRefreshCache(): Promise<{ success: boolean; message: string; skuCount: number }> {
    try {
      logWithTimestamp('Принудительное обновление кеша SKU...');
      
      // Очищаем старый кеш
      await this.clearSkuCache();
      
      // Получаем свежие данные
      const freshSkus = await this.fetchFreshSkusFromWordPress();
      
      // Сохраняем в кеш
      await this.saveSkusToCache(freshSkus);
      
      logWithTimestamp(`Кеш принудительно обновлен: ${freshSkus.length} товаров`);
      
      return {
        success: true,
        message: `Кеш успешно обновлен`,
        skuCount: freshSkus.length
      };
    } catch (error) {
      logWithTimestamp('Ошибка принудительного обновления кеша:', error);
      
      return {
        success: false,
        message: `Ошибка обновления кеша: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        skuCount: 0
      };
    }
  }

  // Закрытие соединения с базой данных
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
