// Менеджер кеша SKU товаров

import { PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/utils.js';
import { WordPressProduct } from './DilovodTypes.js';
import { syncSettingsService } from '../syncSettingsService.js';

export class DilovodCacheManager {
  private cacheExpiryHours: number = 24; // Кеш действителен 24 часа (по умолчанию)

  constructor() {
    this.loadCacheSettings();
  }

  /**
   * Загрузить настройки кеша из БД
   */
  private async loadCacheSettings(): Promise<void> {
    try {
      const settings = await syncSettingsService.getSyncSettings();
      this.cacheExpiryHours = settings.dilovod.cacheExpiryHours;
      // console.log(`Dilovod кеш налаштування завантажені: ${this.cacheExpiryHours} години`);
    } catch (error) {
      console.log('Помилка завантаження налаштувань кеша Dilovod, використовуємо значення за замовчуванням:', error);
    }
  }

  // Получение SKU товаров в наличии из WordPress
  async getInStockSkusFromWordPress(): Promise<string[]> {
    try {
      console.log('Отримуємо SKU товарів в наявності з WordPress...');
      
      // Перевіряємо кеш
      const cachedSkus = await this.getCachedSkus();
      if (cachedSkus && cachedSkus.length > 0) {
        console.log(`Використовуємо кешовані SKU: ${cachedSkus.length} товарів`);
        return cachedSkus;
      }

      // Якщо кеш порожній або застарілий, отримуємо нові дані
      console.log('Кеш порожній або застарілий, отримуємо нові дані з WordPress...');
      const freshSkus = await this.fetchFreshSkusFromWordPress();
      
      // Перевіряємо, що отримали валідні дані
      if (!freshSkus || freshSkus.length === 0) {
        console.log('Попередження: отримано порожній масив SKU з WordPress');
        return [];
      }
      
      // Зберігаємо в кеш
      console.log(`Зберігаємо ${freshSkus.length} SKU в кеш...`);
      await this.saveSkusToCache(freshSkus);
      
      console.log(`Отримано і збережено в кеш ${freshSkus.length} SKU`);
      return freshSkus;
      
    } catch (error) {
      console.log('Помилка отримання SKU з WordPress:', error);
      
      // Працюємо з кешем навіть якщо він застарів
      const cachedSkus = await this.getCachedSkus();
      if (cachedSkus && cachedSkus.length > 0) {
        console.log(`Використовуємо застарілий кеш: ${cachedSkus.length} товарів`);
        return cachedSkus;
      }
      
      throw error;
    }
  }

  // Получение кешированных SKU
  private async getCachedSkus(): Promise<string[]> {
    try {
      const cacheRecord = await prisma.settingsWpSku.findFirst({
        where: { id: 1 }
      });

      if (cacheRecord && cacheRecord.skus) {
        try {
          const parsedSkus = JSON.parse(cacheRecord.skus as string);
          if (Array.isArray(parsedSkus) && parsedSkus.length > 0) {
            console.log(`Найден валидный кеш: ${parsedSkus.length} SKU, обновлен ${cacheRecord.lastUpdated.toISOString()}`);
            return parsedSkus;
          } else {
            console.log('Кеш содержит невалидные данные (не массив или пустой массив)');
            return [];
          }
        } catch (parseError) {
          console.log('Ошибка парсинга JSON из кеша:', parseError);
          return [];
        }
      }
      
      console.log('Кеш не найден или устарел');
      return [];
    } catch (error) {
      console.log('Ошибка получения кеша SKU:', error);
      return [];
    }
  }

  // Сохранение SKU в кеш
  private async saveSkusToCache(skus: string[]): Promise<void> {
    try {
      if (!skus || skus.length === 0) {
        console.log('Предупреждение: попытка сохранить пустой массив SKU');
        return;
      }

      const skuListJson = JSON.stringify(skus);
      console.log(`Подготавливаем к сохранению ${skus.length} SKU: ${skus.slice(0, 5).join(', ')}${skus.length > 5 ? '...' : ''}`);
      
      // Используем upsert для более надежного обновления
      await prisma.settingsWpSku.upsert({
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
      
      console.log(`Кеш SKU успешно обновлен: ${skus.length} товаров`);
    } catch (error) {
      console.log('Ошибка сохранения кеша SKU:', error);
      throw error;
    }
  }

  // Получение свежих SKU из WordPress
  public async fetchFreshSkusFromWordPress(): Promise<string[]> {
    try {
      if (!process.env.WORDPRESS_DATABASE_URL) {
        throw new Error('WORDPRESS_DATABASE_URL не настроен в переменных окружения');
      }

      console.log('Подключаемся к WordPress базе данных...');
      console.log(`URL подключения: ${process.env.WORDPRESS_DATABASE_URL.replace(/\/\/.*@/, '//***@')}`);
      
      // Создаем отдельное подключение к WordPress базе данных
      const wordpressDb = new PrismaClient({
        datasources: {
          db: {
            url: process.env.WORDPRESS_DATABASE_URL
          }
        }
      });

      try {
        console.log('Выполняем SQL запрос к WordPress базе...');
        
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

        console.log(`SQL запрос выполнен успешно. Получено ${products.length} записей из WordPress`);
        
        if (products.length === 0) {
          console.log('Предупреждение: SQL запрос вернул 0 записей. Возможно, структура таблиц отличается от ожидаемой.');
          return [];
        }

        // Логируем первые несколько записей для отладки (без BigInt)
        const sampleProducts = products.slice(0, 3).map(p => ({
          sku: String(p.sku),
          stock_quantity: Number(p.stock_quantity)
        }));
        console.log(`Примеры полученных данных: ${JSON.stringify(sampleProducts)}`);

        // Фильтруем только валидные SKU (количество может быть любым)
        const validSkus = products
          .filter(product => {
            const isValid = product.sku && product.sku.trim() !== '';
            if (!isValid) {
              console.log(`Пропускаем невалидный товар: SKU="${product.sku}"`);
            }
            return isValid;
          })
          .map(product => product.sku.trim());

        console.log(`После фильтрации осталось ${validSkus.length} валидных SKU`);
        
        if (validSkus.length > 0) {
          console.log(`Примеры валидных SKU: ${validSkus.slice(0, 5).join(', ')}`);
        }

        return validSkus;

      } finally {
        // Всегда закрываем соединение
        await wordpressDb.$disconnect();
        console.log('Соединение с WordPress базой закрыто');
      }
      
    } catch (error) {
      console.log('Ошибка получения SKU из WordPress:', error);
      throw error;
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
      const cacheRecord = await prisma.settingsWpSku.findFirst({
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
    console.log(`Dilovod кеш: проверка срока действия (${this.cacheExpiryHours} часов)`);
      
      return {
        hasCache: true,
        skuCount: cacheRecord.totalCount,
        lastUpdated: cacheRecord.lastUpdated.toISOString(),
        isExpired
      };
    } catch (error) {
      console.log('Ошибка получения статистики кеша:', error);
      
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
      console.log('Принудительное обновление кеша SKU...');
      
      // Получаем свежие данные
      const freshSkus = await this.fetchFreshSkusFromWordPress();
      
      // Сохраняем в кеш
      await this.saveSkusToCache(freshSkus);
      
      console.log(`Кеш принудительно обновлен: ${freshSkus.length} товаров`);
      
      return {
        success: true,
        message: `Кеш успешно обновлен`,
        skuCount: freshSkus.length
      };
    } catch (error) {
      console.log('Ошибка принудительного обновления кеша:', error);
      
      return {
        success: false,
        message: `Ошибка обновления кеша: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        skuCount: 0
      };
    }
  }

  // Закрытие соединения с базой данных
  async disconnect(): Promise<void> {
    await prisma.$disconnect();
  }
}
