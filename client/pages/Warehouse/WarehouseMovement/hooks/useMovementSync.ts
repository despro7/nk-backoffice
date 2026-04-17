import { useState, useCallback, useRef } from 'react';
import { ToastService } from '@/services/ToastService';
import { LoggingService } from '@/services/LoggingService';
import type { MovementProduct, MovementDraft } from '../../shared/WarehouseMovementTypes';

// ---------------------------------------------------------------------------
// useMovementSync — синхронізація залишків та обробка дати документа
//
// Відповідає за:
//   • handleSyncBalances — оновлення залишків з нашої БД
//   • handleSyncStockFromDilovod — синхронізація залишків із зовнішнього Dilovod
//   • handleDateChange — зміна дати документа з debounce-оновленням залишків
//   • isRefreshingBatches — прапорець стану оновлення
// ---------------------------------------------------------------------------

export interface UseMovementSyncReturn {
  isRefreshingBatches: boolean;
  handleSyncBalances: (
    loadProducts: () => Promise<MovementProduct[]>,
    savedDraft: MovementDraft | null,
    loadDraftIntoProducts: (prods: MovementProduct[], items: any[], asOfDate?: Date) => Promise<void>,
    refreshStockData?: (prods: MovementProduct[], asOfDate?: Date) => Promise<void>,
    stockDateMode?: 'movement' | 'now',
    selectedDateTime?: Date,
  ) => Promise<void>;
  handleSyncStockFromDilovod: (
    loadProducts: () => Promise<MovementProduct[]>,
    savedDraft: MovementDraft | null,
    loadDraftIntoProducts: (prods: MovementProduct[], items: any[], asOfDate?: Date) => Promise<void>,
  ) => Promise<void>;
  handleDateChange: (
    date: Date,
    products: MovementProduct[],
    selectedProductIds: Set<string>,
    refreshBatchQuantities: (
      prods: MovementProduct[],
      selectedIds: Set<string>,
      asOfDate?: Date,
    ) => Promise<void>,
    setSelectedDateTime: (date: Date) => void,
    /** Якщо 'movement' — перераховує залишки на нову дату; якщо 'now' — не змінює дату залишків */
    stockDateMode?: 'movement' | 'now',
  ) => void;
}

