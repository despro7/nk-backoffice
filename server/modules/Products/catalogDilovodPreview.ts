import type {
  CatalogDilovodBarcodePreviewLine,
  CatalogDilovodFieldSnapshot,
  CatalogDilovodPreviewResult,
  CatalogFieldConflict,
} from '../../../shared/types/catalog.js';
import { resolveStorefrontRegularPrice } from '../Storefront/resolveStorefrontRegularPrice.js';

function norm(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null;
  return String(value).trim();
}

function fieldConflict(
  field: string,
  local: string | null | undefined,
  remote: string | null | undefined,
): CatalogFieldConflict | null {
  const localStr = norm(local);
  const remoteStr = norm(remote);
  if (!localStr && !remoteStr) return null;
  if (localStr === remoteStr) return null;
  return { field, localValue: localStr, remoteValue: remoteStr };
}

export function buildDilovodFieldSnapshot(input: {
  name: string | null | undefined;
  sku: string | null | undefined;
  description: string | null | undefined;
  weight: number | null | undefined;
  packageRatio: number | null | undefined;
  prices: Array<{ priceType: string; price: number }>;
  bomRowCount: number;
  barcodeCount: number;
}): CatalogDilovodFieldSnapshot {
  const weight =
    input.weight != null && Number.isFinite(Number(input.weight))
      ? String(Number(input.weight))
      : null;
  const packageRatio =
    input.packageRatio != null && Number.isFinite(Number(input.packageRatio))
      ? String(Number(input.packageRatio))
      : null;

  return {
    name: norm(input.name),
    sku: norm(input.sku),
    description: norm(input.description),
    weight,
    regularPrice: resolveStorefrontRegularPrice(input.prices),
    packageRatio,
    bomRowCount: input.bomRowCount > 0 ? String(input.bomRowCount) : null,
    barcodeCount: input.barcodeCount > 0 ? String(input.barcodeCount) : null,
  };
}

export function diffDilovodSnapshots(
  local: CatalogDilovodFieldSnapshot,
  proposed: CatalogDilovodFieldSnapshot,
): CatalogFieldConflict[] {
  return [
    fieldConflict('name', local.name, proposed.name),
    fieldConflict('sku', local.sku, proposed.sku),
    // description — не порівнюємо: короткий/повний опис у BO, не в ERP pull-preview
    fieldConflict('weight', local.weight, proposed.weight),
    fieldConflict('regularPrice', local.regularPrice, proposed.regularPrice),
    fieldConflict('packageRatio', local.packageRatio, proposed.packageRatio),
    fieldConflict('bomRowCount', local.bomRowCount, proposed.bomRowCount),
    fieldConflict('barcodeCount', local.barcodeCount, proposed.barcodeCount),
  ].filter(Boolean) as CatalogFieldConflict[];
}

export function mapCatalogBarcodePreviewLines(
  rows: Array<{
    code: string;
    goodPart?: string | null;
    goodPartName?: string | null;
  }>,
): CatalogDilovodBarcodePreviewLine[] {
  return rows
    .filter((row) => row.code?.trim())
    .map((row) => ({
      code: row.code.trim(),
      goodPart: row.goodPart?.trim() || null,
      goodPartName: row.goodPartName?.trim() || null,
    }));
}

export function emptyDilovodPreview(goodId: string, error?: string): CatalogDilovodPreviewResult {
  const empty: CatalogDilovodFieldSnapshot = {
    name: null,
    sku: null,
    description: null,
    weight: null,
    regularPrice: null,
    packageRatio: null,
    bomRowCount: null,
    barcodeCount: null,
  };
  return {
    goodId,
    remoteAvailable: false,
    remoteError: error ?? null,
    local: empty,
    proposed: empty,
    conflicts: [],
    localBarcodes: [],
    proposedBarcodes: [],
  };
}
