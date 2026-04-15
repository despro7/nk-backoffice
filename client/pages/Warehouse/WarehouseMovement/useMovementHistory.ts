import { useState, useCallback } from 'react';
import type { GoodMovingDocument, GoodMovingDocumentDetails, MovementHistoryResponse } from '@shared/types/movement';

// ---------------------------------------------------------------------------
// Типи пресетів дат
// ---------------------------------------------------------------------------

export type DatePreset = '7d' | '14d' | '30d' | 'month';

/** Обчислює fromDate і toDate на основі пресету і вибраного місяця */
function computeDateRange(preset: DatePreset, selectedMonth: Date): { fromDate: string; toDate?: string } {
  const toIsoDateTime = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

  if (preset === 'month') {
    const y = selectedMonth.getFullYear();
    const m = selectedMonth.getMonth();
    const firstDay = new Date(y, m, 1, 0, 0, 0);
    // Останній день місяця: перший день наступного мінус 1 секунда
    const lastDay = new Date(y, m + 1, 0, 23, 59, 59);
    return { fromDate: toIsoDateTime(firstDay), toDate: toIsoDateTime(lastDay) };
  }

  const days = preset === '7d' ? 7 : preset === '14d' ? 14 : 30;
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  return { fromDate: toIsoDateTime(from) };
}

/**
 * Hook для управління історією переміщень
 */
export function useMovementHistory() {
  const [documents, setDocuments] = useState<GoodMovingDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState<Record<string, boolean>>({});

  // Пресет дат: 7d | 14d | 30d | month (за замовченням — 7d)
  const [datePreset, setDatePreset] = useState<DatePreset>('7d');
  // Вибраний місяць (активний лише коли datePreset === 'month')
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [filters, setFilters] = useState({
    storageId: undefined as string | undefined,
    storageToId: undefined as string | undefined,
    remark: undefined as string | undefined
  });

  /**
   * Завантажує історію переміщень з сервера.
   * fromDate/toDate обчислюються з поточного datePreset/selectedMonth якщо не передані явно.
   */
  const loadHistory = useCallback(async (
    customFilters?: typeof filters,
    overrideDateRange?: { fromDate?: string; toDate?: string },
    overridePreset?: { preset: DatePreset; month: Date },
  ) => {
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();

      const filtersToUse = customFilters || filters;

      if (filtersToUse.storageId) {
        queryParams.append('storageId', filtersToUse.storageId);
      }
      if (filtersToUse.storageToId) {
        queryParams.append('storageToId', filtersToUse.storageToId);
      }
      if (filtersToUse.remark) {
        queryParams.append('remark', filtersToUse.remark);
      }

      // Обчислюємо fromDate/toDate: або явно передані, або з поточного пресету
      const { preset: presetToUse, month: monthToUse } = overridePreset
        || { preset: datePreset, month: selectedMonth };
      const dateRange = overrideDateRange ?? computeDateRange(presetToUse, monthToUse);

      queryParams.append('fromDate', dateRange.fromDate);
      if (dateRange.toDate) {
        queryParams.append('toDate', dateRange.toDate);
      }

      const queryString = queryParams.toString();
      const url = `/api/warehouse/history${queryString ? `?${queryString}` : ''}`;

      console.log(`📦 [useMovementHistory] Запит історії переміщень: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: MovementHistoryResponse = await response.json();

      console.log(`✅ [useMovementHistory] Отримано ${data.documents.length} документів`);

      // Зберігаємо вже завантажені details — щоб повторний loadHistory не скидав деталі
      setDocuments((prev) =>
        data.documents.map((doc) => {
          const existing = prev.find((d) => d.id === doc.id);
          return existing?.details ? { ...doc, details: existing.details } : doc;
        })
      );

      // Оновлюємо фільтри якщо передані
      if (customFilters) {
        setFilters(customFilters);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Невідома помилка';
      console.error('🚨 [useMovementHistory] Помилка при завантаженні:', errorMessage);
      setError(errorMessage);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [filters, datePreset, selectedMonth]);

  /**
   * Внутрішня функція завантаження деталей.
   * force=true — ігнорує in-memory кеш і серверний кеш (БД), завжди іде в Dilovod.
   */
  const fetchDetails = useCallback(async (documentId: string, force: boolean): Promise<void> => {
    // In-memory кеш: якщо деталі вже є в стані і це не force — скіпаємо запит
    if (!force) {
      const existing = documents.find(d => d.id === documentId);
      if (existing?.details) {
        console.log(`📦 [useMovementHistory] Деталі для ${documentId} вже є (in-memory) — пропускаємо запит`);
        return;
      }
    }

    setDetailsLoading((prev) => ({ ...prev, [documentId]: true }));

    try {
      const url = `/api/warehouse/details/${documentId}${force ? '?force=true' : ''}`;
      console.log(`📦 [useMovementHistory] Запит деталей: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const details: GoodMovingDocumentDetails = await response.json();

      console.log(`✅ [useMovementHistory] Отримані деталі для ${documentId}${(details as any).fromCache ? ' (з кешу БД)' : ' (з Dilovod)'}`);

      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === documentId ? { ...doc, details } : doc
        )
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Невідома помилка';
      console.error('🚨 [useMovementHistory] Помилка при завантаженні деталей:', errorMessage);
    } finally {
      setDetailsLoading((prev) => ({ ...prev, [documentId]: false }));
    }
  }, [documents]);

  /**
   * Завантажує деталі переміщення за ID.
   * Якщо деталі вже є в in-memory стані — нічого не робить.
   * Якщо є в БД (кеш) — повертає з БД без звернення до Dilovod.
   */
  const loadDetails = useCallback((documentId: string): Promise<void> => {
    return fetchDetails(documentId, false);
  }, [fetchDetails]);

  /**
   * Примусово оновлює деталі з Dilovod (ігнорує in-memory та серверний кеш).
   */
  const refreshDetails = useCallback((documentId: string): Promise<void> => {
    return fetchDetails(documentId, true);
  }, [fetchDetails]);

  /**
   * Оновлює фільтри та перезавантажує дані
   */
  const updateFilters = useCallback((newFilters: Partial<typeof filters>) => {
    const updated = { ...filters, ...newFilters };
    setFilters(updated);
    return loadHistory(updated);
  }, [filters, loadHistory]);

  /**
   * Перезавантажує дані з поточними фільтрами і пресетом
   */
  const refresh = useCallback(() => {
    return loadHistory();
  }, [loadHistory]);

  /**
   * Змінює пресет дат і одразу завантажує дані
   */
  const changeDatePreset = useCallback((preset: DatePreset) => {
    setDatePreset(preset);
    return loadHistory(undefined, undefined, { preset, month: selectedMonth });
  }, [loadHistory, selectedMonth]);

  /**
   * Змінює вибраний місяць (активно лише коли preset === 'month') і одразу завантажує дані
   */
  const changeMonth = useCallback((month: Date) => {
    setSelectedMonth(month);
    return loadHistory(undefined, undefined, { preset: 'month', month });
  }, [loadHistory]);

  return {
    documents,
    loading,
    error,
    detailsLoading,
    filters,
    datePreset,
    selectedMonth,
    loadHistory,
    loadDetails,
    refreshDetails,
    updateFilters,
    refresh,
    changeDatePreset,
    changeMonth,
  };
}
