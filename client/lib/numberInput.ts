export type DecimalSeparator = ',' | '.';

export interface NumberInputFormatOptions {
  decimalSeparator?: DecimalSeparator;
  decimalPlaces?: number;
  allowNegative?: boolean;
  trimTrailingZeros?: boolean;
}

const DEFAULT_SEPARATOR: DecimalSeparator = ',';
const DEFAULT_PLACES = 2;

function otherSeparator(sep: DecimalSeparator): DecimalSeparator {
  return sep === ',' ? '.' : ',';
}

/** Рядок → число. Порожнє / невалідне → `null`. */
export function parseNumberInput(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') {
    return null;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Фільтр під час набору: цифри, один роздільник, `.` і `,` зводяться до `decimalSeparator`.
 */
export function sanitizeNumberInput(
  raw: string,
  options: NumberInputFormatOptions = {},
): string {
  const sep = options.decimalSeparator ?? DEFAULT_SEPARATOR;
  const decimalPlaces = options.decimalPlaces ?? DEFAULT_PLACES;
  const allowNegative = options.allowNegative ?? false;

  let negative = false;
  let seenSep = false;
  let intPart = '';
  let fracPart = '';

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '-' && allowNegative && !negative && intPart === '' && fracPart === '' && !seenSep) {
      negative = true;
      continue;
    }
    if (ch === sep || ch === otherSeparator(sep)) {
      seenSep = true;
      continue;
    }
    if (ch < '0' || ch > '9') continue;
    if (seenSep) {
      if (decimalPlaces <= 0) continue;
      if (fracPart.length < decimalPlaces) fracPart += ch;
    } else {
      intPart += ch;
    }
  }

  const sign = negative ? '-' : '';
  if (seenSep && decimalPlaces > 0) return `${sign}${intPart}${sep}${fracPart}`;
  return `${sign}${intPart}`;
}

function clampNumber(n: number, min?: number, max?: number): number {
  let next = n;
  if (min != null && Number.isFinite(min) && next < min) next = min;
  if (max != null && Number.isFinite(max) && next > max) next = max;
  return next;
}

/** Число → рядок для поля (роздільник, знаки, опційний trim нулів). */
export function formatNumberInput(
  value: number,
  options: NumberInputFormatOptions & { min?: number; max?: number } = {},
): string {
  const sep = options.decimalSeparator ?? DEFAULT_SEPARATOR;
  const decimalPlaces = options.decimalPlaces ?? DEFAULT_PLACES;
  if (!Number.isFinite(value)) return '';

  const n = clampNumber(value, options.min, options.max);
  const factor = 10 ** Math.max(0, decimalPlaces);
  const rounded = decimalPlaces <= 0 ? Math.round(n) : Math.round(n * factor) / factor;

  if (decimalPlaces <= 0) return String(rounded);

  let body = Math.abs(rounded).toFixed(decimalPlaces);
  if (options.trimTrailingZeros) {
    body = body.replace(/\.?0+$/, '');
  }
  const sign = rounded < 0 ? '-' : '';
  return `${sign}${body.replace('.', sep)}`;
}

export function formatNumberInputFromRaw(
  raw: string,
  options: NumberInputFormatOptions & {
    min?: number;
    max?: number;
    emptyAs?: 'keep' | 'min';
  } = {},
): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    if (options.emptyAs === 'min' && options.min != null && Number.isFinite(options.min)) {
      return formatNumberInput(options.min, options);
    }
    return '';
  }
  const n = parseNumberInput(trimmed);
  if (n == null) return '';
  return formatNumberInput(n, options);
}

export function isZeroInput(raw: string): boolean {
  return parseNumberInput(raw) === 0;
}
