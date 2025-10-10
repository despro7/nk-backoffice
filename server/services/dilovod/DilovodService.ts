// Основной сервис Dilovod - координатор всех модулей

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
    
    logWithTimestamp('DilovodService инициализирован');
  }

  // ===== ОСНОВНЫЕ ФУНКЦИИ СИНХРОНИЗАЦИИ =====

  // Полная синхронизация товаров с Dilovod
  async syncProductsWithDilovod(): Promise<DilovodSyncResult> {
    try {
      logWithTimestamp('\n🚀 === НАЧАЛО СИНХРОНИЗАЦИИ ТОВАРОВ С DILOVOD ===');

      // Проверяем, включена ли синхронизация Dilovod
      const isEnabled = await syncSettingsService.isSyncEnabled('dilovod');
      if (!isEnabled) {
        logWithTimestamp('❌ Синхронизация Dilovod отключена в настройках');
        return {
          success: false,
          message: 'Синхронизация Dilovod отключена в настройках',
          syncedProducts: 0,
          syncedSets: 0,
          errors: ['Синхронизация Dilovod отключена']
        };
      }

      logWithTimestamp('✅ Синхронизация Dilovod включена, продолжаем...');

      // Шаг 1: Получение SKU товаров из WordPress (прямой запрос без кеша)
      logWithTimestamp('📋 Шаг 1: Получение SKU товаров из WordPress...');
      const skus = await this.fetchSkusDirectlyFromWordPress();
      
      if (skus.length === 0) {
        logWithTimestamp('❌ Не найдено SKU товаров для синхронизации');
        return {
          success: false,
          message: 'Не найдено SKU товаров для синхронизации',
          syncedProducts: 0,
          syncedSets: 0,
          errors: []
        };
      }

      logWithTimestamp(`✅ Получено ${skus.length} SKU для синхронизации`);
      logWithTimestamp('📋 SKU:', skus.slice(0, 10));
      if (skus.length > 10) {
        logWithTimestamp(`... и еще ${skus.length - 10}`);
      }

      // Шаг 2: Получение информации о товарах и комплектах из Dilovod
      logWithTimestamp('\n📋 Шаг 2: Получение информации о товарах и комплектах из Dilovod...');
      const dilovodProducts = await this.getGoodsInfoWithSetsOptimized(skus);
      
      if (!dilovodProducts || dilovodProducts.length === 0) {
        logWithTimestamp('❌ Не удалось получить данные из Dilovod');
        return {
          success: false,
          message: 'Не удалось получить данные из Dilovod',
          syncedProducts: 0,
          syncedSets: 0,
          errors: []
        };
      }

      logWithTimestamp(`✅ Получено ${dilovodProducts.length} товаров из Dilovod`);
      
      // Анализируем полученные данные
      const productsWithSets = dilovodProducts.filter(p => p.set && p.set.length > 0);
      const regularProducts = dilovodProducts.filter(p => !p.set || p.set.length === 0);
      
      logWithTimestamp(`📊 Анализ полученных данных:`);
      logWithTimestamp(`  - Всего товаров: ${dilovodProducts.length}`);
      logWithTimestamp(`  - Комплектов: ${productsWithSets.length}`);
      logWithTimestamp(`  - Обычных товаров: ${regularProducts.length}`);
      
      if (productsWithSets.length > 0) {
        logWithTimestamp(`🎯 Найденные комплекты:`);
        productsWithSets.forEach((product, index) => {
          logWithTimestamp(`  ${index + 1}. ${product.sku} - ${product.name} (${product.set.length} компонентов)`);
        });
      }

      // Шаг 3: Синхронизация с базой данных
      logWithTimestamp('\n📋 Шаг 3: Синхронизация с базой данных...');
      const syncResult = await this.syncManager.syncProductsToDatabase(dilovodProducts);
      
      // Шаг 4: Позначення застарілих товарів (які є в БД але немає в WordPress)
      logWithTimestamp('\n📋 Шаг 4: Позначення застарілих товарів...');
      await this.syncManager.markOutdatedProducts(skus);
      
      logWithTimestamp('\n✅ === СИНХРОНИЗАЦИЯ ЗАВЕРШЕНА ===');
      logWithTimestamp(`Результат: ${syncResult.message}`);
      logWithTimestamp(`Успешно: ${syncResult.success ? 'ДА' : 'НЕТ'}`);
      
      return syncResult;

    } catch (error) {
      logWithTimestamp('\n❌ === ОШИБКА СИНХРОНИЗАЦИИ ===');
      logWithTimestamp('Ошибка синхронизации с Dilovod:', error);
      return {
        success: false,
        message: `Ошибка синхронизации: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        syncedProducts: 0,
        syncedSets: 0,
        errors: [error instanceof Error ? error.message : 'Неизвестная ошибка']
      };
    }
  }

  // ===== ФУНКЦИИ ПОЛУЧЕНИЯ ДАННЫХ =====

  // Получение информации о товарах с комплектами (оптимизированная версия)
  async getGoodsInfoWithSetsOptimized(skuList: string[]): Promise<DilovodProduct[]> {
    try {
      logWithTimestamp('Получаем информацию о товарах и комплектах из Dilovod...');
      logWithTimestamp('SKU для обработки:', skuList);
      
      // Получаем товары с ценами
      const pricesResponse = await this.apiClient.getGoodsWithPrices(skuList);
      logWithTimestamp(`Получено ${pricesResponse.length} товаров с ценами`);
      logWithTimestamp('RAW pricesResponse (first 2):', Array.isArray(pricesResponse) ? pricesResponse.slice(0, 2) : pricesResponse);
      
      // Получаем товары из каталога для дополнительной информации
      const goodsResponse = await this.apiClient.getGoodsFromCatalog(skuList);
      logWithTimestamp(`Получено ${goodsResponse.length} товаров из каталога`);
      logWithTimestamp('RAW goodsResponse (first 2):', Array.isArray(goodsResponse) ? goodsResponse.slice(0, 2) : goodsResponse);
      
      // Обрабатываем данные через процессор
      const result = await this.dataProcessor.processGoodsWithSets(pricesResponse, goodsResponse);
      
      return result;
      
    } catch (error) {
      logWithTimestamp('Ошибка получения информации о товарах с комплектами:', error);
      throw error;
    }
  }

  // Получение остатков товаров по списку SKU
  async getBalanceBySkuList(): Promise<DilovodStockBalance[]> {
    try {
      logWithTimestamp('Получаем остатки товаров по списку SKU...');
      
      const skus = await this.fetchSkusDirectlyFromWordPress();
      if (skus.length === 0) {
        return [];
      }

      const stockResponse = await this.apiClient.getStockBalance(skus);
      const processedStock = this.dataProcessor.processStockBalance(stockResponse);
      
      logWithTimestamp(`Обработано ${processedStock.length} товаров с остатками`);
      
      return processedStock.map(item => ({
        sku: item.sku,
        name: item.name,
        mainStorage: item.mainStorage,
        kyivStorage: item.kyivStorage,
        total: item.total
      }));
      
    } catch (error) {
      logWithTimestamp('Ошибка получения остатков по SKU:', error);
      throw error;
    }
  }

  // Новая функция: обновление остатков товаров в БД
  async updateStockBalancesInDatabase(): Promise<{
    success: boolean;
    message: string;
    updatedProducts: number;
    errors: string[];
  }> {
    try {
      logWithTimestamp('\n🔄 === ОБНОВЛЕНИЕ ОСТАТКОВ ТОВАРОВ В БД ===');
      
      // Получаем актуальные остатки из Dilovod
      const stockBalances = await this.getBalanceBySkuList();
      
      if (stockBalances.length === 0) {
        return {
          success: false,
          message: 'Не удалось получить остатки из Dilovod',
          updatedProducts: 0,
          errors: []
        };
      }

      logWithTimestamp(`Получено ${stockBalances.length} товаров с остатками для обновления`);
      
      const errors: string[] = [];
      let updatedProducts = 0;

      // Обновляем остатки в базе данных
      for (const stockBalance of stockBalances) {
        try {
          const result = await this.syncManager.updateProductStockBalance(
            stockBalance.sku,
            stockBalance.mainStorage,
            stockBalance.kyivStorage
          );
          
          if (result.success) {
            updatedProducts++;
            logWithTimestamp(`✅ Остатки для ${stockBalance.sku} обновлены: Склад1=${stockBalance.mainStorage}, Склад2=${stockBalance.kyivStorage}`);
          } else {
            errors.push(`Ошибка обновления ${stockBalance.sku}: ${result.message}`);
          }
        } catch (error) {
          const errorMessage = `Ошибка обновления остатков ${stockBalance.sku}: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`;
          logWithTimestamp(errorMessage);
          errors.push(errorMessage);
        }
      }

      logWithTimestamp(`\n=== РЕЗУЛЬТАТ ОБНОВЛЕНИЯ ОСТАТКОВ ===`);
      logWithTimestamp(`Обновлено товаров: ${updatedProducts}`);
      logWithTimestamp(`Ошибок: ${errors.length}`);
      
      if (errors.length > 0) {
        logWithTimestamp(`Список ошибок:`);
        errors.forEach((error, index) => {
          logWithTimestamp(`${index + 1}. ${error}`);
        });
      }

      return {
        success: errors.length === 0,
        message: `Обновлено ${updatedProducts} товаров с остатками`,
        updatedProducts,
        errors
      };

    } catch (error) {
      logWithTimestamp('Ошибка обновления остатков в БД:', error);
      return {
        success: false,
        message: `Ошибка обновления остатков: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        updatedProducts: 0,
        errors: [error instanceof Error ? error.message : 'Неизвестная ошибка']
      };
    }
  }

  // ===== ТЕСТОВЫЕ ФУНКЦИИ =====

  // Тест подключения к Dilovod
  async testConnection(): Promise<DilovodTestResult> {
    try {
      logWithTimestamp('Тестируем подключение к Dilovod...');
      
      const isConnected = await this.apiClient.testConnection();
      
      if (isConnected) {
        return {
          success: true,
          message: 'Подключение к Dilovod успешно'
        };
      } else {
        return {
          success: false,
          message: 'Не удалось подключиться к Dilovod'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Ошибка тестирования подключения: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
      };
    }
  }

  // Тест получения только комплектов
  async testSetsOnly(): Promise<DilovodTestResult> {
    try {
      logWithTimestamp('\n🧪 === ТЕСТ ПОЛУЧЕНИЯ КОМПЛЕКТОВ ===');
      
      const skus = await this.fetchSkusDirectlyFromWordPress();
      if (skus.length === 0) {
        return {
          success: false,
          message: 'Нет SKU для тестирования'
        };
      }

      logWithTimestamp(`Получено ${skus.length} SKU для тестирования`);
      
      // Получаем товары из каталога
      const response = await this.apiClient.getGoodsFromCatalog(skus);
      
      if (!Array.isArray(response)) {
        return {
          success: false,
          message: 'Неожиданный формат ответа'
        };
      }

      // Анализируем ответ
      const setParentId = "1100300000001315";
      const potentialSets = response.filter((item: any) => item.parent === setParentId);
      const regularGoods = response.filter((item: any) => item.parent !== setParentId);
      
      logWithTimestamp(`\n📊 Анализ ответа:`);
      logWithTimestamp(`  - Всего товаров: ${response.length}`);
      logWithTimestamp(`  - Потенциальных комплектов (parent=${setParentId}): ${potentialSets.length}`);
      logWithTimestamp(`  - Обычных товаров: ${regularGoods.length}`);
      
      if (potentialSets.length > 0) {
        logWithTimestamp(`\n🎯 Потенциальные комплекты:`);
        potentialSets.forEach((item: any, index: number) => {
          logWithTimestamp(`  ${index + 1}. ID: ${item.id}, SKU: ${item.sku}, Название: ${item.id__pr || 'N/A'}`);
        });
      }
      
      return {
        success: true,
        message: `Тест завершен. Найдено ${potentialSets.length} потенциальных комплектов`,
        data: {
          totalGoods: response.length,
          potentialSets: potentialSets.length,
          regularGoods: regularGoods.length,
          response: response
        }
      };
      
    } catch (error) {
      logWithTimestamp('Ошибка тестирования комплектов:', error);
      return {
        success: false,
        message: `Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
      };
    }
  }

  // ===== ФУНКЦИИ УПРАВЛЕНИЯ КЕШЕМ =====

  // Получение SKU для тестирования
  async getTestSkus(): Promise<string[]> {
    return this.fetchSkusDirectlyFromWordPress();
  }

  // Получение статистики кеша
  async getCacheStats(): Promise<{
    hasCache: boolean;
    skuCount: number;
    lastUpdated: string | null;
    isExpired: boolean;
  }> {
    return this.cacheManager.getCacheStats();
  }

  // Принудительное обновление кеша
  async forceRefreshCache(): Promise<{ success: boolean; message: string; skuCount: number }> {
    return this.cacheManager.forceRefreshCache();
  }

  // ===== ФУНКЦИИ СТАТИСТИКИ =====

  // Получение статистики синхронизации
  async getSyncStats(): Promise<{
    totalProducts: number;
    productsWithSets: number;
    lastSync: string | null;
    categoriesCount: Array<{ name: string; count: number }>;
  }> {
    return this.syncManager.getSyncStats();
  }

  // Получение товаров по фильтрам
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

  // ===== ФУНКЦИИ ОЧИСТКИ =====

  // Очистка старых товаров
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
        
        // Получаем SKU товаров
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
          logWithTimestamp('Предупреждение: SQL запрос вернул 0 записей.');
          return [];
        }

        // Фильтруем только валидные SKU
        const validSkus = products
          .filter(product => product.sku && product.sku.trim() !== '')
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

  // ===== ЗАКРЫТИЕ СОЕДИНЕНИЙ =====

  // Закрытие всех соединений
  async disconnect(): Promise<void> {
    logWithTimestamp('Закрываем соединения DilovodService...');
    
    await Promise.all([
      this.cacheManager.disconnect(),
      this.syncManager.disconnect()
    ]);
    
    logWithTimestamp('Соединения DilovodService закрыты');
  }
}
