import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  isWarehouseProductArchived,
  type WarehouseProductSearchFilters,
  type WarehouseProductSearchHit,
  type WarehouseProductSearchIndexItem,
} from '@shared/types/warehouseProductSearch';

const INDEX_QUERY_KEY = ['warehouse-product-search-index'] as const;

async function fetchIndex(): Promise<WarehouseProductSearchIndexItem[]> {
  const resp = await fetch('/api/catalog/warehouse-search-index', { credentials: 'include' });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json?.success) {
    throw new Error(json?.error || 'Не вдалося завантажити індекс товарів');
  }
  return Array.isArray(json.data) ? json.data : [];
}

async function fetchBatchHits(query: string): Promise<WarehouseProductSearchHit[]> {
  const resp = await fetch(
    `/api/warehouse/search-by-batch?q=${encodeURIComponent(query)}&limit=30`,
    { credentials: 'include' },
  );
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json?.success) return [];
  const items = Array.isArray(json.items) ? json.items : [];
  return items.map((item: Record<string, unknown>) => ({
    sku: String(item.sku ?? ''),
    name: String(item.name ?? ''),
    catalogGoodId: String(item.catalogGoodId ?? ''),
    parentName: item.parentName != null ? String(item.parentName) : null,
    barcodes: item.barcode ? [String(item.barcode)] : [],
    portionsPerBox: 1,
    isOutdated: Boolean(item.isOutdated),
    doNotPublish: Boolean(item.doNotPublish),
    delMark: Boolean(item.isOutdated),
    updatedAt: String(item.updatedAt ?? ''),
    matchType: 'batch',
    batchId: item.batchId != null ? String(item.batchId) : null,
    batchLabel: item.batchLabel != null ? String(item.batchLabel) : null,
  }));
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

function matchesIndexItem(item: WarehouseProductSearchIndexItem, q: string): boolean {
  if (!q) return false;
  if (item.sku.toLowerCase().includes(q)) return true;
  if (item.name.toLowerCase().includes(q)) return true;
  if (item.barcodes.some((code) => code.toLowerCase().includes(q))) return true;
  return false;
}

function applyFilters(
  hits: WarehouseProductSearchHit[],
  filters: WarehouseProductSearchFilters | undefined,
): WarehouseProductSearchHit[] {
  if (!filters) return hits;
  return hits.filter((hit) => {
    if (filters.activeOnly && (isWarehouseProductArchived(hit) || hit.doNotPublish)) return false;
    if (!filters.includeArchived && isWarehouseProductArchived(hit)) return false;
    if (filters.withStockOnly && (hit.stockAtStorage ?? 0) <= 0) return false;
    if (filters.withoutStockOnly && (hit.stockAtStorage ?? 0) > 0) return false;
    return true;
  });
}

function resolveMinQueryLength(q: string): number {
  if (!q) return 3;
  if (/^\d{2,}$/.test(q)) return 2;
  return 3;
}

function rankHits(hits: WarehouseProductSearchHit[], q: string): WarehouseProductSearchHit[] {
  const scored = hits.map((hit) => {
    const sku = hit.sku.toLowerCase();
    const name = hit.name.toLowerCase();
    let score = 0;
    if (sku === q) score += 100;
    else if (sku.startsWith(q)) score += 80;
    else if (sku.includes(q)) score += 50;
    if (name.startsWith(q)) score += 40;
    else if (name.includes(q)) score += 20;
    if (hit.matchType === 'batch') score += 30;
    return { hit, score };
  });
  scored.sort((a, b) => b.score - a.score || a.hit.name.localeCompare(b.hit.name, 'uk'));
  return scored.map((row) => row.hit);
}

