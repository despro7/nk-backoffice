// Менеджер синхронізації товарів з базою даних 

import crypto from 'crypto';
import { prisma } from '../../lib/utils.js';
import { DilovodProduct, DilovodSyncResult } from './DilovodTypes.js';
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
  async syncProductsToDatabase(
    dilovodProducts: DilovodProduct[],
    logError?: (params: {
      sku: string;
      errorType: 'missing_price' | 'invalid_data' | 'db_error' | 'validation_error' | 'sync_failed';
      message: string;
      productData?: any;
      initiatedBy?: string;
    }) => Promise<void>,
    abortSignal?: AbortSignal
  ): Promise<DilovodSyncResult> {
    try {
      console.log('Починаємо синхронізацію товарів з базою даних...');
      console.log(`Отримано ${dilovodProducts.length} товарів для синхронізації`);
      
      const errors: string[] = [];
      let createdProducts = 0;
      let updatedProducts = 0;
      let skippedProducts = 0;
      let syncedSets = 0;

      for (const product of dilovodProducts) {
        // Перевіряємо, чи був запит на скасування від клієнта/зовнішнього джерела
        if (abortSignal?.aborted) {
          console.log('🔻 Синхронізацію з базою даних було скасовано (abortSignal)');
          break;
        }
        try {
          console.log(`\n--- Синхронізація товару ${product.sku} ---`);
          console.log(`Назва: ${product.name}`);
          console.log(`Категорія: ${product.category.name} (ID: ${product.category.id})`);
          console.log(`Ціна: ${product.costPerItem} ${product.currency}`);
          
          // Визначаємо і показуємо вагу  
          const weight = this.determineWeightByCategory(product.category.id);
          if (weight) {
            console.log(`⚖️ Вага: ${weight} гр (категорія ID: ${product.category.id})`);
          } else {
            console.log(`⚖️ Вага: не визначена (категорія ID: ${product.category.id})`);
          }
          
          console.log(`Комплект: ${product.set.length > 0 ? 'ТАК' : 'НІ'}`);
          
          if (product.set.length > 0) {
            console.log(`Склад комплекта:`);
            product.set.forEach((item, index) => {
              console.log(`  ${index + 1}. ${item.id} - ${item.quantity}`);
            });
          }
          
          console.log(`Додаткові ціни: ${product.additionalPrices.length}`);
          
          // Валідація даних товару
          const validationError = this.validateProductData(product);
          if (validationError) {
            console.log(`❌ Валідація не пройдена: ${validationError.message}`);
            errors.push(`Товар ${product.sku}: ${validationError.message}`);
            
            // Логуємо помилку в систему повідомлень
            if (logError) {
              await logError({
                sku: product.sku,
                errorType: validationError.type,
                message: validationError.message,
                productData: {
                  name: product.name,
                  category: product.category,
                  costPerItem: product.costPerItem
                },
                initiatedBy: 'system'
              });
            }
            continue; // Пропускаємо товар з помилками
          }
          
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
              console.log(`🔄 Дані товару ${product.sku} змінилися, оновлюємо...`);
              
              const productData = this.prepareProductData(product, false); // false = існуючий товар
              console.log(`Дані для оновлення:`, JSON.stringify(productData, null, 2));
              
              await prisma.product.update({
                where: { sku: product.sku },
                data: productData
              });
              console.log(`✅ Товар ${product.sku} оновлений`);
              updatedProducts++;
            } else {
              console.log(`⏭️  Товар ${product.sku} не змінився, пропускаємо оновлення`);
              skippedProducts++;
            }
          } else {
            // Створюємо новий товар
            console.log(`➕ Створюємо новий товар ${product.sku}...`);
            
            const productData = this.prepareProductData(product, true); // true = новий товар
            console.log(`Дані для створення:`, JSON.stringify(productData, null, 2));
            
            await prisma.product.create({
              data: ({
                sku: product.sku,
                ...productData
              } as any)
            });
            console.log(`✅ Товар ${product.sku} створений`);
            createdProducts++;
          }
          
          // Підраховуємо комплекти
          if (product.set && product.set.length > 0) {
            syncedSets++;
            console.log(`🎯 Комплект ${product.sku} успішно синхронізований (${product.set.length} компонентів)`);
          } else {
            console.log(`📦 Звичайний товар ${product.sku} синхронізований`);
          }

        } catch (error) {
          const errorMessage = `Помилка синхронізації товару ${product.sku}: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
          console.log(errorMessage);
          errors.push(errorMessage);

          // Логуємо помилку в систему повідомлень
          if (logError) {
            await logError({
              sku: product.sku,
              errorType: 'sync_failed',
              message: error instanceof Error ? error.message : 'Невідома помилка',
              productData: {
                name: product.name,
                category: product.category,
                costPerItem: product.costPerItem
              },
              initiatedBy: 'system'
            });
          }
        }
      }

      const totalProcessed = createdProducts + updatedProducts + skippedProducts;
      
      console.log(`\n=== РЕЗУЛЬТАТ СИНХРОНІЗАЦІЇ ===`);
      console.log(`📊 Всього оброблено товарів: ${totalProcessed}`);
      console.log(`  ➕ Створено нових: ${createdProducts}`);
      console.log(`  🔄 Оновлено: ${updatedProducts}`);
      console.log(`  ⏭️  Пропущено (без змін): ${skippedProducts}`);
      console.log(`  🎯 Комплектів: ${syncedSets}`);
      console.log(`  ❌ Помилок: ${errors.length}`);
      
      if (errors.length > 0) {
        console.log(`\nСписок помилок:`);
        errors.forEach((error, index) => {
          console.log(`  ${index + 1}. ${error}`);
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
      console.log('Помилка синхронізації з базою даних:', error);
      return {
        success: false,
        message: `Помилка синхронізації з базою даних: ${error instanceof Error ? error.message : 'Невідома помилка'}`,
        syncedProducts: 0,
        syncedSets: 0,
        errors: [error instanceof Error ? error.message : 'Невідома помилка']
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
      console.log(`⚖️  Встановлюємо вагу для нового товару: ${weight ?? 'не визначено'} г`);
      
      const manualOrder = this.determineManualOrderByCategory(product.category.id);
      data.manualOrder = manualOrder;
      console.log(`📋 Встановлюємо порядок сортування: ${manualOrder}`);
    } else {
      console.log(`🔒 Вага і порядок сортування не оновлюються (захист локальних змін)`);
    }
    
    return data;
  }

  // Валідація даних товару перед синхронізацією
  private validateProductData(product: DilovodProduct): { type: 'missing_price' | 'invalid_data' | 'validation_error'; message: string } | null {
    // Перевірка наявності ціни
    if (!product.costPerItem || parseFloat(product.costPerItem) <= 0) {
      return {
        type: 'missing_price',
        message: `відсутня або невірна ціна (${product.costPerItem})`
      };
    }

    // Перевірка наявності назви
    if (!product.name || product.name.trim().length === 0) {
      return {
        type: 'invalid_data',
        message: 'відсутня назва товару'
      };
    }

    // Перевірка наявності SKU
    if (!product.sku || product.sku.trim().length === 0) {
      return {
        type: 'invalid_data',
        message: 'відсутній SKU товару'
      };
    }

    // Перевірка валідності SKU (не повинен містити заборонені символи)
    if (!/^[A-Za-z0-9\-_.]+$/.test(product.sku)) {
      return {
        type: 'invalid_data',
        message: `невірний формат SKU (${product.sku})`
      };
    }

    // Перевірка наявності категорії
    if (!product.category || !product.category.id) {
      return {
        type: 'invalid_data',
        message: 'відсутня категорія товару'
      };
    }

    // Перевірка комплектів (якщо є set, він повинен бути масивом)
    if (product.set && !Array.isArray(product.set)) {
      return {
        type: 'invalid_data',
        message: 'невірний формат даних комплекту'
      };
    }

    return null; // Валідація пройдена
  }

  // Визначення ваги товару за категорією
  private determineWeightByCategory(categoryId: number): number | null {
    // Перші страви - 400 г
    if (categoryId === 16) {
      return 400;
    }
    
    // Другі страви - 300 г
    if (categoryId === 21) {
      return 300;
    }
    
    // За замовчуванням не встановлюємо вагу
    return null;
  }

  // Визначення порядку сортування за категорією
  private determineManualOrderByCategory(categoryId: number): number {
    // Перші страви - 1000
    if (categoryId === 16) {
      return 1000;
    }
    
    // Другі страви - 2000
    if (categoryId === 21) {
      return 2000;
    }
    
    // Комплекти - 3000
    if (categoryId === 19) {
      return 3000;
    }

    // Салати - 4000
    if (categoryId === 20) {
      return 4000;
    }

    // Напої - 5000
    if (categoryId === 33) {
      return 5000;
    }

    if (categoryId === 0) {
      return 99999; // Відправляемо в кінець списку
    }
    
    // За замовчуванням - 0 (на початку списку)
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
      console.log('Ошибка получения статистики синхронизации:', error);
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
          console.log('Помилка отримання налаштувань Dilovod, використовуємо значення за замовчуванням:', error);
          daysOld = 30;
        }
      }

      console.log(`Очищення товарів, не синхронізованих більше ${daysOld} днів...`);
      
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
      
      const deletedProducts = await prisma.product.deleteMany({
        where: {
          lastSyncAt: {
            lt: cutoffDate
          }
        }
      });
      
      console.log(`Удалено ${deletedProducts.count} старых товаров`);
      
      return {
        success: true,
        message: `Удалено ${deletedProducts.count} старых товаров`,
        deletedCount: deletedProducts.count
      };
      
    } catch (error) {
      console.log('Ошибка очистки старых товаров:', error);
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
      console.log('Помилка отримання товарів:', error);
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
    smallStorage: number
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
            "2": smallStorage    // Склад 2 (малий склад для відвантажень)
          })
        }
      });

      return {
        success: true,
        message: `Остатки для ${sku} обновлены`
      };

    } catch (error) {
      console.log(`Ошибка обновления остатков для ${sku}:`, error);
      return {
        success: false,
        message: `Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
      };
    }
  }

  // Масове оновлення залишків товарів (для оптимізації при великій кількості товарів)
  async updateProductStockBalancesBulk(
    items: {
      sku: string;
      mainStorage: number;
      smallStorage: number;
    }[]
  ): Promise<{
    success: boolean;
    updated: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let updated = 0;

    try {
      await prisma.$transaction(
        items.map((item) =>
          prisma.product.update({
            where: { sku: item.sku },
            data: {
              stockBalanceByStock: JSON.stringify({
                "1": item.mainStorage,
                "2": item.smallStorage
              })
            }
          })
        )
      );

      updated = items.length;

    } catch (error) {
      console.error("Bulk update error:", error);

      // fallback — поштучно щоб знайти проблемні SKU
      for (const item of items) {
        try {
          await prisma.product.update({
            where: { sku: item.sku },
            data: {
              stockBalanceByStock: JSON.stringify({
                "1": item.mainStorage,
                "2": item.smallStorage
              })
            }
          });

          updated++;

        } catch (err) {
          errors.push(
            `${item.sku}: ${err instanceof Error ? err.message : "error"}`
          );
        }
      }
    }

    return {
      success: errors.length === 0,
      updated,
      errors
    };
  }

  // Позначення застарілих товарів (які є в БД але немає в WordPress)
  // scope = 'all'    — перевіряє всі товари в БД (full sync)
  //                    currentSkus = повний список SKU з WordPress
  // scope = 'scoped' — перевіряє тільки товари з переданого списку manualSkus (manual sync)
  //                    currentSkus = актуальний список SKU з WordPress (для валідації)
  //                    manualSkus  = список SKU, які були синхронізовані вручну
  async markOutdatedProducts(currentSkus: string[], scope: 'all' | 'scoped' = 'all', manualSkus?: string[]): Promise<void> {
    try {
      console.log(`Позначаємо застарілі товари... (режим: ${scope})`);
      console.log(`Отримано ${currentSkus.length} актуальних SKU з WordPress`);
      
      // Створюємо Set для швидкого пошуку по актуальному списку WordPress
      const currentSkusSet = new Set(currentSkus.map(sku => sku.toLowerCase().trim()));

      // Завантажуємо whitelist зі служби налаштувань (таблиця settings_wp_sku)
      let whitelistSet = new Set<string>();
      try {
        const wpSkuRecord = await prisma.settingsWpSku.findFirst();
        if (wpSkuRecord && wpSkuRecord.skus) {
          const parsed = wpSkuRecord.skus.split(/[\s,]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
          whitelistSet = new Set(parsed);
          console.log(`Знайдено ${whitelistSet.size} SKU у whitelist`);
        }
      } catch (e) {
        console.log('Не вдалося завантажити SKU whitelist:', e);
      }
      
      // При scoped — беремо тільки товари з переданого списку manualSkus
      // При all — беремо всі товари з БД
      const scopedSkus = scope === 'scoped' ? (manualSkus ?? currentSkus) : undefined;
      const allProducts = await prisma.product.findMany({
        where: scopedSkus !== undefined
          ? { sku: { in: scopedSkus } }
          : undefined,
        select: {
          id: true,
          sku: true,
          name: true,
          isOutdated: true
        }
      });
      
      console.log(`Товарів для перевірки: ${allProducts.length}`);
      
      let markedAsOutdated = 0;
      let unmarkedAsOutdated = 0;
      
      for (const product of allProducts) {
        const productSku = product.sku.toLowerCase().trim();
        // Не позначаємо як застарілий товари, які є у whitelist
        const isInWhitelist = whitelistSet.has(productSku);
        // Перевіряємо наявність у актуальному списку WordPress (або whitelist)
        const isInWordPress = isInWhitelist || currentSkusSet.has(productSku);
        
        // Якщо товар НЕ в WordPress але НЕ позначений як застарілий - позначаємо
        if (!isInWordPress && !product.isOutdated) {
          await prisma.product.update({
            where: { id: product.id },
            data: { isOutdated: true }
          });
          console.log(`  ⚠️  Товар ${product.sku} (${product.name}) позначено як застарілий`);
          markedAsOutdated++;
        }
        
        // Якщо товар Є в WordPress але позначений як застарілий - знімаємо позначку
        if (isInWordPress && product.isOutdated) {
          await prisma.product.update({
            where: { id: product.id },
            data: { isOutdated: false }
          });
          console.log(`  ✅ Товар ${product.sku} (${product.name}) знову актуальний`);
          unmarkedAsOutdated++;
        }
      }
      
      console.log(`\n📊 Результат позначення застарілих товарів:`);
      console.log(`  ⚠️  Позначено як застарілих: ${markedAsOutdated}`);
      console.log(`  ✅ Знято позначку застарілості: ${unmarkedAsOutdated}`);
      
    } catch (error) {
      console.log('Помилка позначення застарілих товарів:', error);
      // Не кидаємо помилку, щоб не зупиняти синхронізацію
    }
  }
}
