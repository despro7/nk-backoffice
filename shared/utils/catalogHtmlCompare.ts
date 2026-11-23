import {
  normalizeWcTypography,
  normalizeWcTypographyInHtml,
} from './storefrontDescription.js';
import { isEffectivelyEmptyHtml } from './storefrontDescriptionParser.js';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  laquo: '\u00ab',
  raquo: '\u00bb',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  bdquo: '\u201e',
};

/** WooCommerce віддає short_description з HTML-сутностями (`&#8211;`, `&amp;`). */
function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const num = code[1] === 'x' || code[1] === 'X'
        ? Number.parseInt(code.slice(2), 16)
        : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(num) && num > 0 && num <= 0x10ffff ? String.fromCodePoint(num) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/**
 * Згортає типографіку WordPress (wptexturize): « - » → « – », розумні лапки, «...» → «…».
 * Лише для порівняння: WP змінює текст на виході, тож BO і WC інакше вічно «відрізняються».
 */
function foldWpTexturize(text: string): string {
  return text
    .replace(/\s[-\u2013\u2014]\s/g, ' \u2013 ')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033\u00ab\u00bb]/g, '"')
    .replace(/\u2026/g, '...');
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '');
}

export function normalizeCatalogHtmlForCompare(value: string | null | undefined): string {
  if (!value || value === '[object Object]') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (isEffectivelyEmptyHtml(trimmed)) return '';

  const withTypography = /<[a-z][\s\S]*>/i.test(trimmed)
    ? normalizeWcTypographyInHtml(trimmed)
    : trimmed;

  return withTypography
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

export function catalogPlainTextForCompare(value: string | null | undefined): string {
  const normalized = normalizeCatalogHtmlForCompare(value);
  if (!normalized) return '';
  const plain = /<[a-z][\s\S]*>/i.test(normalized)
    ? stripHtml(normalized)
    : normalized;
  return normalizeWcTypography(decodeHtmlEntities(plain).replace(/\u00a0/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function catalogHtmlEquivalent(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const normA = normalizeCatalogHtmlForCompare(a);
  const normB = normalizeCatalogHtmlForCompare(b);
  if (!normA && !normB) return true;
  if (normA && normB && normA === normB) return true;
  const plainA = catalogPlainTextForCompare(a);
  const plainB = catalogPlainTextForCompare(b);
  if (!plainA && !plainB) return true;
  return plainA === plainB || foldWpTexturize(plainA) === foldWpTexturize(plainB);
}