export function useWarehouseProductSearchIndex() {
  return useQuery({
    queryKey: INDEX_QUERY_KEY,
    queryFn: fetchIndex,
    staleTime: 15 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

export type WarehouseProductStockBreakdown = {
  gp: number;
  ms: number;
  /** Час розрахунку залишків (відповідь stock-snapshot), не дата картки товару. */
  balancesAsOf?: string | null;
};

interface UseWarehouseProductSearchOptions {
  query: string;
  excludeSkus?: string[];
  filters?: WarehouseProductSearchFilters;
  storageId?: string | null;
  stockAsOfDate?: Date | null;
  debounceMs?: number;
  limit?: number;
}

export function useWarehouseProductSearch({
  query,
  excludeSkus = [],
  filters,
  storageId,
  stockAsOfDate,
  debounceMs = 250,
  limit = 25,
}: UseWarehouseProductSearchOptions) {
  const indexQuery = useWarehouseProductSearchIndex();
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [batchHits, setBatchHits] = useState<WarehouseProductSearchHit[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), debounceMs);
    return () => clearTimeout(handle);
  }, [query, debounceMs]);

  const minLength = useMemo(
    () => resolveMinQueryLength(normalizeQuery(debouncedQuery)),
    [debouncedQuery],
  );

  const refetchBatchHitsForQuery = useCallback(async (rawQuery: string) => {
    const q = rawQuery.trim();
    const minLen = resolveMinQueryLength(normalizeQuery(q));
    if (q.length < minLen) {
      setBatchHits([]);
      setBatchLoading(false);
      return;
    }
    const looksLikeBatch = /[/_-]/.test(q) || q.length >= 4;
    if (!looksLikeBatch) {
      setBatchHits([]);
      return;
    }
    setBatchLoading(true);
    try {
      const items = await fetchBatchHits(q);
      setBatchHits(items);
    } catch {
      setBatchHits([]);
    } finally {
      setBatchLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < minLength) {
      setBatchHits([]);
      setBatchLoading(false);
      return;
    }

    void refetchBatchHitsForQuery(q);
  }, [debouncedQuery, minLength, refetchBatchHitsForQuery]);

  const results = useMemo(() => {
    const q = normalizeQuery(debouncedQuery);
    if (q.length < minLength) return [];

    const exclude = new Set(excludeSkus.map((sku) => sku.trim()).filter(Boolean));
    const index = indexQuery.data ?? [];
    const fromIndex: WarehouseProductSearchHit[] = index
      .filter((item) => matchesIndexItem(item, q))
      .map((item) => ({ ...item, matchType: item.sku.toLowerCase().includes(q) ? 'sku' : 'name' }));

    const merged = new Map<string, WarehouseProductSearchHit>();
    for (const hit of [...batchHits, ...fromIndex]) {
      if (!hit.sku || exclude.has(hit.sku)) continue;
      const key = `${hit.sku}::${hit.batchId ?? ''}`;
      if (!merged.has(key)) merged.set(key, hit);
    }

    let list = [...merged.values()];
    list = applyFilters(list, filters);
    list = rankHits(list, q);
    return list.slice(0, limit);
  }, [batchHits, debouncedQuery, excludeSkus, filters, indexQuery.data, limit, minLength]);

  const loading = indexQuery.isLoading || batchLoading;

  const enrichStockBreakdown = useCallback(async (skus: string[]) => {
    if (skus.length === 0) return {} as Record<string, WarehouseProductStockBreakdown>;
    const url = new URL('/api/warehouse/stock-snapshot', window.location.origin);
    url.searchParams.set('skus', skus.join(','));
    if (stockAsOfDate) {
      url.searchParams.set('asOfDate', stockAsOfDate.toISOString());
    }
    const resp = await fetch(url.pathname + url.search, { credentials: 'include' });
    if (!resp.ok) return {};
    const data = await resp.json().catch(() => null) as {
      asOfDate?: string | null;
      stocks?: Record<string, { mainStock?: number; smallStock?: number }>;
    } | null;
    const balancesAsOf = data?.asOfDate ?? (stockAsOfDate ? stockAsOfDate.toISOString() : null);
    const out: Record<string, WarehouseProductStockBreakdown> = {};
    for (const sku of skus) {
      const row = data?.stocks?.[sku];
      if (!row) continue;
      out[sku] = {
        gp: Number(row.mainStock) || 0,
        ms: Number(row.smallStock) || 0,
        balancesAsOf,
      };
    }
    return out;
  }, [stockAsOfDate]);

  const refresh = useCallback(async (searchQuery?: string) => {
    const q = (searchQuery ?? debouncedQuery).trim();
    await indexQuery.refetch();
    await refetchBatchHitsForQuery(q);
  }, [debouncedQuery, indexQuery, refetchBatchHitsForQuery]);

  const isRefreshing = indexQuery.isFetching || batchLoading;

  return {
    results,
    loading,
    indexLoading: indexQuery.isLoading,
    minLength,
    enrichStockBreakdown,
    refresh,
    isRefreshing,
  };
}
