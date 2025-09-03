// Клиент для работы с Dilovod API

import { 
  DilovodApiRequest, 
  DilovodApiResponse,
  DilovodObjectResponse,
  DilovodGoodsResponse,
  DilovodPricesResponse
} from './DilovodTypes';
import {
  handleDilovodApiError,
  logWithTimestamp,
  validateDilovodConfig,
  getDilovodConfig,
  getDilovodConfigFromDB,
  formatDateForDilovod
} from './DilovodUtils';

export class DilovodApiClient {
  private apiUrl: string;
  private apiKey: string;
  private config: ReturnType<typeof getDilovodConfig>;

  constructor() {
    this.loadConfig();
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

      const data = await response.json();
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

    return this.makeRequest<DilovodPricesResponse[]>(request);
  }

  // Получение товаров из каталога
  async getGoodsFromCatalog(skuList: string[]): Promise<DilovodGoodsResponse[]> {
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

    return this.makeRequest<DilovodGoodsResponse[]>(request);
  }

  // Получение детальной информации об объекте (для комплектов)
  async getObject(id: string): Promise<DilovodObjectResponse> {
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
