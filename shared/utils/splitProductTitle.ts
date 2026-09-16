import type { ProductLabelTitleLayout } from '../types/productLabel.js';

function fontSizeForLine(text: string, max: number, min: number): number {
  const len = text.length;
  if (len <= 16) return max;
  if (len <= 22) return max - 1;
  if (len <= 28) return max - 2;
  if (len <= 34) return max - 3;
  return min;
}

/** Макс. символів у рядку заголовка етикетки (≈174px при Days One). */
export const TITLE_LINE_MAX_CHARS = 22;

/** Перерозбиває заголовок, якщо збережений як один довгий рядок. */
export function ensureSplitTitle(
  title: ProductLabelTitleLayout,
  name: string,
  printName?: string | null,
): ProductLabelTitleLayout {
  const withAlign: ProductLabelTitleLayout = {
    ...title,
    align: title.align === 'left' || title.align === 'right' ? title.align : 'center',
  };
  if (title.line2.trim()) return withAlign;

  const combined = title.line1.trim();
  const source = combined || printName?.trim() || name.trim();
  if (source.length <= TITLE_LINE_MAX_CHARS) return withAlign;

  const split = splitProductTitle(source, null);
  return { ...split, align: withAlign.align };
}

function splitAtWordBoundary(text: string): [string, string] {
  const raw = text.trim();
  if (!raw) return ['', ''];
  if (raw.length <= TITLE_LINE_MAX_CHARS) return [raw, ''];

  const mid = Math.floor(raw.length / 2);
  let splitAt = raw.lastIndexOf(' ', mid);
  if (splitAt < raw.length * 0.25) {
    splitAt = raw.indexOf(' ', mid);
  }
  if (splitAt <= 0) {
    splitAt = mid;
  }

  return [raw.slice(0, splitAt).trim(), raw.slice(splitAt).trim()];
}

/**
 * Розбиває назву товару на 2 рядки для етикетки.
 * Пріоритет: printName з явним \n, далі printName / name з авто-розбиттям.
 */
export function splitProductTitle(
  name: string,
  printName?: string | null,
): ProductLabelTitleLayout {
  const empty: ProductLabelTitleLayout = {
    line1: '',
    line2: '',
    line1FontSize: 14,
    line2FontSize: 11,
    align: 'center',
  };

  const trimmedPrint = printName?.trim() || '';
  const trimmedName = name.trim();
  const source = trimmedPrint || trimmedName;
  if (!source) return empty;

  if (trimmedPrint.includes('\n')) {
    const parts = trimmedPrint
      .split('\n')
      .map((part) => part.trim())
      .filter(Boolean);
    const line1 = parts[0] || '';
    const line2 = parts.slice(1).join(' ');
    return {
      line1,
      line2,
      line1FontSize: fontSizeForLine(line1, 16, 10),
      line2FontSize: fontSizeForLine(line2, 13, 9),
      align: 'center',
    };
  }

  const [line1, line2] = splitAtWordBoundary(source);
  return {
    line1,
    line2,
    line1FontSize: fontSizeForLine(line1, 16, 10),
    line2FontSize: fontSizeForLine(line2, 13, 9),
    align: 'center',
  };
}
