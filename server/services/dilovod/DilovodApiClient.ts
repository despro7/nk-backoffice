// Клієнт для роботи з Dilovod API

import { 
  DilovodApiRequest, 
  DilovodApiResponse,
  DilovodObjectResponse,
  DilovodGoodsResponse,
  DilovodPricesResponse,
  DilovodOrder,
  DilovodOrderResponse
} from './DilovodTypes.js';
import { DilovodStorage } from '../../../shared/types/dilovod.js';
import {
  handleDilovodApiError,
  logWithTimestamp,
  validateDilovodConfig,
  DEFAULT_DILOVOD_CONFIG,
  getDilovodConfigFromDB,
  formatDateForDilovod
} from './DilovodUtils.js';

export class DilovodApiClient {
  public getApiKey(): string {
    return this.apiKey;
  }
  private apiUrl: string;
  private apiKey: string;
  private config: typeof DEFAULT_DILOVOD_CONFIG;
  private ready: Promise<void>;

  constructor() {
    // Ініціалізуємо і зберігаємо проміс готовності, щоб очікувати перед запитами
    this.ready = this.loadConfig();
  }

  private async ensureReady(): Promise<void> {
    if (this.ready) {
      await this.ready;
    }
    // Не кидаємо помилку тут - перевірка буде в makeRequest
  }

  /**
   * Примусово оновлює конфігурацію з БД
   * Викликається при зміні налаштувань API
   */
  public async reloadConfig(): Promise<void> {
    logWithTimestamp('DilovodApiClient: Примусове оновлення конфігурації...');
    
    // Імпортуємо функцію очищення кешу та очищаємо його
    const { clearConfigCache } = await import('./DilovodUtils.js');
    clearConfigCache();
    
    await this.loadConfig();
    logWithTimestamp(`DilovodApiClient: Конфігурацію оновлено. API Key: ${this.apiKey?.substring(0, 10)}...`);
  }

  private normalizeToArray<T>(data: any): T[] {
    if (Array.isArray(data)) return data as T[];
    if (data == null) return [] as T[];
    // Деякі відповіді можуть приходити як { data: [...] } або { rows: [...] }
    const possibleArrays = [data.data, data.rows, data.result, data.items];
    for (const candidate of possibleArrays) {
      if (Array.isArray(candidate)) return candidate as T[];
    }
    // Якщо прийшов одиночний об'єкт – обгортаємо в масив
    if (typeof data === 'object') return [data as T];
    return [] as T[];
  }

  /**
   * Завантажити конфігурацію з БД
   */
  private async loadConfig(): Promise<void> {
    try {
      this.config = await getDilovodConfigFromDB();
      this.apiUrl = this.config.apiUrl;
      this.apiKey = this.config.apiKey;

      logWithTimestamp('Dilovod конфігурація завантажена з БД');

      // Валідируємо конфігурацію (тепер без викидання помилки при старті)
      const errors = validateDilovodConfig(this.config);
      if (errors.length > 0) {
        logWithTimestamp('⚠️ Попередження конфігурації Dilovod (сервер продовжує роботу):', errors);
      }
    } catch (error) {
      logWithTimestamp('Помилка завантаження конфігурації Dilovod з БД, використовуємо значення за замовчуванням:', error);

      // У разі помилки використовуємо конфігурацію за замовчуванням
      this.config = DEFAULT_DILOVOD_CONFIG;
      this.apiUrl = this.config.apiUrl;
      this.apiKey = this.config.apiKey;

      // Валідируємо конфігурацію за замовчуванням (теж без викидання помилки)
      const errors = validateDilovodConfig(this.config);
      if (errors.length > 0) {
        logWithTimestamp('⚠️ Попередження конфігурації Dilovod за замовчуванням:', errors);
      }
    }
  }

