/**
 * Утиліти для форматування дат, часу та інших даних.
 *
 * Основні експорти:
 * - formatRelativeDate — відносне форматування дати з опціями
 * - formatDate — дата й час у короткому форматі (uk-UA, Europe/Kyiv)
 * - formatDateTime — дата й час (uk-UA)
 * - formatDateTimeUS — дата й час у форматі YYYY-MM-DD HH:mm:ss
 * - formatDateOnly — лише дата
 * - formatTimeOnly — лише час (опційно секунди)
 * - formatDateLong — дата з назвою місяця
 * - formatWeekdayOnly — назва дня тижня
 * - formatPrice — сума в UAH
 * - formatMoney — грошова сума без символу валюти
 * - formatNumber — число з роздільниками тисяч
 * - formatPercentage — відсоткове значення
 * - formatFileSize — розмір файлу (Б, КБ, …)
 * - formatPhone, isValidPhone — відображення та валідація UA-телефону
 * - formatUkrainianPhone, parseUkrainianPhone — реекспорт з @shared/utils/phoneFormat
 * - pluralize — відмінювання українських слів за числом
 * - truncateText — обрізання довгого тексту
 * - getStatusColor, getStatusTextColor — Tailwind-класи статусу замовлення
 * - ORDER_STATUSES, getStatusLabel — довідник і підпис статусу
 * - formatDuration, normalizeSyncHistoryDurationSeconds, formatSyncHistoryDuration — тривалість
 * - formatTrackingNumber — форматування ТТН
 * - getChannelClass — кольори каналу SalesDrive
 * - getCategoryColors — кольори категорії товару
 */


/**
 * Застарілий варіант formatRelativeDate (закоментовано; використовуйте export formatRelativeDate нижче).
 */
// export const formatRelativeDate = (dateString: string | null): string => {
//   if (!dateString) return 'Немає даних';
  
//   const date = new Date(dateString);
//   const now = new Date();
//   const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  
//   // Щойно
//   if (diffInMinutes < 1) return 'Щойно';
  
//   // Хвилини тому
//   if (diffInMinutes < 60) return `${diffInMinutes} хв тому`;
  
//   // Години тому
//   if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} год тому`;
  
//   // Дні тому
//   const diffInDays = Math.floor(diffInMinutes / 1440);
  
//   // Вчора
//   if (diffInDays === 1) {
//     return `Вчора о ${date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`;
//   }
    
//   // Понад добу тому — повна дата
//   return date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
// };

/**
 * Розширене форматування відносної дати з настроюваними параметрами
 * @param dateString - рядок із датою або null
 * @param options - параметри форматування
 * @param options.showTime - чи показувати час (за замовчуванням true)
 * @param options.showYear - чи показувати рік у даті (за замовчуванням true)
 * @param options.maxRelativeDays - максимальна кількість днів для відносного формату (за замовчуванням 7)
 * @param options.maxRelativeHours - максимальна кількість годин для відносного формату (за замовчуванням 7)
 * @param options.includeWeekdays - чи включати назву дня тижня для дат в межах maxRelativeDays (за замовчуванням false)
 * @param options.include2DaysAgo - чи включати "Позавчора" для дат, що на 2 дні старші за сьогодні (за замовчуванням false)
 * @param options.weekdayOnly - якщо true, для дат у межах maxRelativeDays повертається лише день тижня (за замовчуванням false)
 * @param options.shortWeekday - якщо true, повертається коротка назва дня тижня (за замовчуванням false)
 * @returns відформатований рядок
 * 
 * @example // Якщо зараз 15.01.2025, 10:35, то:
 * formatRelativeDate('2024-01-15T10:30:00Z') // "5 хв тому"
 * formatRelativeDate('2024-01-14T15:20:00Z') // "Вчора о 15:20"
 * formatRelativeDate('2024-01-12T15:20:00Z') // "3 дні тому, о 15:20"
 */

