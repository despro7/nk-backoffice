// Утилиты и хелперы для работы с Dilovod

import { DilovodConfig } from './DilovodTypes.js';

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
  setParentId: "1100300000001315",
  mainPriceType: "1101300000001001",
  categoriesMap: {
    "Перші страви": 16,
    "Другі страви": 21,
    "Готові набори": 19,
    "Салати": 20,
    "Напої": 33,
    "М'ясні страви": 34,
    "Основи для салатів": 35
  }
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
      setParentId: dilovodSettings.setParentId || DEFAULT_DILOVOD_CONFIG.setParentId,
      mainPriceType: dilovodSettings.mainPriceType || DEFAULT_DILOVOD_CONFIG.mainPriceType,
      categoriesMap: dilovodSettings.categoriesMap || DEFAULT_DILOVOD_CONFIG.categoriesMap
    };
    
    // Кешуємо конфігурацію
    configCache = { config, timestamp: now };
    
    logWithTimestamp(`Dilovod конфігурація: API Key з ${dilovodSettings.apiKey ? 'БД' : 'ENV'}: ${config.apiKey?.substring(0, 10)}...`);
    return config;
  } catch (error) {
    // У разі помилки повертаємо конфігурацію за замовчуванням
    console.warn('Помилка завантаження налаштувань Dilovod з БД, використовуємо значення за замовчуванням:', error);
    return DEFAULT_DILOVOD_CONFIG;
  }
}

// Завантаження налаштувань Dilovod з settings_base таблиці
async function loadDilovodSettingsFromDB() {
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
      setParentId: settingsMap['dilovod_set_parent_id'] || '',
      mainPriceType: settingsMap['dilovod_main_price_type'] || '',
      categoriesMap: settingsMap['dilovod_categories_map'] ? JSON.parse(settingsMap['dilovod_categories_map']) : {}
    };
  } finally {
    await prisma.$disconnect();
  }
}

// Получение названия типа цены по ID
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

// Форматирование даты для Dilovod API
/**
 * Форматирует дату для Dilovod API.
 * @param mode 'UTC_now' | 'Kyiv' | 'UTC_lastDay'
 *   - 'UTC_now': текущее время по UTC
 *   - 'Kyiv': текущее время по Europe/Kyiv (по умолчанию)
 *   - 'UTC_lastDay': сегодня по UTC, но время "00:00:00"
 */
export function formatDateForDilovod(
  mode: 'UTC_now' | 'Kyiv' | 'UTC_lastDay' = 'Kyiv'
): string {
  const now = new Date();

  if (mode === 'UTC_now') {
    // Формат: YYYY-MM-DD HH:mm:ss по UTC
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
  }

  if (mode === 'UTC_lastDay') {
    // Сегодня по UTC, но время "00:00:00"
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} 00:00:00`;
  }

  return now.toLocaleString('sv-SE', {
    timeZone: 'Europe/Kyiv',
    hour12: false
  }).replace('T', ' ');
}

// Валидация конфигурации
export function validateDilovodConfig(config: DilovodConfig): string[] {
  const errors: string[] = [];
  
  if (!config.apiUrl) {
    errors.push('DILOVOD_API_URL не настроен');
  }
  
  if (!config.apiKey) {
    errors.push('DILOVOD_API_KEY не настроен');
  }
  
  if (!config.setParentId) {
    errors.push('ID группы комплектов не настроен');
  }
  
  if (!config.mainPriceType) {
    errors.push('Основной тип цены не настроен');
  }
  
  return errors;
}

// Создание базового запроса к API
export function createBaseApiRequest(action: string, params: any): any {
  return {
    version: "0.25",
    key: process.env.DILOVOD_API_KEY,
    action,
    params
  };
}

// Создание запроса для получения товаров
export function createGoodsRequest(skuList: string[]) {
  return createBaseApiRequest("request", {
    from: {
      type: "sliceLast",
      register: "goodsPrices",
      date: formatDateForDilovod(),
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

// Создание запроса для получения объекта (комплекта)
export function createGetObjectRequest(id: string) {
  return createBaseApiRequest("getObject", { id });
}

// Создание запроса для получения товаров из каталога
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

// Обработка ошибок API
export function handleDilovodApiError(error: any, context: string): string {
  if (error.response) {
    // Ошибка от сервера
    const status = error.response.status;
    const data = error.response.data;
    
    if (status === 401) {
      return `Ошибка авторизации в Dilovod API: ${data?.error || 'Неверный API ключ'}`;
    } else if (status === 403) {
      return `Доступ запрещен в Dilovod API: ${data?.error || 'Недостаточно прав'}`;
    } else if (status === 404) {
      return `Ресурс не найден в Dilovod API: ${data?.error || 'API endpoint не существует'}`;
    } else if (status >= 500) {
      return `Ошибка сервера Dilovod: ${data?.error || 'Внутренняя ошибка сервера'}`;
    } else {
      return `Ошибка Dilovod API (${status}): ${data?.error || 'Неизвестная ошибка'}`;
    }
  } else if (error.request) {
    // Ошибка сети
    return `Ошибка сети при обращении к Dilovod API: ${error.message || 'Нет ответа от сервера'}`;
  } else {
    // Другая ошибка
    return `Ошибка при работе с Dilovod API: ${error.message || 'Неизвестная ошибка'}`;
  }
}

// Логирование с временными метками и опцией gap
export function logWithTimestamp(message: string, data?: any, gap?: boolean): void {
  if (gap) {
    console.log('\n\n\n------------------------\n\n\n');
  }
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  
  if (data) {
    console.log(logMessage, data);
  } else {
    console.log(logMessage);
  }
  // if (gap) {
  //   console.log('\n\n');
  // }
}

// Задержка для избежания перегрузки API
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Безопасное извлечение значения из объекта
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
