import { productIsSet } from '@shared/utils/productIsSet';
import type { MovementV2Line } from './types';

export async function fetchSkusIsSet(skus: string[]): Promise<Map<string, boolean>> {
  const unique = [...new Set(skus.map((sku) => sku.trim()).filter(Boolean))];
  const result = new Map<string, boolean>();
  if (unique.length === 0) return result;

  const url = `/api/products/batch?skus=${encodeURIComponent(unique.join(','))}&fields=set`;
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) return result;

  const json = await response.json().catch(() => null) as {
    products?: Array<{ sku?: string; set?: unknown }>;
  } | null;

  for (const row of json?.products ?? []) {
    const sku = String(row.sku ?? '').trim();
    if (!sku) continue;
    result.set(sku, productIsSet(row.set));
  }
  return result;
}

export async function enrichMovementV2LinesIsSet(lines: MovementV2Line[]): Promise<MovementV2Line[]> {
  if (lines.length === 0) return lines;
  const isSetBySku = await fetchSkusIsSet(lines.map((line) => line.sku));
  if (isSetBySku.size === 0) return lines;
  return lines.map((line) => {
    const isSet = isSetBySku.get(line.sku);
    if (isSet === undefined) return line;
    return { ...line, isSet };
  });
}
