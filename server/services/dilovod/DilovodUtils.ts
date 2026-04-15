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
 * @param result - сира відповідь від `exportToDilovod` / `makeRequest`
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
 * Видаляє HTML-теги та переформатує помилку Dilovod для коротких повідомлень.
 * Витягує: назву товару, артикул, партію, потрібно, вільний залишок, недостатньо.
 *
 * @example
 * Input:  "applicationLayerError Документ не збережено. Недостатня кількість.
 *          <span ...>Каша гречана зі курячим м'ясом</span> | Код: 0000000313 | Артикул: 03004 |
 *          Партія: 51203 | Рахунок Готова продукція. Потрібно: 58.000 шт | Вільний залишок: 0 шт | Недостатньо: 58.000 шт."
 * Output: "Недостатня кількість:
 *          - Каша гречана зі курячим м'ясом | арт: 03004 | партія: 51203 | потрібно: 58 шт | залишок: 0 шт | бракує: 58 шт"
 */
export function cleanDilovodErrorMessageShort(errorStr: string): string {
  if (!errorStr) return '';

  // emptyRequiredReq — окремий тип, делегуємо parseEmptyRequiredReqError
  if (errorStr.toLowerCase().includes('emptyrequiredreq')) {
    const fields = parseEmptyRequiredReqError(errorStr);
    return fields
      ? `Відсутні обов'язкові поля:\n${fields.map(f => `- ${f}`).join('\n')}`
      : `Відсутні обов'язкові поля у запиті до Діловода`;
  }

  // Видалення основного префіксу помилки (applicationLayerError тощо)
  let cleaned = errorStr
    .replace(/^applicationLayerError\s*/i, '')
    .replace(/^multithreadApiSession\s*/i, '')
    .trim();

  // Витяг основної помилки (напр. "Недостатня кількість") — перший рядок після "Документ не збережено."
  const mainError = cleaned.match(/(?:Документ не збережено\.\s+)?([^.<]+)/)?.[1]?.trim() || 'Помилка';

  /**
   * Витягуємо по одному блоку: <span>НАЗВА</span> ... аж до наступного <span> або кінця рядка.
   * Кожен блок містить: Код, Артикул, Партія, Потрібно, Вільний залишок, Недостатньо.
   */
  const blockRegex = /<span[^>]*>([^<]+)<\/span>([\s\S]*?)(?=<span|$)/g;
  const items: string[] = [];
  let match;

  while ((match = blockRegex.exec(cleaned)) !== null) {
    const productName = match[1].trim();
    const block = match[2];

    const sku      = block.match(/Артикул:\s*(\S+)/)?.[1]?.replace(/\s*\|.*$/, '').trim() ?? '';
    const batch    = block.match(/Партія:\s*(\S+)/)?.[1]?.replace(/\s*\|.*$/, '').trim() ?? '';
    const needed   = block.match(/Потрібно:\s*([\d.,]+\s*шт)/)?.[1]?.trim() ?? '';
    const free     = block.match(/Вільний залишок:\s*([\d.,]+\s*шт)/)?.[1]?.trim() ?? '';
    const shortage = block.match(/Недостатньо:\s*([\d.,]+\s*шт)/)?.[1]?.trim() ?? '';

    const parts: string[] = [productName];
    if (sku)      parts.push(`арт: ${sku}`);
    if (batch)    parts.push(`партія: ${batch}`);
    if (needed)   parts.push(`потрібно: ${needed}`);
    if (free)     parts.push(`залишок: ${free}`);
    if (shortage) parts.push(`бракує: ${shortage}`);

    items.push(`- ${parts.join(' | ')}`);
  }

  if (items.length > 0) {
    return `${mainError}:\n${items.join('\n')}`;
  }

  // Fallback: прибираємо HTML і повертаємо як є
  return cleaned.replace(/<[^>]+>/g, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Видаляє HTML-теги та переформатує помилку Dilovod для повних логів.
 * Повертає детальну інформацію про кожен товар (код, артикул, рахунок, залишки).
 *
 * @example
 * Input: "Недостатня кількість. <span onclick='...'>Квасоля</span> | Код: 123 | ... Недостатньо: 1 шт. <span>Гречка</span> | Код: 456 | ..."
 * Output: "Недостатня кількість.\n- Квасоля | Код: 123 | ... Недостатньо: 1 шт.\n- Гречка | Код: 456 | ... Недостатньо: 2 шт."
 */
export function cleanDilovodErrorMessageFull(errorStr: string): string {
  if (!errorStr) return '';

  // Видалення основного префіксу помилки
  let cleaned = errorStr
    .replace(/^applicationLayerError\s*/i, '')
    .replace(/^multithreadApiSession\s*/i, '')
    .trim();

  // Видалення HTML-тегів (зберігаємо текст всередину)
  cleaned = cleaned.replace(/<span[^>]*>([^<]+)<\/span>/g, '$1');

  // Витяг заголовка (все до першого товару включно з першим |)
  const firstPipeIndex = cleaned.indexOf('|');
  if (firstPipeIndex === -1) {
    // Немає | — нема товарів, повернути як є
    return cleaned;
  }

  const header = cleaned.substring(0, firstPipeIndex).trim();
  const content = cleaned.substring(firstPipeIndex + 1).trim();

  // Розділення товарів за паттерном: " шт. " + (велика буква)
  // Кожен товар закінчується на "шт." або "шт. "
  // На початок наступного товару вказує: "шт." + " " + велика буква українського алфавіту
  const items: string[] = [];

  // Замінимо паттерн " шт. " + велика буква на спеціальний розділювач
  const separator = '|||ITEM_SEPARATOR|||';
  let processed = content.replace(/(\d+\s+шт\.)\s+(?=[А-Яа-я])/g, `$1${separator}`);

  // Розділимо по розділювачу
  const parts = processed.split(separator);

  // Перший товар не має розділювача на початку
  if (parts.length > 0 && parts[0]) {
    items.push(parts[0].trim());
  }

  // Решта товарів
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].trim()) {
      items.push(parts[i].trim());
    }
  }

  // Формування результату
  if (items.length > 0) {
    return `${header}\n- ${items.join('\n- ')}`;
  }

  // Якщо розділення не спрацювало, повернути простий формат
  return `${header}\n- ${content}`;
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
          const shortMsg = cleanDilovodErrorMessageShort(errStr);
          return shortMsg || `Dilovod: документ не збережено (applicationLayerError)`;
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

