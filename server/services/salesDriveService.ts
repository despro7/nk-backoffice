import { prisma } from '../lib/utils.js';
import { orderDatabaseService } from './orderDatabaseService.js';
import { syncSettingsService } from './syncSettingsService.js';
import { syncHistoryService, CreateSyncHistoryData } from './syncHistoryService.js';
import type { SyncSettings } from './syncSettingsService.js';

// Node.js types for setInterval
declare const setInterval: (callback: () => void, ms: number) => NodeJS.Timeout;

export interface SalesDriveOrder {
  id: number;
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
  };
  private cacheState: {
    data: Map<string, { data: any; timestamp: number; expiresAt: number }>;
    maxSize: number;
    defaultTTL: number;
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
      baseDelay: this.getSetting('orders.baseDelay', 5000), // Начальная задержка 5 секунд (увеличена)
      maxDelay: this.getSetting('orders.maxDelay', 60000) // Максимальная задержка 60 секунд (увеличена)
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
  private async loadSyncSettings(forceRefresh = false): Promise<SyncSettings | null> {
    if (this.syncSettings && !forceRefresh) {
      return this.syncSettings;
    }

    try {
      const settings = await syncSettingsService.getSyncSettings();
      this.syncSettings = settings;
      return settings;
    } catch (error) {
      console.error('❌ [SalesDrive] Failed to load sync settings, using defaults:', error);
      this.syncSettings = {};
      return null;
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
   * Вычисляет задержку между запросами на основе количества страниц
   * Логика: если Total pages > 10 но не < 100, ставим задержку 8 сек
   */
  private calculateRequestDelay(totalPages: number): number {
    // Если страниц больше 10, используем задержку 8 секунд
    // Это обеспечивает максимум 7.5 запросов в минуту (безопасно для лимита 10/мин)
    if (totalPages > 10 && totalPages < 100) {
      return 8000; // 8 секунд
    }
    
    // Для небольшого количества страниц используем меньшую задержку
    if (totalPages <= 10) {
      return 3000; // 3 секунды для быстрой обработки
    }
    
    // Для очень больших объемов используем максимальную задержку
    return 10000; // 10 секунд для больших объемов
  }

  /**
   * Вычисляет адаптивную задержку при получении 429 ошибки
   */
  private calculateAdaptiveDelay(): number {
    const state = this.rateLimitState;

    // Экспоненциальная задержка для обработки 429 ошибок
    let exponentialDelay;

    if (state.consecutive429Errors === 0) {
      exponentialDelay = state.baseDelay;
    } else if (state.consecutive429Errors === 1) {
      exponentialDelay = state.baseDelay * 2; // 10 секунд
    } else if (state.consecutive429Errors === 2) {
      exponentialDelay = state.baseDelay * 4; // 20 секунд
    } else if (state.consecutive429Errors === 3) {
      exponentialDelay = state.baseDelay * 8; // 40 секунд
    } else {
      // После 3 ошибок используем максимальную задержку
      exponentialDelay = state.maxDelay;
    }

    return Math.min(exponentialDelay, state.maxDelay); // Не превышаем максимум
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

    // Более агрессивный сброс для быстрого восстановления
    if (state.consecutive429Errors > 0) {
      // Сбрасываем полностью после 3 успешных запросов подряд
      if (state.consecutive429Errors <= 2) {
        state.consecutive429Errors = 0;
      } else {
        // Для более серьезных случаев уменьшаем постепенно
        state.consecutive429Errors = Math.max(0, state.consecutive429Errors - 2);
      }
      console.log(`🔄 Rate limit state reset: ${state.consecutive429Errors} consecutive errors`);
    }
  }

  /**
   * Сбрасывает состояние rate limiting
   */
  public resetRateLimit(): void {
    this.rateLimitState.consecutive429Errors = 0;
    this.rateLimitState.last429Time = 0;
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
   * Проверяет соединение с SalesDrive API
   */
  async checkApiConnection(): Promise<boolean> {
    try {
      if (!this.apiUrl || !this.apiKey) {
        return false;
      }

      // Используем правильный эндпоинт SalesDrive API
      const fullUrl = `${this.apiUrl}/api/order/list/?page=1&limit=1`;
      console.log(`🔍 [SalesDrive GET] Full request URL: \x1b[36m${fullUrl}\x1b[0m`);
      console.log(`🔍 [SalesDrive REQUEST] Headers:`, {
        'Form-Api-Key': this.apiKey.substring(0, 10) + '...', // Mask API key for security
        'Content-Type': 'application/json',
      });

      const response = await fetch(fullUrl, {
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
   * Получает заказы с момента последней синхронизации
   *
   * Оптимизация с фильтром updateAt:
   * - Использует filter[updateAt] вместо filter[orderTime]
   * - Получает только измененные заказы, а не все созданные
   * - Значительно сокращает объем данных при частых синхронизациях
   * - Настраивается через 'orders.filterType' = 'updateAt'
   *
   * Преимущества updateAt фильтра:
   * - Быстрее: получает только актуальные изменения
   * - Эффективнее: меньше нагрузка на API и сеть
   * - Точнее: отражает реальные изменения заказов
   */
  async fetchOrdersSinceLastSync(): Promise<SalesDriveApiResponse> {
    try {
      console.log('🔄 [SYNC] Starting fetchOrdersSinceLastSync...');
      console.log('🔄 [SYNC] Timestamp:', new Date().toISOString());
      console.log('🔄 [SYNC] Rate limit state:', {
        consecutiveErrors: this.rateLimitState.consecutive429Errors,
        lastErrorTime: this.rateLimitState.last429Time,
        baseDelay: this.rateLimitState.baseDelay,
        maxDelay: this.rateLimitState.maxDelay
      });

      // Получаем время последней синхронизации
      const lastSyncTime = await orderDatabaseService.getLastSyncedOrder();
      console.log('🔄 [SYNC] Last sync time from database:', lastSyncTime?.lastSynced || 'none');
      const now = new Date();
      const currentDate = now.toISOString().split('T')[0];

      console.log('🔄 [SYNC] Starting sync from last sync point');

      // Выбираем тип фильтра на основе настроек
      const filterType = this.getSetting('orders.filterType', 'orderTime');

      let startDate: string;
      if (filterType === 'updateAt') {
        // Оптимизация для фильтра updateAt - получаем только измененные заказы
        if (lastSyncTime?.lastSynced) {
          const lastSync = new Date(lastSyncTime.lastSynced);
          const diffHours = Math.floor((now.getTime() - lastSync.getTime()) / (1000 * 60 * 60));

          if (diffHours < 2) {
            // Если синхронизировались недавно (< 2 часов), берем заказы за последние 4 часа
            const fourHoursAgo = new Date(now.getTime() - (4 * 60 * 60 * 1000));
            startDate = fourHoursAgo.toISOString();
          } else if (diffHours < 24) {
            // Если синхронизировались сегодня (< 24 часов), берем заказы с момента последней синхронизации
            startDate = lastSync.toISOString();
          } else {
            // Если прошло больше суток, берем заказы за последние 24 часа
            const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
            startDate = yesterday.toISOString();
          }
        } else {
          // Если синхронизации не было, берем заказы за последние 24 часа
          const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
          startDate = yesterday.toISOString();
        }
      } else {
        // Обычная логика для фильтра orderTime
        if (lastSyncTime?.lastSynced) {
          const lastSync = new Date(lastSyncTime.lastSynced);
          const diffDays = Math.floor((now.getTime() - lastSync.getTime()) / (1000 * 60 * 60 * 24));

          if (diffDays === 0) {
            // Если синхронизировались сегодня, берем за последние 7 дней
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            startDate = sevenDaysAgo.toISOString().split('T')[0];
          } else {
            // Если синхронизировались раньше, берем с момента последней синхронизации
            startDate = lastSync.toISOString().split('T')[0];
          }
        } else {
          // Если синхронизации не было, берем за последний месяц
          const oneMonthAgo = new Date();
          oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
          startDate = oneMonthAgo.toISOString().split('T')[0];
        }
      }

      // Определяем endDate в зависимости от фильтра
      const endDate = filterType === 'updateAt' ? now.toISOString() : currentDate;

      if (filterType === 'updateAt') {
        try {
          return await this.fetchOrdersFromDateRangeParallelUpdateAt(startDate, endDate);
        } catch (error) {
          console.warn(`⚠️ [SYNC] UpdateAt filter failed, falling back to orderTime filter:`, error);

          // Fallback на orderTime фильтр при ошибке updateAt
          const fallbackStartDate = startDate.includes('T') ? startDate.split('T')[0] : startDate;
          const fallbackEndDate = endDate.includes('T') ? endDate.split('T')[0] : endDate;

          console.log(`🔄 [SYNC] Fallback: Using orderTime filter from ${fallbackStartDate} to ${fallbackEndDate}`);
          return await this.fetchOrdersFromDateRangeParallel(fallbackStartDate, fallbackEndDate);
        }
      } else {
        console.log(`🔄 [SYNC] Using orderTime filter (default)`);
        return await this.fetchOrdersFromDateRangeParallel(startDate, endDate);
      }
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
  async fetchOrdersFromDateRangeParallel(
    startDate: string,
    endDate: string,
    options: { onProgress?: (stage: 'fetching' | 'processing' | 'saving' | 'completed' | 'error', message: string, processed: number, total: number) => void } = {}
  ): Promise<SalesDriveApiResponse> {
    // console.log(`🚀 [SalesDrive] fetchOrdersFromDateRangeParallel called with dates: ${startDate} to ${endDate}`);

    const maxRetries = this.getSetting('orders.retryAttempts', 3);
    const retryDelay = this.getSetting('orders.retryDelay', 3000);
    const concurrencyLimit = 1; // SalesDrive: 10 запросов/мин, используем 1 для надежности

    console.log(`🔧 [SalesDrive] Using sync settings: retries=${maxRetries}, delay=${retryDelay}ms, concurrency=${concurrencyLimit}`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`🔄 [SalesDrive] Starting attempt ${attempt}/${maxRetries}`);

      try {
        // console.log(`🔐 [SalesDrive] Checking credentials: apiUrl=${!!this.apiUrl}, apiKey=${!!this.apiKey}`);

        if (!this.apiUrl || !this.apiKey) {
          console.error(`❌ [SalesDrive] API credentials missing: apiUrl=${this.apiUrl ? 'SET' : 'MISSING'}, apiKey=${this.apiKey ? 'SET' : 'MISSING'}`);
          throw new Error('SalesDrive API credentials not configured');
        }

        console.log(`🔄 Parallel fetching orders from ${startDate} to ${endDate} (attempt ${attempt}/${maxRetries})`);

        // Сначала получаем первую страницу, чтобы узнать общее количество
        const batchSize = Math.min(this.getSetting('orders.batchSize', 100), 100); // Максимум 100 заказов на страницу
        console.log(`📏 [SalesDrive] Using optimal batch size: ${batchSize} orders per page (minimizes API calls)`);
        const firstPageParams = new URLSearchParams({
          page: '1',
          limit: batchSize.toString(),
          'filter[orderTime][from]': startDate,
          'filter[orderTime][to]': endDate,
          'filter[statusId]': '__NOTDELETED__'
        });

        // console.log(`📄 Fetching first page to determine total pages...`);
        const firstPageFullUrl = `${this.apiUrl}/api/order/list/?${firstPageParams}`;
        console.log(`🔍 [SalesDrive REQUEST] Full request URL (page 1): \x1b[36m${firstPageFullUrl}\x1b[0m`);

        const firstResponse = await fetch(firstPageFullUrl, {
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
        const totalPages = Math.ceil(totalOrders / batchSize);
        const maxAllowedPages = Math.min(totalPages, 100); // Максимум 100 страниц

        console.log(`📊 Total orders: ${totalOrders}, Total pages: ${totalPages}, Will fetch: ${maxAllowedPages} pages`);

        // Обновляем прогресс - начинаем получение данных
        if (options.onProgress) {
          options.onProgress('fetching', `Отримуємо замовлення з SalesDrive API...`, firstPageOrders.length, totalOrders);
        }

        // Если всего одна страница, возвращаем результат сразу
        if (maxAllowedPages <= 1) {
          return {
            success: true,
            data: this.formatOrdersList(firstPageOrders),
          };
        }

        // Вычисляем задержку на основе количества страниц
        const requestDelay = this.calculateRequestDelay(maxAllowedPages);
        console.log(`⏱️ [SalesDrive] Using dynamic delay: ${requestDelay}ms (based on ${maxAllowedPages} pages)`);

        // Загружаем оставшиеся страницы параллельно с контролем количества
        const allOrders = [...firstPageOrders];
        const pagePromises: Promise<any[]>[] = [];

        // Оптимизируем количество страниц - с batchSize=100, для большинства случаев хватит 1-5 страниц
        console.log(`📊 [Parallel Filter] Will fetch all ${maxAllowedPages} pages (${Math.ceil(totalOrders / batchSize)} pages needed for ${totalOrders} orders)`);

        for (let page = 2; page <= maxAllowedPages; page++) {
          pagePromises.push(this.fetchSinglePage(startDate, endDate, page));
        }

        // Разбиваем на батчи для строгого контроля concurrency
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
              // Обновляем прогресс после получения данных
              if (options.onProgress) {
                options.onProgress('fetching', `Отримуємо замовлення з SalesDrive API...`, allOrders.length, totalOrders);
              }
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

          // Динамическая задержка между батчами на основе количества страниц
          if (batchIndex < batches.length - 1) {
            console.log(`⏱️ Waiting ${requestDelay}ms before next batch (dynamic delay based on ${maxAllowedPages} pages)...`);
            await new Promise(resolve => setTimeout(resolve, requestDelay));
          }
        }

        console.log(`✅ Parallel fetch completed: ${allOrders.length} orders from ${maxAllowedPages} pages`);

        // Финальное обновление прогресса
        if (options.onProgress) {
          options.onProgress('fetching', `Замовлення отримані з SalesDrive API`, allOrders.length, totalOrders);
        }

        return {
          success: true,
          data: this.formatOrdersList(allOrders),
        };

      } catch (error) {
        console.error(`❌ Error in parallel fetch (attempt ${attempt}/${maxRetries}):`, error);
        console.error(`❌ Error details:`, {
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack?.substring(0, 500) : 'No stack trace'
        });

        if (attempt === maxRetries) {
          console.error(`❌ All ${maxRetries} attempts failed`);
          return {
            success: false,
            error: 'Max retries exceeded for parallel loading'
          };
        }

        console.log(`⏳ Waiting ${retryDelay}ms before retry ${attempt + 1}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    return {
      success: false,
      error: 'Max retries exceeded',
    };
  }

  /**
   * Получает заказы за определенный период с пагинацией (параллельная версия с фильтром updateAt)
   */
  private async fetchOrdersFromDateRangeParallelUpdateAt(startDate: string, endDate: string): Promise<SalesDriveApiResponse> {
    const maxRetries = this.getSetting('orders.retryAttempts', 3);
    const retryDelay = this.getSetting('orders.retryDelay', 3000);
    const concurrencyLimit = 1; // SalesDrive: 10 запросов/мин, используем 1 для надежности

    console.log(`🔧 [SalesDrive UpdateAt] Using sync settings: retries=${maxRetries}, delay=${retryDelay}ms, concurrency=${concurrencyLimit}`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.apiUrl || !this.apiKey) {
          throw new Error('SalesDrive API credentials not configured');
        }

        console.log(`🔄 Parallel fetching orders by updateAt from ${startDate} to ${endDate} (attempt ${attempt}/${maxRetries})`);

        // Сначала получаем первую страницу, чтобы узнать общее количество
        const batchSize = Math.min(this.getSetting('orders.batchSize', 100), 100); // Максимум 100 заказов на страницу
        const formattedStartDate = this.formatSalesDriveDate(startDate);
        const formattedEndDate = this.formatSalesDriveDate(endDate);

        console.log(`📏 [SalesDrive] Using optimal batch size: ${batchSize} orders per page (UpdateAt filter)`);
        console.log(`📅 [Parallel UpdateAt] Formatted dates: ${startDate} -> ${formattedStartDate}, ${endDate} -> ${formattedEndDate}`);

        const firstPageParams = new URLSearchParams({
          page: '1',
          limit: batchSize.toString(),
          'filter[updateAt][from]': formattedStartDate,
          'filter[updateAt][to]': formattedEndDate,
          'filter[statusId]': '__NOTDELETED__'
        });

        console.log(`📄 Fetching first page to determine total pages (updateAt filter)...`);
        const firstPageFullUrl = `${this.apiUrl}/api/order/list/?${firstPageParams}`;
        console.log(`🔍 [SalesDrive REQUEST] First page request URL: \x1b[36m${firstPageFullUrl}\x1b[0m`);

        const firstResponse = await fetch(firstPageFullUrl, {
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

        console.log('🔍 [SalesDrive DEBUG] Full response from first page:', JSON.stringify(firstData, null, 2));

        if (firstData.status !== 'success') {
          throw new Error(`SalesDrive API error: ${firstData.message || 'Unknown error'}`);
        }

        const firstPageOrders = firstData.data || [];
        const totalOrders = firstData.totals?.count || firstData.data?.length || 0;
        const totalPages = Math.ceil(totalOrders / batchSize);
        const maxAllowedPages = Math.min(totalPages, 100); // Максимум 100 страниц

        console.log(`📊 [UpdateAt Filter] Total orders: ${totalOrders}, Total pages: ${totalPages}, Will fetch: ${maxAllowedPages} pages`);

        // Если всего одна страница, возвращаем результат сразу
        if (maxAllowedPages <= 1) {
          return {
            success: true,
            data: this.formatOrdersList(firstPageOrders),
          };
        }

        // Вычисляем задержку на основе количества страниц
        const requestDelay = this.calculateRequestDelay(maxAllowedPages);
        console.log(`⏱️ [SalesDrive UpdateAt] Using dynamic delay: ${requestDelay}ms (based on ${maxAllowedPages} pages)`);

        // Создаем массив промисов для параллельной загрузки с контролем количества
        const pagePromises: Promise<any[]>[] = [];

        // Оптимизируем количество страниц для UpdateAt фильтра
        // const maxPagesToFetch = maxAllowedPages - 1; // Загружаем все необходимые страницы
        console.log(`📊 [UpdateAt Filter] Will fetch all ${maxAllowedPages} pages (${Math.ceil(totalOrders / batchSize)} pages needed for ${totalOrders} orders)`);

        for (let page = 2; page <= maxAllowedPages; page++) {
          pagePromises.push(this.fetchSinglePageUpdateAt(startDate, endDate, page));
        }

        // Разбиваем на батчи для строгого контроля concurrency
        const batches: Promise<any[]>[][] = [];
        for (let i = 0; i < pagePromises.length; i += concurrencyLimit) {
          batches.push(pagePromises.slice(i, i + concurrencyLimit));
        }

        // Выполняем батчи последовательно, но внутри батча - параллельно
        const allOrders = [...firstPageOrders];
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          console.log(`🔄 Processing batch ${batchIndex + 1}/${batches.length} (${batches[batchIndex].length} pages) - updateAt filter`);

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
                  }
                }
              } else {
                console.error(`❌ Batch ${batchIndex} failed:`, error.message);
              }
            }
          }

          // Динамическая задержка между батчами на основе количества страниц
          if (batchIndex < batches.length - 1) {
            console.log(`⏱️ Waiting ${requestDelay}ms before next batch (dynamic delay based on ${maxAllowedPages} pages)...`);
            await new Promise(resolve => setTimeout(resolve, requestDelay));
          }
        }

        console.log(`✅ Parallel fetch completed: ${allOrders.length} orders from ${maxAllowedPages} pages (updateAt filter)`);

        return {
          success: true,
          data: this.formatOrdersList(allOrders),
        };

      } catch (error) {
        console.error(`Error in parallel fetch (attempt ${attempt}):`, error);

        if (attempt === maxRetries) {
          console.error(`❌ All ${maxRetries} attempts failed for updateAt filter`);
          return {
            success: false,
            error: 'Max retries exceeded for updateAt parallel loading'
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
   * Загружает одну страницу заказов с обработкой rate limiting
   */
  private async fetchSinglePage(startDate: string, endDate: string, page: number): Promise<any[]> {
    const batchSize = this.getSetting('orders.batchSize', 100); // Увеличиваем batch size до 100 для эффективности
    const params = new URLSearchParams({
      page: page.toString(),
      limit: batchSize.toString(),
      'filter[orderTime][from]': startDate,
      'filter[orderTime][to]': endDate,
      'filter[statusId]': '__NOTDELETED__'
    });

    const fullUrl = `${this.apiUrl}/api/order/list/?${params}`;
    console.log(`🔍 [SalesDrive REQUEST] Full request URL (page ${page}): \x1b[36m${fullUrl}\x1b[0m`);

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Form-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 429) {
      // При rate limiting - применяем адаптивную задержку и повторяем
      console.log(`🚦 Rate limit detected on page ${page}, applying adaptive delay...`);
      const adaptiveDelay = this.handleRateLimit();
      await new Promise(resolve => setTimeout(resolve, adaptiveDelay));

      // Повторяем запрос после задержки
      return await this.fetchSinglePage(startDate, endDate, page);
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
   * Получает заказы за определенный период последовательно (фильтр updateAt)
   */
  private async fetchOrdersFromDateRangeUpdateAt(startDate: string, endDate: string): Promise<SalesDriveApiResponse> {
    const maxRetries = this.getSetting('orders.retryAttempts', 3);
    const retryDelay = this.getSetting('orders.retryDelay', 2000);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.apiUrl || !this.apiKey) {
          throw new Error('SalesDrive API credentials not configured');
        }

        console.log(`🔄 Sequential fetching orders by updateAt from ${startDate} to ${endDate} (attempt ${attempt}/${maxRetries})`);

        // Сначала получаем первую страницу, чтобы узнать общее количество
        const batchSize = Math.min(this.getSetting('orders.batchSize', 100), 100); // Максимум 100 заказов на страницу
        const formattedStartDate = this.formatSalesDriveDate(startDate);
        const formattedEndDate = this.formatSalesDriveDate(endDate);

        console.log(`📅 [Sequential UpdateAt] Formatted dates: ${startDate} -> ${formattedStartDate}, ${endDate} -> ${formattedEndDate}`);

        const firstPageParams = new URLSearchParams({
          page: '1',
          limit: batchSize.toString(),
          'filter[updateAt][from]': formattedStartDate,
          'filter[updateAt][to]': formattedEndDate,
          'filter[statusId]': '__NOTDELETED__'
        });

        const firstPageFullUrl = `${this.apiUrl}/api/order/list/?${firstPageParams}`;
        console.log(`🔍 [SalesDrive GET] First page request URL: \x1b[36m${firstPageFullUrl}\x1b[0m`);

        const firstResponse = await fetch(firstPageFullUrl, {
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
        const totalPages = Math.ceil(totalOrders / batchSize);
        const maxAllowedPages = Math.min(totalPages, 100);

        console.log(`📊 [UpdateAt Sequential] Total orders: ${totalOrders}, Total pages: ${totalPages}, Will fetch: ${maxAllowedPages} pages`);

        if (maxAllowedPages <= 1) {
          return {
            success: true,
            data: this.formatOrdersList(firstPageOrders),
          };
        }

        // Вычисляем задержку на основе количества страниц
        const requestDelay = this.calculateRequestDelay(maxAllowedPages);
        console.log(`⏱️ [SalesDrive Sequential UpdateAt] Using dynamic delay: ${requestDelay}ms (based on ${maxAllowedPages} pages)`);

        // Загружаем оставшиеся страницы последовательно
        const allOrders = [...firstPageOrders];
        for (let page = 2; page <= maxAllowedPages; page++) {
          console.log(`📄 Fetching page ${page}/${maxAllowedPages} (updateAt filter)`);
          const pageOrders = await this.fetchSinglePageUpdateAt(startDate, endDate, page);
          allOrders.push(...pageOrders);

          // Динамическая задержка между страницами на основе количества страниц
          if (page < maxAllowedPages) {
            console.log(`⏱️ Waiting ${requestDelay}ms before next page (dynamic delay based on ${maxAllowedPages} pages)...`);
            await new Promise(resolve => setTimeout(resolve, requestDelay));
          }
        }

        console.log(`✅ Sequential fetch completed: ${allOrders.length} orders from ${maxAllowedPages} pages (updateAt filter)`);

        return {
          success: true,
          data: this.formatOrdersList(allOrders),
        };

      } catch (error) {
        console.error(`Error in sequential fetch (attempt ${attempt}):`, error);

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
   * Конвертирует ISO дату в формат SalesDrive API (РРРР-ММ-ДД ГГ:ХХ:СС)
   */
  private formatSalesDriveDate(isoDate: string): string {
    try {
      const date = new Date(isoDate);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');

      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
      console.error('❌ Error formatting date for SalesDrive API:', error);
      // Fallback: если не получается конвертировать, возвращаем текущую дату
      const now = new Date();
      return now.toISOString().split('T')[0] + ' ' + now.toTimeString().split(' ')[0];
    }
  }

  /**
   * Загружает одну страницу заказов с фильтром по updateAt (время изменения)
   */
  private async fetchSinglePageUpdateAt(startDate: string, endDate: string, page: number): Promise<any[]> {
    const batchSize = this.getSetting('orders.batchSize', 25);
    const formattedStartDate = this.formatSalesDriveDate(startDate);
    const formattedEndDate = this.formatSalesDriveDate(endDate);

    console.log(`📅 [UpdateAt] Formatted dates: ${startDate} -> ${formattedStartDate}, ${endDate} -> ${formattedEndDate}`);

    const params = new URLSearchParams({
      page: page.toString(),
      limit: batchSize.toString(),
      'filter[updateAt][from]': formattedStartDate,
      'filter[updateAt][to]': formattedEndDate,
      'filter[statusId]': '__NOTDELETED__'
    });

    const fullUrl = `${this.apiUrl}/api/order/list/?${params}`;
    console.log(`🔍 [SalesDrive GET] Full request URL: \x1b[36m${fullUrl}\x1b[0m`);

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Form-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 429) {
      // При rate limiting - применяем адаптивную задержку и повторяем
      console.log(`🚦 Rate limit detected on page ${page}, applying adaptive delay...`);
      const adaptiveDelay = this.handleRateLimit();
      await new Promise(resolve => setTimeout(resolve, adaptiveDelay));

      // Повторяем запрос после задержки
      return await this.fetchSinglePageUpdateAt(startDate, endDate, page);
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
    if (!Array.isArray(orders)) {
      console.error('❌ [ERROR] formatOrdersList received non-array:', orders);
      return [];
    }

    return orders
      .filter((order, index) => {
        if (!order) {
          console.warn(`⚠️ [WARNING] Skipping null/undefined order at index ${index}`);
          return false;
        }
        return true;
      })
      .map((order: any, index) => {
        try {
          return this.formatOrder(order);
        } catch (error) {
          console.error(`❌ [ERROR] Failed to format order at index ${index}:`, error);
          console.error('Order data:', order);
          return null;
        }
      })
      .filter(order => order !== null) as SalesDriveOrder[];
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
    // Проверяем, что rawOrder существует
    if (!rawOrder) {
      console.error('❌ [ERROR] formatOrder received null/undefined rawOrder');
      throw new Error('Invalid order data: rawOrder is null or undefined');
    }


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

    let customerName = '';
    let customerPhone = '';
    // Добавляем информацию о клиенте
    if (rawOrder.primaryContact) {
      const contact = rawOrder.primaryContact;
      customerName = `${contact.lName || ''} ${contact.fName || ''} ${contact.mName || ''}`.trim();
      customerPhone = Array.isArray(contact.phone) ? contact.phone[0] : contact.phone || '';
    }

    // Обчислюємо quantity: спочатку спробуємо kilTPorcij, якщо порожнє — сумуємо amount товарів
    let quantity = rawOrder.kilTPorcij || 0;
    if (!quantity && rawOrder.products && Array.isArray(rawOrder.products)) {
      // Обчислюємо quantity через orderDatabaseService.calculateActualQuantityPublic
      quantity = orderDatabaseService.calculateActualQuantityPublic(rawOrder.products.map((p: any) => ({ sku: p.sku, quantity: p.amount })));
    }

    // Базовое форматирование для основного объекта
    const formattedOrder: SalesDriveOrder = {
      rawData: rawOrder,  // Сохраняем полные сырые данные
      id: rawOrder.id || 0,
      orderNumber: rawOrder.externalId || rawOrder.id?.toString() || '',
      ttn: rawOrder.ord_delivery_data?.[0]?.trackingNumber || '',
      quantity: quantity,
      status: rawOrder.statusId?.toString() || '',
      statusText: statusMap[rawOrder.statusId] || 'Невідомий',
      items: rawOrder.products
        ? rawOrder.products.map((p: any) => ({
          productName: p.text,
          quantity: p.amount,
          price: p.price,
          sku: p.sku
        }))
        : rawOrder.items || [],
      createdAt: new Date().toISOString(),
      orderDate: rawOrder.orderTime || '',
      externalId: rawOrder.externalId || '',
      shippingMethod: rawOrder.shippingMethod || shippingMethodMap[rawOrder.shipping_method] || 'Невідомий',
      paymentMethod: rawOrder.paymentMethod || paymentMethodMap[rawOrder.payment_method] || 'Невідомий',
      cityName: rawOrder.ord_delivery_data?.[0]?.cityName || '',
      provider: rawOrder.ord_delivery_data?.[0]?.provider || rawOrder.ord_delivery || 'novaposhta',
      customerName: customerName,
      customerPhone: customerPhone,
      deliveryAddress: rawOrder.shipping_address || '',
      totalPrice: rawOrder.paymentAmount || 0,
      pricinaZnizki: rawOrder.pricinaZnizki ? String(rawOrder.pricinaZnizki) : '',
      sajt: rawOrder.sajt ? String(rawOrder.sajt) : ''
    };

    return formattedOrder;
  }


  /**
   * Обновляет статус заказа в SalesDrive API
   */
  async updateSalesDriveOrderStatus(id: string, status: string): Promise<boolean> {
    try {
      if (!this.apiUrl || !this.apiKey || !this.formKey) {
        throw new Error('SalesDrive API not fully configured');
      }

      console.log(`🔄 Updating order ${id} status to ${status} in SalesDrive`);

      // Подготавливаем URL для обновления заказа
      const updateUrl = `${this.apiUrl}/api/order/update/`;
      console.log(`📡 [SalesDrive POST] Making API request to: \x1b[36m${updateUrl}\x1b[0m`);

      // Формируем тело запроса согласно документации
      const requestBody = {
        form: this.formKey,
        id: id,
        data: {
          statusId: status
        }
      };

      console.log(`📤 Request body:`, JSON.stringify(requestBody, null, 2));

      // Выполняем запрос
      const response = await fetch(updateUrl, {
        method: 'POST',
        headers: {
          'X-Api-Key': this.apiKey,
          'Content-Type': 'application/json',
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
        console.log(`✅ Successfully updated order ${id} status to ${status} in SalesDrive`);
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
   */
  async getOrderDetails(orderId: string): Promise<SalesDriveOrder | null> {
    try {
      if (!this.apiUrl || !this.apiKey) {
        throw new Error('SalesDrive API not configured');
      }

      console.log(`🔍 Fetching order details for ${orderId}...`);

      const orderDetails = await this.getOrderById(orderId);
      if (orderDetails) {
        console.log(`✅ Found order ${orderId} via direct API call`);
        return orderDetails;
      } else {
        console.log(`❌ Order ${orderId} not found in SalesDrive`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching order details for ${orderId}:`, error);
      return null;
    }
  }

  /**
   * Получает заказ по ID через SalesDrive API с фильтром
   */
  async getOrderById(orderId: string): Promise<SalesDriveOrder | null> {
    const maxRetries = this.getSetting('orders.retryAttempts', 3);
    const retryDelay = this.getSetting('orders.retryDelay', 2000);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.apiUrl || !this.apiKey) {
          throw new Error('SalesDrive API not configured');
        }

        // Пробуем получить заказ по externalId через фильтр
        const params = new URLSearchParams({
          page: '1',
          limit: '1',
          'filter[externalId]': orderId
        });

        const fullUrl = `${this.apiUrl}/api/order/list/?${params}`;
        console.log(`🔍 [SalesDrive GET] Full request URL: \x1b[36m${fullUrl}\x1b[0m`);

        const response = await fetch(fullUrl, {
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
            continue;
          } else {
            throw new Error('Rate limit exceeded after all retries');
          }
        }

        this.resetRateLimitState();

        if (!response.ok) {
          throw new Error(`SalesDrive API error: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json() as { status: string; message?: string; data?: any[] };

        if (data.status !== 'success') {
          throw new Error(`SalesDrive API error: ${data.message || 'Unknown error'}`);
        }

        const orders = data.data || [];
        if (orders.length > 0) {
          return this.formatOrder(orders[0]);
        } else {
          return null;
        }

      } catch (error) {
        console.error(`Error fetching order by ID (attempt ${attempt}):`, error);

        if (attempt === maxRetries) {
          throw error;
        }

        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    return null;
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
   * Оптимизированная синхронизация с batch операциями
   */
  async syncOrdersWithDatabaseOptimized(): Promise<{ success: boolean; synced: number; errors: number; details: any[]; metadata?: any }> {
    const startTime = Date.now();

    try {
      console.log('🚀 [SYNC] Starting optimized SalesDrive to Database synchronization...');
      console.log('🚀 [SYNC] Timestamp:', new Date().toISOString());
      console.log('🚀 [SYNC] Rate limit state at start:', {
        consecutiveErrors: this.rateLimitState.consecutive429Errors,
        lastErrorTime: this.rateLimitState.last429Time ? new Date(this.rateLimitState.last429Time).toISOString() : 'never'
      });


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
      console.log(`📊 [SYNC] Order statuses: ${[...new Set(salesDriveOrders.filter(o => o && o.status).map(o => o.status))].join(', ')}`);

      // Группируем заказы для batch операций
      const orderIds = salesDriveOrders.filter(o => o && o.orderNumber).map(o => o.orderNumber);
      const existingOrders = await orderDatabaseService.getOrdersByExternalIds(orderIds);
      
      // Разделяем на новые и обновляемые
      const existingIds = new Set(existingOrders.filter(o => o && o.externalId).map(o => o.externalId));
      const newOrders = salesDriveOrders.filter(o => o && o.orderNumber && !existingIds.has(o.orderNumber));
      const updateOrders = salesDriveOrders.filter(o => o && o.orderNumber && existingIds.has(o.orderNumber));

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
        console.log(`📝 [SYNC] Sample new orders: ${newOrders.slice(0, 3).filter(o => o && o.orderNumber).map(o => `${o.orderNumber} (${o.status || 'no status'})`).join(', ')}`);

        try {
          const startTime = Date.now();
          await orderDatabaseService.createOrdersBatch(newOrders.filter(o => o && o.orderNumber).map(o => ({
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

          synced += newOrders.filter(o => o && o.orderNumber).length;
          details.push(...newOrders.filter(o => o && o.orderNumber).map(o => ({
            action: 'created',
            orderNumber: o.orderNumber,
            success: true
          })));

          console.log(`✅ [SYNC] Successfully created ${newOrders.length} new orders in ${duration}ms`);
          console.log(`✅ [SYNC] Average time per order: ${(duration / newOrders.length).toFixed(2)}ms`);
          console.log(`✅ [SYNC] Orders with cache populated: ${newOrders.length} (100%)`);

        } catch (error) {
          console.error('❌ [SYNC] Error creating orders batch:', error);
          errors += newOrders.filter(o => o && o.orderNumber).length;
          details.push(...newOrders.filter(o => o && o.orderNumber).map(o => ({
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
        console.log(`🔄 [SYNC] Sample update orders: ${updateOrders.slice(0, 3).filter(o => o && o.orderNumber).map(o => `${o.orderNumber} (${o.status || 'no status'})`).join(', ')}`);

        try {
          const updateStartTime = Date.now();
          const updateResult = await orderDatabaseService.updateOrdersBatchSmart(updateOrders.filter(o => o && o.orderNumber).map(o => ({
            id: o.id,
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
              if (!result) return;

              if (result.action === 'updated') {
                console.log(`   🔄 Order ${result.orderNumber}: ${result.changedFields?.join(', ') || 'no fields'}`);

                // Показываем конкретные значения для важных полей
                if (result.previousValues?.status && result.changedFields?.includes('status')) {
                  const newStatus = updateOrders.find(o => o && o.orderNumber === result.orderNumber)?.status;
                  console.log(`      Status: ${result.previousValues.status} → ${newStatus || 'no status'}`);
                }
                
                if (result.previousValues?.statusText && result.changedFields?.includes('statusText')) {
                  const newStatusText = updateOrders.find(o => o && o.orderNumber === result.orderNumber)?.statusText;
                  console.log(`      StatusText: ${result.previousValues.statusText} → ${newStatusText || 'no statusText'}`);
                }

                if (result.previousValues?.ttn && result.changedFields?.includes('ttn')) {
                  const newTtn = updateOrders.find(o => o && o.orderNumber === result.orderNumber)?.ttn;
                  console.log(`      TTN: ${result.previousValues.ttn} → ${newTtn || 'no ttn'}`);
                }

                if (result.previousValues?.quantity && result.changedFields?.includes('quantity')) {
                  const newQuantity = updateOrders.find(o => o && o.orderNumber === result.orderNumber)?.quantity;
                  console.log(`      Quantity: ${result.previousValues.quantity} → ${newQuantity || 'no quantity'}`);
                }

                if (result.previousValues?.totalPrice && result.changedFields?.includes('totalPrice')) {
                  const newTotalPrice = updateOrders.find(o => o && o.orderNumber === result.orderNumber)?.totalPrice;
                  console.log(`      TotalPrice: ${result.previousValues.totalPrice} → ${newTotalPrice || 'no price'}`);
                }

                if (result.changedFields?.includes('rawData')) {
                  const oldKeys = result.previousValues?.rawData ? Object.keys(result.previousValues.rawData).length : 0;
                  const newOrder = updateOrders.find(o => o && o.orderNumber === result.orderNumber);
                  const newKeys = newOrder?.rawData ? Object.keys(newOrder.rawData).length : 0;
                  console.log(`      RawData: Updated (contains ${oldKeys} → ${newKeys} fields)`);
                }

                if (result.changedFields?.includes('items')) {
                  const oldItemsCount = Array.isArray(result.previousValues?.items) ? result.previousValues.items.length : 0;
                  const newOrder = updateOrders.find(o => o && o.orderNumber === result.orderNumber);
                  const newItemsCount = Array.isArray(newOrder?.items) ? newOrder.items.length : 0;
                  console.log(`      Items: ${oldItemsCount} → ${newItemsCount} items`);
                }
                
              // } else if (result.action === 'skipped') {
                // console.log(`   ⏭️ Order ${result.orderNumber || 'unknown'}: ${result.reason}`);
              } else if (result.action === 'error') {
                console.log(`   ❌ Order ${result.orderNumber || 'unknown'}: ${result.error || 'no error'}`);
              }
            });
          }

          // Показываем краткую сводку изменений
          if (updateResult.totalUpdated > 0) {
            const statusChanges = updateResult.results
              .filter(r => r && r.action === 'updated' && r.changedFields?.includes('status'))
              .length;
            const ttnChanges = updateResult.results
              .filter(r => r && r.action === 'updated' && r.changedFields?.includes('ttn'))
              .length;
            const priceChanges = updateResult.results
              .filter(r => r && r.action === 'updated' && r.changedFields?.includes('totalPrice'))
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
          details.push(...updateResult.results.filter(r => r).map(r => ({
            action: r.action,
            orderNumber: r.orderNumber || 'unknown',
            success: r.action !== 'error',
            ...(r.action === 'updated' && { changedFields: r.changedFields }),
            ...(r.action === 'error' && { error: r.error })
          })));
          
          console.log(`✅ Successfully processed ${updateResult.totalUpdated + updateResult.totalSkipped} orders`);
        } catch (error) {
          console.error('❌ Error updating orders batch:', error);
          errors += updateOrders.filter(o => o && o.orderNumber).length;
          details.push(...updateOrders.filter(o => o && o.orderNumber).map(o => ({
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
      console.log(`   🌐 Rate limit state at end: ${this.rateLimitState.consecutive429Errors} consecutive errors`);
      console.log(`   📊 Memory usage: ${process.memoryUsage().heapUsed / 1024 / 1024}MB heap used`);

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
   * Записывает результат синхронизации в историю
   */
  private async recordSyncInHistory(result: { success: boolean; synced: number; errors: number; details: any[]; metadata?: any }, syncType: 'automatic' | 'manual' | 'background' = 'automatic'): Promise<void> {
    try {
      const startDate = result.metadata?.startDate;
      const endDate = result.metadata?.endDate;
      const totalOrders = result.metadata?.totalProcessed || result.synced + result.errors;
      const newOrders = result.metadata?.newOrders || 0;
      const updatedOrders = result.metadata?.updatedOrders || result.synced;
      const skippedOrders = result.metadata?.skippedOrders || 0;
      const duration = result.metadata?.totalDuration || 0;

      const historyData: CreateSyncHistoryData = {
        syncType,
        startDate,
        endDate,
        totalOrders,
        newOrders,
        updatedOrders,
        skippedOrders,
        errors: result.errors,
        duration,
        details: {
          ...result.metadata,
          synced: result.synced,
          errors: result.errors
        },
        status: result.success ? 'success' : (result.errors > 0 ? 'partial' : 'failed'),
        errorMessage: result.errors > 0 ? `${result.errors} orders failed to sync` : undefined
      };

      await syncHistoryService.createSyncRecord(historyData);
      console.log(`📝 [SYNC HISTORY] Recorded ${syncType} sync: ${result.success ? 'success' : 'failed'}`);
    } catch (error) {
      console.error('❌ [SYNC HISTORY] Failed to record sync in history:', error);
      throw error;
    }
  }

  /**
   * Синхронизирует заказы из SalesDrive с локальной БД (CRON task каждый час)
   */
  async syncOrdersWithDatabase(): Promise<{ success: boolean; synced: number; errors: number; details: any[] }> {
    try {
      console.log('🎯 [SYNC] Starting SalesDrive to Database synchronization...');
      console.log('🎯 [SYNC] Initiated at:', new Date().toISOString());

      // Используем оптимизированный метод
      const result = await this.syncOrdersWithDatabaseOptimized();

      // Записываем в историю синхронизаций
      try {
        await this.recordSyncInHistory(result, 'automatic');
      } catch (historyError) {
        console.error('❌ [SYNC] Failed to record sync in history:', historyError);
        // Не прерываем выполнение из-за ошибки записи в историю
      }

      return result;
    } catch (error) {
      console.error('❌ Error during synchronization:', error);

      // Записываем неудачную синхронизацию в историю
      try {
        await this.recordSyncInHistory({
          success: false,
          synced: 0,
          errors: 1,
          details: [{ error: error instanceof Error ? error.message : 'Unknown error' }]
        }, 'automatic');
      } catch (historyError) {
        console.error('❌ [SYNC] Failed to record failed sync in history:', historyError);
      }

      return {
        success: false,
        synced: 0,
        errors: 1,
        details: [{ error: error instanceof Error ? error.message : 'Unknown error' }]
      };
    }
  }

  /**
   * Ручная синхронизация заказов с указанным диапазоном дат
   * Получает ВСЕ заказы из диапазона дат (независимо от статуса)
   * По умолчанию использует умную синхронизацию (только изменения)
   * Поддерживает чанкинг для больших объемов данных
   * syncMode: 'smart' - только измененные заказы, 'force' - все заказы
   */
  async syncOrdersWithDatabaseManual(startDate: string, endDate?: string, options: {
    chunkSize?: number;
    maxMemoryMB?: number;
    enableProgress?: boolean;
    batchSize?: number;
    concurrency?: number;
    syncMode?: 'smart' | 'force'; // 'smart' - только изменения, 'force' - полная синхронизация
    onProgress?: (stage: 'fetching' | 'processing' | 'saving' | 'completed' | 'error', message: string, processedOrders?: number, totalOrders?: number, currentBatch?: number, totalBatches?: number, errors?: string[]) => void;
  } = {}): Promise<{ success: boolean; synced: number; errors: number; totalCreated?: number; totalUpdated?: number; totalSkipped?: number; details: any[]; metadata?: any }> {
    const operationStartTime = Date.now();
    let syncHistoryData: CreateSyncHistoryData | null = null;

    // Настройки чанкинга
    const chunkSize = options.chunkSize || 500; // Размер чанка по умолчанию
    const maxMemoryMB = options.maxMemoryMB || 100; // Максимальный размер памяти в MB
    const enableProgress = options.enableProgress !== false;
    const syncMode = options.syncMode || 'smart'; // По умолчанию используем умную синхронизацию

    try {
      // console.log('🔄 [MANUAL SYNC] Starting comprehensive manual sync from:', startDate);
      // console.log('🔄 [MANUAL SYNC] Initiated at:', new Date().toISOString());

      try {

      console.log(`🔧 [MANUAL SYNC] Chunking settings: size=${chunkSize}, maxMemory=${maxMemoryMB}MB, progress=${enableProgress}`);

      // Валидация и форматирование даты начала
      let formattedStartDate: string;
      try {
        const startDateObj = new Date(startDate);
        if (isNaN(startDateObj.getTime())) {
          throw new Error('Invalid start date format');
        }
        formattedStartDate = startDateObj.toISOString().split('T')[0];
        // console.log('📅 [MANUAL SYNC] Formatted start date:', formattedStartDate);
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
          // console.log('📅 [MANUAL SYNC] Formatted end date:', formattedEndDate);
        } catch (dateError) {
          console.error('❌ [MANUAL SYNC] Invalid end date:', endDate, dateError);
          formattedEndDate = new Date().toISOString().split('T')[0];
          console.log('📅 [MANUAL SYNC] Using current date as end date due to invalid input');
        }
      } else {
        formattedEndDate = new Date().toISOString().split('T')[0];
        console.log('📅 [MANUAL SYNC] No end date provided, using current date');
      }

      console.log(`📅 [MANUAL SYNC] Fetching ALL orders from ${formattedStartDate} to ${formattedEndDate} (no status filtering)`);
      // console.log(`🔧 [MANUAL SYNC] API URL configured: ${!!this.apiUrl}`);
      // console.log(`🔧 [MANUAL SYNC] API Key configured: ${!!this.apiKey}`);

      const salesDriveResponse = await this.fetchOrdersFromDateRangeParallel(formattedStartDate, formattedEndDate, {
        onProgress: (stage, message, processed, total) => {
          if (options.onProgress && enableProgress) {
            options.onProgress('fetching', message, processed, total, 0, 1);
          }
        }
      });

      console.log(`📊 [MANUAL SYNC] SalesDrive response received: success=${salesDriveResponse.success}, orders=${salesDriveResponse.data?.length || 0}`);

      // Инициализируем переменную salesDriveOrders
      let salesDriveOrders: any[] = [];

      if (!salesDriveResponse.success || !salesDriveResponse.data) {
        const errorMsg = salesDriveResponse.error || 'Failed to fetch orders from SalesDrive';
        console.error(`❌ [MANUAL SYNC] SalesDrive API not available: ${errorMsg}`);

        return {
          success: false,
          synced: 0,
          errors: 1,
          details: [{ action: 'error', error: 'SalesDrive API недоступен' }],
          metadata: {
            totalDuration: (Date.now() - operationStartTime) / 1000,
            error: errorMsg
          }
        };
      }

      salesDriveOrders = salesDriveResponse.data || [];

      console.log(`📦 [MANUAL SYNC] Retrieved ${salesDriveOrders.length} orders from SalesDrive`);
      console.log(`📊 [MANUAL SYNC] Order statuses present: ${[...new Set(salesDriveOrders.filter(o => o && o.status).map(o => o.status))].join(', ')}`);

      // Применяем чанкинг для больших объемов данных
      const shouldUseChunking = salesDriveOrders.length > chunkSize;
      const estimatedMemoryMB = (JSON.stringify(salesDriveOrders).length / 1024 / 1024);

      // Создаем чанки если нужно
      const chunks: SalesDriveOrder[][] = [];
      if (shouldUseChunking) {
        for (let i = 0; i < salesDriveOrders.length; i += chunkSize) {
          chunks.push(salesDriveOrders.slice(i, i + chunkSize));
        }
      }

      // Обновляем прогресс с общим количеством заказов
      if (options.onProgress && enableProgress) {
        options.onProgress('processing', `Знайдено ${salesDriveOrders.length} замовлень для синхронізації`, 0, salesDriveOrders.length, 0, shouldUseChunking ? chunks.length : 1);
      }

      console.log(`🔧 [MANUAL SYNC] Memory usage estimate: ${estimatedMemoryMB.toFixed(1)}MB`);
      console.log(`🔧 [MANUAL SYNC] Using chunking: ${shouldUseChunking} (threshold: ${chunkSize} orders)`);

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

      let totalSynced = 0;
      let totalErrors = 0;
      let totalSkipped = 0;
      let updateResult: any;
      let updateDuration = 0;

      if (shouldUseChunking) {
        // Обработка с чанкингом
        console.log(`🔄 [MANUAL SYNC] Starting chunked sync of ${salesDriveOrders.length} orders...`);
        console.log(`📦 [MANUAL SYNC] Split into ${chunks.length} chunks of ~${chunkSize} orders each`);

        let totalCreated = 0;
        let totalUpdated = 0;
        const updateStartTime = Date.now();

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
          const chunk = chunks[chunkIndex];
          console.log(`🔄 [MANUAL SYNC] Processing chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} orders)`);

          // Обновляем прогресс перед обработкой чанка
          if (options.onProgress && enableProgress) {
            options.onProgress('processing', `Обробка чанка ${chunkIndex + 1}/${chunks.length}`, totalSynced, salesDriveOrders.length, chunkIndex + 1, chunks.length);
          }

          const chunkUpdateData = chunk.filter(o => o && o.orderNumber).map(o => ({
            id: o.id,
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

          try {
            let chunkResult;
            if (syncMode === 'smart') {
              console.log(`🔄 [MANUAL SYNC] Using SMART sync for chunk ${chunkIndex + 1}/${chunks.length}`);
              chunkResult = await orderDatabaseService.updateOrdersBatchSmart(chunkUpdateData, {
                batchSize: options.batchSize || 50,
                concurrency: options.concurrency || 2
              });
            } else {
              console.log(`🔄 [MANUAL SYNC] Using FORCE sync for chunk ${chunkIndex + 1}/${chunks.length}`);
              chunkResult = await orderDatabaseService.forceUpdateOrdersBatch(chunkUpdateData);
            }
            totalCreated += chunkResult.totalCreated;
            totalUpdated += chunkResult.totalUpdated;
            totalSkipped += chunkResult.totalSkipped || 0;
            totalSynced += chunkResult.totalCreated + chunkResult.totalUpdated;
            totalErrors += chunkResult.totalErrors;

            console.log(`✅ [MANUAL SYNC] Chunk ${chunkIndex + 1} completed: +${chunkResult.totalCreated} created, ${chunkResult.totalUpdated} updated, ${chunkResult.totalSkipped || 0} skipped, ${chunkResult.totalErrors} errors`);

            // Обновляем прогресс после обработки чанка
            if (options.onProgress && enableProgress) {
              options.onProgress('processing', `Чанк ${chunkIndex + 1}/${chunks.length} оброблений: +${chunkResult.totalCreated} створено, ${chunkResult.totalUpdated} оновлено`, totalSynced, salesDriveOrders.length, chunkIndex + 1, chunks.length, totalErrors > 0 ? [`${totalErrors} помилок`] : []);
            }
          } catch (chunkError) {
            console.error(`❌ [MANUAL SYNC] Error processing chunk ${chunkIndex + 1}:`, chunkError);
            totalErrors += chunk.length;

            // Обновляем прогресс при ошибке
            if (options.onProgress && enableProgress) {
              options.onProgress('processing', `Помилка в чанку ${chunkIndex + 1}/${chunks.length}`, totalSynced, salesDriveOrders.length, chunkIndex + 1, chunks.length, [`Помилка обробки чанку: ${chunkError instanceof Error ? chunkError.message : 'Unknown error'}`]);
            }
          }

          // Очистка памяти между чанками
          if (global.gc) {
            global.gc();
          }
        }

        updateDuration = (Date.now() - updateStartTime) / 1000;
        updateResult = {
          totalCreated: totalCreated,
          totalUpdated: totalUpdated,
          totalErrors: totalErrors,
          totalSkipped: 0
        };

        console.log(`✅ [MANUAL SYNC] Chunked sync completed in ${updateDuration.toFixed(1)}s`);
      } else {
        // Обработка без чанкинга
        console.log(`🔄 [MANUAL SYNC] Starting direct batch sync of ${salesDriveOrders.length} orders...`);

        // Обновляем прогресс перед обработкой
        if (options.onProgress && enableProgress) {
          options.onProgress('processing', `Обробка ${salesDriveOrders.length} замовлень...`, 0, salesDriveOrders.length, 1, 1);
        }

        const updateData = salesDriveOrders.filter(o => o && o.orderNumber).map(o => ({
          id: o.id,
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
        if (syncMode === 'smart') {
          console.log(`🔄 [MANUAL SYNC] Using SMART sync for ${updateData.length} orders`);
          updateResult = await orderDatabaseService.updateOrdersBatchSmart(updateData, {
            batchSize: options.batchSize || 50,
            concurrency: options.concurrency || 2
          });
        } else {
          console.log(`🔄 [MANUAL SYNC] Using FORCE sync for ${updateData.length} orders`);
          updateResult = await orderDatabaseService.forceUpdateOrdersBatch(updateData);
        }
        updateDuration = (Date.now() - updateStartTime) / 1000;

        totalSynced = updateResult.totalCreated + updateResult.totalUpdated;
        totalSkipped = updateResult.totalSkipped || 0;
        totalErrors = updateResult.totalErrors;

        // Обновляем прогресс после обработки
        if (options.onProgress && enableProgress) {
          const progressMessage = syncMode === 'smart'
            ? `Обробка завершена: +${updateResult.totalCreated} створено, ${updateResult.totalUpdated} оновлено, ${totalSkipped} пропущено`
            : `Обробка завершена: +${updateResult.totalCreated} створено, ${updateResult.totalUpdated} оновлено`;
          options.onProgress('saving', progressMessage, totalSynced, salesDriveOrders.length, 1, 1, totalErrors > 0 ? [`${totalErrors} помилок`] : []);
        }
      }

      console.log(`📊 [MANUAL SYNC] ${syncMode.toUpperCase()} batch update completed in ${updateDuration.toFixed(1)}s:`);
      console.log(`   🆕 Created: ${updateResult.totalCreated} orders`);
      console.log(`   🔄 Updated: ${updateResult.totalUpdated} orders`);
      if (syncMode === 'smart') {
        console.log(`   ⏭️ Skipped: ${totalSkipped} orders (no changes)`);
      }
      console.log(`   ❌ Errors: ${updateResult.totalErrors} orders`);
      console.log(`   📊 Total processed: ${totalSynced + totalSkipped}/${salesDriveOrders.length} orders from SalesDrive`);
      if (syncMode === 'smart') {
        console.log(`   ✅ Smart sync: only changed orders were processed`);
      } else {
        console.log(`   ✅ Force sync: all orders were processed`);
      }

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
        totalOrders: salesDriveOrders.length,
        newOrders: updateResult.totalCreated,
        updatedOrders: updateResult.totalUpdated,
        skippedOrders: updateResult.totalSkipped || 0,
        errors: updateResult.totalErrors,
        duration: totalDuration,
        details: {
          processedOrders: totalProcessed,
          totalFromSalesDrive: salesDriveOrders.length,
          successRate: parseFloat(successRate),
          dateRange: `${formattedStartDate} to ${formattedEndDate}`,
          batchUpdateDuration: updateDuration,
          syncMode,
          changes: updateResult.changesSummary || {},
          sampleOrders: salesDriveOrders.slice(0, 5).filter(o => o && o.orderNumber).map(o => ({
            orderNumber: o.orderNumber,
            status: o.status || 'no status',
            customerName: o.customerName || 'no name'
          }))
        },
        status: status,
        errorMessage: updateResult.totalErrors > 0 ? `${updateResult.totalErrors} orders failed to sync` : undefined
      };

      await syncHistoryService.createSyncRecord(syncHistoryData);

      // Финальное обновление прогресса
      if (options.onProgress && enableProgress) {
        const completedMessage = syncMode === 'smart'
          ? `Синхронізація завершена: +${updateResult.totalCreated} створено, ${updateResult.totalUpdated} оновлено, ${updateResult.totalSkipped || 0} пропущено`
          : `Синхронізація завершена: ${updateResult.totalCreated + updateResult.totalUpdated} оброблено, ${updateResult.totalErrors} помилок`;
        const errors = updateResult.totalErrors > 0 ? [`${updateResult.totalErrors} замовлень не вдалося обробити`] : [];
        options.onProgress('completed', completedMessage, totalProcessed, totalProcessed, shouldUseChunking ? chunks.length : 1, shouldUseChunking ? chunks.length : 1, errors);
      }

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
        totalCreated: updateResult.totalCreated,
        totalUpdated: updateResult.totalUpdated,
        totalSkipped: updateResult.totalSkipped || 0,
        details: updateResult.results || [],
        metadata: {
          ...metadata,
          syncMode,
          totalCreated: updateResult.totalCreated,
          totalUpdated: updateResult.totalUpdated,
          totalSkipped: updateResult.totalSkipped || 0,
          totalErrors: updateResult.totalErrors
        }
      };

      } catch (innerError) {
        console.error('❌ [MANUAL SYNC] Error during sync process:', innerError);

        // Обновляем прогресс при внутренней ошибке
        if (options.onProgress && enableProgress) {
          options.onProgress('error', 'Помилка обробки даних', 0, 0, 0, 1, [innerError instanceof Error ? innerError.message : 'Unknown processing error']);
        }

        throw innerError; // Перекидаємо помилку в зовнішній catch
      }

    } catch (error) {
      console.error('❌ [MANUAL SYNC] Critical error during manual sync:', error);

      // Обновляем прогресс при критической ошибке
      if (options.onProgress && enableProgress) {
        options.onProgress('error', 'Критична помилка синхронізації', 0, 0, 0, 1, [error instanceof Error ? error.message : 'Unknown critical error']);
      }

      const totalDuration = (Date.now() - operationStartTime) / 1000;

      // Записуємо критичну помилку в історію
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
