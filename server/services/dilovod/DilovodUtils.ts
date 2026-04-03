// Утиліти та хелпери для роботи з Dilovod

import { DilovodConfig } from './DilovodTypes.js';

// ============================================================
// Діагностика результату saveObject від Dilovod API
// ============================================================

/**
 * Відомі типи "м'яких" помилок Dilovod API — вони приходять у полі `error`
 * або `clientMessages` відповіді з HTTP 200, але документ НЕ збережено.
 *
 * Використовується для запобігання хибному запису дати відвантаження в БД.
 */
const DILOVOD_SOFT_ERROR_PATTERNS = [
  'applicationLayerError',       // Документ не збережено (напр. недостатня кількість)
  'multithreadApiSession',        // Паралельний запит заблоковано
] as const;

/**
 * Перевіряє, чи відповідь Dilovod API містить помилку збереження документа.
 *
 * Повертає `true` якщо:
 *  - відсутній `id` у відповіді (документ не створено), АБО
 *  - поле `error` містить будь-який з відомих шаблонів помилок, АБО
 *  - `status === 'error'`, АБО
 *  - `clientMessages` містить повідомлення типу 'error' або 'warn'
 *    разом з відсутнім `id`.
 *
 * @param result - сира відповідь від `exportOrderToDilovod` / `makeRequest`
 */
export function isDilovodExportError(result: any): boolean {
  if (!result) return true;

  // Явна помилка в полі error (applicationLayerError, multithreadApiSession тощо)
  if (result.error) {
    // Будь-яке непорожнє значення error = документ не збережено
    return true;
  }

  // Явний статус помилки
  if (result.status === 'error') return true;

  // clientMessages можуть містити помилки навіть без поля error
  if (Array.isArray(result.clientMessages)) {
    const hasError = result.clientMessages.some(
      (m: any) => m && (m.type === 'error' || m.type === 'warn')
    );
    if (hasError && !result.id) return true;
  }

  // Немає id — документ не створено (будь-яка причина)
  if (!result.id) return true;

  return false;
}

/**
 * Повертає рядок опису помилки з відповіді Dilovod для логування.
 */
export function getDilovodExportErrorMessage(result: any): string {
  if (!result) return 'Порожня відповідь від Dilovod API';

  if (result.error) {
    const errStr = String(result.error);
    for (const pattern of DILOVOD_SOFT_ERROR_PATTERNS) {
      if (errStr.includes(pattern)) {
        if (pattern === 'applicationLayerError') {
          return `Dilovod: документ не збережено (applicationLayerError) — ${errStr}`;
        }
        if (pattern === 'multithreadApiSession') {
          return `Dilovod: заблоковано паралельний запит (multithreadApiSession) — повторіть спробу пізніше`;
        }
      }
    }
    return `Dilovod: помилка збереження документа — ${errStr}`;
  }

  if (result.status === 'error') {
    return result.message || 'Dilovod: статус відповіді "error"';
  }

  if (!result.id) {
    return 'Dilovod: відповідь не містить id — документ не збережено';
  }

  return 'Невідома помилка';
}

// Простий кеш для конфігурації з TTL 10 хвилин
let configCache: { config: DilovodConfig; timestamp: number } | null = null;
const CONFIG_CACHE_TTL = 600000; // 10 хвилин

// Функція очищення кешу (викликається при оновленні налаштувань)
export function clearConfigCache(): void {
  configCache = null;
}

// Конфігурація за замовчуванням
export const DEFAULT_DILOVOD_CONFIG: DilovodConfig = {
  apiUrl: '',
  apiKey: '',
  /** Масив ID батьківських груп комплектів (задається в UI налаштувань) */
  setParentIds: ["1100300000001315"],
  mainPriceType: "1101300000001001",
  categoriesMap: {
    "Перші страви": 16,
    "Другі страви": 21,
    "Готові набори": 19,
    "Салати": 20,
    "Салатні набори": 20,
    "Напої": 33,
    "М'ясні страви": 34,
    "Основи для салатів": 35
  },
  /** ID головного складу (склад готової продукції) */
  mainStorageId: "1100700000001005",
  /** ID малого складу (для відвантажень) */
  smallStorageId: "1100700000001017",
  /** @deprecated Залишено для зворотної сумісності — використовуйте mainStorageId/smallStorageId */
  storageIdsList: ["1100700000001005", "1100700000001017"]
};


