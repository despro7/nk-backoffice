/**
 * Утилиты для форматирования дат, времени и других данных
 * 
 * Основные функции:
 * - formatRelativeDate: базовое относительное форматирование дат
 * - formatRelativeDateExtended: расширенное форматирование с настройками
 * - formatDate: стандартное форматирование даты
 * - formatDateTime: форматирование даты и времени
 * - formatDateOnly: только дата
 * - formatTimeOnly: только время
 * - formatPrice: форматирование цены
 * - formatNumber: форматирование чисел
 * - formatPercentage: форматирование процентов
 * - formatFileSize: форматирование размера файла
 * - formatPhone: форматирование телефона
 * - getStatusColor: возвращает CSS классы для цвета статуса заказа
 * - ORDER_STATUSES: массив статусов заказа
 * - getStatusLabel: возвращает текстовое название статуса заказа
 */


/**
 * Форматирует дату в относительном формате (например, "5 хв тому", "2 год тому", "Вчора в 16:16")
 * @param dateString - строка с датой или null
 * @returns отформатированная строка
 * 
 * @example
 * formatRelativeDate('2024-01-15T10:30:00Z') // "5 хв тому" (если сейчас 10:35)
 * formatRelativeDate('2024-01-14T15:20:00Z') // "Вчора о 15:20"
 * formatRelativeDate('2024-01-10T12:00:00Z') // "10.01.2024, 12:00"
 * formatRelativeDate(null) // "Немає даних"
 */
// export const formatRelativeDate = (dateString: string | null): string => {
//   if (!dateString) return 'Немає даних';
  
//   const date = new Date(dateString);
//   const now = new Date();
//   const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  
//   // Только что
//   if (diffInMinutes < 1) return 'Щойно';
  
//   // Минуты назад
//   if (diffInMinutes < 60) return `${diffInMinutes} хв тому`;
  
//   // Часы назад
//   if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} год тому`;
  
//   // Дни назад
//   const diffInDays = Math.floor(diffInMinutes / 1440);
  
//   // Вчера
//   if (diffInDays === 1) {
//     return `Вчора о ${date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`;
//   }
    
//   // Более суток назад - показываем полную дату
//   return date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
// };

/**
 * Расширенное форматирование относительной даты с настраиваемыми опциями
 * @param dateString - строка с датой или null
 * @param options - опции форматирования
 * @returns отформатированная строка
 * 
 * @example // Если сейчас 15.01.2025, 10:35, то:
 * formatRelativeDateExtended('2024-01-15T10:30:00Z') // "5 хв тому"
 * formatRelativeDateExtended('2024-01-14T15:20:00Z') // "Вчора о 15:20"
 * formatRelativeDateExtended('2024-01-12T15:20:00Z') // "3 дн тому в 15:20"
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
  if (diffInMinutes < 1) return 'Тільки що';
  if (diffInMinutes < 60) return `${diffInMinutes} хв тому`;
  if (diffInMinutes < 1440 && diffInMinutes < maxRelativeHours * 60) return `${Math.floor(diffInMinutes / 60)} год тому`;

  // Сравниваем только даты (без времени) для "Вчора" и "Позавчора"
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffInDays = Math.round((nowDate.getTime() - dateOnly.getTime()) / (1000 * 60 * 60 * 24));
  
  // Дни недели (shortWeekday - короткое название)
  const dayName = shortWeekday ? SHORT_WEEKDAYS[date.getDay()] : FULL_WEEKDAYS[date.getDay()];

  // Форматируем время
  const hour = date.getHours();
  const preposition = hour === 11 ? 'об' : 'о';
  const timeStr = showTime ? ` ${preposition} ${date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}` : '';
  
  // Дата (showYear - показать год, showTime - показать время)
  const dateStr = date.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: showYear ? 'numeric' : undefined,
    // ...(showTime && { hour: '2-digit', minute: '2-digit' })
  });
  
  // Определяем правильное окончание для "день/дні/днів"
  const lastDigit = diffInDays % 10;
  const lastTwoDigits = diffInDays % 100;
  let dayWord = "днів";
  if (lastDigit === 1 && lastTwoDigits !== 11) {
    dayWord = "день";
  } else if ([2, 3, 4].includes(lastDigit) && ![12, 13, 14].includes(lastTwoDigits)) {
    dayWord = "дні";
  }

  // Если разница в днях равна 0, то возвращаем "Сьогодні"
  if (diffInDays === 0) return `Сьогодні${timeStr}`;
  
  // Если разница в днях равна 1 или 2, то возвращаем "Вчора/Позавчора" (showTime? опционально)
  if (diffInDays === 1) return `Вчора${timeStr}`;
  if (diffInDays === 2 && include2DaysAgo) return `Позавчора${timeStr}`;

  // weekdayOnly - только день недели
  if (weekdayOnly) {
    return dayName;
  }

  // В остальных случаях возвращаем дату согласно логике
  if (diffInDays > maxRelativeDays) {
    return `${dateStr}${timeStr}`;
  } else if (includeWeekdays) {
    return `${dayName}, ${dateStr}${timeStr}`;
  } else {
    return `${diffInDays} ${dayWord} тому,${timeStr}`;
  }

};

/**
 * Форматирует дату в стандартном украинском формате
 * @param dateString - строка с датой
 * @returns отформатированная строка
 * 
 * @example
 * formatDate('2024-01-15T10:30:00Z') // "15.01.2024, 10:30"
 * formatDate(null) // "-"
 */
export const formatDate = (dateString: string): string => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return date.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

/**
 * Форматирует дату и время в украинском формате
 * @param dateString - строка с датой
 * @returns отформатированная строка
 * 
 * @example
 * formatDateTime('2024-01-15T10:30:00Z') // "15.01.2024, 10:30:46"
 * formatDateTime(null) // "-"
 */
