// Менеджер синхронизации товаров с базой данных

import { PrismaClient } from '@prisma/client';
import { DilovodProduct, DilovodSyncResult } from './DilovodTypes.js';
import { logWithTimestamp } from './DilovodUtils.js';
import { syncSettingsService } from '../syncSettingsService.js';

export class DilovodSyncManager {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  // Основная функция синхронизации товаров с базой данных
  async syncProductsToDatabase(dilovodProducts: DilovodProduct[]): Promise<DilovodSyncResult> {
    try {
      logWithTimestamp('Начинаем синхронизацию товаров с базой данных...');
      logWithTimestamp(`Получено ${dilovodProducts.length} товаров для синхронизации`);
      
      const errors: string[] = [];
      let syncedProducts = 0;
      let syncedSets = 0;

      for (const product of dilovodProducts) {
        try {
          logWithTimestamp(`\n--- Синхронизация товара ${product.sku} ---`);
          logWithTimestamp(`Название: ${product.name}`);
          logWithTimestamp(`Категория: ${product.category.name} (ID: ${product.category.id})`);
          logWithTimestamp(`Цена: ${product.costPerItem} ${product.currency}`);
          
          // Определяем и показываем вес
          const weight = this.determineWeightByCategory(product.category.id);
          if (weight) {
            logWithTimestamp(`⚖️ Вес: ${weight} гр (категория ID: ${product.category.id})`);
          } else {
            logWithTimestamp(`⚖️ Вес: не определен (категория ID: ${product.category.id})`);
          }
          
          logWithTimestamp(`Комплект: ${product.set.length > 0 ? 'ДА' : 'НЕТ'}`);
          
          if (product.set.length > 0) {
            logWithTimestamp(`Состав комплекта:`);
            product.set.forEach((item, index) => {
              logWithTimestamp(`  ${index + 1}. ${item.id} - ${item.quantity}`);
            });
          }
          
          logWithTimestamp(`Дополнительные цены: ${product.additionalPrices.length}`);
          
          // Проверяем, существует ли товар в базе
          const existingProduct = await this.prisma.product.findUnique({
            where: { sku: product.sku }
          });

          const productData = this.prepareProductData(product);
          logWithTimestamp(`Данные для сохранения:`, JSON.stringify(productData, null, 2));

          if (existingProduct) {
            // Обновляем существующий товар
            logWithTimestamp(`Обновляем существующий товар ${product.sku}...`);
            await this.prisma.product.update({
              where: { sku: product.sku },
              data: productData
            });
            logWithTimestamp(`✅ Товар ${product.sku} обновлен`);
          } else {
            // Создаем новый товар
            logWithTimestamp(`Создаем новый товар ${product.sku}...`);
            await this.prisma.product.create({
              data: {
                sku: product.sku,
                ...productData
              }
            });
            logWithTimestamp(`✅ Товар ${product.sku} создан`);
          }

          syncedProducts++;
          
          // Подсчитываем комплекты
          if (product.set && product.set.length > 0) {
            syncedSets++;
            logWithTimestamp(`🎯 Комплект ${product.sku} успешно синхронизирован (${product.set.length} компонентов)`);
          } else {
            logWithTimestamp(`📦 Обычный товар ${product.sku} синхронизирован`);
          }

        } catch (error) {
          const errorMessage = `Ошибка синхронизации товара ${product.sku}: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`;
          logWithTimestamp(errorMessage);
          errors.push(errorMessage);
        }
      }

      logWithTimestamp(`\n=== РЕЗУЛЬТАТ СИНХРОНИЗАЦИИ ===`);
      logWithTimestamp(`Синхронизировано товаров: ${syncedProducts}`);
      logWithTimestamp(`Синхронизировано комплектов: ${syncedSets}`);
      logWithTimestamp(`Ошибок: ${errors.length}`);
      
      if (errors.length > 0) {
        logWithTimestamp(`Список ошибок:`);
        errors.forEach((error, index) => {
          logWithTimestamp(`${index + 1}. ${error}`);
        });
      }

      return {
        success: errors.length === 0,
        message: `Синхронизировано ${syncedProducts} товаров, ${syncedSets} комплектов`,
        syncedProducts,
        syncedSets,
        errors
      };

    } catch (error) {
      logWithTimestamp('Ошибка синхронизации с базой данных:', error);
      return {
        success: false,
        message: `Ошибка синхронизации с базой данных: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        syncedProducts: 0,
        syncedSets: 0,
        errors: [error instanceof Error ? error.message : 'Неизвестная ошибка']
      };
    }
  }

  // Подготовка данных товара для сохранения
  private prepareProductData(product: DilovodProduct): any {
    // Автоматически определяем вес по ID категории
    const weight = this.determineWeightByCategory(product.category.id);
    
    return {
      name: product.name,
      costPerItem: product.costPerItem ? parseFloat(product.costPerItem) : null,
      currency: product.currency,
      categoryId: product.category.id || null,
      categoryName: product.category.name,
      weight: weight, // Добавляем вес
      set: product.set.length > 0 ? JSON.stringify(product.set) : null,
      additionalPrices: product.additionalPrices.length > 0 ? JSON.stringify(product.additionalPrices) : null,
      dilovodId: product.id,
      lastSyncAt: new Date()
    };
  }

  // Определение веса товара по категории
  private determineWeightByCategory(categoryId: number): number | null {
    // Первые блюда - 400 гр
    if (categoryId === 1) {
      return 400;
    }
    
    // Вторые блюда - 300 гр
    if (categoryId === 2) {
      return 300;
    }
    
    // По умолчанию не устанавливаем вес
    return null;
  }

  // Получение статистики синхронизации
  async getSyncStats(): Promise<{
    totalProducts: number;
    productsWithSets: number;
    lastSync: string | null;
    categoriesCount: Array<{ name: string; count: number }>;
  }> {
    try {
      // Общее количество товаров
      const totalProducts = await this.prisma.product.count();
      
      // Товары с комплектами
      const productsWithSets = await this.prisma.product.count({
        where: {
          set: {
            not: null
          }
        }
      });
      
      // Последняя синхронизация
      const lastSyncProduct = await this.prisma.product.findFirst({
        orderBy: {
          lastSyncAt: 'desc'
        },
        select: {
          lastSyncAt: true
        }
      });
      
      // Статистика по категориям
      const categoriesStats = await this.prisma.product.groupBy({
        by: ['categoryName'],
        _count: {
          categoryName: true
        },
        where: {
          categoryName: {
            not: null
          }
        }
      });
      
      const categoriesCount = categoriesStats.map(stat => ({
        name: stat.categoryName || 'Без категории',
        count: stat._count.categoryName
      }));
      
      return {
        totalProducts,
        productsWithSets,
        lastSync: lastSyncProduct?.lastSyncAt?.toISOString() || null,
        categoriesCount
      };
      
    } catch (error) {
      logWithTimestamp('Ошибка получения статистики синхронизации:', error);
      throw error;
    }
  }

  // Очистка старых товаров (не синхронизированных более N дней)
  async cleanupOldProducts(daysOld?: number): Promise<{
    success: boolean;
    message: string;
    deletedCount: number;
  }> {
    try {
      // Если daysOld не указан, получаем значение из настроек
      if (daysOld === undefined) {
        try {
          const settings = await syncSettingsService.getSyncSettings();
          daysOld = settings.dilovod.cleanupDaysOld;
        } catch (error) {
          logWithTimestamp('Ошибка получения настроек Dilovod, используем значение по умолчанию:', error);
          daysOld = 30;
        }
      }

      logWithTimestamp(`Очистка товаров, не синхронизированных более ${daysOld} дней...`);
      
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
      
      const deletedProducts = await this.prisma.product.deleteMany({
        where: {
          lastSyncAt: {
            lt: cutoffDate
          }
        }
      });
      
      logWithTimestamp(`Удалено ${deletedProducts.count} старых товаров`);
      
      return {
        success: true,
        message: `Удалено ${deletedProducts.count} старых товаров`,
        deletedCount: deletedProducts.count
      };
      
    } catch (error) {
      logWithTimestamp('Ошибка очистки старых товаров:', error);
      return {
        success: false,
        message: `Ошибка очистки: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        deletedCount: 0
      };
    }
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
    try {
      const { page = 1, limit = 20, search, category, hasSets } = filters;
      const skip = (page - 1) * limit;
      
      // Строим условия поиска
      const where: any = {};
      
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } }
        ];
      }
      
      if (category) {
        where.categoryName = category;
      }
      
      if (hasSets !== undefined) {
        if (hasSets) {
          where.set = { not: null };
        } else {
          where.set = null;
        }
      }
      
      // Получаем товары
      const [products, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            lastSyncAt: 'desc'
          }
        }),
        this.prisma.product.count({ where })
      ]);
      
      const pages = Math.ceil(total / limit);
      
      return {
        products,
        pagination: {
          page,
          limit,
          total,
          pages
        }
      };
      
    } catch (error) {
      logWithTimestamp('Ошибка получения товаров:', error);
      throw error;
    }
  }

  // Закрытие соединения с базой данных
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  // Обновление остатков товара в базе данных
  async updateProductStockBalance(
    sku: string, 
    mainStorage: number, 
    kyivStorage: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Проверяем, существует ли товар
      const existingProduct = await this.prisma.product.findUnique({
        where: { sku }
      });

      if (!existingProduct) {
        return {
          success: false,
          message: `Товар с SKU ${sku} не найден в базе`
        };
      }

      // Обновляем остатки
      await this.prisma.product.update({
        where: { sku },
        data: {
          stockBalanceByStock: JSON.stringify({
            "1": mainStorage,    // Склад 1 (главный)
            "2": kyivStorage     // Склад 2 (киевский)
          })
        }
      });

      return {
        success: true,
        message: `Остатки для ${sku} обновлены`
      };

    } catch (error) {
      logWithTimestamp(`Ошибка обновления остатков для ${sku}:`, error);
      return {
        success: false,
        message: `Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
      };
    }
  }
}
