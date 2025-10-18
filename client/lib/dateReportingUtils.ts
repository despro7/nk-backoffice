import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date";
import type { DateRange } from "@react-types/datepicker";

/**
 * Утіліти для роботи з датами в звітах
 * 
 * Обробляє конвертацію між календарними датами та звітними датами
 * з урахуванням налаштувань звітного дня (dayStartHour)
 */

/**
 * Конвертує дату з календаря в звітну дату
 * 
 * Користувач обирає дату в календарі і очікує побачити звіт саме за цю дату.
 * Логіка зсуву дат через dayStartHour відбувається на сервері.
 * 
 * @param calendarDate - дата у форматі CalendarDate
 * @param dayStartHour - година початку звітного дня (не використовується, залишено для сумісності)
 * @returns звітна дата у форматі YYYY-MM-DD (співпадає з календарною)
 */
export function getReportingDateForCalendarDate(calendarDate: CalendarDate, dayStartHour: number = 0): string {
  // Просто повертаємо обрану дату без жодних зсувів
  // Сервер сам розрахує правильний діапазон часу для цієї дати
  
  const year = calendarDate.year;
  const month = String(calendarDate.month).padStart(2, '0');
  const day = String(calendarDate.day).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Конвертує дату з календаря в звітну дату зі зсувом для діапазонів (стара логіка)
 * 
 * Для діапазонів дат ми все ще використовуємо стару логіку, де:
 * - Якщо dayStartHour > 0, то звітна дата зміщується на 1 день вперед
 * 
 * @param calendarDate - дата у форматі CalendarDate
 * @param dayStartHour - година початку звітного дня (0-23)
 * @returns звітна дата у форматі YYYY-MM-DD
 */
export function getReportingDateForCalendarDateWithShift(calendarDate: CalendarDate, dayStartHour: number = 0): string {
  // Стара логіка для діапазонів дат
  let reportingDate = calendarDate;
  if (dayStartHour > 0) {
    reportingDate = calendarDate.add({ days: 1 });
  }
  
  const year = reportingDate.year;
  const month = String(reportingDate.month).padStart(2, '0');
  const day = String(reportingDate.day).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Розраховує діапазон календарних дат для звітної дати з урахуванням години початку звітного дня
 * 
 * Для звітної дати 17.10 з dayStartHour = 16:
 * - start: 16.10 (відповідає 16.10 16:00 попереднього дня)
 * - end: 17.10 (відповідає 17.10 15:59 поточного дня)
 * 
 * @param reportingDate - звітна дата у форматі YYYY-MM-DD
 * @param dayStartHour - година початку звітного дня (0-23)
 * @returns об'єкт з початком та кінцем діапазону CalendarDate
 */
export function getCalendarDateRangeForReportingDate(reportingDate: string, dayStartHour: number = 0): { start: CalendarDate; end: CalendarDate } {
  const [year, month, day] = reportingDate.split('-').map(Number);
  
  // Початок звітного дня - це ПОПЕРЕДНЯ календарна дата
  const startDate = new CalendarDate(year, month, day).subtract({ days: 1 });
  
  // Кінець звітного дня - це поточна календарна дата
  const endDate = new CalendarDate(year, month, day);
  
  return { start: startDate, end: endDate };
}

/**
 * Конвертує діапазон CalendarDate в діапазон звітних дат
 * 
 * Основна функція для конвертації календарних дат у звітні дати.
 * Обробляє як одиночні дати, так і діапазони з різною логікою.
 * 
 * @param dateRange - діапазон календарних дат
 * @param dayStartHour - година початку звітного дня
 * @returns діапазон звітних дат з flagом singleDay
 */
export function convertCalendarRangeToReportingRange(
  dateRange: DateRange, 
  dayStartHour: number = 0
): { 
  startDate: string; 
  endDate: string; 
  isSingleDate: boolean;
} {
  // Перевіряємо, чи це CalendarDate
  const startCalendarDate = dateRange.start as CalendarDate;
  const endCalendarDate = dateRange.end as CalendarDate;
  
  // Перевіряємо, чи вибрана одна дата (start === end)
  const isSingleDate = startCalendarDate.compare(endCalendarDate) === 0;
  
  if (isSingleDate) {
    // Для однієї дати повертаємо тільки одну звітну дату БЕЗ зсувів
    const reportingDate = getReportingDateForCalendarDate(startCalendarDate, dayStartHour);
    return {
      startDate: reportingDate,
      endDate: reportingDate,
      isSingleDate: true
    };
  }
  
  // Для діапазону дат також використовуємо нову логіку БЕЗ зсувів
  // Сервер сам обробить правильний діапазон часу для кожної дати
  const startReportingDate = getReportingDateForCalendarDate(startCalendarDate, dayStartHour);
  const endReportingDate = getReportingDateForCalendarDate(endCalendarDate, dayStartHour);
  
  return {
    startDate: startReportingDate,
    endDate: endReportingDate,
    isSingleDate: false
  };
}

/**
 * Типи для експорту, щоб можна було використовувати в інших файлах
 */
export type DateReportingResult = {
  startDate: string;
  endDate: string;
  isSingleDate: boolean;
};

/**
 * Конфігурація для функцій дат
 */
export type DateReportingConfig = {
  dayStartHour: number;
};

/**
 * Опції для створення preset'ів дат
 */
export type DatePresetConfig = {
  key: string;
  label: string;
  getRange: () => DateRange;
};

/**
 * Створює стандартні preset'и дат для звітів
 * 
 * @returns масив preset'ів дат
 */
export function createStandardDatePresets(): DatePresetConfig[] {
  const getCurrentDate = () => today(getLocalTimeZone());

  return [
    {
      key: "today",
      label: "Сьогодні",
      getRange: () => {
        const todayDate = getCurrentDate();
        return { start: todayDate, end: todayDate };
      },
    },
    {
      key: "yesterday",
      label: "Вчора",
      getRange: () => {
        const yesterday = getCurrentDate().subtract({ days: 1 });
        return { start: yesterday, end: yesterday };
      },
    },
    {
      key: "thisWeek",
      label: "Цього тижня",
      getRange: () => {
        const todayDate = getCurrentDate();
        const dayOfWeek = todayDate.toDate(getLocalTimeZone()).getDay(); // 0 = Sunday, 1 = Monday, etc.
        const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // To get to Monday
        const startOfWeek = todayDate.subtract({ days: daysToSubtract });
        return { start: startOfWeek, end: todayDate };
      },
    },
    {
      key: "last7Days",
      label: "Останні 7 днів",
      getRange: () => {
        const todayDate = getCurrentDate();
        const weekAgo = todayDate.subtract({ days: 6 });
        return { start: weekAgo, end: todayDate };
      },
    },
    {
      key: "last14Days",
      label: "Останні 14 днів",
      getRange: () => {
        const todayDate = getCurrentDate();
        const twoWeeksAgo = todayDate.subtract({ days: 13 });
        return { start: twoWeeksAgo, end: todayDate };
      },
    },
    {
      key: "last30Days",
      label: "Останні 30 днів",
      getRange: () => {
        const todayDate = getCurrentDate();
        const monthAgo = todayDate.subtract({ days: 29 });
        return { start: monthAgo, end: todayDate };
      },
    },
    {
      key: "thisMonth",
      label: "Цього місяця",
      getRange: () => {
        const todayDate = getCurrentDate();
        const startOfMonth = new CalendarDate(todayDate.year, todayDate.month, 1);
        return { start: startOfMonth, end: todayDate };
      },
    },
    {
      key: "lastMonth",
      label: "Минулого місяця",
      getRange: () => {
        const todayDate = getCurrentDate();
        const startOfLastMonth = new CalendarDate(todayDate.year, todayDate.month - 1, 1);
        const endOfLastMonth = new CalendarDate(todayDate.year, todayDate.month, 1).subtract({ days: 1 });
        return { start: startOfLastMonth, end: endOfLastMonth };
      },
    },
    {
      key: "thisYear",
      label: "Цього року",
      getRange: () => {
        const todayDate = getCurrentDate();
        const startOfYear = new CalendarDate(todayDate.year, 1, 1);
        return { start: startOfYear, end: todayDate };
      },
    },
    {
      key: "lastYear",
      label: "Минулого року",
      getRange: () => {
        const todayDate = getCurrentDate();
        const startOfLastYear = new CalendarDate(todayDate.year - 1, 1, 1);
        const endOfLastYear = new CalendarDate(todayDate.year - 1, 12, 31);
        return { start: startOfLastYear, end: endOfLastYear };
      },
    },
  ];
}