const SHORT_WEEKDAYS = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const FULL_WEEKDAYS = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П\'ятниця', 'Субота'];

export const formatRelativeDate = (
  dateString: string | null | Date, 
  options: {
    showTime?: boolean;
    showYear?: boolean;
    maxRelativeDays?: number;
    maxRelativeHours?: number;
    includeWeekdays?: boolean;
    include2DaysAgo?: boolean;
    weekdayOnly?: boolean;
    shortWeekday?: boolean;
  } = {}
): string => {
  if (!dateString) return 'Немає даних';

  const {
    showTime = true,
    showYear = true,
    maxRelativeDays = 7,
    maxRelativeHours = 7,
    includeWeekdays = false,
    include2DaysAgo = false,
    weekdayOnly = false,
    shortWeekday = false
  } = options;

  const date = new Date(dateString);
  const now = new Date();

  // "Щойно", "хв тому", "год тому"
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  if (!weekdayOnly) {
    if (diffInMinutes < 1) return 'Тільки що';
    if (diffInMinutes < 60) return `${diffInMinutes} хв тому`;
    if (diffInMinutes < 1440 && diffInMinutes < maxRelativeHours * 60) return `${Math.floor(diffInMinutes / 60)} год тому`;
  }

  // Порівнюємо лише календарні дати (без часу) для «Вчора» та «Позавчора»
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffInDays = Math.round((nowDate.getTime() - dateOnly.getTime()) / (1000 * 60 * 60 * 24));
  
  // День тижня (shortWeekday — коротка назва)
  const dayName = shortWeekday ? SHORT_WEEKDAYS[date.getDay()] : FULL_WEEKDAYS[date.getDay()];

  // Форматуємо час
  const hour = date.getHours();
  const preposition = hour === 11 ? 'об' : 'о';
  const timeStr = showTime ? ` ${preposition} ${date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}` : '';
  
  // Дата (showYear — рік, showTime — час)
  const dateStr = date.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: showYear ? 'numeric' : undefined,
    // ...(showTime && { hour: '2-digit', minute: '2-digit' })
  });
  
  // Відмінювання «день / дні / днів»
  const lastDigit = diffInDays % 10;
  const lastTwoDigits = diffInDays % 100;
  let dayWord = "днів";
  if (lastDigit === 1 && lastTwoDigits !== 11) {
    dayWord = "день";
  } else if ([2, 3, 4].includes(lastDigit) && ![12, 13, 14].includes(lastTwoDigits)) {
    dayWord = "дні";
  }

  // weekdayOnly — лише назва дня тижня
  if (weekdayOnly) {
    return dayName;
  }

  // diffInDays === 0 → «Сьогодні»
  if (diffInDays === 0) return `Сьогодні${timeStr}`;
  
  // diffInDays 1 або 2 → «Вчора» / «Позавчора» (час — за showTime)
  if (diffInDays === 1) return `Вчора${timeStr}`;
  if (diffInDays === 2 && include2DaysAgo) return `Позавчора${timeStr}`;

  // Інакше — дата за правилами maxRelativeDays / includeWeekdays
  if (diffInDays > maxRelativeDays) {
    return `${dateStr}${timeStr}`;
  } else if (includeWeekdays) {
    return `${dayName}, ${dateStr}${timeStr}`;
  } else {
    return `${diffInDays} ${dayWord} тому,${timeStr}`;
  }

};

/**
 * Форматує дату в стандартному українському форматі (дата + час).
 * @param dateString - рядок із датою
 * @returns відформатований рядок
 * 
 * @example
 * formatDate('2024-01-15T10:30:00Z') // "15.01.2024, 10:30"
 * formatDate(null) // "-"
 */
export const formatDate = (dateString: string): string => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

/**
 * Форматує дату й час українською локаллю (Europe/Kyiv).
 * @param dateString - рядок із датою або Date
 * @returns відформатований рядок
 * 
 * @example
 * formatDateTime('2024-01-15T10:30:00Z') // "15.01.2024, 10:30:46"
 * formatDateTime(null) // "-"
 */
