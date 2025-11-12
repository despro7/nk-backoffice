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

export class DilovodService {
  private apiClient: DilovodApiClient;
  private cacheManager: DilovodCacheManager;
  private dataProcessor: DilovodDataProcessor;
  private syncManager: DilovodSyncManager;

  constructor() {
    this.apiClient = new DilovodApiClient();
    this.cacheManager = new DilovodCacheManager();
    this.dataProcessor = new DilovodDataProcessor(this.apiClient);
    this.syncManager = new DilovodSyncManager();
    
    logWithTimestamp('DilovodService ініціалізований');
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

  // Повна синхронізація товарів з Dilovod
  async syncProductsWithDilovod(): Promise<DilovodSyncResult> {
    try {
      logWithTimestamp('\n🚀 === ПОЧАТОК СИНХРОНІЗАЦІЇ ТОВАРІВ З DILOVOD ===');

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

      logWithTimestamp('✅ Синхронізація Dilovod увімкнена, продовжуємо...');
      // Крок 1: Отримання SKU товарів з WordPress (прямий запит без кешу)
      logWithTimestamp('📋 Крок 1: Отримання SKU товарів з WordPress...');
      const skus = await this.fetchSkusDirectlyFromWordPress();
      
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
      
      // Крок 4: Позначення застарілих товарів (які є в БД але немає в WordPress)
      logWithTimestamp('\n📋 Крок 4: Позначення застарілих товарів...');
      await this.syncManager.markOutdatedProducts(skus);
      
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
      logWithTimestamp('RAW pricesResponse (first 2):', Array.isArray(pricesResponse) ? pricesResponse.slice(0, 2) : pricesResponse);
      
      // Отримуємо товари з каталогу для додаткової інформації
      const goodsResponse = await this.apiClient.getGoodsFromCatalog(skuList);
      logWithTimestamp(`Отримано ${goodsResponse.length} товарів з каталогу`);
      logWithTimestamp('RAW goodsResponse (first 2):', Array.isArray(goodsResponse) ? goodsResponse.slice(0, 2) : goodsResponse);
      
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
      
      const skus = await this.fetchSkusDirectlyFromWordPress();
      if (skus.length === 0) {
        return [];
      }

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
      logWithTimestamp('Пошук documents.sale за базовим документом:', baseDoc);
      const result = await this.apiClient.getDocuments(baseDoc, documentType === 'sale' ? 'sale' : 'cashIn');
      logWithTimestamp(`Знайдено ${result.length} documents.sale`);
      return result;
    } catch (error) {
      const errorMessage = `Помилка пошуку documents.sale: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
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
  async getStorages(): Promise<any[]> {
    try {
      logWithTimestamp('Отримання списку складів з Dilovod');
      const result = await this.apiClient.getStorages();
      logWithTimestamp(`Отримано ${result.length} складів`);
      return result;
    } catch (error) {
      const errorMessage = `Помилка отримання складів: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      logWithTimestamp(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Отримання рахунків з Dilovod
  async getCashAccounts(): Promise<any[]> {
    try {
      logWithTimestamp('Отримання списку рахунків з Dilovod');
      const result = await this.apiClient.getCashAccounts();
      logWithTimestamp(`Отримано ${result.length} рахунків`);
      return result;
    } catch (error) {
      const errorMessage = `Помилка отримання рахунків: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      logWithTimestamp(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Отримання форм оплати з Dilovod
  async getPaymentForms(): Promise<any[]> {
    try {
      logWithTimestamp('Отримання списку форм оплати з Dilovod');
      const result = await this.apiClient.getPaymentForms();
      logWithTimestamp(`Отримано ${result.length} форм оплати`);
      return result;
    } catch (error) {
      const errorMessage = `Помилка отримання форм оплати: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      logWithTimestamp(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Отримання фірм (власників рахунків) з Dilovod
  async getFirms(): Promise<any[]> {
    try {
      logWithTimestamp('Отримання списку фірм з Dilovod');
      const result = await this.apiClient.getFirms();
      logWithTimestamp(`Отримано ${result.length} фірм`);
      return result;
    } catch (error) {
      const errorMessage = `Помилка отримання фірм: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      logWithTimestamp(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // ===== ЗАКРИТТЯ ВСІХ З'ЄДНАНЬ =====
  async disconnect(): Promise<void> {
    logWithTimestamp('Закриваємо з\'єднання DilovodService...');
    
    await Promise.all([
      this.cacheManager.disconnect(),
      this.syncManager.disconnect()
    ]);
    
    logWithTimestamp('З\'єднання DilovodService закриті');
  }
}
