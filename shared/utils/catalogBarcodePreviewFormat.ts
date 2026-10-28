import type { CatalogDilovodBarcodePreviewLine } from '../types/catalog.js';

export function catalogBarcodePreviewKey(line: CatalogDilovodBarcodePreviewLine): string {
  const code = line.code.trim();
  const part = line.goodPart?.trim() || '';
  return `${code}|${part}`;
}

export function formatCatalogBarcodePreviewLine(line: CatalogDilovodBarcodePreviewLine): string {
  const code = line.code.trim();
  if (!code) return '—';
  const batch = line.goodPartName?.trim() || line.goodPart?.trim();
  const base = batch ? `${code} · ${batch}` : code;
  return base;
}

export function formatCatalogBarcodePreviewList(
  lines: CatalogDilovodBarcodePreviewLine[] | null | undefined,
): string | null {
  if (!lines?.length) return null;
  return lines.map(formatCatalogBarcodePreviewLine).join('\n');
}

export function catalogBarcodePreviewOnlyIn(
  lines: CatalogDilovodBarcodePreviewLine[],
  other: CatalogDilovodBarcodePreviewLine[],
): Set<string> {
  const otherKeys = new Set(other.map(catalogBarcodePreviewKey));
  const out = new Set<string>();
  for (const line of lines) {
    const key = catalogBarcodePreviewKey(line);
    if (!otherKeys.has(key)) out.add(key);
  }
  return out;
}

export function catalogBarcodePreviewPortionLines(
  lines: CatalogDilovodBarcodePreviewLine[] | null | undefined,
): CatalogDilovodBarcodePreviewLine[] {
  if (!lines?.length) return [];
  return lines.filter((line) => line.barcodeKind !== 'box');
}

export function catalogBarcodePreviewKeysEqual(
  a: CatalogDilovodBarcodePreviewLine[],
  b: CatalogDilovodBarcodePreviewLine[],
): boolean {
  const sortKeys = (lines: CatalogDilovodBarcodePreviewLine[]) =>
    lines.map(catalogBarcodePreviewKey).sort();
  const left = sortKeys(a);
  const right = sortKeys(b);
  return left.length === right.length && left.every((key, idx) => key === right[idx]);
}
