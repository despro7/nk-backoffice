// Клієнт для роботи з Dilovod API

import { 
  DilovodApiRequest, 
  DilovodApiResponse,
  DilovodObjectResponse,
  DilovodGoodsResponse,
  DilovodPricesResponse,
  DilovodBarCodeResponse,
  DilovodOrder,
  DilovodOrderResponse
} from './DilovodTypes.js';
import { DilovodStorage } from '../../../shared/types/dilovod.js';
import {
  handleDilovodApiError,
  validateDilovodConfig,
  DEFAULT_DILOVOD_CONFIG,
  getDilovodConfigFromDB,
  formatDateForDilovod
} from './DilovodUtils.js';
import { delay } from './DilovodUtils.js';
import { inspect } from 'node:util';

type DilovodCashItemRow = {
  id?: string;
  name?: string;
  code?: string;
  id__pr?: string;
};

export class DilovodApiClient {
  // Простий внутрішній черговий механізм для серіалізації запитів
  private requestQueue: Array<{
    request: any;
    signal?: AbortSignal;
    resolve: (v: any) => void;
    reject: (e: any) => void;
  }> = [];

  // Якщо Dilovod повідомив про penalty — зупиняємо обробку черги до цього часу (ms)
  private pauseUntil: number | null = null;

  // Чи запускається обробник черги
  private isProcessingQueue = false;

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

  public async ensureReady(): Promise<void> {
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
    console.log('DilovodApiClient: Примусове оновлення конфігурації...');
    
    // Імпортуємо функцію очищення кешу та очищаємо його
    const { clearConfigCache } = await import('./DilovodUtils.js');
    clearConfigCache();
    
    await this.loadConfig();
    console.log(`DilovodApiClient: Конфігурацію оновлено. API Key: ${this.apiKey?.substring(0, 10)}...`);
  }

  private normalizeToArray<T>(data: any): T[] {
    if (Array.isArray(data)) return data as T[];
    if (data == null) return [] as T[];
    // Деякі відповіді можуть приходити як { data: [...] } або { rows: [...] }
    const possibleArrays = [data.data, data.rows, data.result, data.items];
    for (const candidate of possibleArrays) {
      if (Array.isArray(candidate)) return candidate as T[];
    }
    // Порожній об'єкт означає відсутність рядків
    if (typeof data === 'object' && Object.keys(data).length === 0) {
      return [] as T[];
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

      // Валідируємо конфігурацію (тепер без викидання помилки при старті)
      const errors = validateDilovodConfig(this.config);
      if (errors.length > 0) {
        console.log('⚠️ Попередження конфігурації Dilovod (сервер продовжує роботу):', errors);
      }
    } catch (error) {
      console.log('Помилка завантаження конфігурації Dilovod з БД, використовуємо значення за замовчуванням:', error);

      // У разі помилки використовуємо конфігурацію за замовчуванням
      this.config = DEFAULT_DILOVOD_CONFIG;
      this.apiUrl = this.config.apiUrl;
      this.apiKey = this.config.apiKey;

      // Валідируємо конфігурацію за замовчуванням (теж без викидання помилки)
      const errors = validateDilovodConfig(this.config);
      if (errors.length > 0) {
        console.log('⚠️ Попередження конфігурації Dilovod за замовчуванням:', errors);
      }
    }
  }

  // Основний метод для виконання запитів до API — додає запит у внутрішню чергу
  async makeRequest<T = any>(request: DilovodApiRequest, signal?: AbortSignal): Promise<T> {
    // Гарантуємо, що конфігурація завантажена перед першим запитом
    if (this.ready) {
      await this.ready;
    }

    // Перевіряємо конфігурацію перед запитом
    if (!this.apiUrl || !this.apiKey) {
      const errors = validateDilovodConfig(this.config);
      throw new Error(`Dilovod API не налаштовано: ${errors.join(', ')}`);
    }

    // Перевіряємо сигнал скасування перед додаванням у чергу
    if (signal?.aborted) {
      throw new DOMException('Запит скасовано', 'AbortError');
    }

    return new Promise<T>((resolve, reject) => {
      this.requestQueue.push({ request, signal, resolve, reject });
      // Запускаємо обробку черги (якщо ще не запущено)
      void this.processQueue();
    });
  }