export const useMovementSync = (
  syncStockFromDilovod: () => Promise<any>,
): UseMovementSyncReturn => {
  const [isRefreshingBatches, setIsRefreshingBatches] = useState(false);

  // Таймер debounce для оновлення залишків після зміни дати (1 сек)
  const dateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─────────────────────────────────────────────────────────────────────
  // Допоміжна функція: парсить items з чернетки (рядок або масив)
  // ─────────────────────────────────────────────────────────────────────

  const parseDraftItems = (savedDraft: MovementDraft): any[] => {
    try {
      if (typeof savedDraft.items === 'string') {
        return JSON.parse(savedDraft.items);
      }
      if (Array.isArray(savedDraft.items)) {
        return savedDraft.items;
      }
    } catch (parseErr) {
      LoggingService.warehouseMovementLog(`⚠️ Помилка розпарсення items: ${parseErr}`);
    }
    return [];
  };

  // ─────────────────────────────────────────────────────────────────────
  // Оновлення залишків з нашої БД
  // ─────────────────────────────────────────────────────────────────────

  const handleSyncBalances = useCallback(
    async (
      loadProducts: () => Promise<MovementProduct[]>,
      savedDraft: MovementDraft | null,
      loadDraftIntoProducts: (prods: MovementProduct[], items: any[], asOfDate?: Date) => Promise<void>,
      refreshStockData?: (prods: MovementProduct[], asOfDate?: Date) => Promise<void>,
      stockDateMode?: 'movement' | 'now',
      selectedDateTime?: Date,
    ): Promise<void> => {
      try {
        const prods = await loadProducts();

        if (savedDraft && prods.length > 0) {
          const draftItems = parseDraftItems(savedDraft);
          if (draftItems.length > 0) {
            await loadDraftIntoProducts(prods, draftItems);
          }
        }

        // Якщо залишки показуються на дату переміщення — перезавантажуємо stockData на ту ж дату
        if (stockDateMode === 'movement' && selectedDateTime && refreshStockData && prods.length > 0) {
          await refreshStockData(prods, selectedDateTime);
        }

        ToastService.show({
          title: 'Товари на переміщення оновлено',
          color: 'success',
          hideIcon: false,
        });
        LoggingService.warehouseMovementLog('✅ Залишки оновлено з БД');
      } catch (err: any) {
        const message = err?.message || 'Помилка оновлення';
        ToastService.show({
          title: 'Помилка оновлення залишків',
          description: message,
          color: 'danger',
        });
        LoggingService.warehouseMovementLog(`🚨 Помилка оновлення залишків: ${message}`);
      }
    },
    [],
  );

  // ─────────────────────────────────────────────────────────────────────
  // Синхронізація залишків із зовнішнього Dilovod
  // ─────────────────────────────────────────────────────────────────────

  const handleSyncStockFromDilovod = useCallback(
    async (
      loadProducts: () => Promise<MovementProduct[]>,
      savedDraft: MovementDraft | null,
      loadDraftIntoProducts: (prods: MovementProduct[], items: any[], asOfDate?: Date) => Promise<void>,
    ): Promise<void> => {
      try {
        ToastService.show({
          title: 'Синхронізуємо залишки з Dilovod',
          description: 'Будь ласка, зачекайте...',
          color: 'primary',
          hideIcon: false,
          icon: 'refresh-cw',
          iconSpin: true,
          timeout: 10000,
        });
        LoggingService.warehouseMovementLog('🔄 Запит синхронізації залишків з Dilovod');

        const result = await syncStockFromDilovod();

        ToastService.show({
          title: 'Синхронізацію завершено',
          description:
            result?.updatedProducts !== undefined
              ? `Оновлено товарів: ${result.updatedProducts}`
              : result?.message,
          color: 'success',
          hideIcon: false,
        });
        LoggingService.warehouseMovementLog(
          `✅ Синхронізація Dilovod завершена: ${result?.updatedProducts ?? 0} товарів`,
        );

        const prods = await loadProducts();

        if (savedDraft && prods.length > 0) {
          const draftItems = parseDraftItems(savedDraft);
          if (draftItems.length > 0) {
            await loadDraftIntoProducts(prods, draftItems);
          }
        }
      } catch (err: any) {
        const message = err?.message || 'Помилка синхронізації з Dilovod';
        ToastService.show({
          title: 'Помилка синхронізації Dilovod',
          description: message,
          color: 'danger',
          hideIcon: false,
        });
        LoggingService.warehouseMovementLog(`🚨 Помилка синхронізації Dilovod: ${message}`);
      }
    },
    [syncStockFromDilovod],
  );

  // ─────────────────────────────────────────────────────────────────────
  // Зміна дати документа
  // Оновлює selectedDateTime та з debounce перераховує залишки по партіях
  // ─────────────────────────────────────────────────────────────────────

  const handleDateChange = useCallback(
    (
      date: Date,
      products: MovementProduct[],
      selectedProductIds: Set<string>,
      refreshBatchQuantities: (
        prods: MovementProduct[],
        selectedIds: Set<string>,
        asOfDate?: Date,
      ) => Promise<void>,
      setSelectedDateTime: (date: Date) => void,
      stockDateMode: 'movement' | 'now' = 'now',
    ): void => {
      setSelectedDateTime(date);

      // Скасовуємо попередній таймер
      if (dateDebounceRef.current !== null) {
        clearTimeout(dateDebounceRef.current);
      }

      // Якщо режим "на поточну дату" — залишки не перераховуємо при зміні дати переміщення
      if (stockDateMode === 'now') return;

      // Перераховуємо залишки лише якщо є вибрані товари з партіями
      const hasSelectedWithBatches = products.some(
        p => selectedProductIds.has(p.id) && p.details.batches.length > 0,
      );
      if (!hasSelectedWithBatches) return;

      setIsRefreshingBatches(true);
      dateDebounceRef.current = setTimeout(() => {
        dateDebounceRef.current = null;
        refreshBatchQuantities(products, selectedProductIds, date).finally(() => {
          setIsRefreshingBatches(false);
        });
      }, 1000);
    },
    [],
  );

  return {
    isRefreshingBatches,
    handleSyncBalances,
    handleSyncStockFromDilovod,
    handleDateChange,
  };
};
