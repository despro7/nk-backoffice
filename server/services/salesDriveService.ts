import { orderDatabaseService } from './orderDatabaseService.js';
import { syncSettingsService } from './syncSettingsService.js';
import { syncHistoryService, CreateSyncHistoryData } from './syncHistoryService.js';

// Node.js types for setInterval
declare const setInterval: (callback: () => void, ms: number) => NodeJS.Timeout;

export interface SalesDriveOrder {
  id: string;
  orderNumber: string;
  ttn: string;
  rawData: any;
  quantity: number;
  status: string;
  statusText: string; // Текстовое представление статуса
  items: Array<{
    productName: string;
    quantity: number;
    price: number;
    sku: string;
  }>;
  // Дополнительные поля из SalesDrive
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  totalPrice?: number;
  createdAt?: string;
  orderDate?: string;
  // Новые поля
  externalId?: string;
  shippingMethod?: string;
  paymentMethod?: string;
  cityName?: string;
  provider?: string;
  pricinaZnizki?: string;
  sajt?: string;
}

export interface SalesDriveApiResponse {
  success: boolean;
  data?: SalesDriveOrder[];
  error?: string;
  metadata?: any;
}

export interface SalesDriveRawApiResponse {
  status: string;
  message?: string;
  data?: any[];
  totals?: {
    count?: number;
  };
}

export interface SalesDriveStatusUpdateResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export class SalesDriveService {
  private apiUrl: string;
  private apiKey: string;
  private formKey: string;
  private rateLimitState: {
    consecutive429Errors: number;
    last429Time: number;
    baseDelay: number;
    maxDelay: number;
    jitterRange: number;
  };
  private cacheState: {
    data: Map<string, { data: any; timestamp: number; expiresAt: number; accessCount: number; lastAccess: number }>;
    maxSize: number;
    defaultTTL: number; // Time To Live в миллисекундах
    cleanupInterval: NodeJS.Timeout | null;
  };
  private syncSettings: any = {}; // Настройки синхронизации из БД

  constructor() {
    this.apiUrl = process.env.SALESDRIVE_API_URL || '';
    this.apiKey = process.env.SALESDRIVE_API_KEY || '';
    this.formKey = process.env.SALESDRIVE_FORM_KEY || '';

    // Убираем /api/order/list/ из базового URL, так как он добавляется в методах
    if (this.apiUrl.endsWith('/api/order/list/')) {
      this.apiUrl = this.apiUrl.replace('/api/order/list/', '');
    }

    if (!this.apiUrl || !this.apiKey) {
      console.warn('SalesDrive API credentials not configured');
    }

    if (!this.formKey) {
      console.warn('SalesDrive form key not configured');
    }

    // Загружаем настройки синхронизации из БД
    this.loadSyncSettings();

    // Инициализация состояния rate limiting
    this.rateLimitState = {
      consecutive429Errors: 0,
      last429Time: 0,
      baseDelay: this.getSetting('orders.baseDelay', 2000), // Начальная задержка 2 секунды
      maxDelay: this.getSetting('orders.maxDelay', 30000), // Максимальная задержка 30 секунд
      jitterRange: this.getSetting('orders.jitterRange', 1000) // Диапазон jitter ±1 секунда
    };

    // Инициализация состояния кеширования
    this.cacheState = {
      data: new Map(),
      maxSize: this.getSetting('general.cacheMaxSize', 50), // Максимум 50 записей в кеше
      defaultTTL: this.getSetting('general.cacheTTL', 15 * 60 * 1000), // 15 минут по умолчанию
      cleanupInterval: null
    };

    // Запускаем автоматическую очистку кеша
    this.startCacheCleanup();
  }

  /**
   * Загружает настройки синхронизации из БД
   */
  private async loadSyncSettings(): Promise<void> {
    try {
      this.syncSettings = await syncSettingsService.getSyncSettings();
      console.log('✅ [SalesDrive] Sync settings loaded from database');
    } catch (error) {
      console.error('❌ [SalesDrive] Failed to load sync settings, using defaults:', error);
      this.syncSettings = {};
    }
  }

  /**
   * Получает настройку по ключу с fallback на дефолтное значение
   */
  private getSetting(key: string, defaultValue: any): any {
    const keys = key.split('.');
    let value = this.syncSettings;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }

    return value !== undefined ? value : defaultValue;
  }

  /**
   * Вычисляет адаптивную задержку при rate limiting
   */
  private calculateAdaptiveDelay(): number {
    const state = this.rateLimitState;
    const now = Date.now();

    // Если прошло много времени с последнего 429, сбрасываем счетчик
    if (now - state.last429Time > 60000) { // 1 минута
      state.consecutive429Errors = 0;
    }

    // Экспоненциальная задержка с основанием 2
    const exponentialDelay = Math.min(
      state.baseDelay * Math.pow(2, state.consecutive429Errors),
      state.maxDelay
    );

    // Добавляем jitter для распределения нагрузки
    const jitter = (Math.random() - 0.5) * 2 * state.jitterRange;
    const adaptiveDelay = Math.max(500, exponentialDelay + jitter); // Минимум 500мс

    console.log(`🕐 Rate limit delay calculated: ${Math.round(adaptiveDelay)}ms (attempt ${state.consecutive429Errors + 1})`);

    return adaptiveDelay;
  }

  /**
   * Обрабатывает rate limiting ошибку
   */
  private handleRateLimit(): number {
    const state = this.rateLimitState;
    state.consecutive429Errors++;
    state.last429Time = Date.now();

    return this.calculateAdaptiveDelay();
  }

  /**
   * Сбрасывает состояние rate limiting при успешном запросе
   */
  private resetRateLimitState(): void {
    const state = this.rateLimitState;
    if (state.consecutive429Errors > 0) {
      state.consecutive429Errors = Math.max(0, state.consecutive429Errors - 1);
      console.log(`✅ Rate limit state reset, consecutive errors: ${state.consecutive429Errors}`);
    }
  }

  /**
   * Запускает автоматическую очистку кеша
   */
  private startCacheCleanup(): void {
    // Очистка с интервалом из настроек (по умолчанию 5 минут)
    const cleanupInterval = this.getSetting('general.cacheCleanupInterval', 5 * 60 * 1000);
    this.cacheState.cleanupInterval = setInterval(() => {
      this.cleanupExpiredCache();
    }, cleanupInterval);

    console.log(`🧹 Cache cleanup service started (interval: ${Math.round(cleanupInterval / 1000)}s)`);
  }

  /**
   * Очищает просроченные записи из кеша
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    const cache = this.cacheState.data;
    let cleaned = 0;

    for (const [key, entry] of cache.entries()) {
      if (now > entry.expiresAt) {
        cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} expired cache entries`);
    }
  }

  /**
   * Получает данные из кеша или null если данных нет или они просрочены
   */
  private getCachedData(key: string): any | null {
    const entry = this.cacheState.data.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();

    // Проверяем срок годности
    if (now > entry.expiresAt) {
      this.cacheState.data.delete(key);
      return null;
    }

    // Обновляем статистику доступа
    entry.accessCount++;
    entry.lastAccess = now;

    console.log(`💾 Cache hit for key: ${key} (accessed ${entry.accessCount} times)`);
    return entry.data;
  }

  /**
   * Сохраняет данные в кеш с автоматическим управлением размером
   */
  private setCachedData(key: string, data: any, customTTL?: number): void {
    const now = Date.now();
    const ttl = customTTL || this.cacheState.defaultTTL;

    // Если кеш переполнен, удаляем наименее используемые записи
    if (this.cacheState.data.size >= this.cacheState.maxSize) {
      this.evictLeastUsedCacheEntries();
    }

    this.cacheState.data.set(key, {
      data,
      timestamp: now,
      expiresAt: now + ttl,
      accessCount: 1,
      lastAccess: now
    });

    console.log(`💾 Cached data for key: ${key} (TTL: ${Math.round(ttl / 1000)}s)`);
  }

  /**
   * Удаляет наименее используемые записи из кеша
   */
  private evictLeastUsedCacheEntries(): void {
    const cache = this.cacheState.data;
    const entries = Array.from(cache.entries());

    // Сортируем по частоте использования и времени последнего доступа
    entries.sort(([, a], [, b]) => {
      // Сначала по количеству доступов (меньше - хуже)
      if (a.accessCount !== b.accessCount) {
        return a.accessCount - b.accessCount;
      }
      // Затем по времени последнего доступа (старше - хуже)
      return a.lastAccess - b.lastAccess;
    });

    // Удаляем 25% самых редко используемых записей
    const toEvict = Math.ceil(entries.length * 0.25);
    for (let i = 0; i < toEvict; i++) {
      cache.delete(entries[i][0]);
    }

    console.log(`🗑️ Evicted ${toEvict} least-used cache entries`);
  }

  /**
   * Генерирует ключ кеша для запроса
   */
  private generateCacheKey(method: string, params: any): string {
    return `${method}:${JSON.stringify(params)}`;
  }

  /**
   * Интеллектуально определяет TTL для данных на основе их типа и частоты изменений
   */
  private determineTTL(method: string, dataSize: number): number {
    const baseTTL = this.cacheState.defaultTTL;

    // Для больших объемов данных используем более длительное кеширование
    if (dataSize > 1000) {
      return baseTTL * 2; // 30 минут
    }

    // Для часто меняющихся данных (статистика) - короче
    if (method.includes('stats') || method.includes('sync')) {
      return baseTTL * 0.5; // 7.5 минут
    }

    // Для заказов - стандартное время
    return baseTTL;
  }

  /**
   * Проверяет соединение с SalesDrive API
   */
  async checkApiConnection(): Promise<boolean> {
    try {
      if (!this.apiUrl || !this.apiKey) {
        return false;
      }

      // Используем правильный эндпоинт SalesDrive API
      const response = await fetch(`${this.apiUrl}/api/order/list/?page=1&limit=1`, {
        method: 'GET',
        headers: {
          'Form-Api-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
      });

      return response.ok;
    } catch (error) {
      console.error('SalesDrive API connection failed:', error);
      return false;
    }
  }

  /**
   * Загружает все заказы с 01.07.2025 из SalesDrive с retry логикой
   */
  async fetchOrdersFromDate(): Promise<SalesDriveApiResponse> {
    const maxRetries = this.getSetting('orders.retryAttempts', 3);
    const retryDelay = this.getSetting('orders.retryDelay', 2000); // задержка между попытками

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.apiUrl || !this.apiKey) {
          throw new Error('SalesDrive API credentials not configured');
        }

        // Дата начала: 01.07.2025
        const startDate = '2025-07-01';
        const currentDate = new Date().toISOString().split('T')[0];

        console.log(`Fetching orders from ${startDate} to ${currentDate} (attempt ${attempt}/${maxRetries})`);

        // Параметры для API запроса согласно документации SalesDrive
        const batchSize = this.getSetting('orders.batchSize', 50);
        const params = new URLSearchParams({
          page: '1',
          limit: batchSize.toString(), // Используем настройку batch size
          'filter[orderTime][from]': startDate,
          'filter[orderTime][to]': currentDate,
          'filter[statusId]': '__ALL__' // Все статусы, включая удаленные
        });

        const response = await fetch(`${this.apiUrl}/api/order/list/?${params}`, {
          method: 'GET',
          headers: {
            'Form-Api-Key': this.apiKey,
            'Content-Type': 'application/json',
          },
        });

        if (response.status === 429) {
          // Rate limiting - используем адаптивную задержку
          const adaptiveDelay = this.handleRateLimit();
          console.log(`Rate limited (429), waiting ${Math.round(adaptiveDelay)}ms before retry...`);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
            continue;
          } else {
            throw new Error('Rate limit exceeded after all retries');
          }
        }

        // Сбрасываем состояние rate limiting при успешном запросе
        this.resetRateLimitState();

        if (!response.ok) {
          throw new Error(`SalesDrive API error: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json() as SalesDriveRawApiResponse;

        console.log(`Received response from SalesDrive:`, data);

        // Проверяем структуру ответа согласно документации SalesDrive
        if (data.status !== 'success') {
          throw new Error(`SalesDrive API error: ${data.message || 'Unknown error'}`);
        }

        // Согласно документации, заказы находятся в data.data
        const orders = data.data || [];
        console.log(`Received ${orders.length} orders from SalesDrive`);

        // Структурируем и форматируем каждый заказ
        const formattedOrders = orders.map((order: any) => {
          return this.formatOrder(order);
        });

        console.log(`Formatted ${formattedOrders.length} orders`);

        return {
          success: true,
          data: formattedOrders,
        };
      } catch (error) {
        console.error(`Error fetching SalesDrive orders (attempt ${attempt}):`, error);
        
        if (attempt === maxRetries) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
        
        // Ждем перед следующим попыткой
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    return {
      success: false,
      error: 'Max retries exceeded',
    };
  }

  /**
   * Получает заказы с момента последней синхронизации
   */
  async fetchOrdersSinceLastSync(): Promise<SalesDriveApiResponse> {
    try {
      console.log('🔄 [SYNC] Starting fetchOrdersSinceLastSync...');

      // Получаем время последней синхронизации
      const lastSyncTime = await orderDatabaseService.getLastSyncedOrder();
      const now = new Date();
      const currentDate = now.toISOString().split('T')[0];

      console.log('🔄 [SYNC] Current time:', now.toISOString());
      console.log('🔄 [SYNC] Last sync info:', lastSyncTime ? {
        lastSynced: lastSyncTime.lastSynced,
        formatted: lastSyncTime.lastSynced ? new Date(lastSyncTime.lastSynced).toISOString() : 'null'
      } : 'No last sync found');

      // Если последняя синхронизация была сегодня, берем заказы за последние 7 дней
      let startDate: string;
      if (lastSyncTime?.lastSynced) {
        const lastSync = new Date(lastSyncTime.lastSynced);
        const diffDays = Math.floor((now.getTime() - lastSync.getTime()) / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((now.getTime() - lastSync.getTime()) / (1000 * 60 * 60));

        console.log(`🔄 [SYNC] Time difference: ${diffDays} days, ${diffHours} hours since last sync`);

        if (diffDays === 0) {
          // Если синхронизировались сегодня, берем за последние 7 дней
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          startDate = sevenDaysAgo.toISOString().split('T')[0];
          console.log(`🔄 [SYNC] Last sync was today, fetching orders from last 7 days: ${startDate} to ${currentDate}`);
        } else {
          // Если синхронизировались раньше, берем с момента последней синхронизации
          startDate = lastSync.toISOString().split('T')[0];
          console.log(`🔄 [SYNC] Fetching orders since last sync: ${startDate} to ${currentDate}`);
        }
      } else {
        // Если синхронизации не было, берем за последний месяц
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        startDate = oneMonthAgo.toISOString().split('T')[0];
        console.log(`🔄 [SYNC] No previous sync found, fetching orders from last month: ${startDate} to ${currentDate}`);
      }

      console.log(`🔄 [SYNC] Final date range: ${startDate} to ${currentDate}`);

      return await this.fetchOrdersFromDateRangeParallel(startDate, currentDate);
    } catch (error) {
      console.error('Error fetching orders since last sync:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Получает заказы за определенный период с пагинацией (параллельная версия)
   */
  private async fetchOrdersFromDateRangeParallel(startDate: string, endDate: string): Promise<SalesDriveApiResponse> {
    const maxRetries = this.getSetting('orders.retryAttempts', 3);
    const retryDelay = this.getSetting('orders.retryDelay', 2000);
    const concurrencyLimit = this.getSetting('general.maxConcurrentSyncs', 5); // Загружаем по N страниц параллельно

    console.log(`🔧 [SalesDrive] Using sync settings: retries=${maxRetries}, delay=${retryDelay}ms, concurrency=${concurrencyLimit}`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.apiUrl || !this.apiKey) {
          throw new Error('SalesDrive API credentials not configured');
        }

        console.log(`🔄 Parallel fetching orders from ${startDate} to ${endDate} (attempt ${attempt}/${maxRetries})`);

        // Сначала получаем первую страницу, чтобы узнать общее количество
        const batchSize = this.getSetting('orders.batchSize', 200);
        const firstPageParams = new URLSearchParams({
          page: '1',
          limit: batchSize.toString(),
          'filter[orderTime][from]': startDate,
          'filter[orderTime][to]': endDate,
          'filter[statusId]': '__ALL__'
        });

        console.log(`📄 Fetching first page to determine total pages...`);
        const firstResponse = await fetch(`${this.apiUrl}/api/order/list/?${firstPageParams}`, {
          method: 'GET',
          headers: {
            'Form-Api-Key': this.apiKey,
            'Content-Type': 'application/json',
          },
        });

        if (firstResponse.status === 429) {
          const adaptiveDelay = this.handleRateLimit();
          console.log(`Rate limited (429), waiting ${Math.round(adaptiveDelay)}ms before retry...`);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
            continue;
          } else {
            throw new Error('Rate limit exceeded after all retries');
          }
        }

        // Сбрасываем состояние rate limiting при успешном запросе
        this.resetRateLimitState();

        if (!firstResponse.ok) {
          throw new Error(`SalesDrive API error: ${firstResponse.status} - ${firstResponse.statusText}`);
        }

        const firstData = await firstResponse.json() as SalesDriveRawApiResponse;

        if (firstData.status !== 'success') {
          throw new Error(`SalesDrive API error: ${firstData.message || 'Unknown error'}`);
        }

        const firstPageOrders = firstData.data || [];
        const totalOrders = firstData.totals?.count || firstData.data?.length || 0;
        const totalPages = Math.ceil(totalOrders / 200);
        const maxAllowedPages = Math.min(totalPages, 100); // Максимум 100 страниц

        console.log(`📊 Total orders: ${totalOrders}, Total pages: ${totalPages}, Will fetch: ${maxAllowedPages} pages`);

        // Если всего одна страница, возвращаем результат сразу
        if (maxAllowedPages <= 1) {
          return {
            success: true,
            data: this.formatOrdersList(firstPageOrders),
          };
        }

        // Загружаем оставшиеся страницы параллельно
        const allOrders = [...firstPageOrders];
        const pagePromises: Promise<any[]>[] = [];

        for (let page = 2; page <= maxAllowedPages; page++) {
          pagePromises.push(this.fetchSinglePage(startDate, endDate, page));
        }

        // Разбиваем на батчи для контроля concurrency
        const batches: Promise<any[]>[][] = [];
        for (let i = 0; i < pagePromises.length; i += concurrencyLimit) {
          batches.push(pagePromises.slice(i, i + concurrencyLimit));
        }

        // Выполняем батчи последовательно, но внутри батча - параллельно
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          console.log(`🔄 Processing batch ${batchIndex + 1}/${batches.length} (${batches[batchIndex].length} pages)`);

          const batchResults = await Promise.allSettled(batches[batchIndex]);

          for (const result of batchResults) {
            if (result.status === 'fulfilled') {
              allOrders.push(...result.value);
            } else {
              const error = result.reason as Error;
              if (error.message.includes('RATE_LIMIT_429')) {
                // При rate limiting - повторяем всю пачку с задержкой
                console.log(`🚦 Rate limit detected in batch, applying adaptive delay...`);
                const adaptiveDelay = this.handleRateLimit();
                await new Promise(resolve => setTimeout(resolve, adaptiveDelay));

                // Повторяем текущую пачку
                const retryBatch = await Promise.allSettled(batches[batchIndex]);
                for (const retryResult of retryBatch) {
                  if (retryResult.status === 'fulfilled') {
                    allOrders.push(...retryResult.value);
                  } else {
                    console.warn(`❌ Failed to fetch page after retry:`, retryResult.reason);
                  }
                }
              } else {
                console.warn(`❌ Failed to fetch page:`, error.message);
              }
            }
          }

          // Небольшая задержка между батчами
          if (batchIndex < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        console.log(`✅ Parallel fetch completed: ${allOrders.length} orders from ${maxAllowedPages} pages`);

        return {
          success: true,
          data: this.formatOrdersList(allOrders),
        };

      } catch (error) {
        console.error(`Error in parallel fetch (attempt ${attempt}):`, error);

        if (attempt === maxRetries) {
          // Если параллельная загрузка не удалась, пробуем обычную
          console.log('🔄 Falling back to sequential loading...');
          return await this.fetchOrdersFromDateRange(startDate, endDate);
        }

        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    return {
      success: false,
      error: 'Max retries exceeded',
    };
  }

  /**
   * Загружает одну страницу заказов с обработкой rate limiting
   */
  private async fetchSinglePage(startDate: string, endDate: string, page: number): Promise<any[]> {
    const batchSize = this.getSetting('orders.batchSize', 200);
    const params = new URLSearchParams({
      page: page.toString(),
      limit: batchSize.toString(),
      'filter[orderTime][from]': startDate,
      'filter[orderTime][to]': endDate,
      'filter[statusId]': '__ALL__'
    });

    const response = await fetch(`${this.apiUrl}/api/order/list/?${params}`, {
      method: 'GET',
      headers: {
        'Form-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 429) {
      // При rate limiting в параллельной загрузке - бросаем ошибку для повторной попытки
      throw new Error(`RATE_LIMIT_429`);
    }

    if (!response.ok) {
      throw new Error(`Page ${page} failed: ${response.status} - ${response.statusText}`);
    }

    // Сбрасываем состояние rate limiting при успешном запросе
    this.resetRateLimitState();

    const data = await response.json() as SalesDriveRawApiResponse;

    if (data.status !== 'success') {
      throw new Error(`Page ${page} API error: ${data.message || 'Unknown error'}`);
    }

    return data.data || [];
  }

  /**
   * Форматирует список заказов
   */
  private formatOrdersList(orders: any[]): SalesDriveOrder[] {
    return orders.map((order: any) => this.formatOrder(order));
  }

  /**
   * Получает заказы за определенный период с пагинацией (последовательная версия для fallback)
   */
  private async fetchOrdersFromDateRange(startDate: string, endDate: string): Promise<SalesDriveApiResponse> {
    const maxRetries = this.getSetting('orders.retryAttempts', 3);
    const retryDelay = this.getSetting('orders.retryDelay', 2000);
    const allOrders: any[] = [];
    let currentPage = 1;
    const maxPages = this.getSetting('orders.maxPages', 100); // Максимальное количество страниц

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.apiUrl || !this.apiKey) {
          throw new Error('SalesDrive API credentials not configured');
        }

        console.log(`🔄 Fetching orders from ${startDate} to ${endDate} (attempt ${attempt}/${maxRetries})`);

        // Получаем заказы постранично
        while (currentPage <= maxPages) {
          const batchSize = this.getSetting('orders.batchSize', 200);
          const params = new URLSearchParams({
            page: currentPage.toString(),
            limit: batchSize.toString(), // Используем настройку batch size
            'filter[orderTime][from]': startDate,
            'filter[orderTime][to]': endDate,
            'filter[statusId]': '__ALL__'
          });

          console.log(`📄 Fetching page ${currentPage}...`);

          const response = await fetch(`${this.apiUrl}/api/order/list/?${params}`, {
            method: 'GET',
            headers: {
              'Form-Api-Key': this.apiKey,
              'Content-Type': 'application/json',
            },
          });

          if (response.status === 429) {
            const adaptiveDelay = this.handleRateLimit();
            console.log(`Rate limited (429), waiting ${Math.round(adaptiveDelay)}ms before retry...`);
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, adaptiveDelay));
              break;
            } else {
              throw new Error('Rate limit exceeded after all retries');
            }
          }

          // Сбрасываем состояние rate limiting при успешном запросе
          this.resetRateLimitState();

          if (!response.ok) {
            throw new Error(`SalesDrive API error: ${response.status} - ${response.statusText}`);
          }

          const data = await response.json() as SalesDriveRawApiResponse;

          if (data.status !== 'success') {
            throw new Error(`SalesDrive API error: ${data.message || 'Unknown error'}`);
          }

          const orders = data.data || [];
          console.log(`📄 Page ${currentPage}: received ${orders.length} orders`);

          if (orders.length === 0) {
            console.log(`📄 No more orders on page ${currentPage}, stopping pagination`);
            break;
          }

          allOrders.push(...orders);

          // Проверяем, есть ли еще страницы
          if (orders.length < batchSize) {
            console.log(`📄 Last page reached (${orders.length} orders), stopping pagination`);
            break;
          }

          currentPage++;

          // Небольшая задержка между страницами
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        console.log(`✅ Total orders received: ${allOrders.length} from ${currentPage} pages`);

        const formattedOrders = allOrders.map((order: any) => this.formatOrder(order));

        return {
          success: true,
          data: formattedOrders,
        };

      } catch (error) {
        console.error(`Error fetching SalesDrive orders (attempt ${attempt}):`, error);
        
        if (attempt === maxRetries) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    return {
      success: false,
      error: 'Max retries exceeded',
    };
  }

  /**
   * Получает заказы за текущий месяц
   */
  async fetchOrdersForCurrentMonth(): Promise<SalesDriveApiResponse> {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      const startDate = startOfMonth.toISOString().split('T')[0];
      const endDate = endOfMonth.toISOString().split('T')[0];

      console.log(`📅 Fetching orders for current month: ${startDate} to ${endDate}`);

      return await this.fetchOrdersFromDateRangeParallel(startDate, endDate);
    } catch (error) {
      console.error('Error fetching orders for current month:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Получает заказы за определенный период (публичный метод для внешнего использования)
   */
  async fetchOrdersForPeriod(startDate: string, endDate: string): Promise<SalesDriveApiResponse> {
    try {
      console.log(`📅 Fetching orders for period: ${startDate} to ${endDate}`);
      return await this.fetchOrdersFromDateRangeParallel(startDate, endDate);
    } catch (error) {
      console.error('Error fetching orders for period:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Получает заказы с расширенными фильтрами (с кешированием)
   */
  async fetchOrdersWithFilters(filters: {
    startDate?: string;
    endDate?: string;
    statusIds?: string[];
    minAmount?: number;
    maxAmount?: number;
    paymentMethods?: string[];
    shippingMethods?: string[];
    cities?: string[];
    limit?: number;
    offset?: number;
  }): Promise<SalesDriveApiResponse> {
    try {
      console.log('🔍 Fetching orders with advanced filters:', filters);

      // Генерируем ключ кеша
      const cacheKey = this.generateCacheKey('fetchOrdersWithFilters', filters);

      // Проверяем кеш
      const cachedResult = this.getCachedData(cacheKey);
      if (cachedResult) {
        console.log('✅ Returning cached result for advanced filters');
        return cachedResult;
      }

      // Сначала получаем все заказы за период
      const startDate = filters.startDate || '2025-07-01';
      const endDate = filters.endDate || new Date().toISOString().split('T')[0];

      const allOrdersResponse = await this.fetchOrdersFromDateRangeParallel(startDate, endDate);

      if (!allOrdersResponse.success || !allOrdersResponse.data) {
        return allOrdersResponse;
      }

      let filteredOrders = allOrdersResponse.data;

      // Применяем фильтры
      if (filters.statusIds && filters.statusIds.length > 0) {
        filteredOrders = filteredOrders.filter(order =>
          filters.statusIds!.includes(order.status)
        );
        console.log(`📊 Status filter applied: ${filters.statusIds.join(', ')}, remaining: ${filteredOrders.length}`);
      }

      if (filters.minAmount !== undefined) {
        filteredOrders = filteredOrders.filter(order =>
          (order.totalPrice || 0) >= filters.minAmount!
        );
        console.log(`📊 Min amount filter applied: ${filters.minAmount}, remaining: ${filteredOrders.length}`);
      }

      if (filters.maxAmount !== undefined) {
        filteredOrders = filteredOrders.filter(order =>
          (order.totalPrice || 0) <= filters.maxAmount!
        );
        console.log(`📊 Max amount filter applied: ${filters.maxAmount}, remaining: ${filteredOrders.length}`);
      }

      if (filters.paymentMethods && filters.paymentMethods.length > 0) {
        filteredOrders = filteredOrders.filter(order =>
          order.paymentMethod && filters.paymentMethods!.includes(order.paymentMethod)
        );
        console.log(`📊 Payment methods filter applied: ${filters.paymentMethods.join(', ')}, remaining: ${filteredOrders.length}`);
      }

      if (filters.shippingMethods && filters.shippingMethods.length > 0) {
        filteredOrders = filteredOrders.filter(order =>
          order.shippingMethod && filters.shippingMethods!.includes(order.shippingMethod)
        );
        console.log(`📊 Shipping methods filter applied: ${filters.shippingMethods.join(', ')}, remaining: ${filteredOrders.length}`);
      }

      if (filters.cities && filters.cities.length > 0) {
        filteredOrders = filteredOrders.filter(order =>
          order.cityName && filters.cities!.some(city =>
            order.cityName!.toLowerCase().includes(city.toLowerCase())
          )
        );
        console.log(`📊 Cities filter applied: ${filters.cities.join(', ')}, remaining: ${filteredOrders.length}`);
      }

      // Применяем пагинацию
      const limit = filters.limit || 1000;
      const offset = filters.offset || 0;
      const paginatedOrders = filteredOrders.slice(offset, offset + limit);

      console.log(`✅ Advanced filtering completed: ${paginatedOrders.length} orders returned from ${filteredOrders.length} filtered`);

      const result = {
        success: true,
        data: paginatedOrders,
        metadata: {
          totalFiltered: filteredOrders.length,
          totalAvailable: allOrdersResponse.data.length,
          appliedFilters: filters,
          pagination: {
            limit,
            offset,
            hasMore: offset + limit < filteredOrders.length
          }
        }
      } as SalesDriveApiResponse;

      // Кешируем результат
      const ttl = this.determineTTL('fetchOrdersWithFilters', paginatedOrders.length);
      this.setCachedData(cacheKey, result, ttl);

      return result;

    } catch (error) {
      console.error('Error fetching orders with filters:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Получает время последней синхронизации из БД
   */
  private async getLastSyncTime(): Promise<string | null> {
    try {
      const lastSyncedOrder = await orderDatabaseService.getLastSyncedOrder();
      if (lastSyncedOrder?.lastSynced) {
        // Возвращаем дату в формате YYYY-MM-DD
        return lastSyncedOrder.lastSynced.toISOString().split('T')[0];
      }
      return null;
    } catch (error) {
      console.error('Error getting last sync time:', error);
      return null;
    }
  }

  /**
   * Форматирует заказ в структурированный вид (с нужным форматом rawData)
   */
  private formatOrder(rawOrder: any): SalesDriveOrder {
    // Маппинг статусов
    const statusMap: { [key: number]: string } = {
      1: 'Новий',
      2: 'Підтверджено',
      3: 'На відправку',
      4: 'Відправлено',
      5: 'Продаж',
      6: 'Відмова',
      7: 'Повернення',
      8: 'Видалений'
    };

    // Маппинг способов доставки
    const shippingMethodMap: { [key: number]: string } = {
      9: 'Нова Пошта',
      20: 'Нова Пошта (адресна)',
      16: 'Укрпошта',
      17: 'Meest',
      10: 'Самовивоз'
    };

    // Маппинг способов оплаты
    const paymentMethodMap: { [key: number]: string } = {
      14: 'Plata by Mono',
      13: 'LiqPay',
      12: 'Післяплата',
      15: 'Готівка',
      21: 'Card',
      23: 'Apple Pay',
      25: 'Наложений платіж',
      27: 'Пром-оплата',
      29: 'Google Pay',
      30: 'Credit'
    };

    // Создаем rawData в нужном формате
    const formattedRawData = {
      orderNumber: rawOrder.externalId || rawOrder.id?.toString() || '',
      trackingNumber: rawOrder.ord_delivery_data?.[0]?.trackingNumber || '',
      quantity: rawOrder.kilTPorcij || 0,
      status: rawOrder.statusId?.toString() || '',
      statusText: statusMap[rawOrder.statusId] || 'Невідомий',
      items: [],
      createdAt: rawOrder.orderTime || '',
      orderDate: rawOrder.orderTime || '',
      externalId: rawOrder.externalId || '',
      shippingMethod: shippingMethodMap[rawOrder.shipping_method] || 'Невідомий',
      paymentMethod: paymentMethodMap[rawOrder.payment_method] || 'Невідомий',
      cityName: rawOrder.ord_delivery_data?.[0]?.cityName || '',
      provider: rawOrder.ord_delivery_data?.[0]?.provider || '',
      customerName: '',
      customerPhone: '',
      deliveryAddress: rawOrder.shipping_address || '',
      totalPrice: rawOrder.paymentAmount || 0
    };

    // Форматируем состав заказа
    if (rawOrder.products && Array.isArray(rawOrder.products)) {
      formattedRawData.items = rawOrder.products.map((item: any) => ({
        productName: item.text || 'Невідомий товар',
        quantity: item.amount || 0,
        price: item.price || 0,
        sku: item.sku || item.parameter || ''
      }));
    }

    // Добавляем информацию о клиенте
    if (rawOrder.primaryContact) {
      const contact = rawOrder.primaryContact;
      const customerName = `${contact.lName || ''} ${contact.fName || ''} ${contact.mName || ''}`.trim();
      const customerPhone = Array.isArray(contact.phone) ? contact.phone[0] : contact.phone || '';
      
      formattedRawData.customerName = customerName;
      formattedRawData.customerPhone = customerPhone;
    }

    // Базовое форматирование для основного объекта
    const formattedOrder: SalesDriveOrder = {
      rawData: rawOrder,  // Сохраняем полные сырые данные
      id: rawOrder.id?.toString() || '',
      orderNumber: rawOrder.externalId || rawOrder.id?.toString() || '',
      ttn: rawOrder.ord_delivery_data?.[0]?.trackingNumber || '',
      quantity: rawOrder.kilTPorcij || 0,
      status: rawOrder.statusId?.toString() || '',
      statusText: statusMap[rawOrder.statusId] || 'Невідомий',
      items: formattedRawData.items,  // Используем те же items
      createdAt: rawOrder.orderTime || '',
      orderDate: rawOrder.orderTime || '',
      externalId: rawOrder.externalId || '',
      shippingMethod: shippingMethodMap[rawOrder.shipping_method] || 'Невідомий',
      paymentMethod: paymentMethodMap[rawOrder.payment_method] || 'Невідомий',
      cityName: rawOrder.ord_delivery_data?.[0]?.cityName || '',
      provider: rawOrder.ord_delivery_data?.[0]?.provider || '',
      customerName: formattedRawData.customerName,
      customerPhone: formattedRawData.customerPhone,
      deliveryAddress: rawOrder.shipping_address || '',
      totalPrice: rawOrder.paymentAmount || 0,
      pricinaZnizki: rawOrder.pricinaZnizki ? String(rawOrder.pricinaZnizki) : '',
      sajt: rawOrder.sajt ? String(rawOrder.sajt) : ''
    };

    return formattedOrder;
  }

  /**
   * Загружает заказы со статусом "Підтверджено" из SalesDrive
   */
  async fetchConfirmedOrders(): Promise<SalesDriveApiResponse> {
    try {
      const allOrders = await this.fetchOrdersFromDate();
      
      if (!allOrders.success || !allOrders.data) {
        throw new Error(allOrders.error || 'Failed to fetch orders');
      }

      // Фильтруем только подтвержденные заказы
      const confirmedOrders = allOrders.data.filter(order => 
        order.status === 'Підтверджено' || 
        order.status === 'confirmed' ||
        order.status === 'Confirmed'
      );

      console.log(`Found ${confirmedOrders.length} confirmed orders out of ${allOrders.data.length} total`);

      return {
        success: true,
        data: confirmedOrders,
      };
    } catch (error) {
      console.error('Error fetching confirmed orders:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Обновляет статус заказа в SalesDrive API
   * Примечание: SalesDrive API может не поддерживать обновление статуса через API
   * В реальной реализации может потребоваться другой подход
   */
  async updateSalesDriveOrderStatus(externalId: string, status: string): Promise<boolean> {
    try {
      if (!this.apiUrl || !this.apiKey || !this.formKey) {
        throw new Error('SalesDrive API not fully configured');
      }

      console.log(`🔄 Updating order ${externalId} status to ${status} in SalesDrive`);

      // Подготавливаем URL для обновления заказа
      const updateUrl = `${this.apiUrl}/api/order/update/`;
      console.log(`📡 Making request to: ${updateUrl}`);

      // Маппинг статусов: "id3" -> числовой ID в SalesDrive
      // Нужно настроить соответствие в зависимости от вашей конфигурации SalesDrive
      const statusMapping: { [key: string]: string } = {
        'id3': '3', // Готове до видправки - замените на правильный ID из вашего SalesDrive
        // Добавьте другие соответствия по необходимости
      };

      const statusId = statusMapping[status] || status;
      console.log(`🔄 Mapped status "${status}" to statusId "${statusId}"`);

      // Формируем тело запроса согласно документации
      const requestBody = {
        form: this.formKey,
        externalId: externalId,
        data: {
          statusId: statusId
        }
      };

      console.log(`📤 Request body:`, JSON.stringify(requestBody, null, 2));

      // Выполняем запрос
      const response = await fetch(updateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      console.log(`📡 Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ SalesDrive API error (${response.status}):`, errorText);
        return false;
      }

      const responseData = await response.json() as SalesDriveStatusUpdateResponse;
      console.log(`✅ SalesDrive response:`, responseData);

      if (responseData.success) {
        console.log(`✅ Successfully updated order ${externalId} status to ${status} in SalesDrive`);
        return true;
      } else {
        console.error(`❌ SalesDrive returned error:`, responseData);
        return false;
      }

    } catch (error) {
      console.error('❌ Error updating SalesDrive order status:', error);
      return false;
    }
  }

  /**
   * Получает детальную информацию о заказе по ID
   * Примечание: SalesDrive API может не поддерживать получение отдельного заказа
   * Вместо этого получаем все заказы и фильтруем по ID
   */
  async getOrderDetails(orderId: string): Promise<SalesDriveOrder | null> {
    try {
      if (!this.apiUrl || !this.apiKey) {
        throw new Error('SalesDrive API not configured');
      }

      // Получаем все заказы и ищем нужный по ID
      const allOrders = await this.fetchOrdersFromDate();
      
      if (!allOrders.success || !allOrders.data) {
        throw new Error(allOrders.error || 'Failed to fetch orders');
      }

      const order = allOrders.data.find(o => o.id === orderId || o.orderNumber === orderId);
      return order || null;
    } catch (error) {
      console.error(`Error fetching order details for ${orderId}:`, error);
      return null;
    }
  }

  /**
   * Получает статистику по загружаемым данным
   */
  async getSyncStatistics(options: {
    startDate?: string;
    endDate?: string;
    includeOrderDetails?: boolean;
    includeProductStats?: boolean;
  } = {}): Promise<{
    success: boolean;
    data?: {
      totalOrders: number;
      ordersByStatus: { [status: string]: number };
      ordersByPaymentMethod: { [method: string]: number };
      ordersByShippingMethod: { [method: string]: number };
      ordersByCity: { [city: string]: number };
      revenueStats: {
        total: number;
        average: number;
        min: number;
        max: number;
      };
      productStats?: {
        totalProducts: number;
        productsByCategory: { [category: string]: number };
        topProducts: Array<{ name: string; quantity: number; revenue: number }>;
      };
      dateRange: {
        startDate: string;
        endDate: string;
        days: number;
      };
      performance: {
        estimatedApiCalls: number;
        estimatedLoadTime: string;
        currentRateLimitState: {
          consecutiveErrors: number;
          lastErrorTime: number;
        };
      };
    };
    error?: string;
  }> {
    try {
      const startDate = options.startDate || '2025-07-01';
      const endDate = options.endDate || new Date().toISOString().split('T')[0];

      // Генерируем ключ кеша
      const cacheKey = this.generateCacheKey('getSyncStatistics', options);

      // Проверяем кеш
      const cachedResult = this.getCachedData(cacheKey);
      if (cachedResult) {
        console.log('✅ Returning cached statistics');
        return cachedResult;
      }

      console.log(`📊 Generating sync statistics for period: ${startDate} to ${endDate}`);

      // Получаем все заказы за период (с ограничением для статистики)
      const ordersResponse = await this.fetchOrdersFromDateRangeParallel(startDate, endDate);

      if (!ordersResponse.success || !ordersResponse.data) {
        return {
          success: false,
          error: ordersResponse.error || 'Failed to fetch orders for statistics'
        };
      }

      const orders = ordersResponse.data;

      // Рассчитываем базовую статистику
      const totalOrders = orders.length;
      const ordersByStatus: { [status: string]: number } = {};
      const ordersByPaymentMethod: { [method: string]: number } = {};
      const ordersByShippingMethod: { [method: string]: number } = {};
      const ordersByCity: { [city: string]: number } = {};

      let totalRevenue = 0;
      const revenues: number[] = [];
      const productsMap: { [sku: string]: { name: string; quantity: number; revenue: number } } = {};

      // Анализируем каждый заказ
      for (const order of orders) {
        // Статистика по статусам
        const statusText = order.statusText || order.status || 'Unknown';
        ordersByStatus[statusText] = (ordersByStatus[statusText] || 0) + 1;

        // Статистика по методам оплаты
        if (order.paymentMethod) {
          ordersByPaymentMethod[order.paymentMethod] = (ordersByPaymentMethod[order.paymentMethod] || 0) + 1;
        }

        // Статистика по методам доставки
        if (order.shippingMethod) {
          ordersByShippingMethod[order.shippingMethod] = (ordersByShippingMethod[order.shippingMethod] || 0) + 1;
        }

        // Статистика по городам
        if (order.cityName) {
          ordersByCity[order.cityName] = (ordersByCity[order.cityName] || 0) + 1;
        }

        // Статистика по доходам
        const revenue = order.totalPrice || 0;
        totalRevenue += revenue;
        revenues.push(revenue);

        // Статистика по товарам
        if (options.includeProductStats && order.items) {
          for (const item of order.items) {
            const sku = item.sku || item.productName || 'Unknown';
            if (!productsMap[sku]) {
              productsMap[sku] = {
                name: item.productName || sku,
                quantity: 0,
                revenue: 0
              };
            }
            productsMap[sku].quantity += item.quantity || 0;
            productsMap[sku].revenue += (item.price || 0) * (item.quantity || 0);
          }
        }
      }

      // Рассчитываем статистику доходов
      const validRevenues = revenues.filter(r => r > 0);
      const revenueStats = {
        total: totalRevenue,
        average: validRevenues.length > 0 ? totalRevenue / validRevenues.length : 0,
        min: validRevenues.length > 0 ? Math.min(...validRevenues) : 0,
        max: validRevenues.length > 0 ? Math.max(...validRevenues) : 0
      };

      // Рассчитываем статистику по товарам
      let productStats;
      if (options.includeProductStats) {
        const topProducts = Object.values(productsMap)
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 10);

        // Группировка товаров по категориям (простая логика)
        const productsByCategory: { [category: string]: number } = {};
        for (const product of Object.values(productsMap)) {
          const category = this.categorizeProduct(product.name);
          productsByCategory[category] = (productsByCategory[category] || 0) + product.quantity;
        }

        productStats = {
          totalProducts: Object.keys(productsMap).length,
          productsByCategory,
          topProducts
        };
      }

      // Рассчитываем период
      const start = new Date(startDate);
      const end = new Date(endDate);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      // Оцениваем производительность
      const estimatedApiCalls = Math.ceil(totalOrders / 200) + 1; // +1 для первой страницы
      const estimatedLoadTime = this.estimateLoadTime(totalOrders, estimatedApiCalls);

      const performance = {
        estimatedApiCalls,
        estimatedLoadTime,
        currentRateLimitState: {
          consecutiveErrors: this.rateLimitState.consecutive429Errors,
          lastErrorTime: this.rateLimitState.last429Time
        }
      };

      console.log(`✅ Sync statistics generated: ${totalOrders} orders analyzed`);

      const result = {
        success: true,
        data: {
          totalOrders,
          ordersByStatus,
          ordersByPaymentMethod,
          ordersByShippingMethod,
          ordersByCity,
          revenueStats,
          productStats,
          dateRange: {
            startDate,
            endDate,
            days
          },
          performance
        }
      };

      // Кешируем результат (статистика живет меньше обычных данных)
      const ttl = this.determineTTL('getSyncStatistics', totalOrders);
      this.setCachedData(cacheKey, result, ttl);

      return result;

    } catch (error) {
      console.error('Error generating sync statistics:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Категоризирует товар по названию
   */
  private categorizeProduct(productName: string): string {
    const name = productName.toLowerCase();

    if (name.includes('борщ') || name.includes('суп') || name.includes('перші') || name.includes('перша')) {
      return 'Перші страви';
    }

    if (name.includes('кур') || name.includes('свин') || name.includes('ялови') || name.includes('другі') || name.includes('друга')) {
      return 'Другі страви';
    }

    if (name.includes('вареник') || name.includes('галушк') || name.includes('пельмен')) {
      return 'Тісто';
    }

    if (name.includes('каша') || name.includes('гарнір')) {
      return 'Гарніри';
    }

    if (name.includes('салат') || name.includes('закуск')) {
      return 'Закуски';
    }

    return 'Інші';
  }

  /**
   * Оценивает время загрузки
   */
  private estimateLoadTime(orderCount: number, apiCalls: number): string {
    const baseTimePerCall = 1000; // 1 секунда на вызов
    const parallelFactor = 5; // параллельные вызовы
    const rateLimitBuffer = this.rateLimitState.consecutive429Errors * 2000; // дополнительные задержки

    const sequentialTime = apiCalls * baseTimePerCall;
    const parallelTime = Math.ceil(apiCalls / parallelFactor) * baseTimePerCall;
    const totalTime = Math.min(sequentialTime, parallelTime) + rateLimitBuffer;

    const minutes = Math.floor(totalTime / 60000);
    const seconds = Math.floor((totalTime % 60000) / 1000);

    return `${minutes}m ${seconds}s`;
  }

  /**
   * Получает информацию о состоянии кеша
   */
  getCacheInfo(): {
    size: number;
    maxSize: number;
    hitRate: number;
    totalAccesses: number;
    entries: Array<{
      key: string;
      size: number;
      accessCount: number;
      lastAccess: number;
      expiresAt: number;
      ttl: number;
    }>;
  } {
    const cache = this.cacheState.data;
    const entries = Array.from(cache.entries());

    let totalAccesses = 0;

    const cacheEntries = entries.map(([key, entry]) => {
      totalAccesses += entry.accessCount;
      return {
        key,
        size: JSON.stringify(entry.data).length,
        accessCount: entry.accessCount,
        lastAccess: entry.lastAccess,
        expiresAt: entry.expiresAt,
        ttl: entry.expiresAt - entry.timestamp
      };
    });

    return {
      size: cache.size,
      maxSize: this.cacheState.maxSize,
      hitRate: totalAccesses > 0 ? (totalAccesses / (totalAccesses + entries.length)) * 100 : 0,
      totalAccesses,
      entries: cacheEntries.sort((a, b) => b.accessCount - a.accessCount)
    };
  }

  /**
   * Очищает весь кеш
   */
  clearCache(): { cleared: number } {
    const cleared = this.cacheState.data.size;
    this.cacheState.data.clear();
    console.log(`🗑️ Cleared ${cleared} cache entries`);
    return { cleared };
  }

  /**
   * Очищает конкретную запись из кеша
   */
  clearCacheEntry(key: string): boolean {
    const deleted = this.cacheState.data.delete(key);
    if (deleted) {
      console.log(`🗑️ Cleared cache entry: ${key}`);
    }
    return deleted;
  }

  /**
   * Принудительно обновляет данные (теперь просто логирует)
   */
  async refreshCache(): Promise<void> {
    console.log('Cache refresh requested - now always fetches fresh data from SalesDrive');
  }

  /**
   * Оптимизированная синхронизация с batch операциями
   */
  async syncOrdersWithDatabaseOptimized(): Promise<{ success: boolean; synced: number; errors: number; details: any[]; metadata?: any }> {
    const startTime = Date.now();

    try {
      console.log('🚀 [SYNC] Starting optimized SalesDrive to Database synchronization...');
      console.log('🚀 [SYNC] Timestamp:', new Date().toISOString());

      // Получаем только новые/измененные заказы
      const salesDriveResponse = await this.fetchOrdersSinceLastSync();
      
      if (!salesDriveResponse.success || !salesDriveResponse.data) {
        throw new Error(salesDriveResponse.error || 'Failed to fetch orders from SalesDrive');
      }

      const salesDriveOrders = salesDriveResponse.data;
      
      if (salesDriveOrders.length === 0) {
        console.log('✅ No new orders to sync');
        return {
          success: true,
          synced: 0,
          errors: 0,
          details: []
        };
      }

      console.log(`📊 [SYNC] Processing ${salesDriveOrders.length} orders from SalesDrive...`);
      console.log(`📊 [SYNC] Date range: ${salesDriveOrders[0]?.orderDate || 'N/A'} to ${salesDriveOrders[salesDriveOrders.length - 1]?.orderDate || 'N/A'}`);
      console.log(`📊 [SYNC] Order statuses: ${[...new Set(salesDriveOrders.map(o => o.status))].join(', ')}`);

      // Группируем заказы для batch операций
      const orderIds = salesDriveOrders.map(o => o.orderNumber);
      const existingOrders = await orderDatabaseService.getOrdersByExternalIds(orderIds);
      
      // Разделяем на новые и обновляемые
      const existingIds = new Set(existingOrders.map(o => o.externalId));
      const newOrders = salesDriveOrders.filter(o => !existingIds.has(o.orderNumber));
      const updateOrders = salesDriveOrders.filter(o => existingIds.has(o.orderNumber));

      console.log(`📊 [SYNC] Order classification:`);
      console.log(`   🆕 New orders: ${newOrders.length}`);
      console.log(`   🔄 Update orders: ${updateOrders.length}`);
      console.log(`   📅 Date range for new orders: ${newOrders[0]?.orderDate || 'N/A'} to ${newOrders[newOrders.length - 1]?.orderDate || 'N/A'}`);
      console.log(`   📅 Date range for updates: ${updateOrders[0]?.orderDate || 'N/A'} to ${updateOrders[updateOrders.length - 1]?.orderDate || 'N/A'}`);

      let synced = 0;
      let errors = 0;
      const details: any[] = [];
      let updateResult: any;

      // Batch создание новых заказов
      if (newOrders.length > 0) {
        console.log(`📝 [SYNC] Creating ${newOrders.length} new orders...`);
        console.log(`📝 [SYNC] Sample new orders: ${newOrders.slice(0, 3).map(o => `${o.orderNumber} (${o.status})`).join(', ')}`);

        try {
          const startTime = Date.now();
          await orderDatabaseService.createOrdersBatch(newOrders.map(o => ({
            id: o.id,
            externalId: o.orderNumber,
            orderNumber: o.orderNumber,
            ttn: o.ttn,
            quantity: o.quantity,
            status: o.status,
            statusText: o.statusText,
            items: o.items,
            rawData: o.rawData,
            customerName: o.customerName,
            customerPhone: o.customerPhone,
            deliveryAddress: o.deliveryAddress,
            totalPrice: o.totalPrice,
            orderDate: o.orderDate,
            shippingMethod: o.shippingMethod,
            paymentMethod: o.paymentMethod,
            cityName: o.cityName,
            provider: o.provider,
            pricinaZnizki: o.pricinaZnizki,
            sajt: o.sajt
          })));
          const duration = Date.now() - startTime;

          synced += newOrders.length;
          details.push(...newOrders.map(o => ({
            action: 'created',
            orderNumber: o.orderNumber,
            success: true
          })));

          console.log(`✅ [SYNC] Successfully created ${newOrders.length} new orders in ${duration}ms`);
          console.log(`✅ [SYNC] Average time per order: ${(duration / newOrders.length).toFixed(2)}ms`);
          console.log(`✅ [SYNC] Orders with cache populated: ${newOrders.length} (100%)`);

        } catch (error) {
          console.error('❌ [SYNC] Error creating orders batch:', error);
          errors += newOrders.length;
          details.push(...newOrders.map(o => ({
            action: 'error',
            orderNumber: o.orderNumber,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          })));
        }
      }

      // Batch обновление существующих заказов с умным обновлением
      if (updateOrders.length > 0) {
        console.log(`🔄 [SYNC] Updating ${updateOrders.length} existing orders...`);
        console.log(`🔄 [SYNC] Sample update orders: ${updateOrders.slice(0, 3).map(o => `${o.orderNumber} (${o.status})`).join(', ')}`);

        try {
          const updateStartTime = Date.now();
          const updateResult = await orderDatabaseService.updateOrdersBatchSmart(updateOrders.map(o => ({
            orderNumber: o.orderNumber,
            status: o.status,
            statusText: o.statusText,
            items: o.items,
            rawData: o.rawData,
            ttn: o.ttn,
            quantity: o.quantity,
            customerName: o.customerName,
            customerPhone: o.customerPhone,
            deliveryAddress: o.deliveryAddress,
            totalPrice: o.totalPrice,
            orderDate: o.orderDate,
            shippingMethod: o.shippingMethod,
            paymentMethod: o.paymentMethod,
            cityName: o.cityName,
            provider: o.provider,
            pricinaZnizki: o.pricinaZnizki,
            sajt: o.sajt
          })));

          const updateDuration = Date.now() - updateStartTime;

          // Детальное логирование изменений с конкретными значениями
          if (updateResult.success) {
            console.log(`📊 [SYNC] Update summary (${updateDuration}ms):`);
            console.log(`   ✅ Updated: ${updateResult.totalUpdated} orders`);
            console.log(`   ⏭️ Skipped: ${updateResult.totalSkipped} orders (no changes)`);
            console.log(`   📈 Update efficiency: ${((updateResult.totalUpdated / updateOrders.length) * 100).toFixed(1)}%`);
            
            // Показываем детали по каждому заказу
            updateResult.results.forEach(result => {
              if (result.action === 'updated') {
                console.log(`   🔄 Order ${result.orderNumber}: ${result.changedFields.join(', ')}`);
                
                // Показываем конкретные значения для важных полей
                if (result.previousValues.status && result.changedFields.includes('status')) {
                  const newStatus = updateOrders.find(o => o.orderNumber === result.orderNumber)?.status;
                  console.log(`      Status: ${result.previousValues.status} → ${newStatus}`);
                }
                
                if (result.previousValues.statusText && result.changedFields.includes('statusText')) {
                  const newStatusText = updateOrders.find(o => o.orderNumber === result.orderNumber)?.statusText;
                  console.log(`      StatusText: ${result.previousValues.statusText} → ${newStatusText}`);
                }
                
                if (result.previousValues.ttn && result.changedFields.includes('ttn')) {
                  const newTtn = updateOrders.find(o => o.orderNumber === result.orderNumber)?.ttn;
                  console.log(`      TTN: ${result.previousValues.ttn} → ${newTtn}`);
                }
                
                if (result.previousValues.quantity && result.changedFields.includes('quantity')) {
                  const newQuantity = updateOrders.find(o => o.orderNumber === result.orderNumber)?.quantity;
                  console.log(`      Quantity: ${result.previousValues.quantity} → ${newQuantity}`);
                }
                
                if (result.previousValues.totalPrice && result.changedFields.includes('totalPrice')) {
                  const newTotalPrice = updateOrders.find(o => o.orderNumber === result.orderNumber)?.totalPrice;
                  console.log(`      TotalPrice: ${result.previousValues.totalPrice} → ${newTotalPrice}`);
                }
                
                if (result.changedFields.includes('rawData')) {
                  console.log(`      RawData: Updated (contains ${Object.keys(result.previousValues.rawData || {}).length} → ${Object.keys(updateOrders.find(o => o.orderNumber === result.orderNumber)?.rawData || {}).length} fields)`);
                }
                
                if (result.changedFields.includes('items')) {
                  const oldItemsCount = Array.isArray(result.previousValues.items) ? result.previousValues.items.length : 0;
                  const newItemsCount = Array.isArray(updateOrders.find(o => o.orderNumber === result.orderNumber)?.items) ? updateOrders.find(o => o.orderNumber === result.orderNumber)?.items.length : 0;
                  console.log(`      Items: ${oldItemsCount} → ${newItemsCount} items`);
                }
                
              // } else if (result.action === 'skipped') {
                // console.log(`   ⏭️ Order ${result.orderNumber}: ${result.reason}`);
              } else if (result.action === 'error') {
                console.log(`   ❌ Order ${result.orderNumber}: ${result.error}`);
              }
            });
          }

          // Показываем краткую сводку изменений
          if (updateResult.totalUpdated > 0) {
            const statusChanges = updateResult.results
              .filter(r => r.action === 'updated' && r.changedFields.includes('status'))
              .length;
            const ttnChanges = updateResult.results
              .filter(r => r.action === 'updated' && r.changedFields.includes('ttn'))
              .length;
            const priceChanges = updateResult.results
              .filter(r => r.action === 'updated' && r.changedFields.includes('totalPrice'))
              .length;
            
            console.log(`📈 Change types summary:`);
            if (statusChanges > 0) console.log(`   ✅ Status changes: ${statusChanges}`);
            if (ttnChanges > 0) console.log(`   🔢 TTN changes: ${ttnChanges}`);
            if (priceChanges > 0) console.log(`   💰 Price changes: ${priceChanges}`);
            if (updateResult.totalUpdated - statusChanges - ttnChanges - priceChanges > 0) {
              console.log(`   📝 Other changes: ${updateResult.totalUpdated - statusChanges - ttnChanges - priceChanges}`);
            }
          }

          synced += updateResult.totalUpdated;
          details.push(...updateResult.results.map(r => ({ 
            action: r.action, 
            orderNumber: r.orderNumber, 
            success: r.action !== 'error',
            ...(r.action === 'updated' && { changedFields: r.changedFields }),
            ...(r.action === 'error' && { error: r.error })
          })));
          
          console.log(`✅ Successfully processed ${updateResult.totalUpdated + updateResult.totalSkipped} orders`);
        } catch (error) {
          console.error('❌ Error updating orders batch:', error);
          errors += updateOrders.length;
          details.push(...updateOrders.map(o => ({ 
            action: 'error', 
            orderNumber: o.orderNumber, 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          })));
        }
      }

      // Очищаем старые записи истории
      await orderDatabaseService.cleanupOldHistory();

      const totalDuration = Date.now() - startTime;
      const totalProcessed = newOrders.length + updateOrders.length;

      console.log(`✅ [SYNC] Synchronization completed in ${totalDuration}ms:`);
      console.log(`   📊 Total orders processed: ${totalProcessed}`);
      console.log(`   🆕 Created: ${newOrders.length}`);
      // Calculate total updated and skipped from all batches
      const totalUpdated = details.filter(d => d.action === 'updated').length;
      const totalSkipped = details.filter(d => d.action === 'skipped').length;
      console.log(`   🔄 Updated: ${totalUpdated}`);
      console.log(`   ⏭️ Skipped: ${totalSkipped}`);
      console.log(`   ✅ Successfully synced: ${synced}`);
      console.log(`   ❌ Errors: ${errors}`);
      console.log(`   📈 Overall efficiency: ${totalProcessed > 0 ? ((synced / totalProcessed) * 100).toFixed(1) : 0}%`);
      console.log(`   ⚡ Average time per order: ${totalProcessed > 0 ? (totalDuration / totalProcessed).toFixed(2) : 0}ms`);

      return {
        success: true,
        synced,
        errors,
        details,
        metadata: {
          totalDuration,
          totalProcessed,
          newOrders: newOrders.length,
          updatedOrders: updateResult?.totalUpdated || 0,
          skippedOrders: updateResult?.totalSkipped || 0,
          efficiency: totalProcessed > 0 ? (synced / totalProcessed) * 100 : 0,
          averageTimePerOrder: totalProcessed > 0 ? totalDuration / totalProcessed : 0
        }
      };
    } catch (error) {
      console.error('❌ Error during optimized synchronization:', error);
      return {
        success: false,
        synced: 0,
        errors: 0,
        details: []
      };
    }
  }

  /**
   * Синхронизирует заказы из SalesDrive с локальной БД (обновленная версия)
   */
  async syncOrdersWithDatabase(): Promise<{ success: boolean; synced: number; errors: number; details: any[] }> {
    try {
      console.log('🎯 [SYNC] Starting SalesDrive to Database synchronization...');
      console.log('🎯 [SYNC] Initiated at:', new Date().toISOString());

      // Используем оптимизированный метод
      return await this.syncOrdersWithDatabaseOptimized();
    } catch (error) {
      console.error('❌ Error during synchronization:', error);
      return {
        success: false,
        synced: 0,
        errors: 0,
        details: []
      };
    }
  }

  /**
   * Ручная синхронизация заказов с указанным диапазоном дат
   * Получает ВСЕ заказы из диапазона дат (независимо от статуса) и использует force update
   */
  async syncOrdersWithDatabaseManual(startDate: string, endDate?: string): Promise<{ success: boolean; synced: number; errors: number; details: any[]; metadata?: any }> {
    const operationStartTime = Date.now();
    let syncHistoryData: CreateSyncHistoryData | null = null;

    try {
      console.log('🔄 [MANUAL SYNC] Starting comprehensive manual sync from:', startDate);
      console.log('🔄 [MANUAL SYNC] Initiated at:', new Date().toISOString());

      // Валидация и форматирование даты начала
      let formattedStartDate: string;
      try {
        const startDateObj = new Date(startDate);
        if (isNaN(startDateObj.getTime())) {
          throw new Error('Invalid start date format');
        }
        formattedStartDate = startDateObj.toISOString().split('T')[0];
        console.log('📅 [MANUAL SYNC] Formatted start date:', formattedStartDate);
      } catch (dateError) {
        console.error('❌ [MANUAL SYNC] Invalid start date:', startDate, dateError);

        // Записываем неудачную попытку в историю
        await syncHistoryService.createSyncRecord({
          syncType: 'manual',
          startDate: startDate,
          totalOrders: 0,
          newOrders: 0,
          updatedOrders: 0,
          skippedOrders: 0,
          errors: 1,
          duration: (Date.now() - operationStartTime) / 1000,
          details: { error: 'Invalid start date format' },
          status: 'failed',
          errorMessage: 'Invalid start date format'
        });

        return {
          success: false,
          synced: 0,
          errors: 1,
          details: [{ action: 'error', error: 'Invalid start date format' }]
        };
      }

      // Получаем ВСЕ заказы из диапазона дат (независимо от статуса)
      let formattedEndDate: string;
      if (endDate) {
        try {
          const endDateObj = new Date(endDate);
          if (isNaN(endDateObj.getTime())) {
            throw new Error('Invalid end date format');
          }
          formattedEndDate = endDateObj.toISOString().split('T')[0];
          console.log('📅 [MANUAL SYNC] Formatted end date:', formattedEndDate);
        } catch (dateError) {
          console.error('❌ [MANUAL SYNC] Invalid end date:', endDate, dateError);
          formattedEndDate = new Date().toISOString().split('T')[0];
          console.log('📅 [MANUAL SYNC] Using current date as end date due to invalid input');
        }
      } else {
        formattedEndDate = new Date().toISOString().split('T')[0];
        console.log('📅 [MANUAL SYNC] No end date provided, using current date');
      }

      console.log(`🔍 [MANUAL SYNC] Fetching ALL orders from ${formattedStartDate} to ${formattedEndDate} (no status filtering)`);

      const salesDriveResponse = await this.fetchOrdersFromDateRangeParallel(formattedStartDate, formattedEndDate);

      if (!salesDriveResponse.success || !salesDriveResponse.data) {
        const errorMsg = salesDriveResponse.error || 'Failed to fetch orders from SalesDrive';

        // Записываем неудачную попытку в историю
        await syncHistoryService.createSyncRecord({
          syncType: 'manual',
          startDate: formattedStartDate,
          endDate: formattedEndDate,
          totalOrders: 0,
          newOrders: 0,
          updatedOrders: 0,
          skippedOrders: 0,
          errors: 1,
          duration: (Date.now() - operationStartTime) / 1000,
          details: { error: errorMsg },
          status: 'failed',
          errorMessage: errorMsg
        });

        throw new Error(errorMsg);
      }

      const salesDriveOrders = salesDriveResponse.data;
      console.log(`📦 [MANUAL SYNC] Retrieved ${salesDriveOrders.length} orders from SalesDrive`);
      console.log(`📊 [MANUAL SYNC] Order statuses present: ${[...new Set(salesDriveOrders.map(o => o.status))].join(', ')}`);

      if (salesDriveOrders.length === 0) {
        console.log('✅ [MANUAL SYNC] No orders found in the specified date range');

        // Записываем успешную попытку с 0 заказами
        await syncHistoryService.createSyncRecord({
          syncType: 'manual',
          startDate: formattedStartDate,
          endDate: formattedEndDate,
          totalOrders: 0,
          newOrders: 0,
          updatedOrders: 0,
          skippedOrders: 0,
          errors: 0,
          duration: (Date.now() - operationStartTime) / 1000,
          details: { message: 'No orders found in date range' },
          status: 'success'
        });

        return {
          success: true,
          synced: 0,
          errors: 0,
          details: []
        };
      }

      // Показываем примеры заказов для отладки
      console.log('📋 [MANUAL SYNC] Sample orders from SalesDrive:');
      salesDriveOrders.slice(0, 3).forEach((order, index) => {
        console.log(`   ${index + 1}. ${order.orderNumber} (${order.status}) - ${order.customerName || 'No name'}`);
      });

      // Используем smart batch update для оптимизации
      console.log(`🔄 [MANUAL SYNC] Starting smart batch sync of ${salesDriveOrders.length} orders...`);

      const updateData = salesDriveOrders.map(o => ({
        orderNumber: o.orderNumber,
        status: o.status,
        statusText: o.statusText,
        items: o.items,
        rawData: o.rawData,
        ttn: o.ttn,
        quantity: o.quantity,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        deliveryAddress: o.deliveryAddress,
        totalPrice: o.totalPrice,
        orderDate: o.orderDate,
        shippingMethod: o.shippingMethod,
        paymentMethod: o.paymentMethod,
        cityName: o.cityName,
        provider: o.provider
      }));

      const updateStartTime = Date.now();
      // Используем FORCE update для ручной синхронизации - пересинхронизируем ВСЕ заказы
      const updateResult = await orderDatabaseService.forceUpdateOrdersBatch(updateData);
      const updateDuration = (Date.now() - updateStartTime) / 1000;

      console.log(`📊 [MANUAL SYNC] Force batch update completed in ${updateDuration.toFixed(1)}s:`);
      console.log(`   🆕 Created: ${updateResult.totalCreated} orders`);
      console.log(`   🔄 Updated: ${updateResult.totalUpdated} orders`);
      console.log(`   ❌ Errors: ${updateResult.totalErrors} orders`);
      console.log(`   ✅ All ${salesDriveOrders.length} orders from SalesDrive processed (no skipping)`);

      // Очищаем старые записи истории заказов
      console.log('🧹 [MANUAL SYNC] Cleaning up old order history records...');
      await orderDatabaseService.cleanupOldHistory();

      const totalDuration = (Date.now() - operationStartTime) / 1000; // в секундах
      const totalProcessed = salesDriveOrders.length;
      const successRate = ((updateResult.totalCreated + updateResult.totalUpdated) / totalProcessed * 100).toFixed(1);

      console.log(`✅ [MANUAL SYNC] Synchronization completed in ${totalDuration.toFixed(1)}s:`);
      console.log(`   📊 Total orders processed: ${totalProcessed}`);
      console.log(`   🆕 Created: ${updateResult.totalCreated} orders`);
      console.log(`   🔄 Updated: ${updateResult.totalUpdated} orders`);
      console.log(`   ✅ Successfully synced: ${updateResult.totalCreated + updateResult.totalUpdated} orders (${successRate}%)`);
      console.log(`   ❌ Errors: ${updateResult.totalErrors} orders`);
      console.log(`   📅 Date range: ${formattedStartDate} → ${formattedEndDate}`);

      const status = updateResult.totalErrors === 0 ? 'success' :
                    (updateResult.totalCreated + updateResult.totalUpdated > 0 ? 'partial' : 'failed');

      // Сохраняем детальную информацию в историю синхронизаций
      syncHistoryData = {
        syncType: 'manual',
        startDate: formattedStartDate,
        endDate: formattedEndDate,
        totalOrders: totalProcessed,
        newOrders: updateResult.totalCreated,
        updatedOrders: updateResult.totalUpdated,
        skippedOrders: updateResult.totalSkipped,
        errors: updateResult.totalErrors,
        duration: totalDuration,
        details: {
          processedOrders: totalProcessed,
          successRate: parseFloat(successRate),
          dateRange: `${formattedStartDate} to ${formattedEndDate}`,
          batchUpdateDuration: updateDuration,
          sampleOrders: salesDriveOrders.slice(0, 5).map(o => ({
            orderNumber: o.orderNumber,
            status: o.status,
            customerName: o.customerName
          }))
        },
        status: status,
        errorMessage: updateResult.totalErrors > 0 ? `${updateResult.totalErrors} orders failed to sync` : undefined
      };

      await syncHistoryService.createSyncRecord(syncHistoryData);

      const metadata = {
        startDate: formattedStartDate,
        endDate: formattedEndDate,
        totalDuration: totalDuration,
        totalProcessed: totalProcessed,
        newOrders: updateResult.totalCreated,
        updatedOrders: updateResult.totalUpdated,
        skippedOrders: updateResult.totalSkipped,
        errors: updateResult.totalErrors,
        successRate: parseFloat(successRate),
        batchUpdateDuration: updateDuration,
        syncHistoryId: null // будет заполнено после создания записи
      };

      return {
        success: status === 'success',
        synced: updateResult.totalCreated + updateResult.totalUpdated,
        errors: updateResult.totalErrors,
        details: updateResult.results,
        metadata: metadata
      };

    } catch (error) {
      console.error('❌ [MANUAL SYNC] Critical error during manual sync:', error);

      const totalDuration = (Date.now() - operationStartTime) / 1000;

      // Записываем критическую ошибку в историю
      try {
        await syncHistoryService.createSyncRecord({
          syncType: 'manual',
          startDate: startDate,
          totalOrders: 0,
          newOrders: 0,
          updatedOrders: 0,
          skippedOrders: 0,
          errors: 1,
          duration: totalDuration,
          details: { criticalError: error instanceof Error ? error.message : 'Unknown critical error' },
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown critical error'
        });
      } catch (historyError) {
        console.error('❌ [MANUAL SYNC] Failed to save error to history:', historyError);
      }

      return {
        success: false,
        synced: 0,
        errors: 1,
        details: [{ action: 'error', error: error instanceof Error ? error.message : 'Unknown critical error' }],
        metadata: {
          totalDuration: totalDuration,
          error: error instanceof Error ? error.message : 'Unknown critical error'
        }
      };
    }
  }
}

export const salesDriveService = new SalesDriveService();
