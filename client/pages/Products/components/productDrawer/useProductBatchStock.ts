import { useQuery } from '@tanstack/react-query';
import type { WarehouseBatchListItem } from '@shared/types/warehouse';

export interface BatchStock {
  gp: number;
  ms: number;
}

async function fetchProductBatchStock(sku: string): Promise<Record<string, BatchStock>> {
  const qs = new URLSearchParams({ sku, onlyWithStock: 'false', negativeMode: 'all' });
  const resp = await fetch(`/api/warehouse/batches?${qs.toString()}`, { credentials: 'include' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = (await resp.json()) as { success?: boolean; data?: WarehouseBatchListItem[] };
  const map: Record<string, BatchStock> = {};
  for (const item of json.data ?? []) {
    map[item.batchId] = { gp: item.quantityGp, ms: item.quantityMs };
  }
  return map;
}

/** Залишки ГП/МС по партіях одного товару (готова продукція). Помилка не ламає форму: `stockByBatch` порожній. */
export function useProductBatchStock(sku: string | null | undefined, enabled: boolean) {
  const normalized = sku?.trim() ?? '';
  const query = useQuery({
    queryKey: ['product-batch-stock', normalized],
    queryFn: () => fetchProductBatchStock(normalized),
    enabled: enabled && normalized.length > 0,
    staleTime: 30_000,
    retry: false,
  });
  return {
    stockByBatch: query.data ?? {},
    loading: query.isLoading,
  };
}