export const formatDateTime = (dateString: string | Date): string => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
};

/**
 * Форматує дату й час у форматі YYYY-MM-DD HH:mm:ss (локальний час без таймзони).
 * @param dateString - рядок із датою або Date
 * @returns відформатований рядок
 * 
 * @example
 * formatDateTimeUS('2024-01-15T10:30:00Z') // "2025-09-24 10:30:12"
 * formatDateTimeUS(null) // ""
 */
export const formatDateTimeUS = (dateString: string | Date): string => {
  if (!dateString) return "";
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * Форматує лише дату українською локаллю (Europe/Kyiv).
 * @param dateString - рядок із датою
 * @returns відформатований рядок
 * 
 * @example
 * formatDateOnly('2024-01-15T10:30:00Z') // "15.01.2024"
 * formatDateOnly(null) // "-"
 */
export const formatDateOnly = (dateString: string): string => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv' });
};

/**
 * Форматує лише час українською локаллю (Europe/Kyiv).
 * @param dateString - рядок із датою
 * @param showSeconds - показувати секунди (за замовчуванням false)
 * @returns відформатований рядок
 *
 * @example
 * formatTimeOnly('2024-01-15T10:30:00Z') // "10:30"
 * formatTimeOnly('2024-01-15T10:30:45Z', true) // "10:30:45"
 */
export const formatTimeOnly = (dateString: string, showSeconds = false): string => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleTimeString("uk-UA", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    minute: "2-digit",
    ...(showSeconds ? { second: "2-digit" } : {}),
  });
};

/**
 * Форматує дату з назвою місяця українською мовою
 * @param dateString - рядок із датою або Date
 * @returns відформатований рядок
 *
 * @example
 * formatDateLong('2026-06-25T10:30:00Z') // "25 червня 2026"
 */
export const formatDateLong = (dateString: string | Date): string => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

/**
 * Форматує назву дня тижня українською мовою
 * @param dateString - рядок із датою або Date
 * @returns відформатований рядок
 *
 * @example
 * formatWeekdayOnly('2026-06-25T10:30:00Z') // "четвер"
 */
export const formatWeekdayOnly = (dateString: string | Date): string => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString('uk-UA', {
    weekday: 'long',
  });
};

/**
 * Форматує ціну в українській валюті (UAH).
 * @param price - сума числом
 * @returns відформатований рядок
 * 
 * @example
 * formatPrice(1000) // "1 000 грн"
 * formatPrice(1000.5) // "1 000.50 грн"
 * formatPrice(1000000) // "1 000 000 грн"
 */
export const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH'
  }).format(price);
};

/**
 * Форматує грошову суму для HR-модулів (без символу валюти).
 *
 * @example
 * formatMoney('1234.5') // "1 234,50"
 * formatMoney(1000) // "1 000,00"
 */
