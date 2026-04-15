import { useState, useCallback, useRef } from 'react';

export interface BatchNumber {
  batchId: string;       // ID партії в Діловоді (goodPart)
  batchNumber: string;   // Назва партії для відображення (goodPart__pr)
  storage: string;
  storageDisplayName: string;
  quantity: number;
  firm: string;
  firmDisplayName: string;
}

interface UseBatchNumbersResult {
  batches: BatchNumber[];
  loading: boolean;
  error: string | null;
  fetchBatches: (sku: string, asOfDate?: Date, firmId?: string, force?: boolean) => Promise<void>;
}

/**
 * Hook для отримання доступних партій по SKU.
 * Кешування відбувається на сервері (WarehouseController), тому клієнтський кеш не потрібен.
 * Параметр force=true примусово скидає серверний кеш і отримує свіжі дані.
 */
export function useBatchNumbers(): UseBatchNumbersResult {
  const [batches, setBatches] = useState<BatchNumber[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchBatches = useCallback(async (sku: string, asOfDate?: Date, firmId?: string, force?: boolean) => {
    if (!sku || sku.trim() === '') {
      setBatches([]);
      setError(null);
      return;
    }

    // Скасовуємо попередній запит, якщо він ще виконується
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      console.log(`📦 [useBatchNumbers] Запит партій для SKU: ${sku}${firmId ? ` (фірма: ${firmId})` : ''}${asOfDate ? ` на дату ${asOfDate.toLocaleDateString('uk-UA')}` : ''}${force ? ' [force]' : ''}`);

      // Формуємо URL з параметрами
      const url = new URL(`/api/warehouse/batch-numbers/${encodeURIComponent(sku)}`, window.location.origin);
      if (asOfDate) {
        url.searchParams.set('asOfDate', asOfDate.toISOString());
      }
      if (firmId) {
        url.searchParams.set('firmId', firmId);
      }
      if (force) {
        url.searchParams.set('force', 'true');
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch batch numbers');
      }

      const fetchedBatches: BatchNumber[] = data.batches || [];

      // Сортуємо партії за кількістю (спадаючо)
      fetchedBatches.sort((a, b) => b.quantity - a.quantity);

      setBatches(fetchedBatches);
      console.log(`✅ [useBatchNumbers] Отримано ${fetchedBatches.length} партій для SKU: ${sku}${asOfDate ? ` (дата: ${asOfDate.toISOString()})` : ''}${data.fromCache ? ' (з серверного кешу)' : ' (свіжі дані)'}`);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[useBatchNumbers] Запит скасовано');
        return;
      }

      const errorMessage = err instanceof Error ? err.message : 'Невідома помилка';
      console.error(`🚨 [useBatchNumbers] Помилка при отриманні партій для SKU ${sku}:`, err);
      setError(errorMessage);
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    batches,
    loading,
    error,
    fetchBatches
  };
}
