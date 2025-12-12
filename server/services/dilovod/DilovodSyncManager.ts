// Менеджер синхронізації товарів з базою даних 

import crypto from 'crypto';
import { prisma } from '../../lib/utils.js';
import { DilovodProduct, DilovodSyncResult } from './DilovodTypes.js';
import { logWithTimestamp } from './DilovodUtils.js';
import { syncSettingsService } from '../syncSettingsService.js';

export class DilovodSyncManager {
  constructor() {
    // Використовуємо централізований prisma з utils.js 
  }

  // Обчислення хешу даних товару з Dilovod (для визначення змін) 
  private calculateDataHash(product: DilovodProduct): string {
    // Хешуємо тільки дані, які надходять з Dilovod 
    // НЕ включаємо weight і manualOrder - це локальні дані 
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

  // Основна функція синхронізації товарів з базою даних  
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
          
          // Визначаємо і показуємо вагу  
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
          
          // Перевіряємо, чи існує товар у базі
          const existingProduct = await prisma.product.findUnique({
            where: { sku: product.sku }
          });

          // Обчислюємо хеш даних з Dilovod
          const newDataHash = this.calculateDataHash(product);

          if (existingProduct) {
            // Перевіряємо, чи змінилися дані
            const dataChanged = existingProduct.dilovodDataHash !== newDataHash;
            
            if (dataChanged) {
              logWithTimestamp(`🔄 Данные товара ${product.sku} изменились, обновляем...`);
              
              const productData = this.prepareProductData(product, false); // false = існуючий товар
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
            // Створюємо новий товар
            logWithTimestamp(`➕ Создаем новый товар ${product.sku}...`);
            
            const productData = this.prepareProductData(product, true); // true = новий товар
            logWithTimestamp(`Данные для создания:`, JSON.stringify(productData, null, 2));
            
            await prisma.product.create({
              data: ({
                sku: product.sku,
                ...productData
              } as any)
            });
            logWithTimestamp(`✅ Товар ${product.sku} создан`);
            createdProducts++;
          }
          
          // Підраховуємо комплекти
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

  // Підготовка даних товару для збереження
  private prepareProductData(product: DilovodProduct, isNew: boolean): any {
    // Обчислюємо хеш даних з Dilovod
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
    
    // Вага і manualOrder встановлюємо ТІЛЬКИ для нових товарів
    // Для існуючих товарів НЕ перезаписуємо (захист локальних змін)
    if (isNew) {
      const weight = this.determineWeightByCategory(product.category.id);
      data.weight = weight;
      logWithTimestamp(`⚖️  Встановлюємо вагу для нового товару: ${weight ?? 'не визначено'} г`);
      
      const manualOrder = this.determineManualOrderByCategory(product.category.id);
      data.manualOrder = manualOrder;
      logWithTimestamp(`📋 Встановлюємо порядок сортування: ${manualOrder}`);
    } else {
      logWithTimestamp(`🔒 Вага і порядок сортування не оновлюються (захист локальних змін)`);
    }
    
    return data;
  }

  // Визначення ваги товару за категорією
  private determineWeightByCategory(categoryId: number): number | null {
    // Перші страви - 400 г
    if (categoryId === 1) {
      return 400;
    }
    
    // Другі страви - 300 г
    if (categoryId === 2) {
      return 300;
    }
    
    // За замовчуванням не встановлюємо вагу
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

  // Отримання статистики синхронізації
  async getSyncStats(): Promise<{
    totalProducts: number;
    productsWithSets: number;
    lastSync: string | null;
    categoriesCount: Array<{ name: string; count: number }>;
  }> {
    try {
      // Загальна кількість товарів
      const totalProducts = await prisma.product.count();
      
      // Товари з комплектами
      const productsWithSets = await prisma.product.count({
        where: {
          set: {
            not: null
          }
        }
      });
      
      // Остання синхронізація
      const lastSyncProduct = await prisma.product.findFirst({
        orderBy: {
          lastSyncAt: 'desc'
        },
        select: {
          lastSyncAt: true
        }
      });
      
      // Статистика за категоріями
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

  // Очищення старих товарів (не синхронізованих більше N днів)
  async cleanupOldProducts(daysOld?: number): Promise<{
    success: boolean;
    message: string;
    deletedCount: number;
  }> {
    try {
      // Якщо daysOld не вказано, отримуємо значення з налаштувань
      if (daysOld === undefined) {
        try {
          const settings = await syncSettingsService.getSyncSettings();
          daysOld = settings.dilovod.cleanupDaysOld;
        } catch (error) {
          logWithTimestamp('Помилка отримання налаштувань Dilovod, використовуємо значення за замовчуванням:', error);
          daysOld = 30;
        }
      }

      logWithTimestamp(`Очищення товарів, не синхронізованих більше ${daysOld} днів...`);
      
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
    try {
      const { page = 1, limit = 20, search, category, hasSets } = filters;
      const skip = (page - 1) * limit;
      
      // Створюємо умови пошуку
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
      
      // Отримуємо товари
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
      logWithTimestamp('Помилка отримання товарів:', error);
      throw error;
    }
  }

  // Закриття з'єднання з базою даних
  async disconnect(): Promise<void> {
    await prisma.$disconnect();
  }

  // Оновлення залишків товару в базі даних
  async updateProductStockBalance(
    sku: string, 
    mainStorage: number, 
    kyivStorage: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Перевіряємо, чи існує товар
      const existingProduct = await prisma.product.findUnique({
        where: { sku }
      });

      if (!existingProduct) {
        return {
          success: false,
          message: `Товар с SKU ${sku} не найден в базе`
        };
      }

      // Оновлюємо залишки
      await prisma.product.update({
        where: { sku },
        data: {
          stockBalanceByStock: JSON.stringify({
            "1": mainStorage,    // Склад 1 (головний)
            "2": kyivStorage     // Склад 2 (київський)
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

      // Завантажуємо whitelist зі служби налаштувань (таблиця settings_wp_sku)
      let whitelistSet = new Set<string>();
      try {
        const wpSkuRecord = await prisma.settingsWpSku.findFirst();
        if (wpSkuRecord && wpSkuRecord.skus) {
          const parsed = wpSkuRecord.skus.split(/[\s,]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
          whitelistSet = new Set(parsed);
          logWithTimestamp(`Знайдено ${whitelistSet.size} SKU у whitelist`);
        }
      } catch (e) {
        logWithTimestamp('Не вдалося завантажити SKU whitelist:', e);
      }
      
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
        // Не позначаємо як застарілий товари, які є у whitelist
        const isInWhitelist = whitelistSet.has(productSku);
        const isInWordPress = isInWhitelist || currentSkusSet.has(productSku);
        
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