export function formatMoney(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Форматує число з роздільниками тисяч (uk-UA).
 * @param number - число
 * @returns відформатований рядок
 * 
 * @example
 * formatNumber(1000) // "1 000"
 * formatNumber(1000.5) // "1 000.50"
 * formatNumber(1000000) // "1 000 000"
 */
export const formatNumber = (number: number): string => {
  return new Intl.NumberFormat('uk-UA').format(number);
};

/**
 * Форматує відсоткове значення (доля 0–1 → «%»).
 * @param value - значення від 0 до 1
 * @param decimals - кількість знаків після коми
 * @returns відформатований рядок
 * 
 * @example
 * formatPercentage(0.5) // "50.0%"
 * formatPercentage(0.5, 2) // "50.00%"
 */
export const formatPercentage = (value: number, decimals: number = 1): string => {
  return `${(value * 100).toFixed(decimals)}%`;
};

/**
 * Форматує розмір файлу в читабельному вигляді.
 * @param bytes - розмір у байтах
 * @returns відформатований рядок
 * 
 * @example
 * formatFileSize(100) // "100 Б"
 * formatFileSize(1000) // "1 КБ"
 * formatFileSize(1000000) // "1 МБ"
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Б';
  
  const k = 1024;
  const sizes = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export {
  formatUkrainianPhone,
  parseUkrainianPhone,
  type FormatUkrainianPhoneOptions,
  type ParsedUkrainianPhone,
  type PhoneDisplayStyle,
} from '@shared/utils/phoneFormat';

import {
  formatUkrainianPhone,
  parseUkrainianPhone,
  type FormatUkrainianPhoneOptions,
  type PhoneDisplayStyle,
} from '@shared/utils/phoneFormat';

/**
 * Форматує український номер телефону для відображення.
 *
 * @example
 * formatPhone('380671234567', 'international') // "+38 (067) 123-45-67"
 * formatPhone('0671234567', 'national') // "(067) 123-45-67"
 * formatPhone('0671234567') // "067 123 45 67"
 * formatPhone(null) // "—"
 */
export const formatPhone = (
  phone: string | null | undefined,
  options?: PhoneDisplayStyle | FormatUkrainianPhoneOptions,
): string => formatUkrainianPhone(phone, options);

/** Перевіряє, чи номер у БД має валідний український формат. */
export const isValidPhone = (phone: string | null | undefined): boolean =>
  parseUkrainianPhone(phone).isValid;

/**
 * Функція для правильного відмінювання українських слів
  * @param count - кількість
  * @param one - форма для 1 (наприклад, "порція")
  * @param few - форма для 2, 3, 4 (наприклад, "порції")
  * @param many - форма для інших чисел (наприклад, "порцій")
  * 
  * @example
  * pluralize(1, 'порція', 'порції', 'порцій') // "порція"
  * pluralize(2, 'порція', 'порції', 'порцій') // "порції"
  * pluralize(5, 'порція', 'порції', 'порцій') // "порцій"
 */
export const pluralize = (count: number, one: string, few: string, many: string): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  
  if (mod10 === 1 && mod100 !== 11) {
    return one;
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return few;
  } else {
    return many;
  }
};


/**
 * Обрізає текст до вказаної довжини і додає "..." в кінці, якщо текст перевищує довжину
 * @param text - текст для обрізання
 * @param length - максимальна довжина тексту
 * @returns обрізаний текст або null, якщо текст відсутній
 */
export const truncateText = (text: any, length: number): import("react").ReactNode => {
  if (!text) return null;
  if (text.length <= length) return text;
  return `${text.substring(0, length)}...`;
}


/**
 * Повертає Tailwind CSS-класи фону та тексту для статусу замовлення.
 * @param status - ключ статусу
 * @returns рядок класів
 */
export const getStatusColor = (status: string): string => {
  switch (status) {
    case "1": // Новий
      return "text-neutral-600 bg-neutral-100";
    case "2": // Підтверджено
      return "text-yellow-950 bg-yellow-200";
    case "3": // На відправку
      return "text-orange-500 bg-orange-100";
    case "4": // Відправлено
      return "text-sky-800/80 bg-blue-100";
    case "5": // Продаж
      return "text-green-600 bg-green-100";
    case "6": // Відмова
      return "text-red-600 bg-red-100";
    case "7": // Повернення
      return "text-red-100 bg-red-700";
    case "8": // Видалений
      return "text-gray-600 bg-gray-100";
    case "9": // На утриманні
      return "text-gray-800 bg-[#e8d189]";
    default:
      return "text-gray-600 bg-gray-100";
  }
};

/** Лише text-клас кольору статусу (для inline-значень без фону). */
export const getStatusTextColor = (status: string): string =>
  getStatusColor(status).split(" ").find((c) => c.startsWith("text-")) ?? "text-gray-600";