  // Основний метод для виконання запитів до API
  async makeRequest<T = any>(request: DilovodApiRequest): Promise<T> {
    try {
      // Гарантуємо, що конфігурація завантажена перед першим запитом
      if (this.ready) {
        await this.ready;
      }
      
      // Перевіряємо конфігурацію перед запитом
      if (!this.apiUrl || !this.apiKey) {
        const errors = validateDilovodConfig(this.config);
        throw new Error(`Dilovod API не налаштовано: ${errors.join(', ')}`);
      }
      
      logWithTimestamp('Відправляємо запит до Dilovod API:', request);
      
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.text();
        logWithTimestamp('Помилка відповіді Dilovod API:', {
          status: response.status,
          statusText: response.statusText,
          data: errorData
        });
        
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as T;
      logWithTimestamp('Отримано відповідь від Dilovod API:', data);

      return data;
    } catch (error) {
      const errorMessage = handleDilovodApiError(error, 'API Request');
      logWithTimestamp('Помилка запиту до Dilovod API:', errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Отримання товарів з цінами
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

  // Отримання товарів з каталогу
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

  // Отримання детальної інформації про об'єкт (для комплектів)
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

  /**
   * Пошук товарів за списком SKU (productNum) - оптимізована версія
   * Повертає ID та productNum для мапінгу SKU → ID
   */
  async findGoodsBySkuList(skuList: string[]): Promise<Array<{ id: string; productNum: string }>> {
    await this.ensureReady();
    
    if (skuList.length === 0) {
      return [];
    }

    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "request",
      params: {
        from: "catalogs.goods",
        fields: {
          id: "id",
          productNum: "productNum"
        },
        filters: [
          {
            alias: "productNum",
            operator: "IL",
            value: skuList
          }
        ]
      }
    };

    const resp = await this.makeRequest<any>(request);
    return this.normalizeToArray<{ id: string; productNum: string }>(resp);
  }

  /**
   * Пошук контрагента за номером телефону
   */
  async findPersonByPhone(phone: string): Promise<Array<{ id: string; name: string; phone: string }>> {
    await this.ensureReady();
    
    if (!phone) {
      return [];
    }

    // Очищаємо номер телефону від зайвих символів
    const cleanPhone = phone.replace(/\D+/g, '');

    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "request",
      params: {
        from: "catalogs.persons",
        fields: {
          id: "id",
          name: "name",
          phone: "phone"
        },
        filters: [
          {
            alias: "phone",
            operator: "=",
            value: cleanPhone
          }
        ]
      }
    };

    const resp = await this.makeRequest<any>(request);
    return this.normalizeToArray<{ id: string; name: string; phone: string }>(resp);
  }

  /**
   * Створити нового контрагента
   */
  async createPerson(personData: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
  }): Promise<{ id: string; code: string }> {
    await this.ensureReady();

    const { name, phone, email, address } = personData;

    // Підготовка multilang імені
    const multilangName = {
      ru: name,
      uk: name,
    };

    // Підготовка деталей контакту
    const details: any = {
      names: [
        {
          pr: multilangName,
          kind: 'fullName',
        }
      ]
    };

    // Додаємо телефон якщо є
    if (phone) {
      const cleanPhone = phone.replace(/\D+/g, '');
      details.phones = [
        {
          pr: cleanPhone,
          kind: 'phone'
        }
      ];
    }

    // Додаємо email якщо є
    if (email) {
      details.emails = [
        {
          pr: email,
          kind: 'email'
        }
      ];
    }

    // Додаємо адресу якщо є
    if (address) {
      // Очищаємо адресу від спеціальних символів
      const cleanAddress = address
        .replace(/[''""&#039;]/g, "'")
        .replace(/[:]/g, "")
        .replace(/[&<>"'\\]/g, '');

      if (cleanAddress.trim()) {
        details.addresses = [
          {
            pr: { uk: cleanAddress },
            kind: 'legalAddress',
            detalize: '',
          }
        ];
      }
    }

    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "saveObject",
      params: {
        header: {
          id: 'catalogs.persons',
          name: multilangName,
          address: address || '',
          details: JSON.stringify(details),
        }
      }
    };

    const resp = await this.makeRequest<{ id: string; code: string }>(request);
    return resp;
  }

  // Тест підключення до API
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

  // Отримання залишків товарів
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

  // Оновлення конфігурації
  updateConfig(newConfig: Partial<typeof DEFAULT_DILOVOD_CONFIG>): void {
    this.config = { ...this.config, ...newConfig };
    this.apiUrl = this.config.apiUrl;
    this.apiKey = this.config.apiKey;
    
    logWithTimestamp('Конфігурація Dilovod оновлена:', this.config);
  }

  // Пошук замовлення за номером з опційними деталями
  async getOrderByNumber(orderNumbers: string[], withDetails = false): Promise<any[][]> {
    await this.ensureReady();
    
    // Розбиваємо на частини по 25 номерів, щоб не перевантажувати API
    const chunks = this.chunkArray(orderNumbers, 25);
    const allResults: any[] = [];
    
    for (const chunk of chunks) {
      const request: DilovodApiRequest = {
        version: "0.25",
        key: this.apiKey,
        action: "request",
        params: {
          from: "documents.saleOrder",
          fields: {
            id: "id",
            number: "number",
            date: "date",
          },
          filters: [
            {
              alias: "number",
              operator: "IL",
              value: chunk
            }
          ]
        }
      };

      try {
        const response = await this.makeRequest<any>(request);
        const orders = this.normalizeToArray<any>(response);
        allResults.push(...orders);
        
        // Маленька затримка між чанками, якщо їх більше одного
        if (chunks.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        logWithTimestamp('DilovodApiClient: Помилка отримання чанку замовлень:', error);
        // Продовжуємо з іншими чанками
      }
    }

    if (!withDetails) {
      return allResults as any;
    }

    const ordersWithDetails = await Promise.all(allResults.map(async (order) => {
      if (!order?.id) {
        return order;
      }

      try {
        const details = await this.getOrderDetails(order.id);
        return { ...order, details };
      } catch (error) {
        logWithTimestamp('DilovodApiClient: Помилка отримання деталей замовлення за ID:', {
          orderId: order.id,
          error: handleDilovodApiError(error, 'Order details fetch')
        });
        return order;
      }
    }));

    return ordersWithDetails;
  }

  /**
   * Універсальний метод пошуку документів за номером з опційними деталями
   */
  async searchDocumentByNumber(
    documentNumber: string,
    documentType: string,
    fields: Record<string, unknown>,
    withDetails = false
  ): Promise<any[]> {
    await this.ensureReady();
    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "request",
      params: {
        from: documentType,
        fields,
        filters: [
          {
            alias: "number",
            operator: "=",
            value: documentNumber
          }
        ],
        limit: 10
      }
    };

    const response = await this.makeRequest<any>(request);
    const documents = this.normalizeToArray<any>(response);

    if (!withDetails) {
      return documents;
    }

    const documentsWithDetails = await Promise.all(documents.map(async (document) => {
      if (!document?.id) {
        return document;
      }

      try {
        const details = await this.getOrderDetails(document.id);
        return { ...document, details };
      } catch (error) {
        logWithTimestamp('DilovodApiClient: Помилка отримання деталей документу за ID:', {
          documentId: document.id,
          error: handleDilovodApiError(error, 'Document details fetch')
        });
        return document;
      }
    }));

    return documentsWithDetails;
  }

  /**
   * Універсальний метод пошуку документів за baseDoc з опційними деталями
   */
  async searchDocumentByBaseDoc(
    baseDoc: string,
    documentType: string,
    fields: Record<string, unknown>,
    withDetails = false
  ): Promise<any[]> {
    await this.ensureReady();
    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "request",
      params: {
        from: documentType,
        fields,
        filters: [
          {
            alias: "baseDoc",
            operator: "=",
            value: baseDoc
          }
        ],
        limit: 10
      }
    };

    const response = await this.makeRequest<any>(request);
    const documents = this.normalizeToArray<any>(response);

    if (!withDetails) {
      return documents;
    }

    const documentsWithDetails = await Promise.all(documents.map(async (document) => {
      if (!document?.id) {
        return document;
      }

      try {
        const details = await this.getOrderDetails(document.id);
        return { ...document, details };
      } catch (error) {
        logWithTimestamp('DilovodApiClient: Помилка отримання деталей документу (baseDoc) за ID:', {
          documentId: document.id,
          error: handleDilovodApiError(error, 'Document details fetch (baseDoc)')
        });
        return document;
      }
    }));

    return documentsWithDetails;
  }

  // Отримання детальної інформації про замовлення
  async getOrderDetails(orderId: string): Promise<any> {
    await this.ensureReady();
    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "getObject",
      params: { id: orderId }
    };

    return this.makeRequest<any>(request);
  }

  // ===== МЕТОДИ ДЛЯ ДОВІДНИКІВ =====

  // Отримання мета-даних документів за baseDoc: id
  async getDocuments(baseDocId: any[], documentType: 'sale' | 'cashIn'): Promise<DilovodOrderResponse[]> {
    await this.ensureReady();
    
    // Розбиваємо на чанки по 25 ID
    const chunks = this.chunkArray(baseDocId, 25);
    const allResults: DilovodOrderResponse[] = [];
    
    for (const chunk of chunks) {
      const request: DilovodApiRequest = {
        version: "0.25",
        key: this.apiKey,
        action: "request",
        params: {
          from: `documents.${documentType}`,
          fields: { id: "id", date: "date", baseDoc: "baseDoc" },
          filters: [
            {
              alias: "baseDoc",
              operator: "IL",
              value: chunk
            }
          ]
        }
      };

      try {
        const response = await this.makeRequest<any>(request);
        const docs = this.normalizeToArray<DilovodOrderResponse>(response);
        allResults.push(...docs);
        
        if (chunks.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        logWithTimestamp(`DilovodApiClient: Помилка отримання чанку документів ${documentType}:`, error);
      }
    }
    
    return allResults;
  }

  // Отримання складів
  async getStorages(): Promise<DilovodStorage[]> {
    await this.ensureReady();
    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "request",
      params: {
        from: 'catalogs.storages',
        fields: {
          id: 'id',
          code: 'code',
          name: 'name'
        }
      }
    };

    logWithTimestamp('DilovodApiClient: Запит складів до Dilovod API');
    const result = await this.makeRequest<any>(request);
    
    logWithTimestamp(`DilovodApiClient: Сира відповідь API: ${JSON.stringify(result)}`);
    
    const normalizedResult = this.normalizeToArray<DilovodStorage>(result);
    logWithTimestamp(`DilovodApiClient: Нормалізовано складів: ${normalizedResult.length}`);
    
    // Детальний лог перших записів для діагностики
    if (normalizedResult.length > 0) {
      logWithTimestamp(`DilovodApiClient: Перший склад: ${JSON.stringify(normalizedResult[0])}`);
      if (normalizedResult.length > 1) {
        logWithTimestamp(`DilovodApiClient: Другий склад: ${JSON.stringify(normalizedResult[1])}`);
      }
    }
    
    // Фільтруємо виробничий цех зі списку складів
    const filteredResult = normalizedResult.filter(storage => {
      // Виключаємо склад виробничого цеху (ID: 1100700000001018)
      return storage.id !== '1100700000001018';
    });
    
    if (filteredResult.length !== normalizedResult.length) {
      logWithTimestamp(`DilovodApiClient: Виключено склад виробничого цеху. Залишилось складів: ${filteredResult.length}`);
    }
    
    return filteredResult;
  }

  // Отримання рахунків
  async getCashAccounts(): Promise<any[]> {
    await this.ensureReady();
    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "request",
      params: {
        from: 'catalogs.cashAccounts',
        fields: {
          id: 'id',
          code: 'code',
          name: 'name',
          owner: 'owner'
        }
      }
    };

    const result = await this.makeRequest<any>(request);
    return this.normalizeToArray(result);
  }

