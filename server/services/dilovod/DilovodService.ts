// Основной сервис Dilovod - координатор всех модулей

import {
  DilovodApiClient,
  DilovodCacheManager,
  DilovodDataProcessor,
  DilovodSyncManager,
  DilovodProduct,
  DilovodSyncResult,
  DilovodTestResult,
  DilovodStockBalance
} from './index';
import { logWithTimestamp } from './DilovodUtils';
import { syncSettingsService } from '../syncSettingsService';

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

      // Шаг 1: Получение SKU товаров из WordPress
      logWithTimestamp('📋 Шаг 1: Получение SKU товаров из WordPress...');
      const skus = await this.cacheManager.getInStockSkusFromWordPress();
      
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
      
      // Получаем товары из каталога для дополнительной информации
      const goodsResponse = await this.apiClient.getGoodsFromCatalog(skuList);
      logWithTimestamp(`Получено ${goodsResponse.length} товаров из каталога`);
      
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
      
      const skus = await this.cacheManager.getInStockSkusFromWordPress();
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
      
      const skus = await this.cacheManager.getInStockSkusFromWordPress();
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
    return this.cacheManager.getInStockSkusFromWordPress();
  }

  // Очистка кеша SKU
  async clearSkuCache(): Promise<{ success: boolean; message: string }> {
    return this.cacheManager.clearSkuCache();
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