/**
 * Таблиця перекладів технічних помилок Dilovod → зрозуміле повідомлення для користувача.
 * Ключі — підрядки, що можуть зустрічатися у полі `error` відповіді Dilovod API.
 */
const DILOVOD_ERROR_TRANSLATIONS: Array<{ pattern: string | RegExp; title: string; message: string }> = [
  { pattern: 'object locked',         title: 'Документ заблоковано',           message: 'Зараз його редагує інший користувач. Зверніться до зав. виробництва, щоб розблокувати документ.' },
  { pattern: 'multithreadApiSession', title: 'Паралельний запит заблоковано',  message: 'Зачекайте кілька секунд і спробуйте ще раз.' },
  { pattern: 'applicationLayerError', title: 'Документ не збережено',          message: 'Помилка даних у Діловоді. Перевірте позиції та спробуйте ще раз.' },
  { pattern: 'access denied',         title: 'Доступ заборонено',              message: 'Перевірте права користувача в Діловоді.' },
  { pattern: 'not found',             title: 'Об\'єкт не знайдено',            message: 'Документ або довідник не існує в Діловоді. Можливо, він був видалений.' },
  { pattern: 'invalid parameter',     title: 'Некоректні дані',                message: 'Помилка параметрів запиту до Діловода. Зверніться до адміністратора.' },
];

/**
 * Відомі поля у помилці `emptyRequiredReq` від Dilovod API
 * та їх зрозумілий опис з підказкою що перевірити.
 *
 * Формат помилки: "emptyRequiredReq ПОЛЕ1 (НАЗВА1)|ПОЛЕ2 (НАЗВА2)"
 */
