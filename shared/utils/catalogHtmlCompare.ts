import {
  normalizeWcTypography,
  normalizeWcTypographyInHtml,
} from './storefrontDescription.js';
import { isEffectivelyEmptyHtml } from './storefrontDescriptionParser.js';

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0/g, ' ');
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
  return normalizeWcTypography(plain).replace(/\s+/g, ' ').trim();
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
  return plainA === plainB;
}
