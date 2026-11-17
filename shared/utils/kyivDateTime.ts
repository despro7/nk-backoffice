/** Бізнес-час складу / Dilovod — завжди Europe/Kyiv, незалежно від TZ процесу. */
export const KYIV_TZ = 'Europe/Kyiv';

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Wall-clock Europe/Kyiv → абсолютний Date (UTC instant). */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string = KYIV_TZ,
): Date {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let i = 0; i < 3; i += 1) {
    const parts = getZonedParts(new Date(utcMs), timeZone);
    const asIfUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const desired = Date.UTC(year, month - 1, day, hour, minute, second);
    const diff = desired - asIfUtc;
    if (diff === 0) break;
    utcMs += diff;
  }

  return new Date(utcMs);
}

/**
 * Парсить дату операції складу.
 * Рядки без TZ (`YYYY-MM-DD HH:mm:ss`) — wall-clock Europe/Kyiv.
 * ISO з Z/offset — як є.
 */
export function parseKyivDateTime(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== 'string' || value.trim() === '') return null;

  const trimmed = value.trim();
  const localMatch = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (localMatch) {
    const [, year, month, day, hours, minutes, seconds] = localMatch;
    return zonedWallTimeToUtc(
      Number(year),
      Number(month),
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds ?? '0'),
    );
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Формат Dilovod / payload: `YYYY-MM-DD HH:mm:ss` у Europe/Kyiv. */
export function formatKyivDateTime(date: Date): string {
  return date
    .toLocaleString('sv-SE', { timeZone: KYIV_TZ, hour12: false })
    .replace('T', ' ');
}

/** Календарний день Kyiv: [start, endExclusive) для фільтрів БД. */
export function kyivDayRangeExclusiveFromYmd(dayYmd: string): { start: Date; endExclusive: Date } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayYmd).trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const start = zonedWallTimeToUtc(year, month, day, 0, 0, 0);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const endExclusive = zonedWallTimeToUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    0,
    0,
    0,
  );
  return { start, endExclusive };
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

const formatYmd = (year: number, month: number, day: number): string =>
  `${year}-${pad2(month)}-${pad2(day)}`;

/** Календарний день Kyiv (`YYYY-MM-DD`) для моменту часу. */
export function kyivYmd(date: Date): string {
  const parts = getZonedParts(date, KYIV_TZ);
  return formatYmd(parts.year, parts.month, parts.day);
}

/** Година доби Kyiv (0-23) для моменту часу. */
export function kyivHour(date: Date): number {
  return getZonedParts(date, KYIV_TZ).hour;
}

/** Сьогодні в Kyiv (`YYYY-MM-DD`). */
export function todayKyivYmd(now: Date = new Date()): string {
  return kyivYmd(now);
}

/** Додає дні до календарної дати `YYYY-MM-DD` (без впливу TZ процесу). */
export function addDaysToYmd(ymd: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return formatYmd(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/**
 * Звітна дата (`YYYY-MM-DD`) для моменту часу в Europe/Kyiv.
 * Година >= `dayStartHour` належить наступному звітному дню
 * (`dayStartHour` = 24 означає звичайний календарний день).
 */
export function getKyivReportingDate(date: Date, dayStartHour: number = 0): string {
  const parts = getZonedParts(date, KYIV_TZ);
  const ymd = formatYmd(parts.year, parts.month, parts.day);
  return parts.hour >= dayStartHour ? addDaysToYmd(ymd, 1) : ymd;
}

/**
 * Діапазон звітної дати в Europe/Kyiv: від `dayStartHour` попереднього дня
 * до `dayStartHour` звітного дня мінус 1 секунда.
 */
export function getKyivReportingDateRange(
  reportingDate: string,
  dayStartHour: number = 0,
): { start: Date; end: Date } {
  const [year, month, day] = reportingDate.split('-').map(Number);
  const start = zonedWallTimeToUtc(year, month, day - 1, dayStartHour, 0, 0);
  const end = new Date(zonedWallTimeToUtc(year, month, day, dayStartHour, 0, 0).getTime() - 1000);
  return { start, end };
}