  // Отримання фірм (власників рахунків)
  async getFirms(): Promise<any[]> {
    await this.ensureReady();
    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "request",
      params: {
        from: 'catalogs.firms',
        fields: {
          id: 'id',
          name: 'name'
        }
      }
    };

    const result = await this.makeRequest<any>(request);
    return this.normalizeToArray(result);
  }

  // Отримання форм оплати
  async getPaymentForms(): Promise<any[]> {
    await this.ensureReady();
    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "request",
      params: {
        from: 'catalogs.paymentForms',
        fields: {
          id: 'id',
          code: 'code',
          name: 'name'
        }
      }
    };

    const result = await this.makeRequest<any>(request);
    return this.normalizeToArray(result);
  }

  // Отримання каналів продажів
  async getTradeChanels(): Promise<any[]> {
    await this.ensureReady();
    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "request",
      params: {
        from: 'catalogs.tradeChanels',
        fields: {
          id: 'id',
          code: 'code'
        }
      }
    };

    const result = await this.makeRequest<any>(request);
    return this.normalizeToArray(result);
  }

  // Отримання способів доставки
  async getDeliveryMethods(): Promise<any[]> {
    await this.ensureReady();
    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "request",
      params: {
        from: 'catalogs.deliveryMethods',
        fields: {
          id: 'id',
          code: 'code'
        }
      }
    };

    const result = await this.makeRequest<any>(request);
    return this.normalizeToArray(result);
  }

  // Отримання поточної конфігурації
  getConfig(): typeof DEFAULT_DILOVOD_CONFIG {
    return { ...this.config };
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunked: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunked.push(array.slice(i, i + size));
    }
    return chunked;
  }
}
