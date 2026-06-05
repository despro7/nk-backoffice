import { useCallback, useState } from 'react';
import type { ProductHistoryEntry } from './WarehouseInventoryTypes';

export const useRowHistory = () => {
  const [rowHistoryCache, setRowHistoryCache] = useState<Record<string, ProductHistoryEntry[]>>({});
  const [loadingSku, setLoadingSku] = useState<string | null>(null);

  const fetchHistory = useCallback(async (sku: string, days = 21): Promise<ProductHistoryEntry[]> => {
    if (rowHistoryCache[sku]) return rowHistoryCache[sku];
    setLoadingSku(sku);
    try {
      const res = await fetch(`/api/warehouse/inventory/product-history?sku=${encodeURIComponent(sku)}&days=${days}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { sku: string; entries: ProductHistoryEntry[] } = await res.json();
      const entries = data.entries ?? [];
      setRowHistoryCache((prev) => ({ ...prev, [sku]: entries }));
      return entries;
    } catch (e) {
      setRowHistoryCache((prev) => ({ ...prev, [sku]: [] }));
      return [];
    } finally {
      setLoadingSku(null);
    }
  }, [rowHistoryCache]);

  return { rowHistoryCache, loadingSku, fetchHistory } as const;
};

export default useRowHistory;