// Отримати конфігурацію Dilovod з налаштуваннями з БД (з кешуванням)
export async function getDilovodConfigFromDB(): Promise<DilovodConfig> {
  // Перевіряємо кеш
  const now = Date.now();
  if (configCache && (now - configCache.timestamp) < CONFIG_CACHE_TTL) {
    return configCache.config;
  }
  
  try {
    // Завантажуємо налаштування Dilovod з settings_base таблиці
    const dilovodSettings = await loadDilovodSettingsFromDB();
    
    const config = {
      apiUrl: dilovodSettings.apiUrl || process.env.DILOVOD_API_URL || DEFAULT_DILOVOD_CONFIG.apiUrl,
      apiKey: dilovodSettings.apiKey || process.env.DILOVOD_API_KEY || DEFAULT_DILOVOD_CONFIG.apiKey,
      // Зчитуємо масив ID груп комплектів: новий ключ dilovod_set_parent_ids (JSON-масив),
      // з fallback на старий ключ dilovod_set_parent_id (один рядок)
      setParentIds: dilovodSettings.setParentIds.length > 0
        ? dilovodSettings.setParentIds
        : DEFAULT_DILOVOD_CONFIG.setParentIds,
      mainPriceType: dilovodSettings.mainPriceType || DEFAULT_DILOVOD_CONFIG.mainPriceType,
      categoriesMap: dilovodSettings.categoriesMap || DEFAULT_DILOVOD_CONFIG.categoriesMap,
      // Нові окремі поля складів; fallback на DEFAULT
      mainStorageId: dilovodSettings.mainStorageId || DEFAULT_DILOVOD_CONFIG.mainStorageId,
      smallStorageId: dilovodSettings.smallStorageId || DEFAULT_DILOVOD_CONFIG.smallStorageId,
      // storageIdsList — для зворотної сумісності з DilovodDataProcessor
      storageIdsList: [
        dilovodSettings.mainStorageId || DEFAULT_DILOVOD_CONFIG.mainStorageId,
        dilovodSettings.smallStorageId || DEFAULT_DILOVOD_CONFIG.smallStorageId,
      ].filter(Boolean),
      // ID фірми за замовчуванням (для фільтрації залишків)
      defaultFirmId: dilovodSettings.defaultFirmId || undefined,
    };
    
    // Кешуємо конфігурацію
    configCache = { config, timestamp: now };
    
    return config;
  } catch (error) {
    // У разі помилки повертаємо конфігурацію за замовчуванням
    console.warn('Помилка завантаження налаштувань Dilovod з БД, використовуємо значення за замовчуванням:', error);
    return DEFAULT_DILOVOD_CONFIG;
  }
}

