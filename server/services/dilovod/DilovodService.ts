// Основний сервіс Dilovod - координатор всіх модулів

import { PrismaClient } from '@prisma/client';
import {
  DilovodApiClient,
  DilovodCacheManager,
  DilovodDataProcessor,
  DilovodSyncManager,
  DilovodProduct,
  DilovodSyncResult,
  DilovodTestResult,
  DilovodStockBalance,
  WordPressProduct
} from './index.js';
import { logWithTimestamp } from './DilovodUtils.js';
import { syncSettingsService } from '../syncSettingsService.js';
import { dilovodCacheService } from './DilovodCacheService.js';
import { DilovodGoodsCacheManager } from './DilovodGoodsCacheManager.js';
import { pluralize } from '../../lib/utils.js';

const prisma = new PrismaClient();

export class DilovodService {
  // Goods cache manager
  public goodsCacheManager: DilovodGoodsCacheManager;

  async getGoodsCacheStatus() {
    return await this.goodsCacheManager.getStatus();
  }

  async refreshGoodsCache(skuList?: string[]) {
    return await this.goodsCacheManager.refresh(skuList);
  }
  /**
   * Експортувати замовлення в Dilovod (створити документ saleOrder)
   */
  async exportOrderToDilovod(payload: any): Promise<any> {
    // Викликає API-клієнт для створення документа
    return this.apiClient.makeRequest({
      version: '0.25',
      key: this.apiClient.getApiKey(),
      action: 'saveObject',
      params: payload
    });
  }
  private apiClient: DilovodApiClient;
  private cacheManager: DilovodCacheManager;
  private dataProcessor: DilovodDataProcessor;
  private syncManager: DilovodSyncManager;

  constructor() {
    this.apiClient = new DilovodApiClient();
    this.cacheManager = new DilovodCacheManager();
    this.dataProcessor = new DilovodDataProcessor(this.apiClient);
    this.syncManager = new DilovodSyncManager();
    this.goodsCacheManager = new DilovodGoodsCacheManager();
  }

  /**
   * Логування запиту/відповіді Dilovod API експорту замовлення
   * @param title Заголовок або опис логу
   * @param status success/error
   * @param message текстове повідомлення
   * @param data { payload, warnings }
   * @param metadata додаткові метадані
   */
  async logMetaDilovodExport({ title, status, message, data }: {
    title: string,
    status: 'success' | 'error',
    message: string,
    data?: any
  }) {
    try {
      // Add `as any` cast because Prisma types may not be regenerated yet in this environment.
      // After running `npx prisma generate`, remove the `as any` cast if type checks succeed.
      await prisma.meta_logs.create({
        // @ts-ignore - allow legacy code when prisma schema hasn't been re-generated locally yet
        data: {
          category: 'dilovod',
          title,
          status,
          message,
          data,
          // If the caller provides orderNumber in the payload - save it into a separate column
          // This allows DB-side filtering/counting without complex JSON queries
          orderNumber: data && typeof data === 'object' && 'orderNumber' in data ? (data as any).orderNumber : undefined
        } as any
      });
    } catch (err) {
      logWithTimestamp('Помилка запису логу meta_logs:', err);
    }
  }

  // ===== УПРАВЛІННЯ КОНФІГУРАЦІЄЮ =====

  /**
   * Оновлює конфігурацію API клієнта (після зміни налаштувань)
   */
  async reloadApiConfig(): Promise<void> {
    await this.apiClient.reloadConfig();
    // Також оновлюємо dataProcessor, щоб він використовував нову конфігурацію
    await this.dataProcessor.reloadConfig();
  }

  // ===== ОСНОВНІ ФУНКЦІЇ СИНХРОНІЗАЦІЇ =====

  // Синхронізація товарів з Dilovod
  async syncProductsWithDilovod(mode: 'full' | 'manual' = 'full', manualSkus?: string[]): Promise<DilovodSyncResult> {
    try {
      logWithTimestamp(`\n🚀 === ПОЧАТОК ${mode === 'full' ? 'ПОВНОЇ' : 'РУЧНОЇ'} СИНХРОНІЗАЦІЇ ТОВАРІВ З DILOVOD ===`);

      // Перевіряємо, чи увімкнено синхронізацію Dilovod
      const isEnabled = await syncSettingsService.isSyncEnabled('dilovod');
      if (!isEnabled) {
        logWithTimestamp('❌ Синхронізація Dilovod вимкнена в налаштуваннях');
        return {
          success: false,
          message: 'Синхронізація Dilovod вимкнена в налаштуваннях',
          syncedProducts: 0,
          syncedSets: 0,
          errors: ['Синхронізація Dilovod вимкнена']
        };
      }

      let skus = [];

      if (mode === 'full') {
        // Отримання SKU товарів з WordPress
        logWithTimestamp('📋 Крок 1: Отримання SKU товарів з WordPress...');
        skus = await this.fetchSkusDirectlyFromWordPress();
      } else {
        skus = manualSkus;
      }

      if (skus.length === 0) {
        logWithTimestamp('❌ Не знайдено SKU товарів для синхронізації');
        return {
          success: false,
          message: 'Не знайдено SKU товарів для синхронізації',
          syncedProducts: 0,
          syncedSets: 0,
          errors: []
        };
      }

      logWithTimestamp(`✅ Отримано ${skus.length} SKU для синхронізації`);
      logWithTimestamp('📋 SKU:', skus.slice(0, 10));
      if (skus.length > 10) {
        logWithTimestamp(`... і ще ${skus.length - 10}`);
      }

      // Крок 2: Отримання інформації про товари та комплекти з Dilovod
      logWithTimestamp('\n📋 Крок 2: Отримання інформації про товари та комплекти з Dilovod...');
      const dilovodProducts = await this.getGoodsInfoWithSetsOptimized(skus);

      if (!dilovodProducts || dilovodProducts.length === 0) {
        logWithTimestamp('❌ Не вдалося отримати дані з Dilovod');
        return {
          success: false,
          message: 'Не вдалося отримати дані з Dilovod',
          syncedProducts: 0,
          syncedSets: 0,
          errors: []
        };
      }

      logWithTimestamp(`✅ Отримано ${dilovodProducts.length} товарів з Dilovod`);

      // Аналізуємо отримані дані
      const productsWithSets = dilovodProducts.filter(p => p.set && p.set.length > 0);
      const regularProducts = dilovodProducts.filter(p => !p.set || p.set.length === 0);

      logWithTimestamp(`📊 Аналіз отриманих даних:`);
      logWithTimestamp(`  - Всього товарів: ${dilovodProducts.length}`);
      logWithTimestamp(`  - Комплектів: ${productsWithSets.length}`);
      logWithTimestamp(`  - Звичайних товарів: ${regularProducts.length}`);

      if (productsWithSets.length > 0) {
        logWithTimestamp(`🎯 Знайдені комплекти:`);
        productsWithSets.forEach((product, index) => {
          logWithTimestamp(`  ${index + 1}. ${product.sku} - ${product.name} (${product.set.length} компонентів)`);
        });
      }

      // Крок 3: Синхронізація з базою даних
      logWithTimestamp('\n📋 Крок 3: Синхронізація з базою даних...');
      const syncResult = await this.syncManager.syncProductsToDatabase(dilovodProducts);

      if (mode === 'full') {
        // Крок 4: Позначення застарілих товарів (які є в БД але немає в WordPress)
        logWithTimestamp('\n📋 Крок 4: Позначення застарілих товарів...');
        await this.syncManager.markOutdatedProducts(skus);
      }

      logWithTimestamp('\n✅ === СИНХРОНІЗАЦІЯ ЗАВЕРШЕНА ===');
      logWithTimestamp(`Результат: ${syncResult.message}`);
      logWithTimestamp(`Успішно: ${syncResult.success ? 'ТАК' : 'НІ'}`);

      return syncResult;

    } catch (error) {
      logWithTimestamp('\n❌ === ПОМИЛКА СИНХРОНІЗАЦІЇ ===');
      logWithTimestamp('Помилка синхронізації з Dilovod:', error);
      return {
        success: false,
        message: `Помилка синхронізації: ${error instanceof Error ? error.message : 'Невідома помилка'}`,
        syncedProducts: 0,
        syncedSets: 0,
        errors: [error instanceof Error ? error.message : 'Невідома помилка']
      };
    }
  }

