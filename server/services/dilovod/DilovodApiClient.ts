// Клиент для работы с Dilovod API

import { 
  DilovodApiRequest, 
  DilovodApiResponse,
  DilovodObjectResponse,
  DilovodGoodsResponse,
  DilovodPricesResponse
} from './DilovodTypes.js';
import {
  handleDilovodApiError,
  logWithTimestamp,
  validateDilovodConfig,
  getDilovodConfig,
  getDilovodConfigFromDB,
  formatDateForDilovod
} from './DilovodUtils.js';

export class DilovodApiClient {
  private apiUrl: string;
  private apiKey: string;
  private config: ReturnType<typeof getDilovodConfig>;
  private ready: Promise<void>;

  constructor() {
    // Инициализируем и сохраняем промис готовности, чтобы ожидать перед запросами
    this.ready = this.loadConfig();
  }

  private async ensureReady(): Promise<void> {
    if (this.ready) {
      await this.ready;
    }
    if (!this.apiUrl || !this.apiKey) {
      // Последняя попытка перезагрузить конфиг
      await this.loadConfig();
      if (!this.apiUrl || !this.apiKey) {
        throw new Error('Dilovod API URL/API KEY is not configured');
      }
    }
  }

  private normalizeToArray<T>(data: any): T[] {
    if (Array.isArray(data)) return data as T[];
    if (data == null) return [] as T[];
    // Некоторые ответы могут приходить как { data: [...] } или { rows: [...] }
    const possibleArrays = [data.data, data.rows, data.result, data.items];
    for (const candidate of possibleArrays) {
      if (Array.isArray(candidate)) return candidate as T[];
    }
    // Если пришел одиночный объект – оборачиваем в массив
    if (typeof data === 'object') return [data as T];
    return [] as T[];
  }

  /**
   * Загрузить конфигурацию из БД
   */
  private async loadConfig(): Promise<void> {
    try {
      this.config = await getDilovodConfigFromDB();
      this.apiUrl = this.config.apiUrl;
      this.apiKey = this.config.apiKey;

      logWithTimestamp('Dilovod конфигурация загружена из БД');

      // Валидируем конфигурацию
      const errors = validateDilovodConfig(this.config);
      if (errors.length > 0) {
        logWithTimestamp('Ошибки конфигурации Dilovod:', errors);
        throw new Error(`Ошибки конфигурации Dilovod: ${errors.join(', ')}`);
      }
    } catch (error) {
      logWithTimestamp('Ошибка загрузки конфигурации Dilovod из БД, используем значения по умолчанию:', error);

      // В случае ошибки используем конфигурацию по умолчанию
      this.config = getDilovodConfig();
      this.apiUrl = this.config.apiUrl;
      this.apiKey = this.config.apiKey;

      // Валидируем конфигурацию по умолчанию
      const errors = validateDilovodConfig(this.config);
      if (errors.length > 0) {
        logWithTimestamp('Ошибки конфигурации Dilovod по умолчанию:', errors);
        throw new Error(`Ошибки конфигурации Dilovod: ${errors.join(', ')}`);
      }
    }
  }

  // Основной метод для выполнения запросов к API
  async makeRequest<T = any>(request: DilovodApiRequest): Promise<T> {
    try {
      // Гарантируем, что конфигурация загружена перед первым запросом
      if (this.ready) {
        await this.ready;
      }
      logWithTimestamp('Отправляем запрос к Dilovod API:', request);
      
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.text();
        logWithTimestamp('Ошибка ответа Dilovod API:', {
          status: response.status,
          statusText: response.statusText,
          data: errorData
        });
        
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as T;
      logWithTimestamp('Получен ответ от Dilovod API:', data);

      return data;
    } catch (error) {
      const errorMessage = handleDilovodApiError(error, 'API Request');
      logWithTimestamp('Ошибка запроса к Dilovod API:', errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Получение товаров с ценами
  async getGoodsWithPrices(skuList: string[]): Promise<DilovodPricesResponse[]> {
    await this.ensureReady();
    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "request",
      params: {
        from: {
          type: "sliceLast",
          register: "goodsPrices",
          date: new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Kyiv', hour12: false }),
        },
        fields: {
          good: "id",
          "good.productNum": "sku",
          "good.parent": "parent",
          priceType: "priceType",
          price: "price"
        },
        filters: [
          {
            alias: "sku",
            operator: "IL",
            value: skuList
          }
        ]
      }
    };

    const resp = await this.makeRequest<any>(request);
    return this.normalizeToArray<DilovodPricesResponse>(resp);
  }

  // Получение товаров из каталога
  async getGoodsFromCatalog(skuList: string[]): Promise<DilovodGoodsResponse[]> {
    await this.ensureReady();
    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "request",
      params: {
        from: "catalogs.goods",
        fields: {
          id: "id",
          productNum: "sku",
          parent: "parent",
          id__pr: "name"
        },
        filters: [
          {
            alias: "sku",
            operator: "IL",
            value: skuList
          }
        ]
      }
    };

    const resp = await this.makeRequest<any>(request);
    return this.normalizeToArray<DilovodGoodsResponse>(resp);
  }

  // Получение детальной информации об объекте (для комплектов)
  async getObject(id: string): Promise<DilovodObjectResponse> {
    await this.ensureReady();
    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "getObject",
      params: { id }
    };

    return this.makeRequest<DilovodObjectResponse>(request);
  }

  // Тест подключения к API
  async testConnection(): Promise<boolean> {
    try {
      await this.ensureReady();
      const request: DilovodApiRequest = {
        version: "0.25",
        key: this.apiKey,
        action: "request",
        params: {
          from: "catalogs.goods",
          fields: { id: "id" },
          filters: [],
          limit: 1
        }
      };

      await this.makeRequest(request);
      return true;
    } catch (error) {
      logWithTimestamp('Ошибка тестирования подключения:', error);
      return false;
    }
  }

  // Получение остатков товаров
  async getStockBalance(skuList: string[]): Promise<any[]> {
    await this.ensureReady();
    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "request",
      params: {
        from: {
          "type": "balance",
          "register": "goods",
          "date": formatDateForDilovod('Kyiv'),
          "dimensions": ["good", "storage"]
        },
        fields: {
          "good": "id",
          "good.productNum": "sku",
          "storage": "storage",
          "qty": "qty"
        },
        filters: [
          {
            "alias": "sku",
            "operator": "IL",
            "value": skuList
          }
        ]
      }
    };

    return this.makeRequest<any[]>(request);
  }

  // Обновление конфигурации
  updateConfig(newConfig: Partial<ReturnType<typeof getDilovodConfig>>): void {
    this.config = { ...this.config, ...newConfig };
    this.apiUrl = this.config.apiUrl;
    this.apiKey = this.config.apiKey;
    
    logWithTimestamp('Конфигурация Dilovod обновлена:', this.config);
  }

  // Получение текущей конфигурации
  getConfig(): ReturnType<typeof getDilovodConfig> {
    return { ...this.config };
  }
}
