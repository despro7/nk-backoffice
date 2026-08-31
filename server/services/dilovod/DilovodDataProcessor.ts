// Процессор для обработки и трансформации данных из Dilovod

import { 
  DilovodProduct, 
  DilovodPricesResponse, 
  DilovodGoodsResponse, 
} from './DilovodTypes.js';
import { DilovodApiClient } from './DilovodApiClient.js';
import { prisma } from '../../lib/utils.js';
import { isKitAccPolicy } from '../../modules/Products/ProductsTypes.js';
import { 
  DEFAULT_DILOVOD_CONFIG,
  getPriceTypeNameById,
  getDilovodConfigFromDB,
  delay
} from './DilovodUtils.js';

export class DilovodDataProcessor {
  private config: typeof DEFAULT_DILOVOD_CONFIG;

  constructor(_apiClient: DilovodApiClient) {
    this.config = DEFAULT_DILOVOD_CONFIG;
    this.loadConfig();
  }

  /**
   * Загрузить конфигурацию из БД
   */
  private async loadConfig(): Promise<void> {
    try {
      this.config = await getDilovodConfigFromDB();
    } catch (error) {
      console.log('DilovodDataProcessor: ошибка загрузки конфигурации из БД:', error);
    }
  }

  /**
   * Примусово оновлює конфігурацію з БД
   */
  async reloadConfig(): Promise<void> {
    // Імпортуємо функцію очищення кешу та очищаємо його
    const { clearConfigCache } = await import('./DilovodUtils.js');
    clearConfigCache();
    
    await this.loadConfig();
  }

  // Основний метод обробки товарів у комплекті
  async processGoodsWithSets(
    pricesResponse: DilovodPricesResponse[],
    goodsResponse: DilovodGoodsResponse[]
  ): Promise<DilovodProduct[]> {
    try {
      // Видаляємо дублікати з pricesResponse (кожен товар має оброблятися лише один раз)
      const uniquePricesResponse = this.removeDuplicatePrices(pricesResponse);
      
      console.log(`📊 Унікальних товарів для обробки: ${uniquePricesResponse.length} (з ${pricesResponse.length} записів цін)`);
      
      // Створюємо маппінги
      const pricesByGoodId = this.createPricesMapping(pricesResponse);
      const goodsById = this.createGoodsMapping(goodsResponse);
      const kitSetsByGoodId = await this.loadKitSetsFromCatalog(
        uniquePricesResponse.map((row) => row.id).filter(Boolean)
      );

      const processedGoods = await this.processGoodsWithSetsAsync(
        uniquePricesResponse,
        goodsById,
        kitSetsByGoodId
      );

      // Формуємо фінальний результат
      const result = this.buildFinalProducts(processedGoods, pricesByGoodId);
      
      // Видаляємо дублікати по SKU
      const unique = this.removeDuplicates(result);
      
      // Логуємо фінальний результат для аналізу
      this.logFinalResult(unique);
      
      return unique;
      
    } catch (error) {
      console.log('Помилка обробки товарів у комплекті:', error);
      throw error;
    }
  }

  // Створення маппінгу цін по товарам
  private createPricesMapping(pricesResponse: DilovodPricesResponse[] | any): { [key: string]: Array<{ priceType: string; price: string }> } {
    const mapping: { [key: string]: Array<{ priceType: string; price: string }> } = {};
    
    if (!Array.isArray(pricesResponse)) return mapping;
    pricesResponse.forEach((row) => {
      const id = row.id;
      if (!mapping[id]) {
        mapping[id] = [];
      }
      
      mapping[id].push({
        priceType: row.priceType,
        price: row.price
      });
    });
    
    return mapping;
  }

  // Створення маппінгу товарів
  private createGoodsMapping(goodsResponse: DilovodGoodsResponse[] | any): { [key: string]: DilovodGoodsResponse } {
    const mapping: { [key: string]: DilovodGoodsResponse } = {};
    
    if (!Array.isArray(goodsResponse)) return mapping;
    goodsResponse.forEach((good) => {
      mapping[good.id] = good;
    });
    
    return mapping;
  }