  // ===== ФУНКЦІЇ ОТРИМАННЯ ДАНИХ =====

  // Отримання інформації про товари з комплектами (оптимізована версія)
  async getGoodsInfoWithSetsOptimized(skuList: string[]): Promise<DilovodProduct[]> {
    try {
      logWithTimestamp('Отримуємо інформацію про товари та комплекти з Dilovod...');
      logWithTimestamp('SKU для обробки:', skuList);

      // Отримуємо товари з цінами
      const pricesResponse = await this.apiClient.getGoodsWithPrices(skuList);
      logWithTimestamp(`Отримано ${pricesResponse.length} товарів з цінами`);

      // Отримуємо товари з каталогу для додаткової інформації
      const goodsResponse = await this.apiClient.getGoodsFromCatalog(skuList);
      logWithTimestamp(`Отримано ${goodsResponse.length} товарів з каталогу`);

      // Обробляємо дані через процесор
      const result = await this.dataProcessor.processGoodsWithSets(pricesResponse, goodsResponse);

      return result;

    } catch (error) {
      logWithTimestamp('Помилка отримання інформації про товари з комплектами:', error);
      throw error;
    }
  }

  // Отримання залишків товарів за списком SKU
  async getBalanceBySkuList(): Promise<DilovodStockBalance[]> {
    try {
      logWithTimestamp('Отримуємо залишки товарів за списком SKU...');

      // Отримуємо SKU актуальних товарів з бази даних (за вийнятком застарілих)
      const products = await prisma.product.findMany({
        where: {
          isOutdated: false
        },
        select: {
          sku: true
        }
      });

      const skus = products.map(p => p.sku);
      if (skus.length === 0) {
        logWithTimestamp('Не знайдено актуальних товарів у базі даних');
        return [];
      }

      logWithTimestamp(`Отримано ${skus.length} SKU актуальних товарів з БД`);

      const stockResponse = await this.apiClient.getStockBalance(skus);
      const processedStock = this.dataProcessor.processStockBalance(stockResponse);

      logWithTimestamp(`Оброблено ${processedStock.length} товарів з залишками`);

      return processedStock.map(item => ({
        sku: item.sku,
        name: item.name,
        mainStorage: item.mainStorage,
        kyivStorage: item.kyivStorage,
        total: item.total
      }));

    } catch (error) {
      logWithTimestamp('Помилка отримання залишків за SKU:', error);
      throw error;
    }
  }