export const formatDateTime = (dateString: string | Date): string => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString('uk-UA');
};

/**
 * Форматирует дату и время в американском формате
 * @param dateString - строка с датой
 * @returns отформатированная строка
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
 * Форматирует только дату в украинском формате
 * @param dateString - строка с датой
 * @returns отформатированная строка
 * 
 * @example
 * formatDateOnly('2024-01-15T10:30:00Z') // "15.01.2024"
 * formatDateOnly(null) // "-"
 */
export const formatDateOnly = (dateString: string): string => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString('uk-UA');
};

/**
 * Форматирует только время в украинском формате
 * @param dateString - строка с датой
 * @returns отформатированная строка
 * 
 * @example
 * formatTimeOnly('2024-01-15T10:30:00Z') // "10:30"
 */
export const formatTimeOnly = (dateString: string): string => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleTimeString('uk-UA');
};

/**
 * Форматирует цену в украинской валюте
 * @param price - цена в числах
 * @returns отформатированная строка
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
 * Форматирует число с разделителями тысяч
 * @param number - число для форматирования
 * @returns отформатированная строка
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
 * Форматирует процентное значение
 * @param value - значение от 0 до 1
 * @param decimals - количество знаков после запятой
 * @returns отформатированная строка
 * 
 * @example
 * formatPercentage(0.5) // "50.0%"
 * formatPercentage(0.5, 2) // "50.00%"
 */
export const formatPercentage = (value: number, decimals: number = 1): string => {
  return `${(value * 100).toFixed(decimals)}%`;
};

/**
 * Форматирует размер файла в читаемом виде
 * @param bytes - размер в байтах
 * @returns отформатированная строка
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

/**
 * Форматирует телефонный номер в украинском формате
 * @param phone - строка с телефоном
 * @returns отформатированная строка
 * 
 * @example
 * formatPhone('380671234567') // "+380 67 123 45 67"
 * formatPhone('0671234567') // "067 123 45 67"
 * formatPhone(null) // "-"
 */
export const formatPhone = (phone: string): string => {
  if (!phone) return "-";

  // Убираем все нецифровые символы
  const cleaned = phone.replace(/\D/g, '');

  // Если номер начинается с 380, форматируем как +380
  if (cleaned.startsWith('380') && cleaned.length === 12) {
    return `+${cleaned.slice(0, 3)} ${cleaned.slice(3, 5)} ${cleaned.slice(5, 8)} ${cleaned.slice(8, 10)} ${cleaned.slice(10)}`;
  }

  // Если номер начинается с 0, форматируем как 0XX
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6, 8)} ${cleaned.slice(8)}`;
  }

  return phone;
};

/**
 * Возвращает CSS классы для цвета статуса заказа
 * @param status - строка со статусом заказа
 * @returns строка с CSS классами для цвета
 */
export const getStatusColor = (status: string): string => {
  switch (status) {
    case "1": // Новий
      return "text-neutral-600 bg-neutral-100";
    case "2": // Підтверджено
      return "text-yellow-950 bg-yellow-200";
    case "3": // Готовий до відправлення
      return "text-orange-500 bg-orange-100";
    case "4": // Відправлено
      return "text-neutral-600 bg-blue-100";
    case "5": // Продаж
      return "text-green-600 bg-green-100";
    case "6": // Відмова
      return "text-red-600 bg-red-100";
    case "7": // Повернення
      return "text-red-600 bg-red-100";
    case "8": // Видалено
      return "text-gray-600 bg-gray-100";
    default:
      return "text-gray-600 bg-gray-100";
  }
};

export const ORDER_STATUSES = [
  { key: "all", label: "Усі статуси" },
  { key: "1", label: "Нове замовлення" },
  { key: "2", label: "Підтверджено" },
  { key: "3", label: "Готове до відправки" },
  { key: "4", label: "Відправлено" },
  { key: "5", label: "Доставлено" },
  { key: "6", label: "Повернення" },
  { key: "7", label: "Скасовано" },
  { key: "8", label: "Видалено" },
  // Для совместимости со старыми статусами
  { key: "id3", label: "Готове до відправки" },
];

/**
 * Возвращает текстовое название статуса заказа
 * @param statusKey - ключ статуса
 * @returns строка с названием статуса
 */
export const getStatusLabel = (statusKey: string | null | undefined): string => {
  if (!statusKey) return "Невідомо";
  const status = ORDER_STATUSES.find((s) => s.key === statusKey);
  return status ? status.label : statusKey;
};


/**
 * Форматирует продолжительность в читаемый формат
 * @param duration - продолжительность (в миллисекундах или секундах, зависит от options.unit)
 * @param options - { unit: "s" | "ms" } (по умолчанию "ms")
 * @returns отформатированная строка, например "1год 2хв 3с"
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

  // Приводим к миллисекундам для расчёта
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
 * Форматирует номер отслеживания (ТТН) в читаемый формат
 * @param trackingId - номер отслеживания
 * @param provider - провайдер доставки ('novaposhta' или 'ukrposhta')
 * @returns отформатированная строка
 * 
 * @example
 * formatTrackingNumber('20451232665506', 'novaposhta') // "20 4512 3266 5506"
 * formatTrackingNumber('0503769495578', 'ukrposhta') // "05037 6949 5578"
 */
export const formatTrackingNumber = (trackingId: string, provider: string): string => {
  if (!trackingId || trackingId === 'Не вказано') {
    return 'ТТН не вказано';
  }

  // Убираем все пробелы и приводим к строке
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
  
  // Если формат не распознан, возвращаем как есть
  return trackingId;
};