  /**
   * Комплекти = accPolicy «Товарні набори» у catalog_goods; склад — catalog_good_components.
   */
  private async loadKitSetsFromCatalog(
    goodIds: string[]
  ): Promise<Map<string, Array<{ id: string; name?: string; quantity: number }>>> {
    const result = new Map<string, Array<{ id: string; name?: string; quantity: number }>>();
    const uniqueIds = [...new Set(goodIds.filter(Boolean))];
    if (uniqueIds.length === 0) return result;

    const kitRows = await prisma.catalogGood.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, accPolicyId: true },
    });
    const kitIds = kitRows.filter((row) => isKitAccPolicy(row.accPolicyId)).map((row) => row.id);
    if (kitIds.length === 0) return result;

    const components = await prisma.catalogGoodComponent.findMany({
      where: { parentGoodId: { in: kitIds } },
      orderBy: { rowNum: 'asc' },
      include: { componentGood: { select: { sku: true, name: true } } },
    });

    for (const kitId of kitIds) {
      result.set(kitId, []);
    }
    for (const row of components) {
      const sku = row.componentGood?.sku?.trim() || row.componentGoodId;
      const list = result.get(row.parentGoodId) ?? [];
      list.push({
        id: sku,
        name: row.componentGood?.name,
        quantity: row.qty,
      });
      result.set(row.parentGoodId, list);
    }
    return result;
  }

  // Асинхронна обробка товарів з комплектами
  private async processGoodsWithSetsAsync(
    pricesResponse: DilovodPricesResponse[],
    goodsById: { [key: string]: DilovodGoodsResponse },
    kitSetsByGoodId: Map<string, Array<{ id: string; name?: string; quantity: number }>>
  ): Promise<any[]> {
    try {
      // Обробляємо товари послідовно (не паралельно) для правильної роботи затримок
      const processedGoods: any[] = [];
      
      for (let index = 0; index < pricesResponse.length; index++) {
        const good = pricesResponse[index];
        
        if (kitSetsByGoodId.has(good.id)) {
          good.set = kitSetsByGoodId.get(good.id) ?? [];
        } else {
          good.set = [];
        }
        
        // Дозволяємо назву категорії через каталог: беремо presentation у батька
        try {
          const parentId = good.parent;
          const parentGood = parentId ? goodsById[parentId] : undefined;
          const parentName = (parentGood as any)?.presentation || (parentGood as any)?.name || undefined;
          if (parentName) {
            (good as any).categoryNameResolved = parentName;
          }
        } catch {}

        // Merge additional fields from goods catalog (goodsById) into the price-based record
        try {
          const catalog = goodsById[good.id];
          if (catalog) {
            // packageRatio -> portionsPerBox mapping will be handled later in buildFinalProducts,
            // but we ensure the raw field is available on the `good` object here.
            if (catalog.packageRatio !== undefined) {
              (good as any).packageRatio = catalog.packageRatio;
            }
            if (catalog.id__pr !== undefined) {
              (good as any).id__pr = catalog.id__pr;
            }
            if ((catalog as any).presentation !== undefined) {
              (good as any).presentation = (catalog as any).presentation;
            }
            if (catalog.parent__pr !== undefined) {
              (good as any).parent__pr = catalog.parent__pr;
            }
          }
        } catch (err) {
          // non-fatal: просто лог для діагностики
          try { console.log('DilovodDataProcessor: помилка мерджу полів каталогу для', good.id, err); } catch {};
        }
        
        // Затримка для всіх товарів, щоб не перевантажувати API
        if (index < pricesResponse.length - 1) { // Не затримуємося після останнього товару
          await delay(200);
        }
        
        processedGoods.push(good);
      }

      return processedGoods;
    } catch (error) {
      console.log(`❌ ПОМИЛКА в processGoodsWithSetsAsync:`, error);
      throw error;
    }
  }

  // Формування фінальних товарів
  private buildFinalProducts(
    processedGoods: any[], 
    pricesByGoodId: { [key: string]: Array<{ priceType: string; price: string }> }
  ): DilovodProduct[] {
    const result: DilovodProduct[] = [];
    
    // Підготовлюємо нормалізовану карту категорій (мерджимо дефолт і БД)
    const normalizedCategoriesMap: { [key: string]: number } = {};
    const mergedCategoriesMap = {
      ...(DEFAULT_DILOVOD_CONFIG.categoriesMap || {}),
      ...(this.config.categoriesMap || {})
    } as Record<string, number>;
    Object.entries(mergedCategoriesMap).forEach(([key, value]) => {
      const normKey = this.normalizeCategoryName(key);
      if (normKey) normalizedCategoriesMap[normKey] = value as number;
    });
    
    processedGoods.forEach((good) => {
      let costPerItem = '';
      const additionalPrices: Array<{ priceType: string; priceValue: string }> = [];
      
      // Заповнюємо масив всіх цін по товару
      const prices = pricesByGoodId[good.id] || [];
      
      prices.forEach((priceRow) => {
        if (priceRow.priceType === this.config.mainPriceType) {
          costPerItem = priceRow.price;
        } else {
          additionalPrices.push({
            priceType: getPriceTypeNameById(priceRow.priceType),
            priceValue: priceRow.price
          });
        }
      });

      // Фільтруємо додаткові ціни (тільки позитивні)
      const filteredAdditionalPrices = additionalPrices.filter(
        (p) => parseFloat(p.priceValue) > 0
      );

      // Отримуємо назву та категорію
      const productName = this.extractProductName(good);
      const categoryNameRaw = (good as any).categoryNameResolved || this.extractCategoryName(good);
      const categoryName = categoryNameRaw?.toString()?.trim() || 'Без категорії';
      const normalizedName = this.normalizeCategoryName(categoryName);
      let mappedCategoryId = normalizedName in normalizedCategoriesMap
        ? normalizedCategoriesMap[normalizedName]
        : 0;

      // Heuristic fallback: категоризація по підстроках, якщо маппінг не спрацював
      if (!mappedCategoryId) {
        if (normalizedName.includes('архів')) {
          mappedCategoryId = 0;
        } else if (normalizedName.includes('перш')) {
          mappedCategoryId = 16;
        } else if (normalizedName.includes('друг')) {
          mappedCategoryId = 21;
        } else if (normalizedName.includes('набор') || (normalizedName.includes('набір') || normalizedName.includes('комплект'))) {
          mappedCategoryId = 19;
        } else if (normalizedName.includes('салат')) {
          mappedCategoryId = 20;
        } else if (normalizedName.includes('напій') || normalizedName.includes('напої')) {
          mappedCategoryId = 33;
        } else if (normalizedName.includes('основи') || normalizedName.includes('інгредієнт')) {
          mappedCategoryId = 35;
        } else if (normalizedName.includes('м\'ясн')) {
          mappedCategoryId = 34;
        }
      }

      if (!mappedCategoryId) {
        // Лог для диагностики непідтриманих категорій
        try { console.log('⚠️ Unmapped category name', { categoryName, normalizedName, categoriesMap: normalizedCategoriesMap }); } catch {}
      }

      result.push({
        id: good.id,  // ← ВИПРАВЛЕНО: використовуємо good.id (good_id з Dilovod) замість good.sku
        name: productName,
        sku: good.sku,
        costPerItem: costPerItem,
        currency: "UAH",
        category: {
          id: mappedCategoryId,
          name: categoryName
        },
        set: good.set || [],
        additionalPrices: filteredAdditionalPrices,
        parent: good.parent,
        portionsPerBox: (good.packageRatio !== undefined && good.packageRatio !== null)
          ? parseInt(String(good.packageRatio))
          : undefined
      });
    });

    return result;
  }

  // Витягування назви товару
  private extractProductName(good: any): string {
    return good['id__pr'] || good['presentation'] || good.sku || 'Без назви';
  }

  // Витягування назви категорії
  private extractCategoryName(good: any): string {
    return good['parent__pr'] || good['parentName'] || "Без категорії";
  }

  // Нормалізація назви категорії для порівняння
  private normalizeCategoryName(name: string | undefined): string {
    return (name || '').toString().trim().toLowerCase();
  }

  // Видалення дублікатів по SKU
  private removeDuplicates(products: DilovodProduct[]): DilovodProduct[] {
    const unique: { [key: string]: DilovodProduct } = {};
    
    products.forEach((item) => {
      unique[item.sku] = item;
    });
    
    return Object.values(unique);
  }
  
  // Видалення дублікатів цін по ID товару (залишаємо тільки один екземпляр кожного товару)
  private removeDuplicatePrices(pricesResponse: DilovodPricesResponse[] | any): DilovodPricesResponse[] {
    const unique: { [key: string]: DilovodPricesResponse } = {};
    
    if (!Array.isArray(pricesResponse)) return [];
    pricesResponse.forEach((item) => {
      // Використовуємо ID товару як ключ для унікальності
      if (!unique[item.id]) {
        unique[item.id] = item;
      }
    });
    
    return Object.values(unique);
  }

  // Логування фінального результату
  private logFinalResult(products: DilovodProduct[]): void {
    // Группируем товары по типам
    const sets = products.filter(p => (p.set?.length ?? 0) > 0);
    
    // Логування кількості знайдених комплектів
    if (sets.length > 0) {
      console.log(`Знайдено ${sets.length} комплектів`);
    }
  }

  // Обробка залишків товарів
  processStockBalance(stockResponse: any[]): any[] {
    try {
      const result: any[] = [];
      const stockBySku: { [key: string]: { [key: string]: number } } = {};

      // Групуємо залишки по SKU та складам
      stockResponse.forEach((row) => {
        // Використовуємо правильні поля з відповіді Dilovod API
        const sku = row.sku;
        const name = row.id__pr;
        const storage = row.storage;
        // qty може бути null коли Dilovod не повертає залишки — трактуємо як 0
        const quantity = row.qty == null ? 0 : (parseFloat(row.qty) || 0);
        
        if (!stockBySku[sku]) {
          stockBySku[sku] = {};
          // Зберігаємо назву товару для кожного SKU
          stockBySku[sku]._name = name;
        }
        
        // Зберігаємо кількість по складу (сумуємо між фірмами, якщо той самий склад є у кількох фірмах)
        stockBySku[sku][storage] = (stockBySku[sku][storage] || 0) + quantity;
      });
      
      // Формуємо результат
      Object.keys(stockBySku).forEach(sku => {
        const stockData = stockBySku[sku];

        // Беремо склади з конфігурації (mainStorageId / smallStorageId)
        const mainStorageId = this.config.mainStorageId || (this.config.storageIdsList?.[0] ?? "1100700000001005");
        const smallStorageId = this.config.smallStorageId || (this.config.storageIdsList?.[1] ?? "1100700000001017");

        const mainStorage = stockData[mainStorageId] || 0;
        const smallStorage = stockData[smallStorageId] || 0;
        const total = Object.keys(stockData)
          .filter((key) => key !== '_name')
          .reduce((sum, key) => sum + (stockData[key] || 0), 0);
        
        const storages: Record<string, number> = {};
        Object.keys(stockData).forEach((key) => {
          if (key === '_name') return;
          storages[key] = stockData[key] || 0;
        });

        result.push({
          sku,
          name: stockData._name,
          mainStorage,
          smallStorage,
          total,
          storages,
        });
      });
      
      return result;
      
    } catch (error) {
      console.log('Помилка обробки залишків:', error);
      throw error;
    }
  }

  // Оновлення конфігурації
  updateConfig(newConfig: Partial<typeof DEFAULT_DILOVOD_CONFIG>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
