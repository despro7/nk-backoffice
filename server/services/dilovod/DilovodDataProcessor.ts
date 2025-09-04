// Процессор для обработки и трансформации данных из Dilovod

import { 
  DilovodProduct, 
  DilovodPricesResponse, 
  DilovodGoodsResponse, 
  DilovodSetComponent
} from './DilovodTypes.js';
import { DilovodApiClient } from './DilovodApiClient.js';
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

  // Основной метод обработки товаров с комплектами
  async processGoodsWithSets(
    pricesResponse: DilovodPricesResponse[],
    goodsResponse: DilovodGoodsResponse[]
  ): Promise<DilovodProduct[]> {
    try {
      // Убираем дубликаты из pricesResponse (каждый товар должен обрабатываться только один раз)
      const uniquePricesResponse = this.removeDuplicatePrices(pricesResponse);
      
      // Создаем маппинги
      const idToSku = this.createIdToSkuMapping(uniquePricesResponse);
      const pricesByGoodId = this.createPricesMapping(pricesResponse); // Оставляем оригинальный для цен
      const goodsById = this.createGoodsMapping(goodsResponse);

      // Обрабатываем товары и получаем комплекты
      const processedGoods = await this.processGoodsWithSetsAsync(
        pricesResponse, 
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
  private createIdToSkuMapping(pricesResponse: DilovodPricesResponse[]): { [key: string]: string } {
    const mapping: { [key: string]: string } = {};
    
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
  private createPricesMapping(pricesResponse: DilovodPricesResponse[]): { [key: string]: Array<{ priceType: string; price: string }> } {
    const mapping: { [key: string]: Array<{ priceType: string; price: string }> } = {};
    
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
  private createGoodsMapping(goodsResponse: DilovodGoodsResponse[]): { [key: string]: DilovodGoodsResponse } {
    const mapping: { [key: string]: DilovodGoodsResponse } = {};
    
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
      
      const set: Array<{ id: string; quantity: number }> = [];
      
      componentsArray.forEach((row: DilovodSetComponent) => {
        const id = String(row.good);
        const sku = idToSku[id] || id;
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
      const categoryName = this.extractCategoryName(good);

      result.push({
        id: good.sku,
        name: productName,
        sku: good.sku,
        costPerItem: costPerItem,
        currency: "UAH",
        category: {
          id: this.config.categoriesMap[categoryName] || 0,
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

  // Удаление дубликатов по SKU
  private removeDuplicates(products: DilovodProduct[]): DilovodProduct[] {
    const unique: { [key: string]: DilovodProduct } = {};
    
    products.forEach((item) => {
      unique[item.sku] = item;
    });
    
    return Object.values(unique);
  }
  
  // Удаление дубликатов цен по ID товара (оставляем только один экземпляр каждого товара)
  private removeDuplicatePrices(pricesResponse: DilovodPricesResponse[]): DilovodPricesResponse[] {
    const unique: { [key: string]: DilovodPricesResponse } = {};
    
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