export const ORDER_STATUSES = [
  { key: "all", label: "Усі статуси" },
  { key: "1", label: "Нове замовлення" },
  { key: "2", label: "Підтверджено" },
  { key: "3", label: "На відправку" },
  { key: "4", label: "Відправлено" },
  { key: "5", label: "Продаж" },
  { key: "6", label: "Відмова" },
  { key: "7", label: "Повернення" },
  { key: "8", label: "Видалений" },
  { key: "9", label: "На утриманні" },
];

/**
 * Повертає текстове найменування статусу замовлення
 * @param statusKey - ключ статусу
 * @returns рядок з назвою статусу
 */
export const getStatusLabel = (statusKey: string | null | undefined): string => {
  if (!statusKey) return "Невідомо";
  const status = ORDER_STATUSES.find((s) => s.key === statusKey);
  return status ? status.label : statusKey;
};


/**
 * Форматує тривалість у читабельний формат
 * @param duration - тривалість (в мілісекундах або секундах, залежно від options.unit)
 * @param options - { unit: "s" | "ms" } (за замовчуванням "ms")
 * @returns відформатований рядок, наприклад "1год 2хв 3с"
 * 
 * @example
 * formatDuration(77653, { unit: "ms" }) // "1хв 17с"
 * formatDuration(78, { unit: "s" }) // "1хв 18с"
 * formatDuration(3661, { unit: "s" }) // "1год 1с"
 */
export const formatDuration = (
  duration: number,
  options: { unit?: "s" | "ms" } = { unit: "ms" }
): string => {
  const unit = options.unit || "ms";
  if (typeof duration !== "number" || duration <= 0) return "0с";

  // Переводимо в мілісекунди для розрахунку
  const ms = unit === "s" ? duration * 1000 : duration;

  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((ms % (1000 * 60)) / 1000);

  let result = '';
  if (hours > 0) result += `${hours}год `;
  if (minutes > 0) result += `${minutes}хв `;
  if (secs > 0 || result === '') result += `${secs}с`;

  return result.trim();
};

/**
 * Нормалізує duration історії синхронізацій до секунд.
 * Manual sync зберігав секунди, automatic — мілісекунди (legacy).
 */
export const normalizeSyncHistoryDurationSeconds = (duration: number): number => {
  if (typeof duration !== "number" || duration <= 0) return 0;
  if (duration > 3600) return duration / 1000;
  return duration;
};

/** Форматує тривалість запису історії синхронізацій (завжди в секундах) */
export const formatSyncHistoryDuration = (duration: number): string =>
  formatDuration(normalizeSyncHistoryDurationSeconds(duration), { unit: "s" });

/**
 * Форматує номер відстеження (ТТН) у зручний для читання формат
 * @param trackingId - номер відстеження
 * @param provider - провайдер доставки ('novaposhta' або 'ukrposhta')
 * @returns відформатований рядок
 * 
 * @example
 * formatTrackingNumber('20451232665506', 'novaposhta') // "20 4512 3266 5506"
 * formatTrackingNumber('0503769495578', 'ukrposhta') // "05037 6949 5578"
 */
export const formatTrackingNumber = (trackingId: string, provider: string): string => {
  if (!trackingId || trackingId === 'Не вказано') {
    return 'ТТН не вказано';
  }

  // Видаляємо всі пробіли та приводимо до рядка
  const cleanId = trackingId.toString().replace(/\s/g, '');
  
  if (provider === 'novaposhta') {
    // Формат Нової Пошти: 20 4512 3266 5506
    if (cleanId.length === 14) {
      const part1 = cleanId.slice(0, 2);
      const part2 = cleanId.slice(2, 6);
      const part3 = cleanId.slice(6, 10);
      const part4 = cleanId.slice(10, 14);
      
      return `${part1} ${part2} ${part3} ${part4}`;
    }
  } else if (provider === 'ukrposhta') {
    // Формат Укрпошти: 05037 6949 5578
    if (cleanId.length === 13) {
      const part1 = cleanId.slice(0, 5);
      const part2 = cleanId.slice(5, 9);
      const part3 = cleanId.slice(9, 13);
      
      return `${part1} ${part2} ${part3}`;
    }
  }
  
  // Якщо формат не розпізнаний, повертаємо як є
  return trackingId;
};

