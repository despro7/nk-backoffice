// Процессор для обработки и трансформации данных из Dilovod

import { 
  DilovodProduct, 
  DilovodPricesResponse, 
  DilovodGoodsResponse, 
  DilovodSetComponent
} from './DilovodTypes.js';
import { DilovodApiClient } from './DilovodApiClient.js';
import { getDilovodConfig as getDefaultDilovodConfig, logWithTimestamp as logTS } from './DilovodUtils.js';
import {
  getPriceTypeNameById,
  logWithTimestamp,
  delay,
  getDilovodConfig,
  getDilovodConfigFromDB
} from './DilovodUtils.js';

export class DilovodDataProcessor {
  private config: ReturnType<typeof getDilovodConfig>;
  private apiClient: DilovodApiClient;

  constructor(apiClient: DilovodApiClient) {
    // Инициализируем с настройками по умолчанию, затем перезагрузим из БД
    this.config = getDilovodConfig();
    this.apiClient = apiClient;
    this.loadConfig();
  }

  /**
   * Загрузить конфигурацию из БД
   */
  private async loadConfig(): Promise<void> {
    try {
      this.config = await getDilovodConfigFromDB();
      logWithTimestamp('DilovodDataProcessor: конфигурация загружена из БД');
    } catch (error) {
      logWithTimestamp('DilovodDataProcessor: ошибка загрузки конфигурации из БД:', error);
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

  // Основной метод обработки товаров с комплектами
  async processGoodsWithSets(
    pricesResponse: DilovodPricesResponse[],
    goodsResponse: DilovodGoodsResponse[]
  ): Promise<DilovodProduct[]> {
    try {
      // Убираем дубликаты из pricesResponse (каждый товар должен обрабатываться только один раз)
      const uniquePricesResponse = this.removeDuplicatePrices(pricesResponse);
      
      logWithTimestamp(`📊 Унікальних товарів для обробки: ${uniquePricesResponse.length} (з ${pricesResponse.length} записів цін)`);
      
      // Создаем маппинги
      const idToSku = this.createIdToSkuMapping(uniquePricesResponse);
      const pricesByGoodId = this.createPricesMapping(pricesResponse); // Оставляем оригинальный для цен
      const goodsById = this.createGoodsMapping(goodsResponse);

      // Обрабатываем товары и получаем комплекты
      // ВАЖЛИВО: передаємо uniquePricesResponse, а не pricesResponse, щоб уникнути зайвих запитів до API
      const processedGoods = await this.processGoodsWithSetsAsync(
        uniquePricesResponse, 
        idToSku, 
        pricesByGoodId,
        goodsById
      );

      // Формируем финальный результат
      const result = this.buildFinalProducts(processedGoods, pricesByGoodId);
      
      // Убираем дубликаты по SKU
      const unique = this.removeDuplicates(result);
      
      // Логируем финальный результат для анализа
      this.logFinalResult(unique);
      
      return unique;
      
    } catch (error) {
      logWithTimestamp('Ошибка обработки товаров с комплектами:', error);
      throw error;
    }
  }

  // Создание маппинга ID -> SKU
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

  // Создание маппинга цен по товарам
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

  // Создание маппинга товаров
  private createGoodsMapping(goodsResponse: DilovodGoodsResponse[] | any): { [key: string]: DilovodGoodsResponse } {
    const mapping: { [key: string]: DilovodGoodsResponse } = {};
    
    if (!Array.isArray(goodsResponse)) return mapping;
    goodsResponse.forEach((good) => {
      mapping[good.id] = good;
    });
    
    return mapping;
  }

  // Асинхронная обработка товаров с комплектами
  private async processGoodsWithSetsAsync(
    pricesResponse: DilovodPricesResponse[],
    idToSku: { [key: string]: string },
    pricesByGoodId: { [key: string]: Array<{ priceType: string; price: string }> },
    goodsById: { [key: string]: DilovodGoodsResponse }
  ): Promise<any[]> {
    try {
      // Обрабатываем товары последовательно (не параллельно) для правильной работы задержек
      const processedGoods: any[] = [];
      
      for (let index = 0; index < pricesResponse.length; index++) {
        const good = pricesResponse[index];
        
        if (good.parent === this.config.setParentId) {
          // Получаем детальную информацию о комплекте
          const set = await this.getSetComponents(good.id, idToSku, goodsById);
          good.set = set;
          
          // Увеличенная задержка для избежания блокировки API
          await delay(500);
          
        } else {
          good.set = []; // не комплект, массив set будет []
        }
        
        // Разрешаем название категории через каталог: берём presentation у родителя
        try {
          const parentId = good.parent;
          const parentGood = parentId ? goodsById[parentId] : undefined;
          const parentName = (parentGood as any)?.presentation || (parentGood as any)?.name || undefined;
          if (parentName) {
            (good as any).categoryNameResolved = parentName;
          }
        } catch {}
        
        // Задержка для всех товаров, чтобы не перегружать API
        if (index < pricesResponse.length - 1) { // Не задерживаемся после последнего товара
          await delay(200);
        }
        
        processedGoods.push(good);
      }

      return processedGoods;
    } catch (error) {
      logWithTimestamp(`❌ ОШИБКА в processGoodsWithSetsAsync:`, error);
      throw error;
    }
  }

  // Получение компонентов комплекта
  private async getSetComponents(
    goodId: string, 
    idToSku: { [key: string]: string }, 
    goodsById: { [key: string]: DilovodGoodsResponse }
  ): Promise<Array<{ id: string; quantity: number }>> {
    try {
      // Вызываем API для получения детальной информации об объекте
      const object = await this.apiClient.getObject(goodId);
      
      if (!object || !object.tableParts || !object.tableParts.tpGoods) {
        return [];
      }
      
      const setComponents = object.tableParts.tpGoods;
      
      // tpGoods может быть объектом, а не массивом - преобразуем в массив
      let componentsArray: any[] = [];
      if (Array.isArray(setComponents)) {
        componentsArray = setComponents;
      } else if (typeof setComponents === 'object' && setComponents !== null) {
        // Преобразуем объект в массив
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
          logWithTimestamp(`🔍 Отримуємо SKU для ${missingIds.length} компонентів комплекту...`);
          
          // Використовуємо прямий запит getObject для кожного ID
          for (const componentId of missingIds) {
            try {
              const componentInfo = await this.apiClient.getObject(componentId);
              
              // SKU знаходиться в header.productNum
              const sku = componentInfo?.header?.productNum;
              if (sku) {
                additionalSkuMap[componentId] = sku;
                logWithTimestamp(`  ✅ ${componentId} → ${sku}`);
              } else {
                logWithTimestamp(`  ⚠️ SKU не знайдено для ${componentId}`);
              }
              await delay(100); // Невелика затримка між запитами
            } catch (err) {
              logWithTimestamp(`  ⚠️ Не вдалося отримати SKU для ${componentId}:`, err);
            }
          }
        } catch (error) {
          logWithTimestamp(`⚠️ Помилка отримання SKU компонентів:`, error);
        }
      }
      
      const set: Array<{ id: string; quantity: number }> = [];
      
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
          logWithTimestamp(`⚠️ SKU не знайдено для компонента ${componentId}, використовуємо ID`);
        }
        
        const quantity = parseFloat(row.qty) || 0;
        
        set.push({
          id: sku,
          quantity: quantity
        });
      });
      