  // Нова функція: оновлення залишків товарів у БД
  async updateStockBalancesInDatabase(): Promise<{
    success: boolean;
    message: string;
    updatedProducts: number;
    errors: string[];
  }> {
    try {
      logWithTimestamp('\n🔄 === ОНОВЛЕННЯ ЗАЛИШКІВ ТОВАРІВ У БД ===');

      // Отримуємо актуальні залишки з Dilovod
      const stockBalances = await this.getBalanceBySkuList();

      if (stockBalances.length === 0) {
        return {
          success: false,
          message: 'Не вдалося отримати залишки з Dilovod',
          updatedProducts: 0,
          errors: []
        };
      }

      logWithTimestamp(`Отримано ${stockBalances.length} товарів з залишками для оновлення`);

      const errors: string[] = [];
      let updatedProducts = 0;

      // Оновлюємо залишки в базі даних
      for (const stockBalance of stockBalances) {
        try {
          const result = await this.syncManager.updateProductStockBalance(
            stockBalance.sku,
            stockBalance.mainStorage,
            stockBalance.kyivStorage
          );

          if (result.success) {
            updatedProducts++;
            logWithTimestamp(`✅ Залишки для ${stockBalance.sku} оновлено: Склад1=${stockBalance.mainStorage}, Склад2=${stockBalance.kyivStorage}`);
          } else {
            errors.push(`Помилка оновлення ${stockBalance.sku}: ${result.message}`);
          }
        } catch (error) {
          const errorMessage = `Помилка оновлення залишків ${stockBalance.sku}: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
          logWithTimestamp(errorMessage);
          errors.push(errorMessage);
        }
      }

      logWithTimestamp(`\n=== РЕЗУЛЬТАТ ОНОВЛЕННЯ ЗАЛИШКІВ ===`);
      logWithTimestamp(`Оновлено товарів: ${updatedProducts}`);
      logWithTimestamp(`Помилок: ${errors.length}`);

      if (errors.length > 0) {
        logWithTimestamp(`Список помилок:`);
        errors.forEach((error, index) => {
          logWithTimestamp(`${index + 1}. ${error}`);
        });
      }

      return {
        success: errors.length === 0,
        message: `Оновлено ${updatedProducts} товарів з залишками`,
        updatedProducts,
        errors
      };

    } catch (error) {
      logWithTimestamp('Помилка оновлення залишків у БД:', error);
      return {
        success: false,
        message: `Помилка оновлення залишків: ${error instanceof Error ? error.message : 'Невідома помилка'}`,
        updatedProducts: 0,
        errors: [error instanceof Error ? error.message : 'Невідома помилка']
      };
    }
  }

  // ===== ТЕСТОВІ ФУНКЦІЇ =====

  // Тест підключення до Dilovod
  async testConnection(): Promise<DilovodTestResult> {
    try {
      logWithTimestamp('Тестуємо підключення до Dilovod...');

      const isConnected = await this.apiClient.testConnection();

      if (isConnected) {
        return {
          success: true,
          message: 'Підключення до Dilovod успішне'
        };
      } else {
        return {
          success: false,
          message: 'Не вдалося підключитися до Dilovod'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Помилка тестування підключення: ${error instanceof Error ? error.message : 'Невідома помилка'}`
      };
    }
  }

  // Тест отримання тільки комплектів
  async testSetsOnly(): Promise<DilovodTestResult> {
    try {
      logWithTimestamp('\n🧪 === ТЕСТ ОТРИМАННЯ КОМПЛЕКТІВ ===');

      const skus = await this.fetchSkusDirectlyFromWordPress();
      if (skus.length === 0) {
        return {
          success: false,
          message: 'Немає SKU для тестування'
        };
      }

      logWithTimestamp(`Отримано ${skus.length} SKU для тестування`);

      // Отримуємо товари з каталогу
      const response = await this.apiClient.getGoodsFromCatalog(skus);

      if (!Array.isArray(response)) {
        return {
          success: false,
          message: 'Несподіваний формат відповіді'
        };
      }

      // Аналізуємо відповідь
      const setParentId = "1100300000001315";
      const potentialSets = response.filter((item: any) => item.parent === setParentId);
      const regularGoods = response.filter((item: any) => item.parent !== setParentId);

      logWithTimestamp(`\n📊 Аналіз відповіді:`);
      logWithTimestamp(`  - Всього товарів: ${response.length}`);
      logWithTimestamp(`  - Потенційних комплектів (parent=${setParentId}): ${potentialSets.length}`);
      logWithTimestamp(`  - Звичайних товарів: ${regularGoods.length}`);

      if (potentialSets.length > 0) {
        logWithTimestamp(`\n🎯 Потенційні комплекти:`);
        potentialSets.forEach((item: any, index: number) => {
          logWithTimestamp(`  ${index + 1}. ID: ${item.id}, SKU: ${item.sku}, Назва: ${item.id__pr || 'N/A'}`);
        });
      }

      return {
        success: true,
        message: `Тест завершено. Знайдено ${potentialSets.length} потенційних комплектів`,
        data: {
          totalGoods: response.length,
          potentialSets: potentialSets.length,
          regularGoods: regularGoods.length,
          response: response
        }
      };

    } catch (error) {
      logWithTimestamp('Помилка тестування комплектів:', error);
      return {
        success: false,
        message: `Помилка: ${error instanceof Error ? error.message : 'Невідома помилка'}`
      };
    }
  }

  // ===== ФУНКЦІЇ КЕРУВАННЯ КЕШЕМ =====

  // Отримання SKU для тестування
  async getTestSkus(): Promise<string[]> {
    return this.fetchSkusDirectlyFromWordPress();
  }

  // Отримання статистики кеша
  async getCacheStats(): Promise<{
    hasCache: boolean;
    skuCount: number;
    lastUpdated: string | null;
    isExpired: boolean;
  }> {
    return this.cacheManager.getCacheStats();
  }

  // Примусове оновлення кеша
  async forceRefreshCache(): Promise<{ success: boolean; message: string; skuCount: number }> {
    return this.cacheManager.forceRefreshCache();
  }

  // ===== ФУНКЦІЇ СТАТИСТИКИ =====

  // Отримання статистики синхронізації
  async getSyncStats(): Promise<{
    totalProducts: number;
    productsWithSets: number;
    lastSync: string | null;
    categoriesCount: Array<{ name: string; count: number }>;
  }> {
    return this.syncManager.getSyncStats();
  }

  // Отримання товарів за фільтрами
  async getProducts(filters: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    hasSets?: boolean;
  }): Promise<{
    products: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> {
    return this.syncManager.getProducts(filters);
  }

  // ===== ФУНКЦІЇ ОЧИСТКИ =====

  // Очистка старих товарів
  async cleanupOldProducts(daysOld?: number): Promise<{
    success: boolean;
    message: string;
    deletedCount: number;
  }> {
    return this.syncManager.cleanupOldProducts(daysOld);
  }

  // ===== ПРИВАТНІ МЕТОДИ =====

  // Прямий запит SKU з WordPress (без кешу)
  private async fetchSkusDirectlyFromWordPress(): Promise<string[]> {
    try {
      if (!process.env.WORDPRESS_DATABASE_URL) {
        throw new Error('WORDPRESS_DATABASE_URL не налаштований у змінних оточення');
      }

      logWithTimestamp('Підключаємося до бази даних WordPress...');
      logWithTimestamp(`URL підключення: ${process.env.WORDPRESS_DATABASE_URL.replace(/\/\/.*@/, '//***@')}`);

      // Створюємо окреме підключення до бази даних WordPress
      const wordpressDb = new PrismaClient({
        datasources: {
          db: {
            url: process.env.WORDPRESS_DATABASE_URL
          }
        }
      });

      try {
        logWithTimestamp('Виконуємо SQL запит до бази WordPress...');

        // Отримуємо SKU товарів
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

        logWithTimestamp(`SQL запит виконано успішно. Отримано ${products.length} записів з WordPress`);

        if (products.length === 0) {
          logWithTimestamp('Попередження: SQL запит повернув 0 записів.');
          return [];
        }

        // Фільтруємо тільки валідні SKU
        const validSkus = products
          .filter(product => product.sku && product.sku.trim() !== '')
          .map(product => product.sku.trim());

        logWithTimestamp(`Після фільтрації залишилось ${validSkus.length} валідних SKU`);

        if (validSkus.length > 0) {
          logWithTimestamp(`Приклади валідних SKU: ${validSkus.slice(0, 5).join(', ')}`);
        }

        return validSkus;

      } finally {
        // Завжди закриваємо з'єднання
        await wordpressDb.$disconnect();
        logWithTimestamp('З\'єднання з базою WordPress закрито');
      }

    } catch (error) {
      logWithTimestamp('Помилка отримання SKU з WordPress:', error);
      throw error;
    }
  }


  // ===== ФУНКЦІЇ ДЛЯ РОБОТИ З ЗАМОВЛЕННЯМИ =====

  // Пошук замовлення за номером
  async getOrderByNumber(orderNumbers: string[], withDetails = false): Promise<any[][]> {
    try {
      logWithTimestamp(`Пошук замовлень за номерами: ${orderNumbers.join(', ')}`);
      const result = await this.apiClient.getOrderByNumber(orderNumbers, withDetails);
      logWithTimestamp(`Знайдено ${result.length} замовлень`);
      return result;
    } catch (error) {
      const errorMessage = `Помилка пошуку замовлень: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      logWithTimestamp(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Пошук documents.sale / documents.cashIn
  async getDocuments(baseDoc: any[], documentType: 'sale' | 'cashIn'): Promise<any[]> {
    try {
      logWithTimestamp(`Пошук documents.${documentType} за базовим документом:`, baseDoc);
      const result = await this.apiClient.getDocuments(baseDoc, documentType === 'sale' ? 'sale' : 'cashIn');
      logWithTimestamp(`Знайдено ${result.length} documents.${documentType}`);
      return result;
    } catch (error) {
      const errorMessage = `Помилка пошуку documents.${documentType}: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      logWithTimestamp(errorMessage);
      throw new Error(errorMessage);
    }
  }


  // Отримання деталей замовлення
  async getOrderDetails(orderId: string): Promise<any> {
    try {
      logWithTimestamp(`Отримання деталей замовлення ID: ${orderId}`);
      const result = await this.apiClient.getOrderDetails(orderId);
      logWithTimestamp('Деталі замовлення отримані успішно');
      return result;
    } catch (error) {
      const errorMessage = `Помилка отримання деталей замовлення: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      logWithTimestamp(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // ===== МЕТОДИ ДЛЯ НАЛАШТУВАНЬ =====

  // Отримання складів з Dilovod (з кешуванням)
  async getStorages(forceRefresh = false): Promise<any[]> {
    try {
      // Перевіряємо кеш, якщо не примусове оновлення
      if (!forceRefresh) {
        const cached = await dilovodCacheService.getFromCache('storages');
        if (cached) {
          logWithTimestamp(`📦 [Dilovod] Склади завантажено з кешу: ${cached.length} записів`);
          return cached;
        }
      }

      logWithTimestamp('🔄 [Dilovod] Отримання списку складів з Dilovod API');
      const result = await this.apiClient.getStorages();
      logWithTimestamp(`📦 [Dilovod] Отримано ${result.length} складів з API`);

      // Оновлюємо кеш
      await dilovodCacheService.updateCache('storages', result);

      return result;
    } catch (error) {
      const errorMessage = `Помилка отримання складів: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      logWithTimestamp(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Отримання рахунків з Dilovod (з кешуванням)
  async getCashAccounts(forceRefresh = false): Promise<any[]> {
    try {
      // Перевіряємо кеш, якщо не примусове оновлення
      if (!forceRefresh) {
        const cached = await dilovodCacheService.getFromCache('accounts');
        if (cached) {
          logWithTimestamp(`💰 [Dilovod] Рахунки завантажено з кешу: ${cached.length} записів`);
          return cached;
        }
      }

      logWithTimestamp('🔄 [Dilovod] Отримання списку рахунків з Dilovod API');
      const result = await this.apiClient.getCashAccounts();
      logWithTimestamp(`💰 [Dilovod] Отримано ${result.length} рахунків з API`);

      // Оновлюємо кеш
      await dilovodCacheService.updateCache('accounts', result);

      return result;
    } catch (error) {
      const errorMessage = `Помилка отримання рахунків: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      logWithTimestamp(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Отримання форм оплати з Dilovod (з кешуванням)
  async getPaymentForms(forceRefresh = false): Promise<any[]> {
    try {
      // Перевіряємо кеш, якщо не примусове оновлення
      if (!forceRefresh) {
        const cached = await dilovodCacheService.getFromCache('paymentForms');
        if (cached) {
          logWithTimestamp(`💳 [Dilovod] Форми оплати завантажено з кешу: ${cached.length} записів`);
          return cached;
        }
      }

      logWithTimestamp('🔄 [Dilovod] Отримання списку форм оплати з Dilovod API');
      const result = await this.apiClient.getPaymentForms();
      logWithTimestamp(`💳 [Dilovod] Отримано ${result.length} форм оплати з API`);

      // Оновлюємо кеш
      await dilovodCacheService.updateCache('paymentForms', result);

      return result;
    } catch (error) {
      const errorMessage = `Помилка отримання форм оплати: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      logWithTimestamp(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Отримання каналів продажів з Dilovod (з кешуванням)
  async getTradeChanels(forceRefresh = false): Promise<any[]> {
    try {
      // Перевіряємо кеш, якщо не примусове оновлення
      if (!forceRefresh) {
        const cached = await dilovodCacheService.getFromCache('tradeChanels');
        if (cached) {
          logWithTimestamp(`📺 [Dilovod] Канали продажів завантажено з кешу: ${cached.length} записів`);
          return cached;
        }
      }

      logWithTimestamp('🔄 [Dilovod] Отримання списку каналів продажів з Dilovod API');
      const result = await this.apiClient.getTradeChanels();
      logWithTimestamp(`📺 [Dilovod] Отримано ${result.length} каналів продажів з API`);

      // Оновлюємо кеш
      await dilovodCacheService.updateCache('tradeChanels', result);

      return result;
    } catch (error) {
      const errorMessage = `Помилка отримання каналів продажів: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      logWithTimestamp(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Отримання способів доставки з Dilovod (з кешуванням)
  async getDeliveryMethods(forceRefresh = false): Promise<any[]> {
    try {
      // Перевіряємо кеш, якщо не примусове оновлення
      if (!forceRefresh) {
        const cached = await dilovodCacheService.getFromCache('deliveryMethods');
        if (cached) {
          logWithTimestamp(`🚚 [Dilovod] Способи доставки завантажено з кешу: ${cached.length} записів`);
          return cached;
        }
      }

      logWithTimestamp('🔄 [Dilovod] Отримання списку способів доставки з Dilovod API');
      const result = await this.apiClient.getDeliveryMethods();
      logWithTimestamp(`🚚 [Dilovod] Отримано ${result.length} способів доставки з API`);

      // Оновлюємо кеш
      await dilovodCacheService.updateCache('deliveryMethods', result);

      return result;
    } catch (error) {
      const errorMessage = `Помилка отримання способів доставки: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      logWithTimestamp(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Отримання фірм (власників рахунків) з Dilovod (з кешуванням)
  async getFirms(forceRefresh = false): Promise<any[]> {
    try {
      // Перевіряємо кеш, якщо не примусове оновлення
      if (!forceRefresh) {
        const cached = await dilovodCacheService.getFromCache('firms');
        if (cached) {
          logWithTimestamp(`🏢 [Dilovod] Фірми завантажено з кешу: ${cached.length} записів`);
          return cached;
        }
      }

      logWithTimestamp('🔄 [Dilovod] Отримання списку фірм з Dilovod API');
      const result = await this.apiClient.getFirms();
      logWithTimestamp(`🏢 [Dilovod] Отримано ${result.length} фірм з API`);

      // Оновлюємо кеш
      await dilovodCacheService.updateCache('firms', result);

      return result;
    } catch (error) {
      const errorMessage = `Помилка отримання фірм: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      logWithTimestamp(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Оновити весь кеш довідників Dilovod (примусово)
   * ВАЖЛИВО: Dilovod API блокує паралельні запити, тому робимо послідовно
   */
  async refreshAllDirectoriesCache(): Promise<{
    firms: number;
    accounts: number;
    storages: number;
    paymentForms: number;
    tradeChanels: number;
    deliveryMethods: number;
  }> {
    logWithTimestamp('🔄 Примусове оновлення всіх довідників Dilovod...');

    // Робимо запити ПОСЛІДОВНО через обмеження Dilovod API
    const firms = await this.getFirms(true);
    const accounts = await this.getCashAccounts(true);
    const storages = await this.getStorages(true);
    const paymentForms = await this.getPaymentForms(true);
    const tradeChanels = await this.getTradeChanels(true);
    const deliveryMethods = await this.getDeliveryMethods(true);

    const result = {
      firms: firms.length,
      accounts: accounts.length,
      storages: storages.length,
      paymentForms: paymentForms.length,
      tradeChanels: tradeChanels.length,
      deliveryMethods: deliveryMethods.length
    };

    logWithTimestamp(`✅ [Dilovod] Кеш оновлено: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Знайти контрагента за номером телефону
   */
  async findPersonByPhone(phone: string): Promise<{ id: string; name: string; phone: string } | null> {
    try {
      logWithTimestamp(`🔍 [Dilovod] Пошук контрагента за телефоном: ${phone}`);

      if (!phone) {
        return null;
      }

      const results = await this.apiClient.findPersonByPhone(phone);

      if (results.length > 0) {
        const person = results[0]; // Беремо перший знайдений
        logWithTimestamp(`✅ [Dilovod] Контрагент знайдений: ${person.name} (ID: ${person.id})`);
        return person;
      } else {
        logWithTimestamp(`❌ [Dilovod] Контрагент з телефоном ${phone} не знайдений`);
        return null;
      }

    } catch (error) {
      const errorMessage = `Помилка пошуку контрагента: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      logWithTimestamp(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Створити нового контрагента
   */
  async createPerson(personData: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
  }): Promise<{ id: string; code: string }> {
    try {
      logWithTimestamp(`🆕 [Dilovod] Створення контрагента: ${personData.name}, ${personData.phone}`);

      const result = await this.apiClient.createPerson(personData);

      logWithTimestamp(`✅ [Dilovod] Контрагент створений: ID ${result.id}, код ${result.code}`);

      return result;

    } catch (error) {
      const errorMessage = `Помилка створення контрагента: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      logWithTimestamp(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Знайти або створити контрагента за даними замовлення
   */
  async findOrCreatePersonFromOrder(orderData: {
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    deliveryAddress?: string;
  }, options?: { dryRun?: boolean }): Promise<{ id: string; code: string; name: string; phone?: string; personType: string; wasCreated: boolean }> {
    const { customerName, customerPhone, customerEmail, deliveryAddress } = orderData;

    const dryRun = !!options?.dryRun;

    // Спочатку спробуємо знайти за телефоном
    if (customerPhone) {
      const existingPerson = await this.findPersonByPhone(customerPhone);
      if (existingPerson) {
        logWithTimestamp(`✅ [Dilovod] Використовується існуючий контрагент: ${existingPerson.name}`);
        return {
          id: existingPerson.id,
          code: existingPerson.id, // Використовуємо ID як код
          name: existingPerson.name,
          phone: existingPerson.phone,
          personType: '1004000000000035', // Фізична особа
          wasCreated: false
        };
      }
    } else {
      logWithTimestamp(`⚠️ [Dilovod] Телефон не вказано, створюємо контрагента без пошуку`);
    }

    // Якщо не знайдено
    if (dryRun) {
      logWithTimestamp(`👤 [Dilovod] Контрагент не знайдено, dry-run - пропускаємо створення.`);
      return {
        id: '',
        code: '',
        name: customerName || 'Невідомий клієнт',
        phone: customerPhone,
        personType: '1004000000000035',
        wasCreated: false
      };
    }

    // Якщо не знайдено - створюємо нового
    logWithTimestamp(`👤 [Dilovod] Контрагент не знайдено, створюємо нового...`);

    const newPerson = await this.createPerson({
      name: customerName || 'Невідомий клієнт',
      phone: customerPhone,
      email: customerEmail,
      address: deliveryAddress
    });

    return {
      id: newPerson.id,
      code: newPerson.code,
      name: customerName || 'Невідомий клієнт',
      phone: customerPhone,
      personType: '1004000000000035', // Фізична особа
      wasCreated: true
    };
  }

  /**
   * Оптимізований пошук товарів за списком SKU
   * Повертає Map для швидкого доступу SKU → Dilovod ID
   * 
   * Примітка: Для експорту замовлень цей метод не потрібен, 
   * оскільки Dilovod приймає SKU безпосередньо в полі good
   */
  async findGoodsBySkuList(skuList: string[]): Promise<Map<string, string>> {
    try {
      logWithTimestamp(`🔍 [Dilovod] Пошук товарів за ${skuList.length} SKU...`);

      if (skuList.length === 0) {
        return new Map();
      }

      // Запит до Dilovod API
      const results = await this.apiClient.findGoodsBySkuList(skuList);

      // Створюємо Map для швидкого доступу
      const skuToIdMap = new Map<string, string>();

      for (const item of results) {
        if (item.id && item.productNum) {
          skuToIdMap.set(item.productNum, item.id);
        }
      }

      logWithTimestamp(`✅ [Dilovod] Знайдено ${skuToIdMap.size} з ${skuList.length} товарів`);

      // Логуємо які SKU не знайдено
      const notFoundSkus = skuList.filter(sku => !skuToIdMap.has(sku));
      if (notFoundSkus.length > 0) {
        logWithTimestamp(`⚠️ [Dilovod] Не знайдено SKU: ${notFoundSkus.join(', ')}`);
      }

      return skuToIdMap;

    } catch (error) {
      const errorMessage = `Помилка пошуку товарів за SKU: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      logWithTimestamp(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Отримати фіскальний чек за dilovodDocId
   * @param dilovodDocId ID документа в Dilovod
   * @returns Розпарсені дані чека або null, якщо чек не знайдено
   */
  async getFiscalReceipt(dilovodDocId: string): Promise<{
    header: any;
    goods: any[];
    totals: any;
    payments: any[];
    taxes: any[];
  } | null> {
    try {
      logWithTimestamp(`🧾 [Dilovod] Запит фіскального чека для документа: ${dilovodDocId}`);

      const response = await this.apiClient.makeRequest({
        version: '0.25',
        key: this.apiClient.getApiKey(),
        action: 'request',
        params: {
          from: 'informationRegisters.fiscalRefs',
          fields: {
            contract: 'contract',
            additionalData: 'additionalData'
          },
          filters: [
            {
              alias: 'contract',
              operator: '=',
              value: dilovodDocId
            }
          ]
        }
      });

      // Перевіряємо, чи є дані у відповіді
      if (!response || !Array.isArray(response) || response.length === 0) {
        logWithTimestamp(`⚠️ [Dilovod] Фіскальний чек не знайдено для документа ${dilovodDocId}`);
        return null;
      }

      const fiscalData = response[0];
      const additionalData = fiscalData?.additionalData;

      if (!additionalData) {
        logWithTimestamp(`⚠️ [Dilovod] additionalData порожнє для документа ${dilovodDocId}`);
        return null;
      }

      // Розпарсюємо JSON з additionalData
      let receiptJson: any;
      try {
        receiptJson = JSON.parse(additionalData);
      } catch (parseError) {
        logWithTimestamp(`❌ [Dilovod] Помилка парсингу additionalData:`, parseError);
        throw new Error('Невалідний JSON у полі additionalData');
      }

      // Dilovod може повертати дані в різних форматах, перевіряємо всі варіанти
      let totalsData = receiptJson.totals || receiptJson.Totals || receiptJson.total || {};
      
      // Якщо totals - це масив, беремо перший елемент
      if (Array.isArray(totalsData) && totalsData.length > 0) {
        totalsData = totalsData[0];
      }

      const receipt = {
        header: receiptJson.json.header,
        goods: receiptJson.json.goods || [],
        totals: receiptJson.json.totals[0] || [],
        payments: receiptJson.json.payments[0] || [],
        taxes: receiptJson.json.taxes[0] || []
      };

      // Якщо totals все ще порожній, спробуємо знайти суму в кореневому об'єкті
      if (!receipt.totals.SUM && !receipt.totals.sum) {
        const possibleSumFields = ['SUM', 'sum', 'TOTAL', 'total', 'amount', 'AMOUNT'];
        for (const field of possibleSumFields) {
          if (receiptJson[field] !== undefined) {
            receipt.totals = { SUM: receiptJson[field] };
            break;
          }
        }
      }

      // Якщо досі немає суми, підраховуємо з товарів
      if (!receipt.totals.SUM && receipt.goods.length > 0) {
        const calculatedSum = receipt.goods.reduce((sum: number, item: any) => {
          const cost = item.COST || item.cost || (item.AMOUNT || item.amount || 0) * (item.PRICE || item.price || 0);
          return sum + (parseFloat(cost) || 0);
        }, 0);
        receipt.totals = { ...receipt.totals, SUM: calculatedSum };
      }

      logWithTimestamp(`✅ [Dilovod] Чек отримано. SUM: ${receipt.totals.SUM || 0}`);
      return receipt;

    } catch (error) {
      logWithTimestamp(`❌ [Dilovod] Помилка отримання фіскального чека:`, error);
      throw error;
    }
  }


  /**
   * AUTO MODE: Автоматична перевірка замовлень з неповними даними
   * Використання: Cron job + API endpoint з auto: true
   */
  async checkOrderStatuses(limit: number = 100): Promise<{
    success: boolean;
    message: string;
    updatedCount: number;
    errors?: any[];
    data: any[];
  }> {
    const orderNumbers = await this.fetchIncompleteOrderNumbers(limit);
    return this.processOrderCheck(orderNumbers);
  }

  /**
   * MANUAL MODE: Перевірка конкретних номерів замовлень
   * Використання: UI з масивом orderNumbers
   */
  async checkOrdersByNumbers(orderNumbers: string[]): Promise<{
    success: boolean;
    message: string;
    updatedCount: number;
    errors?: any[];
    data: any[];
  }> {
    return this.processOrderCheck(orderNumbers);
  }

  /**
   * ПРИВАТНИЙ: Вибірка замовлень з неповними даними в Dilovod
   */
  private async fetchIncompleteOrderNumbers(limit: number): Promise<string[]> {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
      // Дата межі для повторної перевірки cashIn (24 години тому)
      const cashInCheckThreshold = new Date();
      cashInCheckThreshold.setHours(cashInCheckThreshold.getHours() - 24);

      // Знаходимо замовлення з неповними даними
      const orders = await prisma.order.findMany({
        where: {
          AND: [
            {
              OR: [
                // Базові поля для всіх статусів >= '2'
                { dilovodDocId: null },
                { dilovodExportDate: null },
                // CashIn: перевіряємо тільки якщо немає дати АБО остання перевірка була >24 год тому
                {
                  AND: [
                    { dilovodCashInDate: null },
                    {
                      OR: [
                        { dilovodCashInLastChecked: null },
                        { dilovodCashInLastChecked: { lt: cashInCheckThreshold } }
                      ]
                    }
                  ]
                },
                { // Для status >= '3' додатково перевіряємо dilovodSaleExportDate
                  AND: [
                    { status: { gte: '3' } },
                    { dilovodSaleExportDate: null }
                  ]
                }
              ]
            },
            // Тільки підтверджені та вище (виключаємо "Нові")
            { status: { gte: '2' } },
            // Виключаємо неактуальні статуси
            { status: { notIn: ['1', '6', '7', '8'] } }
          ]
        },
        orderBy: { orderDate: 'desc' },
        take: limit,
        select: {
          orderNumber: true,
          sajt: true,
          status: true
        }
      });

      await prisma.$disconnect();

      if (orders.length === 0) {
        logWithTimestamp('Немає замовлень з неповними даними для перевірки');
        return [];
      }

      logWithTimestamp(`Знайдено ${orders.length} замовлень з неповними даними`);

      // Повертаємо номери як є (вони вже у правильному форматі в БД)
      return orders.map(o => o.orderNumber);
    } catch (error) {
      await prisma.$disconnect();
      throw error;
    }
  }

  /**
   * ПРИВАТНИЙ: Спільна логіка перевірки замовлень в Dilovod
   */
  private async processOrderCheck(orderNumbers: string[]): Promise<{
    success: boolean;
    message: string;
    updatedCount: number;
    errors?: any[];
    data: any[];
  }> {
    const { PrismaClient } = await import('@prisma/client');
    const { orderDatabaseService } = await import('../orderDatabaseService.js');
    const prisma = new PrismaClient();

    try {
      if (orderNumbers.length === 0) {
        return {
          success: true,
          message: 'No orders to check',
          data: [],
          updatedCount: 0
        };
      }

      logWithTimestamp(`=== Перевірка ${orderNumbers.length} замовлень в Dilovod ===`);

      const results = [];
      const contractIds: string[] = [];
      const orderMap = new Map<string, { orderNumber: string; dilovodId: string; dilovodExportDate: string | Date; status?: string }>();

      // Перевіряємо в локальній базі, які дані вже є (шукаємо за повним номером як є)
      const checks = await Promise.all(
        orderNumbers
          .filter(num => num)
          .map(async num => {
            const existing = await orderDatabaseService.getOrderByExternalId(num);

            return {
              num,
              contractId: existing?.dilovodDocId || null,
              dilovodExportDate: existing?.dilovodExportDate || null,
              dilovodSaleExportDate: existing?.dilovodSaleExportDate || null,
              dilovodCashInDate: existing?.dilovodCashInDate || null,
              status: existing?.status || '0'
            };
          })
      );

      const validOrders = checks.filter(item => !item.contractId).map(item => item.num);
      const passedOrders = checks.filter(item => item.contractId);

      // Обробляємо замовлення, які вже мають contractId
      for (const item of passedOrders) {
        logWithTimestamp(`Замовлення ${item.num} вже має dilovodDocId — буде оновлено додаткові поля`);

        contractIds.push(item.contractId);
        orderMap.set(item.contractId, {
          orderNumber: item.num,
          dilovodId: item.contractId,
          dilovodExportDate: item.dilovodExportDate,
          status: item.status
        });

        results.push({
          orderNumber: item.num,
          dilovodId: item.contractId,
          dilovodExportDate: item.dilovodExportDate,
          dilovodSaleExportDate: item.dilovodSaleExportDate,
          dilovodCashInDate: item.dilovodCashInDate,
          updatedCount: 0,
          success: true,
          warnings: ['Замовлення вже має dilovodDocId — буде оновлено додаткові поля']
        });
      }

      // Шукаємо нові замовлення в Dilovod API
      const dilovodOrders = validOrders.length > 0 ? (await this.getOrderByNumber(validOrders)).flat() : [];

      // Оновлюємо базову інформацію (dilovodDocId, dilovodExportDate)
      for (const dilovodOrder of dilovodOrders) {
        if (!dilovodOrder.number) {
          results.push({
            orderNumber: dilovodOrder.number || 'unknown',
            error: 'Missing number or id in Dilovod order',
            success: false
          });
          continue;
        }

        const orderNumber = String(dilovodOrder.number);
        const contractId = dilovodOrder.id;

        try {
          const updateData: any = {
            dilovodExportDate: new Date(dilovodOrder.date).toISOString(),
            dilovodDocId: contractId
          };

          const updatedOrder = await prisma.order.updateMany({
            where: { orderNumber: orderNumber },
            data: updateData
          });

          if (updatedOrder.count > 0) {
            contractIds.push(contractId);
            orderMap.set(contractId, {
              orderNumber,
              dilovodId: dilovodOrder.id,
              dilovodExportDate: dilovodOrder.date
            });

            results.push({
              orderNumber: orderNumber,
              dilovodId: dilovodOrder.id,
              dilovodExportDate: dilovodOrder.date,
              updatedCount: updatedOrder.count,
              success: true
            });
          } else {
            results.push({
              orderNumber: orderNumber,
              dilovodId: dilovodOrder.id,
              error: 'Order not found in local database',
              success: false
            });
          }
        } catch (err) {
          results.push({
            orderNumber: orderNumber,
            dilovodId: dilovodOrder.id,
            error: err instanceof Error ? err.message : String(err),
            success: false
          });
        }
      }

      // Батч-запит для sale/cashIn документів (через contract!)
      if (contractIds.length > 0) {
        try {
          // Отримуємо тільки ті замовлення, що відповідають нашим orderNumbers
          const orderNumbersFromMap = Array.from(orderMap.values()).map(o => o.orderNumber);
          
          const existingOrders = await prisma.order.findMany({
            where: {
              AND: [
                { dilovodDocId: { in: contractIds } },
                { orderNumber: { in: orderNumbersFromMap } }
              ]
            },
            select: {
              orderNumber: true,
              dilovodDocId: true,
              dilovodSaleExportDate: true,
              dilovodCashInDate: true,
              status: true
            }
          });

          // Sale потрібен тільки для status >= '3'
          const needSaleRequest = contractIds.filter(id => {
            const order = existingOrders.find(o => o.dilovodDocId === id);
            const orderStatus = parseInt(order?.status || '0');
            return order && orderStatus >= 3 && !order.dilovodSaleExportDate;
          });
          
          // CashIn потрібен для всіх
          const needCashInRequest = contractIds.filter(id => {
            const order = existingOrders.find(o => o.dilovodDocId === id);
            return !order || !order.dilovodCashInDate;
          });

          let saleDocuments: any[] = [];
          let cashInDocuments: any[] = [];

          if (needSaleRequest.length > 0) {
            logWithTimestamp(`Виконуємо запит getDocuments() для ${needSaleRequest.length} contract (sale)...`);
            saleDocuments = await this.getDocuments(needSaleRequest, 'sale');
          }
          if (needCashInRequest.length > 0) {
            logWithTimestamp(`Виконуємо запит getDocuments() для ${needCashInRequest.length} contract (cashIn)...`);
            cashInDocuments = await this.getDocuments(needCashInRequest, 'cashIn');
          }

          // Групуємо за contract (або baseDoc - вони ідентичні)
          const groupByContract = (docs: any[]) => {
            const map = new Map<string, any>();
            for (const d of docs) {
              // Використовуємо contract або baseDoc як ключ
              const contractKey = d?.contract || d?.baseDoc;
              if (!contractKey) continue;
              if (!map.has(contractKey)) {
                map.set(contractKey, d);
              }
            }
            return map;
          };

          const saleByContract = groupByContract(saleDocuments);
          const cashInByContract = groupByContract(cashInDocuments);

          // Оновлюємо дати документів
          for (const contractId of contractIds) {
            const orderInfo = orderMap.get(contractId);
            if (!orderInfo) continue;

            const localOrder = existingOrders.find(o => o.dilovodDocId === contractId);
            const updateData: any = {};

            // Sale тільки для status >= '3'
            const orderStatus = parseInt(localOrder?.status || '0');
            if (orderStatus >= 3 && !localOrder?.dilovodSaleExportDate && saleByContract.get(contractId)?.date) {
              updateData.dilovodSaleExportDate = new Date(saleByContract.get(contractId).date).toISOString();
            }
            
            // CashIn для всіх + оновлюємо дату останньої перевірки
            if (!localOrder?.dilovodCashInDate) {
              if (cashInByContract.get(contractId)?.date) {
                // Знайдено документ cashIn - зберігаємо дату
                updateData.dilovodCashInDate = new Date(cashInByContract.get(contractId).date).toISOString();
              }
              // Завжди оновлюємо дату останньої перевірки (навіть якщо документ не знайдено)
              updateData.dilovodCashInLastChecked = new Date().toISOString();
            }

            if (Object.keys(updateData).length > 0) {
              await prisma.order.updateMany({
                where: { orderNumber: orderInfo.orderNumber },
                data: updateData
              });

              const resultIndex = results.findIndex(r => r.orderNumber === orderInfo.orderNumber);
              if (resultIndex !== -1) {
                results[resultIndex] = {
                  ...results[resultIndex],
                  dilovodSaleExportDate: updateData.dilovodSaleExportDate || localOrder?.dilovodSaleExportDate,
                  updatedCountSale: updateData.dilovodSaleExportDate ? 1 : 0,
                  dilovodCashInDate: updateData.dilovodCashInDate || localOrder?.dilovodCashInDate,
                  updatedCountCashIn: updateData.dilovodCashInDate ? 1 : 0
                };
              } else {
                results.push({
                  orderNumber: orderInfo.orderNumber,
                  updatedCount: updateData.dilovodSaleExportDate || updateData.dilovodCashInDate ? 1 : 0,
                  success: true
                });
              }
            }
          }
          logWithTimestamp('Оновлення документів Sale/CashIn завершено (запити лише для відсутніх)');
        } catch (err) {
          logWithTimestamp('Помилка під час оновлення Sale/CashIn:', err);
        }
      }

      // Підсумовуємо результати
      const successCount = results.filter(r => r.success).length;
      const errorCount = results.length - successCount;
      const hasError = errorCount > 0;
      
      // Підраховуємо загальну кількість оновлень (включаючи Sale і CashIn)
      const updatedCount = results.reduce((acc, r) => {
        const baseUpdates = r.updatedCount || 0;
        const saleUpdates = r.updatedCountSale || 0;
        const cashInUpdates = r.updatedCountCashIn || 0;
        return acc + baseUpdates + saleUpdates + cashInUpdates;
      }, 0);

      const errorDetails = hasError
        ? results.filter(r => !r.success).map(r => ({
          orderNumber: r.orderNumber,
          dilovodId: r.dilovodId,
          error: r.error
        }))
        : undefined;

      let message = '';
      if (hasError) {
        message = `Перевірка завершена з помилками (оновлено ${successCount} замовлень, ${errorCount} з помилками)`;
      } else if (updatedCount === 0) {
        message = 'Перевірка завершена: жодних нових даних не було оновлено.';
      } else {
        message = `Перевірка завершена (оновлено ${successCount} ${pluralize(successCount, 'замовлення', 'замовлення', 'замовлень')}, всього ${updatedCount} ${pluralize(updatedCount, 'зміна', 'зміни', 'змін')}).`;
      }

      return {
        success: !hasError,
        message,
        updatedCount: updatedCount,
        errors: errorDetails,
        data: results,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during order status check';
      logWithTimestamp('CRON: Помилка перевірки замовлення в Dilovod:', errorMessage);
      return {
        success: false,
        message: `Dilovod API error: ${errorMessage}`,
        updatedCount: 0,
        data: [],
        errors: [{ error: errorMessage }]
      };
    }
  }


  async disconnect(): Promise<void> {
    logWithTimestamp('Закриваємо з\'єднання DilovodService...');

    await Promise.all([
      this.cacheManager.disconnect(),
      this.syncManager.disconnect()
    ]);

    logWithTimestamp('З\'єднання DilovodService закриті');
  }
}

export const dilovodService = new DilovodService();
