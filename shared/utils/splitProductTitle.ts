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

/** Макс. символів у другому рядку (менший шрифт, тож вміщає більше). */
export const TITLE_LINE2_MAX_CHARS = 28;

/** Ручний роздільник рядків заголовка в редакторі або printName. */
export const TITLE_MANUAL_BREAK = '|';

const TITLE_PREPOSITIONS = ['зі', 'із', 'в', 'у', 'на', 'з', 'та', 'для', 'без', 'по', 'від'];

const TITLE_PREP_RE = new RegExp(`\\s+(?:${TITLE_PREPOSITIONS.join('|')})\\s+`, 'giu');

const TITLE_PREP_SET = new Set(TITLE_PREPOSITIONS);

/** Нерозривні пробіли в заголовку → звичайні, щоб розбиття і перенос працювали передбачувано. */
function normalizeTitleSpaces(text: string): string {
  return text.replace(/[\u00A0\u202F]/g, ' ');
}

function isPreposition(word: string): boolean {
  return TITLE_PREP_SET.has(word.toLowerCase());
}

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
    line2.length <= TITLE_LINE2_MAX_CHARS
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
  let best: [string, string] | null = null;
  let bestDiff = Infinity;

  for (const match of text.matchAll(TITLE_PREP_RE)) {
    if (match.index == null) continue;
    const line1 = text.slice(0, match.index).trim();
    const line2 = text.slice(match.index).trim();
    if (!isValidTitleSplit(line1, line2)) continue;

    const diff = Math.abs(line1.length - line2.length);
    if (diff < bestDiff) {
      best = [line1, line2];
      bestDiff = diff;
    }
  }

  return best;
}

/**
 * Розбиття за межами слів: найменше переповнення рядків, далі найрівніший баланс.
 * Прийменник не залишається в кінці першого рядка (переходить у другий).
 */
function splitAtWordBoundary(text: string): [string, string] {
  const raw = text.trim();
  if (!raw) return ['', ''];
  if (raw.length <= TITLE_LINE_MAX_CHARS) return [raw, ''];

  const words = raw.split(/\s+/);
  if (words.length < 2) {
    const mid = Math.floor(raw.length / 2);
    return [raw.slice(0, mid), raw.slice(mid)];
  }

  type Candidate = { line1: string; line2: string; overflow: number; diff: number };
  const candidates: Candidate[] = [];
  for (let i = 1; i < words.length; i += 1) {
    if (isPreposition(words[i - 1])) continue;
    const line1 = words.slice(0, i).join(' ');
    const line2 = words.slice(i).join(' ');
    candidates.push({
      line1,
      line2,
      overflow:
        Math.max(0, line1.length - TITLE_LINE_MAX_CHARS) +
        Math.max(0, line2.length - TITLE_LINE2_MAX_CHARS),
      diff: Math.abs(line1.length - line2.length),
    });
  }

  if (candidates.length === 0) {
    const mid = Math.floor(words.length / 2);
    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  }

  candidates.sort((a, b) => a.overflow - b.overflow || a.diff - b.diff);
  return [candidates[0].line1, candidates[0].line2];
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

  const trimmedPrint = normalizeTitleSpaces(printName ?? '').trim();
  const trimmedName = normalizeTitleSpaces(name).trim();
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
