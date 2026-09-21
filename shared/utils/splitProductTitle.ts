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

/** Ручний роздільник рядків заголовка в редакторі або printName. */
export const TITLE_MANUAL_BREAK = '|';

const TITLE_PREP_RE = /\s+(?:в|зі?|на|з|та|для|без|по|від)\s+/iu;

function buildTitleLayout(line1: string, line2: string, align: ProductLabelTitleLayout['align'] = 'center'): ProductLabelTitleLayout {
  return {
    line1,
    line2,
    line1FontSize: fontSizeForLine(line1, 16, 10),
    line2FontSize: fontSizeForLine(line2, 13, 9),
    align,
  };
}

function isValidTitleSplit(line1: string, line2: string): boolean {
  return (
    line1.length >= 2 &&
    line2.length >= 2 &&
    line1.length <= TITLE_LINE_MAX_CHARS &&
    line2.length <= TITLE_LINE_MAX_CHARS
  );
}

/** Розбиває текст за ручним роздільником `|` або `\n`. */
export function parseManualTitleBreak(text: string): [string, string] | null {
  const raw = text.trim();
  if (!raw) return null;

  const pipeIdx = raw.indexOf(TITLE_MANUAL_BREAK);
  if (pipeIdx >= 0) {
    const line1 = raw.slice(0, pipeIdx).trim();
    const line2 = raw.slice(pipeIdx + 1).trim();
    if (line1 && line2) return [line1, line2];
  }

  if (raw.includes('\n')) {
    const parts = raw
      .split('\n')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return [parts[0], parts.slice(1).join(' ')];
    }
  }

  return null;
}

/** Застосовує ручний роздільник до одного рядка заголовка (для редактора). */
export function applyManualTitleBreak(
  line1: string,
  line2: string,
): Pick<ProductLabelTitleLayout, 'line1' | 'line2'> {
  const manual = parseManualTitleBreak(line1);
  if (manual) {
    return { line1: manual[0], line2: manual[1] };
  }
  return { line1: line1.trim(), line2: line2.trim() };
}

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

  const manualFromLine1 = parseManualTitleBreak(title.line1);
  if (manualFromLine1) {
    return buildTitleLayout(manualFromLine1[0], manualFromLine1[1], withAlign.align);
  }

  const combined = title.line1.trim();
  const source = combined || printName?.trim() || name.trim();
  if (!source) return withAlign;

  const split = splitProductTitle(source, printName);
  return { ...split, align: withAlign.align };
}

function splitAtPreposition(text: string): [string, string] | null {
  const match = text.match(TITLE_PREP_RE);
  if (!match || match.index == null) return null;

  const line1 = text.slice(0, match.index).trim();
  const line2 = text.slice(match.index).trim();
  if (!isValidTitleSplit(line1, line2)) return null;
  return [line1, line2];
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
 * Пріоритет: ручний `\n` / `|`, далі preposition split, далі авто-розбиття за довжиною.
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

  const manual = parseManualTitleBreak(source);
  if (manual) {
    return buildTitleLayout(manual[0], manual[1]);
  }

  const prepSplit = splitAtPreposition(source);
  if (prepSplit) {
    return buildTitleLayout(prepSplit[0], prepSplit[1]);
  }

  const [line1, line2] = splitAtWordBoundary(source);
  return buildTitleLayout(line1, line2);
}