      return set;
      
    } catch (error) {
      logWithTimestamp(`Ошибка получения состава комплекта ${goodId}:`, error);
      return [];
    }
  }

  // Формирование финальных товаров
  private buildFinalProducts(
    processedGoods: any[], 
    pricesByGoodId: { [key: string]: Array<{ priceType: string; price: string }> }
  ): DilovodProduct[] {
    const result: DilovodProduct[] = [];
    
    // Подготавливаем нормализованную карту категорий (мерджим дефолт и БД)
    const normalizedCategoriesMap: { [key: string]: number } = {};
    const mergedCategoriesMap = {
      ...(getDefaultDilovodConfig().categoriesMap || {}),
      ...(this.config.categoriesMap || {})
    } as Record<string, number>;
    Object.entries(mergedCategoriesMap).forEach(([key, value]) => {
      const normKey = this.normalizeCategoryName(key);
      if (normKey) normalizedCategoriesMap[normKey] = value as number;
    });
    
    processedGoods.forEach((good) => {
      let costPerItem = '';
      const additionalPrices: Array<{ priceType: string; priceValue: string }> = [];
      
      // Заполняем массив всех цен по товару
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

      // Фильтруем дополнительные цены (только положительные)
      const filteredAdditionalPrices = additionalPrices.filter(
        (p) => parseFloat(p.priceValue) > 0
      );

      // Получаем название и категорию
      const productName = this.extractProductName(good);
      const categoryNameRaw = (good as any).categoryNameResolved || this.extractCategoryName(good);
      const categoryName = categoryNameRaw?.toString()?.trim() || 'Без категории';
      const normalizedName = this.normalizeCategoryName(categoryName);
      let mappedCategoryId = normalizedName in normalizedCategoriesMap
        ? normalizedCategoriesMap[normalizedName]
        : 0;

      // Heuristic fallback: категоризация по подстроке, если маппинг не сработал
      if (!mappedCategoryId) {
        if (normalizedName.includes('перш')) {
          mappedCategoryId = 1;
        } else if (normalizedName.includes('друг')) {
          mappedCategoryId = 2;
        } else if (normalizedName.includes('набор') || normalizedName.includes('набори') || normalizedName.includes('комплект')) {
          mappedCategoryId = 3;
        } else if (normalizedName.includes('салат')) {
          mappedCategoryId = 4;
        } else if (normalizedName.includes('напій') || normalizedName.includes('напої')) {
          mappedCategoryId = 5;
        } else if (normalizedName.includes('овоч')) {
          mappedCategoryId = 6;
        }
      }

      if (!mappedCategoryId) {
        // Лог для диагностики неподдержанных категорий
        try { logTS('⚠️ Unmapped category name', { categoryName, normalizedName, categoriesMap: normalizedCategoriesMap }); } catch {}
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
        parent: good.parent // Сохраняем parent для определения комплектов
      });
    });

    return result;
  }

  // Извлечение названия товара
  private extractProductName(good: any): string {
    return good['id__pr'] || good['presentation'] || good.sku || 'Без названия';
  }

  // Извлечение названия категории
  private extractCategoryName(good: any): string {
    return good['parent__pr'] || good['parentName'] || "Без категории";
  }

  // Нормализация названия категории для сравнения
  private normalizeCategoryName(name: string | undefined): string {
    return (name || '').toString().trim().toLowerCase();
  }

  // Удаление дубликатов по SKU
  private removeDuplicates(products: DilovodProduct[]): DilovodProduct[] {
    const unique: { [key: string]: DilovodProduct } = {};
    
    products.forEach((item) => {
      unique[item.sku] = item;
    });
    
    return Object.values(unique);
  }
  
  // Удаление дубликатов цен по ID товара (оставляем только один экземпляр каждого товара)
  private removeDuplicatePrices(pricesResponse: DilovodPricesResponse[] | any): DilovodPricesResponse[] {
    const unique: { [key: string]: DilovodPricesResponse } = {};
    
    if (!Array.isArray(pricesResponse)) return [];
    pricesResponse.forEach((item) => {
      // Используем ID товара как ключ для уникальности
      if (!unique[item.id]) {
        unique[item.id] = item;
      }
    });
    
    return Object.values(unique);
  }

  // Логирование финального результата
  private logFinalResult(products: DilovodProduct[]): void {
    // Группируем товары по типам
    const sets = products.filter(p => p.parent === this.config.setParentId && p.set && p.set.length > 0);
    
    // Логируем количество найденных комплектов
    if (sets.length > 0) {
      logWithTimestamp(`Найдено ${sets.length} комплектов`);
    }
  }

  // Обработка остатков товаров
  processStockBalance(stockResponse: any[]): any[] {
    try {
      const result: any[] = [];
      const stockBySku: { [key: string]: { [key: string]: number } } = {};
      
      // Группируем остатки по SKU и складам
      stockResponse.forEach((row) => {
        // Используем правильные поля из ответа Dilovod API
        const sku = row.sku;
        const name = row.id__pr;
        const storage = row.storage;
        const quantity = parseFloat(row.qty) || 0;
        
        if (!stockBySku[sku]) {
          stockBySku[sku] = {};
          // Сохраняем название товара для каждого SKU
          stockBySku[sku]._name = name;
        }
        
        // Сохраняем количество по складу
        stockBySku[sku][storage] = quantity;
      });
      
      // Формируем результат
      Object.keys(stockBySku).forEach(sku => {
        const stockData = stockBySku[sku];
        
        // Определяем склады по их ID (исключаем хоз. склад)
        const mainStorage = stockData["1100700000001005"] || 0; // Склад готової продукції (Склад 1)
        const kyivStorage = stockData["1100700000001017"] || 0; // Склад готової продукції Київ (Склад 2)
        // Исключаем хоз. склад "1100700000000001"
        
        // Суммируем только товарные склады
        const total = mainStorage + kyivStorage;
        
        result.push({
          sku,
          name: stockData._name,
          mainStorage,    // Склад 1
          kyivStorage,    // Склад 2
          total
        });
      });
      
      return result;
      
    } catch (error) {
      logWithTimestamp('Ошибка обработки остатков:', error);
      throw error;
    }
  }

  // Обновление конфигурации
  updateConfig(newConfig: Partial<ReturnType<typeof getDilovodConfig>>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
