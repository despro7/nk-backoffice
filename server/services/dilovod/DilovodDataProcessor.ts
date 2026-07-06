// Процессор для обработки и трансформации данных из Dilovod

import { 
  DilovodProduct, 
  DilovodPricesResponse, 
  DilovodGoodsResponse, 
  DilovodSetComponent
} from './DilovodTypes.js';
import { DilovodApiClient } from './DilovodApiClient.js';
import { 
  DEFAULT_DILOVOD_CONFIG,
  getPriceTypeNameById,
  getDilovodConfigFromDB,
  delay
} from './DilovodUtils.js';

export class DilovodDataProcessor {
  private config: typeof DEFAULT_DILOVOD_CONFIG;
  private apiClient: DilovodApiClient;

  constructor(apiClient: DilovodApiClient) {
    // Инициализируем с настройками по умолчанию, затем перезагрузим из БД
    this.config = DEFAULT_DILOVOD_CONFIG;
    this.apiClient = apiClient;
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
      const idToSku = this.createIdToSkuMapping(uniquePricesResponse);
      const pricesByGoodId = this.createPricesMapping(pricesResponse); // Залишаємо оригінальний для цін
      const goodsById = this.createGoodsMapping(goodsResponse);

      // Обробляємо товари і отримуємо комплекти
      // ВАЖЛИВО: передаємо uniquePricesResponse, а не pricesResponse, щоб уникнути зайвих запитів до API
      const processedGoods = await this.processGoodsWithSetsAsync(
        uniquePricesResponse, 
        idToSku, 
        pricesByGoodId,
        goodsById
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

  // Створення маппінгу ID -> SKU
  private createIdToSkuMapping(pricesResponse: DilovodPricesResponse[] | any): { [key: string]: string } {
    const mapping: { [key: string]: string } = {};
    
    if (!Array.isArray(pricesResponse)) return mapping;
    pricesResponse.forEach((row) => {
      const id = row.id;
      const sku = row.sku;
      if (id && sku) {
        mapping[id] = sku;
      }
    });
    
    return mapping;
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

  // Асинхронна обробка товарів з комплектами
  private async processGoodsWithSetsAsync(
    pricesResponse: DilovodPricesResponse[],
    idToSku: { [key: string]: string },
    pricesByGoodId: { [key: string]: Array<{ priceType: string; price: string }> },
    goodsById: { [key: string]: DilovodGoodsResponse }
  ): Promise<any[]> {
    try {
      // Обробляємо товари послідовно (не паралельно) для правильної роботи затримок
      const processedGoods: any[] = [];
      
      for (let index = 0; index < pricesResponse.length; index++) {
        const good = pricesResponse[index];
        
        if (this.config.setParentIds.includes(good.parent)) {
          // Отримуємо детальну інформацію про комплект
          const set = await this.getSetComponents(good.id, idToSku, goodsById);
          good.set = set;
          
          // Збільшена затримка для уникнення блокування API
          await delay(500);
          
        } else {
          good.set = []; // не комплект, масив set буде []
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

  // Отримання компонентів комплекту
  private async getSetComponents(
    goodId: string, 
    idToSku: { [key: string]: string }, 
    goodsById: { [key: string]: DilovodGoodsResponse }
  ): Promise<Array<{ id: string; quantity: number }>> {
    try {
      // Викликаємо API для отримання детальної інформації про об'єкт
      const object = await this.apiClient.getObject(goodId);
      
      if (!object || !object.tableParts || !object.tableParts.tpGoods) {
        return [];
      }
      
      const setComponents = object.tableParts.tpGoods;
      
      // tpGoods може бути об'єктом, а не масивом - перетворюємо в масив
      let componentsArray: any[] = [];
      if (Array.isArray(setComponents)) {
        componentsArray = setComponents;
      } else if (typeof setComponents === 'object' && setComponents !== null) {
        // Перетворюємо об'єкт в масив
        componentsArray = Object.values(setComponents);
      } else {
        return [];
      }
      
      // Збираємо ID компонентів, для яких немає SKU в мапі
      const missingIds: string[] = [];
      componentsArray.forEach((row: DilovodSetComponent) => {
        const componentId = String(row.good);
        if (!idToSku[componentId] && !goodsById[componentId]) {
          missingIds.push(componentId);
        }
      });

      // Якщо є відсутні SKU - отримуємо їх через API
      let additionalSkuMap: { [key: string]: string } = {};
      if (missingIds.length > 0) {
        try {
          console.log(`🔍 Отримуємо SKU для ${missingIds.length} компонентів комплекту...`);
          
          // Використовуємо прямий запит getObject для кожного ID
          for (const componentId of missingIds) {
            try {
              const componentInfo = await this.apiClient.getObject(componentId);
              
              // SKU знаходиться в header.productNum
              const sku = componentInfo?.header?.productNum;
              if (sku) {
                additionalSkuMap[componentId] = sku;
                console.log(`  ✅ ${componentId} → ${sku}`);
              } else {
                console.log(`  ⚠️ SKU не знайдено для ${componentId}`);
              }
              await delay(100); // Невелика затримка між запитами
            } catch (err) {
              console.log(`  ⚠️ Не вдалося отримати SKU для ${componentId}:`, err);
            }
          }
        } catch (error) {
          console.log(`⚠️ Помилка отримання SKU компонентів:`, error);
        }
      }
      
      const set: Array<{ id: string; name?: string; quantity: number }> = [];
      
      componentsArray.forEach((row: DilovodSetComponent) => {
        const componentId = String(row.good);
        // Спочатку шукаємо в idToSku, потім в goodsById, потім в additionalSkuMap
        let sku = idToSku[componentId];
        if (!sku && goodsById[componentId]) {
          sku = goodsById[componentId].sku;
        }
        if (!sku) {
          sku = additionalSkuMap[componentId];
        }
        // Якщо все ще немає SKU - використовуємо ID
        if (!sku) {
          sku = componentId;
          console.log(`⚠️ SKU не знайдено для компонента ${componentId}, використовуємо ID`);
        }
        
        const quantity = parseFloat(row.qty) || 0;
        
        // Отримуємо назву компонента
        let componentName: string | undefined;
        if (goodsById[componentId]) {
          componentName = goodsById[componentId].name;
        } else if (additionalSkuMap[componentId]) {
          // Спробуємо отримати назву через API, якщо можливо
          // Але поки що залишимо undefined - буде fallback в orderAssemblyUtils
        }
        
        set.push({
          id: sku,
          name: componentName,
          quantity: quantity
        });
      });
      
      return set;
      
    } catch (error) {
      console.log(`Ошибка получения состава комплекта ${goodId}:`, error);
      return [];
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
        parent: good.parent // Зберігаємо parent для визначення комплектів
        ,
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
    const sets = products.filter(p => this.config.setParentIds.includes(p.parent) && p.set && p.set.length > 0);
    
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
