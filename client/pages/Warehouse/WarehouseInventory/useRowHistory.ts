import { useCallback, useState } from 'react';
import type { ProductHistoryEntry } from './WarehouseInventoryTypes';

export const useRowHistory = () => {
  const [rowHistoryCache, setRowHistoryCache] = useState<Record<string, ProductHistoryEntry[]>>({});
  const [loadingSku, setLoadingSku] = useState<string | null>(null);

  const fetchHistory = useCallback(async (sku: string, days = 21, force = false): Promise<ProductHistoryEntry[]> => {
    if (!force && rowHistoryCache[sku]) return rowHistoryCache[sku];
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

  /** Скидає серверний кеш денних рухів і перезавантажує історію цього SKU. */
  const refreshHistory = useCallback(async (sku: string): Promise<void> => {
    try {
      await fetch('/api/settings/inventory-history-cache/clear', { method: 'POST', credentials: 'include' });
    } catch {
      // навіть якщо кеш не скинувся, перезавантажимо історію
    }
    await fetchHistory(sku, 21, true);
  }, [fetchHistory]);

  return { rowHistoryCache, loadingSku, fetchHistory, refreshHistory } as const;
};

export default useRowHistory;
