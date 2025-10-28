// Менеджер синхронизации товаров с базой данных

import crypto from 'crypto';
import { prisma } from '../../lib/utils.js';
import { DilovodProduct, DilovodSyncResult } from './DilovodTypes.js';
import { logWithTimestamp } from './DilovodUtils.js';
import { syncSettingsService } from '../syncSettingsService.js';

export class DilovodSyncManager {
  constructor() {
    // Используем централизованный prisma из utils.js
  }

  // Вычисление хеша данных товара из Dilovod (для определения изменений)
  private calculateDataHash(product: DilovodProduct): string {
    // Хешируем только данные которые приходят из Dilovod
    // НЕ включаем weight и manualOrder - это локальные данные
    const dataToHash = {
      name: product.name,
      costPerItem: product.costPerItem,
      currency: product.currency,
      categoryId: product.category.id,
      categoryName: product.category.name,
      set: product.set,
      additionalPrices: product.additionalPrices,
      dilovodId: product.id
    };
    
    const dataString = JSON.stringify(dataToHash);
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }

  // Основная функция синхронизации товаров с базой данных
  async syncProductsToDatabase(dilovodProducts: DilovodProduct[]): Promise<DilovodSyncResult> {
    try {
      logWithTimestamp('Начинаем синхронизацию товаров с базой данных...');
      logWithTimestamp(`Получено ${dilovodProducts.length} товаров для синхронизации`);
      
      const errors: string[] = [];
      let createdProducts = 0;
      let updatedProducts = 0;
      let skippedProducts = 0;
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
          const existingProduct = await prisma.product.findUnique({
            where: { sku: product.sku }
          });

          // Вычисляем хеш данных из Dilovod
          const newDataHash = this.calculateDataHash(product);

          if (existingProduct) {
            // Проверяем, изменились ли данные
            const dataChanged = existingProduct.dilovodDataHash !== newDataHash;
            
            if (dataChanged) {
              logWithTimestamp(`🔄 Данные товара ${product.sku} изменились, обновляем...`);
              
              const productData = this.prepareProductData(product, false); // false = существующий товар
              logWithTimestamp(`Данные для обновления:`, JSON.stringify(productData, null, 2));
              
              await prisma.product.update({
                where: { sku: product.sku },
                data: productData
              });
              logWithTimestamp(`✅ Товар ${product.sku} обновлен`);
              updatedProducts++;
            } else {
              logWithTimestamp(`⏭️  Товар ${product.sku} не изменился, пропускаем обновление`);
              skippedProducts++;
            }
          } else {
            // Создаем новый товар
            logWithTimestamp(`➕ Создаем новый товар ${product.sku}...`);
            
            const productData = this.prepareProductData(product, true); // true = новый товар
            logWithTimestamp(`Данные для создания:`, JSON.stringify(productData, null, 2));
            
            await prisma.product.create({
              data: {
                sku: product.sku,
                ...productData
              }
            });
            logWithTimestamp(`✅ Товар ${product.sku} создан`);
            createdProducts++;
          }
          
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

      const totalProcessed = createdProducts + updatedProducts + skippedProducts;
      
      logWithTimestamp(`\n=== РЕЗУЛЬТАТ СИНХРОНИЗАЦИИ ===`);
      logWithTimestamp(`📊 Всього оброблено товарів: ${totalProcessed}`);
      logWithTimestamp(`  ➕ Створено нових: ${createdProducts}`);
      logWithTimestamp(`  🔄 Оновлено: ${updatedProducts}`);
      logWithTimestamp(`  ⏭️  Пропущено (без змін): ${skippedProducts}`);
      logWithTimestamp(`  🎯 Комплектів: ${syncedSets}`);
      logWithTimestamp(`  ❌ Помилок: ${errors.length}`);
      
      if (errors.length > 0) {
        logWithTimestamp(`\nСписок помилок:`);
        errors.forEach((error, index) => {
          logWithTimestamp(`  ${index + 1}. ${error}`);
        });
      }

      const message = [
        `Оброблено ${totalProcessed} товарів`,
        createdProducts > 0 ? `створено ${createdProducts}` : null,
        updatedProducts > 0 ? `оновлено ${updatedProducts}` : null,
        skippedProducts > 0 ? `пропущено ${skippedProducts}` : null,
        syncedSets > 0 ? `комплектів ${syncedSets}` : null,
      ].filter(Boolean).join(', ');

      return {
        success: errors.length === 0,
        message,
        syncedProducts: createdProducts + updatedProducts, // Для зворотної сумісності
        syncedSets,
        createdProducts,
        updatedProducts,
        skippedProducts,
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
  private prepareProductData(product: DilovodProduct, isNew: boolean): any {
    // Вычисляем хеш данных из Dilovod
    const dilovodDataHash = this.calculateDataHash(product);
    
    const data: any = {
      name: product.name,
      costPerItem: product.costPerItem ? parseFloat(product.costPerItem) : null,
      currency: product.currency,
      categoryId: product.category.id ?? null,
      categoryName: product.category.name,
      set: product.set.length > 0 ? JSON.stringify(product.set) : null,
      additionalPrices: product.additionalPrices.length > 0 ? JSON.stringify(product.additionalPrices) : null,
      dilovodId: product.id,
      dilovodDataHash: dilovodDataHash,
      lastSyncAt: new Date()
    };
    
    // Вес і manualOrder встановлюємо ТІЛЬКИ для нових товарів
    // Для існуючих товарів НЕ перезаписуємо (захист локальних змін)
    if (isNew) {
      const weight = this.determineWeightByCategory(product.category.id);
      data.weight = weight;
      logWithTimestamp(`⚖️  Устанавливаем вес для нового товара: ${weight ?? 'не определен'} г`);
      
      const manualOrder = this.determineManualOrderByCategory(product.category.id);
      data.manualOrder = manualOrder;
      logWithTimestamp(`📋 Устанавливаем порядок сортировки: ${manualOrder}`);
    } else {
      logWithTimestamp(`🔒 Вес і порядок сортування не оновлюються (защита локальних змін)`);
    }
    
    return data;
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

  // Визначення порядку сортування за категорією
  private determineManualOrderByCategory(categoryId: number): number {
    // Перші страви - 1000
    if (categoryId === 1) {
      return 1000;
    }
    
    // Другі страви - 2000
    if (categoryId === 2) {
      return 2000;
    }
    
    // Комплекти - 3000
    if (categoryId === 3) {
      return 3000;
    }
    
    // За замовчуванням - 0 (в кінці списку)
    return 0;
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
      const totalProducts = await prisma.product.count();
      
      // Товары с комплектами
      const productsWithSets = await prisma.product.count({
        where: {
          set: {
            not: null
          }
        }
      });
      
      // Последняя синхронизация
      const lastSyncProduct = await prisma.product.findFirst({
        orderBy: {
          lastSyncAt: 'desc'
        },
        select: {
          lastSyncAt: true
        }
      });
      
      // Статистика по категориям
      const categoriesStats = await prisma.product.groupBy({
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
      
      const deletedProducts = await prisma.product.deleteMany({
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
          { name: { contains: search } },
          { sku: { contains: search } }
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
        prisma.product.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            lastSyncAt: 'desc'
          }
        }),
        prisma.product.count({ where })
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
    await prisma.$disconnect();
  }

  // Обновление остатков товара в базе данных
  async updateProductStockBalance(
    sku: string, 
    mainStorage: number, 
    kyivStorage: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Проверяем, существует ли товар
      const existingProduct = await prisma.product.findUnique({
        where: { sku }
      });

      if (!existingProduct) {
        return {
          success: false,
          message: `Товар с SKU ${sku} не найден в базе`
        };
      }

      // Обновляем остатки
      await prisma.product.update({
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

  // Позначення застарілих товарів (які є в БД але немає в WordPress)
  async markOutdatedProducts(currentSkus: string[]): Promise<void> {
    try {
      logWithTimestamp(`Позначаємо застарілі товари...`);
      logWithTimestamp(`Отримано ${currentSkus.length} актуальних SKU з WordPress`);
      
      // Створюємо Set для швидкого пошуку
      const currentSkusSet = new Set(currentSkus.map(sku => sku.toLowerCase().trim()));
      
      // Отримуємо всі товари з БД
      const allProducts = await prisma.product.findMany({
        select: {
          id: true,
          sku: true,
          name: true,
          isOutdated: true
        }
      });
      
      logWithTimestamp(`Всього товарів в БД: ${allProducts.length}`);
      
      let markedAsOutdated = 0;
      let unmarkedAsOutdated = 0;
      
      for (const product of allProducts) {
        const productSku = product.sku.toLowerCase().trim();
        const isInWordPress = currentSkusSet.has(productSku);
        
        // Якщо товар НЕ в WordPress але НЕ позначений як застарілий - позначаємо
        if (!isInWordPress && !product.isOutdated) {
          await prisma.product.update({
            where: { id: product.id },
            data: { isOutdated: true }
          });
          logWithTimestamp(`  ⚠️  Товар ${product.sku} (${product.name}) позначено як застарілий`);
          markedAsOutdated++;
        }
        
        // Якщо товар Є в WordPress але позначений як застарілий - знімаємо позначку
        if (isInWordPress && product.isOutdated) {
          await prisma.product.update({
            where: { id: product.id },
            data: { isOutdated: false }
          });
          logWithTimestamp(`  ✅ Товар ${product.sku} (${product.name}) знову актуальний`);
          unmarkedAsOutdated++;
        }
      }
      
      logWithTimestamp(`\n📊 Результат позначення застарілих товарів:`);
      logWithTimestamp(`  ⚠️  Позначено як застарілих: ${markedAsOutdated}`);
      logWithTimestamp(`  ✅ Знято позначку застарілості: ${unmarkedAsOutdated}`);
      
    } catch (error) {
      logWithTimestamp('Помилка позначення застарілих товарів:', error);
      // Не кидаємо помилку, щоб не зупиняти синхронізацію
    }
  }
}