// Завантаження налаштувань Dilovod з settings_base таблиці
export async function loadDilovodSettingsFromDB() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  
  try {
    const settings = await prisma.settingsBase.findMany({
      where: { category: 'dilovod', isActive: true }
    });

    const settingsMap = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {} as Record<string, string>);

    return {
      apiUrl: settingsMap['dilovod_api_url'] || '',
      apiKey: settingsMap['dilovod_api_key'] || '',
      // Спочатку читаємо новий ключ (масив JSON), якщо немає — старий ключ (один ID)
      setParentIds: (() => {
        if (settingsMap['dilovod_set_parent_ids']) {
          try { return JSON.parse(settingsMap['dilovod_set_parent_ids']) as string[]; } catch { /* ignore */ }
        }
        if (settingsMap['dilovod_set_parent_id']) {
          return [settingsMap['dilovod_set_parent_id']];
        }
        return [];
      })(),
      mainPriceType: settingsMap['dilovod_main_price_type'] || '',
      categoriesMap: settingsMap['dilovod_categories_map'] ? JSON.parse(settingsMap['dilovod_categories_map']) : {},
      mainStorageId: settingsMap['dilovod_main_storage_id'] || '',
      smallStorageId: settingsMap['dilovod_small_storage_id'] || '',
      storageIdsList: settingsMap['dilovod_storage_ids_list']
        ? (() => { try { return JSON.parse(settingsMap['dilovod_storage_ids_list']) as string[]; } catch { return []; } })()
        : [],
      productsInterval: (settingsMap['dilovod_products_interval'] || 'none sync') as import('../../../shared/types/dilovod.js').DilovodSyncInterval,
      productsHour: settingsMap['dilovod_products_hour'] !== undefined ? Number(settingsMap['dilovod_products_hour']) : 6,
      productsMinute: settingsMap['dilovod_products_minute'] !== undefined ? Number(settingsMap['dilovod_products_minute']) : 0,
      synchronizationInterval: (settingsMap['dilovod_synchronization_interval'] || 'twicedaily') as import('../../../shared/types/dilovod.js').DilovodSyncInterval,
      synchronizationHour: settingsMap['dilovod_synchronization_hour'] !== undefined ? Number(settingsMap['dilovod_synchronization_hour']) : 6,
      synchronizationMinute: settingsMap['dilovod_synchronization_minute'] !== undefined ? Number(settingsMap['dilovod_synchronization_minute']) : 0,
      synchronizationStockQuantity: settingsMap['dilovod_synchronization_stock_quantity'] === 'true',
      ordersInterval: (settingsMap['dilovod_orders_interval'] || 'hourly') as import('../../../shared/types/dilovod.js').DilovodSyncInterval,
      ordersHour: settingsMap['dilovod_orders_hour'] !== undefined ? Number(settingsMap['dilovod_orders_hour']) : 5,
      ordersMinute: settingsMap['dilovod_orders_minute'] !== undefined ? Number(settingsMap['dilovod_orders_minute']) : 5,
      ordersBatchSize: settingsMap['dilovod_orders_batch_size'] !== undefined ? Number(settingsMap['dilovod_orders_batch_size']) : 50,
      ordersRetryAttempts: settingsMap['dilovod_orders_retry_attempts'] !== undefined ? Number(settingsMap['dilovod_orders_retry_attempts']) : 3,
      defaultFirmId: settingsMap['dilovod_default_firm_id'] || undefined,
    };
  } finally {
    await prisma.$disconnect();
  }
}

// Отримання назви типу ціни за ID
export function getPriceTypeNameById(priceTypeId: string): string {
  const priceTypeMap: { [key: string]: string } = {
    "1101300000001006": "Акційна",
    "1101300000001003": "Дрібний опт",
    "1101300000001004": "Опт (мережі магазинів)",
    "1101300000001005": "Роздріб (Розетка)",
    "1101300000001002": "Дрібний опт (Славутич)",
    "1101300000001008": "Вако трейд",
    "1101300000001012": "Військові",
    "1101300000001001": "Роздріб (Інтернет-магазин)",
    "1101300000001007": "Звичайна",
    "1101300000001013": "Роздріб(Пром)"
  };
  
  return priceTypeMap[priceTypeId] || "Невідомо";
}

// Форматування дати для Dilovod API
/**
 * Форматує дату для Dilovod API.
 * @param mode 'UTC_now' | 'Kyiv' | 'UTC_lastDay'
 *   - 'UTC_now': поточний час за UTC
 *   - 'Kyiv': поточний час за Europe/Kyiv (за замовчуванням)
 *   - 'UTC_lastDay': сьогодні по UTC, але час "00:00:00"
 */