const EMPTY_REQUIRED_REQ_FIELDS: Record<string, { label: string; hint: string }> = {
  'balanceregisters.goods': {
    label: 'Складські запаси',
    hint: 'перевірте партію та кількість товарів — поле "goodPart" або "qty" порожнє/некоректне',
  },
  'business': {
    label: 'Напрям бізнесу',
    hint: 'не вказано напрям бізнесу (businessId) у налаштуваннях переміщення — окреме поле, не те саме що підприємство (firm)',
  },
  'storage': {
    label: 'Склад',
    hint: 'не вказано склад-донор (storageFrom) у налаштуваннях',
  },
  'storageto': {
    label: 'Склад призначення',
    hint: 'не вказано склад-реципієнт (storageTo) у налаштуваннях',
  },
  'good': {
    label: 'Товар',
    hint: 'у рядку відсутній ID товару в Діловоді (dilovodId)',
  },
  'goodpart': {
    label: 'Партія',
    hint: 'партія товару не вибрана або не існує',
  },
  'unit': {
    label: 'Одиниця виміру',
    hint: 'не вказано одиницю виміру (unit) у налаштуваннях',
  },
  'docmode': {
    label: 'Режим документа',
    hint: 'не вказано режим документа (docMode) у налаштуваннях',
  },
  'firm': {
    label: 'Підприємство',
    hint: 'не вказано підприємство (firm) у налаштуваннях переміщення',
  },
};

/**
 * Парсить помилку типу `emptyRequiredReq` від Dilovod API.
 * Повертає масив зрозумілих рядків з підказками, або null якщо це не цей тип.
 *
 * @example
 * Input:  "emptyRequiredReq balanceRegisters.goods (Складські запаси)|business (Бізнес)"
 * Output: [
 *   "Складські запаси — перевірте партію та кількість товарів",
 *   "Підприємство — не вказано підприємство (firm) у налаштуваннях переміщення",
 * ]
 */
export function parseEmptyRequiredReqError(rawError: string): string[] | null {
  if (!rawError?.toLowerCase().includes('emptyrequiredreq')) return null;

  // Видаляємо префікс "emptyRequiredReq " і парсимо пари "ПОЛЕ (НАЗВА)"
  const body = rawError.replace(/^emptyRequiredReq\s*/i, '').trim();

  // Розбиваємо по "|" — кожен елемент: "ПОЛЕ (НАЗВА)" або просто "ПОЛЕ"
  const parts = body.split('|').map(p => p.trim()).filter(Boolean);
  const results: string[] = [];

  for (const part of parts) {
    // Витягуємо технічну назву поля (до першого пробілу або дужки)
    const fieldMatch = part.match(/^([\w.]+)/);
    const fieldKey = fieldMatch?.[1]?.toLowerCase() ?? '';

    // Витягуємо локалізовану назву з дужок (якщо є)
    const labelMatch = part.match(/\(([^)]+)\)/);
    const dilovodLabel = labelMatch?.[1]?.trim() ?? '';

    const known = EMPTY_REQUIRED_REQ_FIELDS[fieldKey];
    if (known) {
      results.push(`${known.label} — ${known.hint}`);
    } else {
      // Невідоме поле — показуємо що є
      const display = dilovodLabel || fieldKey || part;
      results.push(`${display} — обов'язкове поле відсутнє у запиті`);
    }
  }

  return results.length > 0 ? results : null;
}

export interface DilovodErrorTranslation {
  title: string;
  message: string;
}

/**
 * Перекладає технічне повідомлення помилки від Dilovod API
 * у зрозумілий title + message для Toast-повідомлення.
 * Якщо відповідний переклад не знайдено — повертає оригінальний рядок як message.
 */
export function translateDilovodError(rawError: string): DilovodErrorTranslation {
  if (!rawError) return { title: 'Помилка Діловода', message: 'Невідома помилка від Діловода' };

  // emptyRequiredReq — окремий тип з детальним парсингом
  if (rawError.toLowerCase().includes('emptyrequiredreq')) {
    const fields = parseEmptyRequiredReqError(rawError);
    const message = fields
      ? `Відсутні обов'язкові поля:\n${fields.map(f => `- ${f}`).join('\n')}`
      : 'Відсутні обов\'язкові поля у запиті до Діловода. Перевірте налаштування.';
    return { title: 'Незаповнені обов\'язкові поля', message };
  }

  const lower = rawError.toLowerCase();
  for (const entry of DILOVOD_ERROR_TRANSLATIONS) {
    const matches = typeof entry.pattern === 'string'
      ? lower.includes(entry.pattern.toLowerCase())
      : entry.pattern.test(lower);
    if (matches) return { title: entry.title, message: entry.message };
  }

  return { title: 'Помилка Діловода', message: rawError };
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