/**
 * Повертає CSS-класи для кольорового відображення каналу продажів SalesDrive.
 * Використовується для чіпів і кружечків у фільтрах/таблицях.
 * @param channelId - ID каналу з SalesDrive (рядок) або null/undefined
 * @returns рядок з Tailwind CSS класами
 */
export const getChannelClass = (channelId: string | null | undefined): string => {
  if (!channelId) {
    return 'bg-red-500 text-white border-red-500 font-semibold';
  }

  switch (channelId) {
    case '22': // Rozetka (Сергій)
      return 'bg-green-100 text-green-800 border-green-200';
    case '39': // Rozetka (Марія)
    case '48': // Rozetka (Сергій)
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case '28': // prom (актуальний)
    case '24': // prom (old)
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case '31': // інше (менеджер)
      return 'bg-red-100 text-red-800 border-red-200';
    case '38': // дрібні магазини
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case '19': // nk-food.shop
      return 'bg-gray-700 text-gray-100 border-gray-200';
    case 'unknown': // Невідомий канал
      return 'bg-red-500 text-white border-red-500 font-semibold';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
};

/**
 * Повертає Tailwind CSS класи для кольору фону та тексту на основі categoryId товару.
 * Для деяких категорій задані спеціальні кольори, для решти — детерміновано за модулем.
 * @param categoryId - числовий ID категорії
 * @returns об'єкт { bg, text } з Tailwind класами
 *
 * @example
 * getCategoryColors(16) // { bg: 'bg-warning-100', text: 'text-warning-700' }
 * getCategoryColors(99) // { bg: 'bg-blue-100', text: 'text-blue-700' }
 */
export const getCategoryColors = (categoryId: number): { bg: string; text: string } => {
  // Спеціальні кольори для певних категорій
  const specialColors: Record<number, { bg: string; text: string }> = {
    16: { bg: 'bg-warning-100', text: 'text-warning-700' }, // Перші страви
    21: { bg: 'bg-success-100', text: 'text-success-700' }, // Другі страви
    19: { bg: 'bg-purple-100', text: 'text-purple-700' },   // Готові набори
    14: { bg: 'bg-sky-100', text: 'text-sky-700' },         // Інгрідієнти для салатів
    20: { bg: 'bg-teal-100', text: 'text-teal-700' },       // Салати
    33: { bg: 'bg-rose-100', text: 'text-rose-700' },       // Напої
  };

  if (specialColors[categoryId]) {
    return specialColors[categoryId];
  }

  // Генерація кольору на основі categoryId для інших категорій
  const colors = [
    { bg: 'bg-blue-100', text: 'text-blue-700' },
    { bg: 'bg-red-100', text: 'text-red-700' },
    { bg: 'bg-indigo-100', text: 'text-indigo-700' },
    { bg: 'bg-pink-100', text: 'text-pink-700' },
    { bg: 'bg-cyan-100', text: 'text-cyan-700' },
    { bg: 'bg-teal-100', text: 'text-teal-700' },
    { bg: 'bg-orange-100', text: 'text-orange-700' },
    { bg: 'bg-lime-100', text: 'text-lime-700' },
    { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    { bg: 'bg-violet-100', text: 'text-violet-700' },
    { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700' },
    { bg: 'bg-rose-100', text: 'text-rose-700' },
    { bg: 'bg-sky-100', text: 'text-sky-700' },
    { bg: 'bg-amber-100', text: 'text-amber-700' },
    { bg: 'bg-stone-100', text: 'text-stone-700' },
  ];

  // Використовуємо categoryId для вибору кольору (детерміновано)
  const colorIndex = Math.abs(categoryId) % colors.length;
  return colors[colorIndex];
};