export function formatDateForDilovod(
  mode: 'UTC_now' | 'UTC_lastDay' | 'Kyiv'
): string {
  const now = new Date();

  if (mode === 'UTC_now') {
    // Формат: YYYY-MM-DD HH:mm:ss за UTC
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  }

  if (mode === 'UTC_lastDay') {
    // Сьогодні по UTC, але час "00:00:00"
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} 00:00:00`;
  }

  // mode === 'Kyiv' за замовчуванням
  return now.toLocaleString('sv-SE', {
    // Формат: YYYY-MM-DD HH:mm:ss за часовим поясом Europe/Kyiv
    timeZone: 'Europe/Kyiv',
    hour12: false
  }).replace('T', ' ');
}

// Валідація конфігурації Dilovod
export function validateDilovodConfig(config: DilovodConfig): string[] {
  const errors: string[] = [];
  
  if (!config.apiUrl) {
    errors.push('DILOVOD_API_URL не налаштовано');
  }
  
  if (!config.apiKey) {
    errors.push('DILOVOD_API_KEY не налаштовано');
  }
  
  if (!config.setParentIds || config.setParentIds.length === 0) {
    errors.push('ID групи комплектів не налаштовано');
  }
  
  if (!config.mainPriceType) {
    errors.push('Основний тип ціни не налаштовано');
  }
  
  return errors;
}

// Створення базового запиту до API
export function createBaseApiRequest(action: string, params: any): any {
  return {
    version: "0.25",
    key: process.env.DILOVOD_API_KEY,
    action,
    params
  };
}

// Створення запиту для отримання товарів
export function createGoodsRequest(skuList: string[]) {
  return createBaseApiRequest("request", {
    from: {
      type: "sliceLast",
      register: "goodsPrices",
      date: formatDateForDilovod('Kyiv'),
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
  });
}

// Створення запиту для отримання об'єкта (комплекта)
export function createGetObjectRequest(id: string) {
  return createBaseApiRequest("getObject", { id });
}

// Створення запиту для отримання товарів з каталогу
export function createCatalogGoodsRequest(skuList: string[]) {
  return createBaseApiRequest("request", {
    from: "catalogs.goods",
    fields: {
      id: "id",
      productNum: "sku",
      parent: "parent",
      presentation: "name"
    },
    filters: [
      {
        alias: "sku",
        operator: "IL",
        value: skuList
      }
    ]
  });
}

// Обробка помилок API
export function handleDilovodApiError(error: any, context: string): string {
  if (error.response) {
    // Помилка від сервера
    const status = error.response.status;
    const data = error.response.data;
    
    if (status === 401) {
      return `Помилка авторизації в Dilovod API: ${data?.error || 'Невірний API ключ'}`;
    } else if (status === 403) {
      return `Доступ заборонено в Dilovod API: ${data?.error || 'Недостатньо прав'}`;
    } else if (status === 404) {
      return `Ресурс не знайдено в Dilovod API: ${data?.error || 'API endpoint не існує'}`;
    } else if (status >= 500) {
      return `Помилка сервера Dilovod: ${data?.error || 'Внутрішня помилка сервера'}`;
    } else {
      return `Помилка Dilovod API (${status}): ${data?.error || 'Невідома помилка'}`;
    }
  } else if (error.request) {
    // Помилка мережі
    return `Помилка мережі при зверненні до Dilovod API: ${error.message || 'Немає відповіді від сервера'}`;
  } else {
    // Інша помилка
    return `Помилка при роботі з Dilovod API: ${error.message || 'Невідома помилка'}`;
  }
}


// Затримка для уникнення перевантаження API
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Безпечне отримання значення з об'єкта
export function safeGet<T>(obj: any, path: string, defaultValue: T): T {
  try {
    const keys = path.split('.');
    let result = obj;
    
    for (const key of keys) {
      if (result && typeof result === 'object' && key in result) {
        result = result[key];
      } else {
        return defaultValue;
      }
    }
    
    return result !== undefined ? result : defaultValue;
  } catch {
    return defaultValue;
  }
}