  // Обробник черги запитів — серіалізує запити до Dilovod
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      // Якщо встановлена пауза (penalty) — чекаємо
      if (this.pauseUntil && Date.now() < this.pauseUntil) {
        const waitMs = this.pauseUntil - Date.now();
        console.log(`DilovodApiClient: Paused due to Dilovod penalty for ${waitMs}ms`);
        await delay(waitMs);
      }

      const task = this.requestQueue.shift();
      if (!task) break;

      const { request, signal, resolve, reject } = task;

      // Якщо зовнішній сигнал уже скасовано — одразу відхиляємо
      if (signal?.aborted) {
        reject(new DOMException('Запит скасовано', 'AbortError'));
        continue;
      }

      // Повторюємо спроби при тимчасових помилках (multithread)
      const maxAttempts = 4;
      let attempt = 0;
      let lastError: any = null;

      while (attempt < maxAttempts) {
        attempt++;
        try {
          console.log('Відправляємо запит до Dilovod API (черга):', inspect({
            ...request,
            key: request.key ? `${String(request.key).substring(0, 6)}***` : undefined,
            attempt
          }, { depth: null, colors: true, compact: false }));

          const resp = await fetch(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
            signal,
          });

          const text = await resp.text();

          if (!resp.ok) {
            console.log('Помилка відповіді Dilovod API (черга):', { status: resp.status, statusText: resp.statusText, data: text });
            throw new Error(`HTTP ${resp.status}: ${resp.statusText} ${text}`);
          }

          // Парсимо JSON (можливі помилки парсингу)
          let data: any;
          try { data = JSON.parse(text); } catch { data = text as any; }

          // Якщо Dilovod повернув помилку multithread — ставимо паузу та retry
          const errStr = data && (data.error || (typeof data === 'string' ? data : undefined));
          if (errStr && String(errStr).toLowerCase().includes('multithread')) {
            console.log('DilovodApiClient: Отримано multithread помилку від Dilovod — застосовуємо паузу 30s');
            // Встановлюємо паузу на 30 секунд
            this.pauseUntil = Date.now() + 30_000;
            lastError = new Error('Dilovod: multithreadApiSession');
            // Якщо ще є спроби — зачекаємо зростаюче backoff
            const backoffMs = attempt < maxAttempts ? (attempt === 1 ? 1000 : attempt === 2 ? 2000 : 5000) : 30000;
            await delay(backoffMs);
            continue;
          }

          // Успіх — повертаємо результат
          resolve(data);
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          const msg = handleDilovodApiError(err, 'Queue request');
          // Якщо помилка містить multithread — застосовуємо паузу і спробуємо ще раз
          if (String(msg).toLowerCase().includes('multithread')) {
            console.log('DilovodApiClient: Помилка multithread в catch — чекаємо 30s перед retry');
            this.pauseUntil = Date.now() + 30_000;
            const backoffMs = attempt < maxAttempts ? (attempt === 1 ? 1000 : attempt === 2 ? 2000 : 5000) : 30000;
            await delay(backoffMs);
            continue;
          }

          // Якщо сигнал скасовано — відхиляємо без retry
          if (signal?.aborted) {
            reject(new DOMException('Запит скасовано', 'AbortError'));
            break;
          }

          // Інші помилки — лог і retry з невеликою затримкою
          console.log(`DilovodApiClient: Помилка запиту (attempt ${attempt}):`, msg);
          const backoffMs = attempt < maxAttempts ? 500 * attempt : 1000 * attempt;
          await delay(backoffMs);
        }
      }

      if (lastError) {
        const finalMsg = handleDilovodApiError(lastError, 'Final queue request');
        reject(new Error(finalMsg));
      }
    }

    this.isProcessingQueue = false;
  }

  // Отримання товарів з цінами
  async getGoodsWithPrices(skuList: string[], signal?: AbortSignal): Promise<DilovodPricesResponse[]> {
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

    const resp = await this.makeRequest<any>(request, signal);
    return this.normalizeToArray<DilovodPricesResponse>(resp);
  }

  // Отримання товарів з каталогу
  async getGoodsFromCatalog(skuList: string[], signal?: AbortSignal): Promise<DilovodGoodsResponse[]> {
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
          id__pr: "name",
          packageRatio: "packageRatio"
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

    const resp = await this.makeRequest<any>(request, signal);
    return this.normalizeToArray<DilovodGoodsResponse>(resp);
  }

  /**
   * Отримання штрих-кодів з регістру barCodes за ID товарів Dilovod (`object`).
   * Запити б'ємо чанками по 50, як і інші IL-фільтри.
   */
  async getBarCodesByObjectIds(
    objectIds: string[],
    signal?: AbortSignal
  ): Promise<DilovodBarCodeResponse[]> {
    await this.ensureReady();

    const uniqueIds = [...new Set(objectIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return [];
    }

    const chunks = this.chunkArray(uniqueIds, 50);
    const results: DilovodBarCodeResponse[] = [];

    for (const chunk of chunks) {
      if (signal?.aborted) {
        const err: any = new Error('Запит скасовано');
        err.name = 'AbortError';
        throw err;
      }

      const request: DilovodApiRequest = {
        version: "0.25",
        key: this.apiKey,
        action: "request",
        params: {
          from: {
            type: "sliceLast",
            register: "barCodes"
          },
          fields: {
            id: "id",
            object: "object",
            code: "code"
          },
          filters: [
            {
              alias: "object",
              operator: "IL",
              value: chunk
            }
          ]
        }
      };

      const resp = await this.makeRequest<any>(request, signal);
      results.push(...this.normalizeToArray<DilovodBarCodeResponse>(resp));
    }

    return results;
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
    if (resp?.error) {
      throw new Error(`Dilovod API error: ${resp.error}`);
    }
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
      console.log('Помилка під час тестування з\'єднання:', error);
      return false;
    }
  }

  // Отримання залишків товарів
  async getStockBalance(skuList: string[], firmId?: string, asOfDate?: Date): Promise<any[]> {
    await this.ensureReady();

    // Якщо дата передана — форматуємо у Kyiv timezone; інакше поточна дата
    let formattedDate: string;
    if (asOfDate) {
      const pad = (n: number) => n.toString().padStart(2, '0');
      const kyivDate = new Date(asOfDate.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
      formattedDate = `${kyivDate.getFullYear()}-${pad(kyivDate.getMonth() + 1)}-${pad(kyivDate.getDate())} ${pad(kyivDate.getHours())}:${pad(kyivDate.getMinutes())}:${pad(kyivDate.getSeconds())}`;
    } else {
      formattedDate = formatDateForDilovod('Kyiv');
    }

    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "request",
      params: {
        from: {
          "type": "balance",
          "register": "goods",
          "date": formattedDate,
          "dimensions": ["good", "storage", "firm"]
        },
        fields: {
          "good": "id",
          "good.productNum": "sku",
          "storage": "storage",
          "qty": "qty",
          "firm": "firm"
        },
        filters: [
          {
            "alias": "sku",
            "operator": "IL",
            "value": skuList
          },
          ...(firmId ? [{ "alias": "firm", "operator": "=", "value": firmId }] : [])
        ]
      }
    };

    const response = await this.makeRequest<any>(request);

    return this.normalizeToArray<any>(response);
  }

  // Оновлення конфігурації
  updateConfig(newConfig: Partial<typeof DEFAULT_DILOVOD_CONFIG>): void {
    this.config = { ...this.config, ...newConfig };
    this.apiUrl = this.config.apiUrl;
    this.apiKey = this.config.apiKey;
    
    console.log('Конфігурація Dilovod оновлена:', this.config);
  }

  // Пошук замовлення за номером з опційними деталями
  async getOrderByNumber(orderNumbers: string[], withDetails = false): Promise<any[][]> {
    await this.ensureReady();
    
    // Розбиваємо на частини по 50 номерів, щоб не перевантажувати API
    const chunks = this.chunkArray(orderNumbers, 50);
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
        console.log('DilovodApiClient: Помилка отримання чанку замовлень:', error);
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
        console.log('DilovodApiClient: Помилка отримання деталей замовлення за ID:', {
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
        console.log('DilovodApiClient: Помилка отримання деталей документу за ID:', {
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
        console.log('DilovodApiClient: Помилка отримання деталей документу (baseDoc) за ID:', {
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

  // Отримання мета-даних документів за списком baseDocId (для documents.sale, documents.cashIn, documents.saleReturn)
  async getDocuments(baseDocId: any[], documentType: 'sale' | 'cashIn' | 'saleReturn'): Promise<DilovodOrderResponse[]> {
    await this.ensureReady();
    
    // Розбиваємо на чанки по 50 ID
    const chunks = this.chunkArray(baseDocId, 50);
    const allResults: DilovodOrderResponse[] = [];
    
    for (const chunk of chunks) {
      // Для documents.sale та documents.saleReturn фільтруємо за contract, для documents.cashIn за baseDoc
      const filterAlias = documentType === 'sale' || documentType === 'saleReturn' ? 'contract' : 'baseDoc';
      
      const request: DilovodApiRequest = {
        version: "0.25",
        key: this.apiKey,
        action: "request",
        params: {
          from: `documents.${documentType}`,
          fields: { id: "id", date: "date", baseDoc: "baseDoc", contract: "contract", delMark: "delMark" },
          filters: [
            {
              alias: filterAlias,
              operator: "IL",
              value: chunk
            },
            {
              alias: "delMark",
              operator: "=",
              value: false
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
        console.log(`DilovodApiClient: Помилка отримання чанку документів ${documentType}:`, error);
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

    console.log('DilovodApiClient: Запит складів до Dilovod API');
    const result = await this.makeRequest<any>(request);
    
    console.log(`DilovodApiClient: Сира відповідь API: ${JSON.stringify(result)}`);
    
    const normalizedResult = this.normalizeToArray<DilovodStorage>(result);
    console.log(`DilovodApiClient: Нормалізовано складів: ${normalizedResult.length}`);
    
    // Детальний лог перших записів для діагностики
    if (normalizedResult.length > 0) {
      console.log(`DilovodApiClient: Перший склад: ${JSON.stringify(normalizedResult[0])}`);
      if (normalizedResult.length > 1) {
        console.log(`DilovodApiClient: Другий склад: ${JSON.stringify(normalizedResult[1])}`);
      }
    }
    
    // Фільтруємо виробничий цех зі списку складів
    const filteredResult = normalizedResult.filter(storage => {
      // Виключаємо склад виробничого цеху (ID: 1100700000001018)
      return storage.id !== '1100700000001018';
    });
    
    if (filteredResult.length !== normalizedResult.length) {
      console.log(`DilovodApiClient: Виключено склад виробничого цеху. Залишилось складів: ${filteredResult.length}`);
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

  /**
   * Види розрахунків (catalogs.settlementsKinds).
   * Якщо каталог має іншу назву — fallback через getMetadata.
   */
  async getSettlementsKinds(): Promise<any[]> {
    await this.ensureReady();
    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "request",
      params: {
        from: 'catalogs.settlementsKinds',
        fields: {
          id: 'id',
          code: 'code',
          name: 'name',
          id__pr: 'id__pr',
        }
      }
    };

    try {
      const result = await this.makeRequest<any>(request);
      if (result?.error) {
        throw new Error(String(result.error));
      }
      return this.normalizeToArray(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`⚠️ [Dilovod] catalogs.settlementsKinds недоступний (${msg}), пробуємо getMetadata`);
      try {
        const metaReq: DilovodApiRequest = {
          version: "0.25",
          key: this.apiKey,
          action: "getMetadata",
          params: { id: 'catalogs.settlementsKinds' },
        };
        await this.makeRequest<any>(metaReq);
      } catch {
        // ім'я каталогу зафіксоване як catalogs.settlementsKinds
      }
      throw error;
    }
  }

  /**
   * Статті руху коштів (header.cashItem).
   * catalogs.cashItems часто закритий роллю API — тоді збираємо унікальні
   * значення з documents.cashIn / cashOut і добираємо відомі id через getObject.
   */
  async getCashItems(): Promise<any[]> {
    await this.ensureReady();

    const catalogReq: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "request",
      params: {
        from: 'catalogs.cashItems',
        fields: {
          id: 'id',
          code: 'code',
          name: 'name',
          id__pr: 'id__pr',
        }
      }
    };

    const catalogResult = await this.makeRequest<unknown>(catalogReq);
    const catalogError = this.extractDilovodError(catalogResult);
    if (!catalogError) {
      const items = this.normalizeToArray<DilovodCashItemRow>(catalogResult).filter((item) => Boolean(item?.id));
      if (items.length > 0) return items;
    } else {
      console.log(`⚠️ [Dilovod] catalogs.cashItems недоступний (${catalogError}), збираємо статті з документів`);
    }

    const harvested = await this.harvestCashItemsFromDocuments();
    return this.mergeKnownCashItems(harvested);
  }

  private extractDilovodError(result: unknown): string | undefined {
    if (!result || typeof result !== 'object') return undefined;
    const error = (result as { error?: unknown }).error;
    return typeof error === 'string' && error.trim() ? error : undefined;
  }

  private cashItemPresentation(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
    if (typeof value !== 'object') return '';
    const rec = value as { uk?: unknown; ru?: unknown; pr?: unknown; id?: unknown };
    if (typeof rec.uk === 'string' && rec.uk.trim()) return rec.uk.trim();
    if (typeof rec.ru === 'string' && rec.ru.trim()) return rec.ru.trim();
    if (typeof rec.pr === 'string' && rec.pr.trim()) return rec.pr.trim();
    if (typeof rec.id === 'string') return rec.id.trim();
    return '';
  }

  private async harvestCashItemsFromDocuments(): Promise<DilovodCashItemRow[]> {
    const byId = new Map<string, DilovodCashItemRow>();
    for (const from of ['documents.cashIn', 'documents.cashOut'] as const) {
      try {
        const request: DilovodApiRequest = {
          version: "0.25",
          key: this.apiKey,
          action: "request",
          params: {
            from,
            fields: {
              cashItem: 'id',
              'cashItem.id__pr': 'name',
              'cashItem.code': 'code',
            },
            limit: 300,
          }
        };
        const result = await this.makeRequest<unknown>(request);
        const error = this.extractDilovodError(result);
        if (error) {
          console.log(`⚠️ [Dilovod] Не вдалося зібрати cashItem з ${from}: ${error}`);
          continue;
        }
        for (const row of this.normalizeToArray<DilovodCashItemRow>(result)) {
          const id = String(row.id ?? '').trim();
          if (!id || id === '0') continue;
          const name = String(row.name ?? row.id__pr ?? '').trim();
          const code = String(row.code ?? '').trim();
          const prev = byId.get(id);
          byId.set(id, {
            id,
            name: name || prev?.name,
            code: code || prev?.code,
            id__pr: name || prev?.id__pr,
          });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`⚠️ [Dilovod] Помилка збору cashItem з ${from}: ${msg}`);
      }
    }
    return [...byId.values()];
  }

  private async mergeKnownCashItems(harvested: DilovodCashItemRow[]): Promise<DilovodCashItemRow[]> {
    const knownIds = ['1104300000001016', '1104300000001022'];
    const byId = new Map(harvested.map((item) => [item.id, item]));

    for (const id of knownIds) {
      if (byId.has(id)) continue;
      try {
        const obj = await this.getObject(id);
        if (this.extractDilovodError(obj)) {
          byId.set(id, { id, name: id, id__pr: id });
          continue;
        }
        const header = obj.header ?? {};
        const headerId = header.id;
        const headerIdPr = headerId && typeof headerId === 'object' ? headerId.pr : undefined;
        const name = this.cashItemPresentation(header.name)
          || this.cashItemPresentation(header.id__pr)
          || this.cashItemPresentation(headerIdPr);
        byId.set(id, { id, name: name || id, id__pr: name || id });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`⚠️ [Dilovod] getObject(${id}) для cashItem: ${msg}`);
        byId.set(id, { id, name: id, id__pr: id });
      }
    }

    return [...byId.values()];
  }

  /**
   * План рахунків (catalogs.accounts) — corAccount / account у cashIn/cashOut.
   */
  async getLedgerAccounts(): Promise<any[]> {
    await this.ensureReady();
    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "request",
      params: {
        from: 'catalogs.accounts',
        fields: {
          id: 'id',
          code: 'code',
          name: 'name',
          id__pr: 'id__pr',
          parent: 'parent',
          parent__pr: 'parent__pr',
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
          code: 'code',
          id__pr: 'id__pr'
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

  // Отримання доступних партій (goodPart) по SKU з залишками по складах
  // Параметр asOfDate дозволяє отримати партії на конкретну дату
  async getBatchNumbersBySku(sku: string, firmId?: string, asOfDate?: Date): Promise<Array<{
    batchId: string;       // ID партії в Діловоді (goodPart) — для поля goodPart у payload
    batchNumber: string;   // Людська назва партії (goodPart__pr) — для відображення у UI
    storage: string;
    storageDisplayName: string;
    quantity: number;
    firm: string;
    firmDisplayName: string;
  }>> {
    await this.ensureReady();
    
    // Якщо дата передана, використовуємо її; інакше поточна дата
    // Форматуємо дату до YYYY-MM-DD HH:mm:ss у часовому поясі Europe/Kyiv
    let formattedDate: string;
    if (asOfDate) {
      const date = new Date(asOfDate);
      const pad = (n: number) => n.toString().padStart(2, '0');
      // Конвертуємо у Kyiv timezone
      const kyivDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
      formattedDate = `${kyivDate.getFullYear()}-${pad(kyivDate.getMonth() + 1)}-${pad(kyivDate.getDate())} ${pad(kyivDate.getHours())}:${pad(kyivDate.getMinutes())}:${pad(kyivDate.getSeconds())}`;
    } else {
      formattedDate = formatDateForDilovod('Kyiv');
    }
    
    // Якщо firmId не передана, беремо з конфігурації
    const effectiveFirmId = firmId || this.config.defaultFirmId;

    const request: DilovodApiRequest = {
      version: "0.25",
      key: this.apiKey,
      action: "request",
      params: {
        from: {
          type: "balance",
          register: "goods",
          date: formattedDate,
          dimensions: ["good", "goodPart", "storage", "firm"]
        },
        fields: {
          good: "id",
          "good.productNum": "sku",
          goodPart: "goodPart",
          storage: "storage",
          qty: "qty",
          firm: "firm"
        },
        filters: [
          {
            alias: "sku",
            operator: "=",
            value: sku
          },
          {
            alias: "qty",
            operator: ">",
            value: 0
          },
          ...(effectiveFirmId ? [{ alias: "firm", operator: "=", value: effectiveFirmId }] : [])
        ]
      }
    };

    try {
      console.log(`📦 [DilovodApiClient] Запит партій для SKU ${sku} на дату ${formattedDate}${effectiveFirmId ? ` з фірмою ${effectiveFirmId}` : ' (без фільтра по фірмі)'}`);
      // console.log(`📦 [DilovodApiClient] Запит:`, JSON.stringify(request, null, 2));
      
      const result = await this.makeRequest<any>(request);
      
      // console.log(`📦 [DilovodApiClient] Сира відповідь Dilovod:`, JSON.stringify(result, null, 2));
      
      const rows = this.normalizeToArray<any>(result);

      // console.log(`📦 [DilovodApiClient] Нормалізовано ${rows.length} рядків`);
      
      // Трансформуємо відповідь з Dilovod в зручний формат для клієнта
      const transformed = rows.map((row: any) => {
        console.log(`📦 [DilovodApiClient] Обробляємо рядок:`, row);
        return {
          batchId: row.goodPart || '',
          batchNumber: row.goodPart__pr || row.goodPart || 'невідома',
          storage: row.storage || 'unknown',
          storageDisplayName: row.storage__pr || 'невідомий склад',
          quantity: parseFloat(row.qty) || 0,
          firm: row.firm || 'unknown',
          firmDisplayName: row.firm__pr || 'невідома фірма'
        };
      });
      
      console.log(`✅ [DilovodApiClient] Трансформовано ${transformed.length} партій для SKU ${sku}`);
      return transformed;
    } catch (error) {
      console.error(`🚨 Помилка отримання партій для SKU ${sku}:`, error);
      return [];
    }
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
