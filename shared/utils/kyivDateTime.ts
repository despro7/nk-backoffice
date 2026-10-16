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
