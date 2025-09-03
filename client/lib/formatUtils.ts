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
 */

/**
 * Форматирует дату в относительном формате (например, "5 хв тому", "2 год тому", "Вчора в 16:16")
 * @param dateString - строка с датой или null
 * @returns отформатированная строка
 */
export const formatRelativeDate = (dateString: string | null): string => {
  if (!dateString) return 'Немає даних';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  
  // Только что
  if (diffInMinutes < 1) return 'Щойно';
  
  // Минуты назад
  if (diffInMinutes < 60) return `${diffInMinutes} хв тому`;
  
  // Часы назад
  if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} год тому`;
  
  // Дни назад
  const diffInDays = Math.floor(diffInMinutes / 1440);
  
  // Вчера
  if (diffInDays === 1) {
    return `Вчора о ${date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`;
  }
    
  // Позавчера
  // if (diffInDays === 2) {
  //   return `Позавчора о ${date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`;
  // }
  
  // 3-7 дней назад
  // if (diffInDays <= 7) {
  //   const dayNames = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П\'ятниця', 'Субота'];
  //   const dayName = dayNames[date.getDay()];
  //   return `${dayName},
  //    ${date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  // }
  
  // Более недели назад - показываем полную дату
  return date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/**
 * Расширенное форматирование относительной даты с настраиваемыми опциями
 * @param dateString - строка с датой или null
 * @param options - опции форматирования
 * @returns отформатированная строка
 */
export const formatRelativeDateExtended = (
  dateString: string | null, 
  options: {
    showTime?: boolean;
    maxRelativeDays?: number;
    includeWeekdays?: boolean;
  } = {}
): string => {
  if (!dateString) return 'Немає даних';
  
  const {
    showTime = true,
    maxRelativeDays = 7,
    includeWeekdays = true
  } = options;
  
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  
  // Только что
  if (diffInMinutes < 1) return 'Тільки що';
  
  // Минуты назад
  if (diffInMinutes < 60) return `${diffInMinutes} хв тому`;
  
  // Часы назад
  if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} год тому`;
  
  // Дни назад
  const diffInDays = Math.floor(diffInMinutes / 1440);
  
  // Если превышен максимальный диапазон для относительного форматирования
  if (diffInDays > maxRelativeDays) {
    if (showTime) {
      return date.toLocaleDateString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } else {
      return date.toLocaleDateString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }
  }
  
  // Вчера
  if (diffInDays === 1) {
    const timeStr = showTime ? ` в ${date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}` : '';
    return `Вчора${timeStr}`;
  }
  
  // Позавчера
  if (diffInDays === 2) {
    const timeStr = showTime ? ` в ${date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}` : '';
    return `Позавчора${timeStr}`;
  }
  
  // 3-7 дней назад с названиями дней недели
  if (diffInDays <= 7 && includeWeekdays) {
    const dayNames = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П\'ятниця', 'Субота'];
    const dayName = dayNames[date.getDay()];
    const timeStr = showTime ? ` в ${date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}` : '';
    return `${dayName}${timeStr}`;
  }
  
  // Просто количество дней назад
  const timeStr = showTime ? ` в ${date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}` : '';
  return `${diffInDays} дн тому${timeStr}`;
};

/**
 * Форматирует дату в стандартном украинском формате
 * @param dateString - строка с датой
 * @returns отформатированная строка
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
 */
export const formatDateTime = (dateString: string): string => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString('uk-UA');
};

/**
 * Форматирует только дату в украинском формате
 * @param dateString - строка с датой
 * @returns отформатированная строка
 */
export const formatDateOnly = (dateString: string): string => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString('uk-UA');
};

/**
 * Форматирует только время в украинском формате
 * @param dateString - строка с датой
 * @returns отформатированная строка
 */
export const formatTimeOnly = (dateString: string): string => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleTimeString('uk-UA');
};

/**
 * Форматирует цену в украинской валюте
 * @param price - цена в числах
 * @returns отформатированная строка
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
 */
export const formatNumber = (number: number): string => {
  return new Intl.NumberFormat('uk-UA').format(number);
};

/**
 * Форматирует процентное значение
 * @param value - значение от 0 до 1
 * @param decimals - количество знаков после запятой
 * @returns отформатированная строка
 */
export const formatPercentage = (value: number, decimals: number = 1): string => {
  return `${(value * 100).toFixed(decimals)}%`;
};

/**
 * Форматирует размер файла в читаемом виде
 * @param bytes - размер в байтах
 * @returns отформатированная строка
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
