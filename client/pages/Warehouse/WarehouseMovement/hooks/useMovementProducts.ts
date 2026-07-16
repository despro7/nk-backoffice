import { useState, useCallback, useMemo, useRef } from 'react';
import { LoggingService } from '@/services/LoggingService';
import type { MovementProduct, MovementBatch } from '../WarehouseMovementTypes';

// ---------------------------------------------------------------------------
// useMovementProducts — управління списком товарів для переміщення
//
// Відповідає за:
//   • завантаження товарів з сервера
//   • фільтрацію / вибір товарів (selectedProductIds)
//   • оновлення залишків по партіях (refreshBatchQuantities)
//   • відновлення партій з чернетки (loadDraftIntoProducts)
//   • зміну партій конкретного товару (handleProductChange)
// ---------------------------------------------------------------------------

export interface UseMovementProductsReturn {
  products: MovementProduct[];
  setProducts: React.Dispatch<React.SetStateAction<MovementProduct[]>>;
  productsLoading: boolean;
  productsError: string | null;
  filteredProducts: MovementProduct[];
  summaryItems: MovementProduct[];
  selectedProductIds: Set<string>;
  setSelectedProductIds: (v: Set<string>) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  lastSavedSnapshotRef: React.MutableRefObject<string>;
  loadProducts: () => Promise<MovementProduct[]>;
  handleToggleProduct: (id: string) => void;
  handleProductChange: (id: string, batches: MovementBatch[]) => void;
  refreshBatchQuantities: (
    prods: MovementProduct[],
    selectedIds: Set<string>,
    asOfDate?: Date,
  ) => Promise<void>;
  loadDraftIntoProducts: (prods: MovementProduct[], draftItems: any[], asOfDate?: Date) => Promise<void>;
  /** Оновлює stockData (mainStock/smallStock + sourceStock/destStock) для всіх товарів на задану дату */
  refreshStockData: (
    allProds: MovementProduct[],
    asOfDate?: Date,
    sourceStorageId?: string,
    destStorageId?: string,
  ) => Promise<void>;
  /** true поки виконується refreshStockData */
  isRefreshingStock: boolean;
  /** Дозволяє оркестратору одразу показати індикатор завантаження (до debounce) */
  setIsRefreshingStock: (v: boolean) => void;
  /** Згортає акордіони товарів без партій (не впливають на isDirty) */
  collapseEmptyAccordionsWithProducts: (prods: MovementProduct[]) => void;
}

export const useMovementProducts = (
  getProductsForMovement: () => Promise<any>,
): UseMovementProductsReturn => {
  const [products, setProducts] = useState<MovementProduct[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [isRefreshingStock, setIsRefreshingStock] = useState(false);

  // Snapshot для відстеження незбережених змін (isDirty)
  const lastSavedSnapshotRef = useRef<string>('');

  // ─────────────────────────────────────────────────────────────────────
  // Фільтровані товари за пошуковим запитом
  // ─────────────────────────────────────────────────────────────────────

  const filteredProducts = useMemo(() => {
    return products.filter(
      p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [products, searchQuery]);

  // Обрані (розгорнуті) товари — для таблиці підсумків
  const summaryItems = useMemo(() => {
    return products.filter(p => selectedProductIds.has(p.id));
  }, [products, selectedProductIds]);

  // ─────────────────────────────────────────────────────────────────────
  // Завантаження товарів із сервера
  // ─────────────────────────────────────────────────────────────────────

  const loadProducts = useCallback(async (): Promise<MovementProduct[]> => {
    setProductsLoading(true);
    setProductsError(null);
    // Юзер явно ініціював завантаження — знімаємо прапорець dismissed
    sessionStorage.removeItem('warehouse-draft-dismissed');
    try {
      const result = await getProductsForMovement();
      const prods: MovementProduct[] = result?.products || [];
      // Зберігаємо попередні залишки (stockData), щоб уникнути візуального скидання
      // на 0 під час оновлення списку товарів. Сервер у /products-for-movement завжди
      // повертає sourceStock/destStock = 0, тому беремо їх з поточного стану (за SKU).
      setProducts(prev => {
        const prevBySku = new Map(prev.map(p => [p.sku, p.stockData]));
        return prods.map(p => ({
          ...p,
          stockData: prevBySku.get(p.sku) ?? p.stockData,
        }));
      });
      return prods;
    } catch (err: any) {
      const message = err?.message || 'Помилка завантаження товарів';
      setProductsError(message);
      LoggingService.warehouseMovementLog(`🚨 Помилка завантаження товарів: ${message}`);
      return [];
    } finally {
      setProductsLoading(false);
    }
  }, [getProductsForMovement]);

  // ─────────────────────────────────────────────────────────────────────
  // Toggle товару (розгорнути / згорнути акордіон)
  // ─────────────────────────────────────────────────────────────────────

  const handleToggleProduct = useCallback((id: string) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // ─────────────────────────────────────────────────────────────────────
  // Згортає акордіони товарів, у яких немає жодної партії.
  // Викликається при навігації / оновленні сторінки, щоб "порожні"
  // відкриті акордіони не вважались активними й не впливали на isDirty.
  // ─────────────────────────────────────────────────────────────────────

  const collapseEmptyAccordionsWithProducts = useCallback((prods: MovementProduct[]) => {
    setSelectedProductIds(prev => {
      const hasChanged = Array.from(prev).some(id => {
        const product = prods.find(p => p.id === id);
        return !product || product.details.batches.length === 0;
      });
      if (!hasChanged) return prev; // без змін — повертаємо той самий Set (без ре-рендеру)

      const next = new Set(prev);
      for (const id of prev) {
        const product = prods.find(p => p.id === id);
        if (!product || product.details.batches.length === 0) {
          next.delete(id);
        }
      }
      return next;
    });
  }, []);

  // ─────────────────────────────────────────────────────────────────────
  // Оновлення масиву партій конкретного товару
  // ─────────────────────────────────────────────────────────────────────

  const handleProductChange = useCallback((id: string, batches: MovementBatch[]) => {
    setProducts(prev =>
      prev.map(p => {
        if (p.id === id || p.sku === id) {
          return { ...p, details: { ...p.details, batches } };
        }
        return p;
      }),
    );
  }, []);

  // ─────────────────────────────────────────────────────────────────────
  // Оновлення актуальних залишків по партіях
  // Запитує /api/warehouse/batch-numbers/:sku для кожного вибраного SKU
  // і проставляє актуальний quantity / batchId по batchNumber
  // Запити виконуються ПОСЛІДОВНО — Dilovod блокує паралельні сесії
  // ─────────────────────────────────────────────────────────────────────

  const refreshBatchQuantities = useCallback(
    async (
      prods: MovementProduct[],
      selectedIds: Set<string>,
      asOfDate?: Date,
    ): Promise<void> => {
      const selectedProds = prods.filter(
        p => selectedIds.has(p.id) && p.details.batches.length > 0,
      );
      if (selectedProds.length === 0) return;

      LoggingService.warehouseMovementLog(
        `🔄 Оновлення залишків по партіях для ${selectedProds.length} товарів...`,
      );

      const quantityMap = new Map<
        string,
        Map<string, { quantity: number; batchId: string }>
      >();

      for (const product of selectedProds) {
        try {
          const url = new URL(
            `/api/warehouse/batch-numbers/${encodeURIComponent(product.sku)}`,
            window.location.origin,
          );
          if (asOfDate) {
            url.searchParams.set('asOfDate', asOfDate.toISOString());
          }
          const response = await fetch(url.toString(), {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();

          const batchMap = new Map<string, { quantity: number; batchId: string }>();
          (data.batches || []).forEach(
            (b: { batchId: string; batchNumber: string; quantity: number }) => {
              batchMap.set(b.batchNumber, { quantity: b.quantity, batchId: b.batchId });
            },
          );
          quantityMap.set(product.sku, batchMap);
        } catch (err) {
          LoggingService.warehouseMovementLog(
            `⚠️ Не вдалося оновити залишки для SKU ${product.sku}: ${err}`,
          );
        }
      }

      // Проставляємо оновлені quantity та batchId у products state.
      // Беремо за основу `prev` (найновіший стан React), щоб НЕ втратити
      // щойно встановлені boxes/portions з чернетки, якщо аргумент `prods`
      // виявився застарілим (наприклад, старий стан з порожніми batches
      // під час синхронного initData, коли ефект [sessionStatus] викликає
      // refreshBatchQuantities ще до оновлення mov.products).
      // Мержимо: quantity/batchId — з API (batchMap), boxes/portions — з prev.
      // Якщо prev не має партій для SKU, фолбек на prods.
      setProducts(prev =>
        prev.map(product => {
          const batchMap = quantityMap.get(product.sku);
          if (!batchMap) return product;

          // Базові партії: пріоритет у prev (зберігає boxes/portions з чернетки)
          const baseBatches =
            product.details.batches.length > 0
              ? product.details.batches
              : (prods.find(p => p.sku === product.sku)?.details.batches ?? []);

          if (baseBatches.length === 0) return product;

          const updatedBatches = baseBatches.map(batch => {
            const fromApi = batchMap.get(batch.batchNumber);
            return {
              ...batch,
              quantity: fromApi?.quantity ?? batch.quantity,
              batchId: fromApi?.batchId ?? batch.batchId,
            };
          });

          return { ...product, details: { ...product.details, batches: updatedBatches } };
        }),
      );

      LoggingService.warehouseMovementLog('✅ Залишки по партіях оновлено');
    },
    [],
  );

  // ─────────────────────────────────────────────────────────────────────
  // Відновлення партій з даних чернетки (або документа з Dilovod)
  // Групує рядки за SKU і створює масив партій для кожного товару
  // ─────────────────────────────────────────────────────────────────────

  const loadDraftIntoProducts = useCallback(
    async (prods: MovementProduct[], draftItems: any[], asOfDate?: Date): Promise<void> => {
      if (!Array.isArray(draftItems)) return;

      // Групуємо рядки по SKU (один товар може мати кілька партій)
      const itemsBySkuMap = new Map<string, any[]>();
      draftItems.forEach(item => {
        const existing = itemsBySkuMap.get(item.sku) || [];
        existing.push(item);
        itemsBySkuMap.set(item.sku, existing);
      });

      const updated = prods.map(product => {
        const skuItems = itemsBySkuMap.get(product.sku);
        if (!skuItems || skuItems.length === 0) return product;

        const forecast = skuItems[0].forecast ?? product.details.forecast;

        // quantity = 0 — актуальне значення оновимо нижче через refreshBatchQuantities
        const batches: MovementBatch[] = skuItems.map((item, idx) => {
          // Якщо boxQuantity=0, але є totalPortions — перераховуємо через portionsPerBox.
          // Це виправляє старі записи, де всі порції зберігались у portionQuantity без поділу.
          const rawBoxes: number = item.boxQuantity ?? 0;
          const rawPortions: number = item.portionQuantity ?? 0;
          const total: number = item.totalPortions ?? (rawBoxes * product.portionsPerBox + rawPortions);
          const boxes = rawBoxes > 0 ? rawBoxes : Math.floor(total / (product.portionsPerBox || 1));
          const portions = rawBoxes > 0 ? rawPortions : total % (product.portionsPerBox || 1);

          // ТИМЧАСОВО (DIAG): що мапиться для кожної партії
          console.log('[DIAG] map batch', product.sku, JSON.stringify({
            rawBoxes, rawPortions, total, boxes, portions,
            batchId: item.batchId, batchNumber: item.batchNumber, batchStorage: item.batchStorage,
          }));

          return {
            id: `batch-${product.sku}-${idx}`,
            batchId: item.batchId || '',
            batchNumber: item.batchNumber || '',
            storage: item.batchStorage || '',
            quantity: 0,
            boxes,
            portions,
          };
        });

        return { ...product, details: { ...product.details, batches, forecast } };
      });

      setProducts(updated);

      const selectedIds = new Set(
        Array.from(itemsBySkuMap.keys())
          .map(sku => prods.find(p => p.sku === sku)?.id ?? null)
          .filter((id): id is string => id !== null),
      );
      setSelectedProductIds(selectedIds);

      // Зберігаємо snapshot для відстеження наступних змін
      lastSavedSnapshotRef.current = JSON.stringify(
        updated
          .filter(p => selectedIds.has(p.id))
          .map(p => ({
            id: p.id,
            batches: p.details.batches.map(b => ({
              batchNumber: b.batchNumber,
              boxes: b.boxes,
              portions: b.portions,
            })),
          })),
      );

      // Одразу оновлюємо актуальні залишки з сервера
      await refreshBatchQuantities(updated, selectedIds, asOfDate);
    },
    [refreshBatchQuantities],
  );

  // ─────────────────────────────────────────────────────────────────────
  // Оновлення stockData (mainStock / smallStock) для всіх товарів у списку
  // Робить один запит до /api/warehouse/stock-snapshot з усіма SKU
  // Якщо asOfDate не передана — перезавантажує товари з БД (поточна дата)
  // ─────────────────────────────────────────────────────────────────────

  const refreshStockData = useCallback(
    async (
      allProds: MovementProduct[],
      asOfDate?: Date,
      sourceStorageId?: string,
      destStorageId?: string,
    ): Promise<void> => {
      // Показуємо індикатор завантаження одразу, навіть якщо список порожній
      // (щоб уникнути "зависання" спінера, якщо виклик завершиться достроково).
      setIsRefreshingStock(true);
      try {
        if (allProds.length === 0) {
          LoggingService.warehouseMovementLog(`📊 refreshStockData: список товарів порожній`);
          return;
        }

        LoggingService.warehouseMovementLog(
          `📊 Оновлення stockData для ${allProds.length} товарів${asOfDate ? ` на дату ${asOfDate.toLocaleString('uk-UA')}` : ' (поточні залишки)'}${sourceStorageId ? ` (напрям: ${sourceStorageId} → ${destStorageId})` : ''}...`,
        );

        const skus = allProds.map(p => p.sku).join(',');

        // ДІАГНОСТИКА: що ми запитуємо
        const baseUrl = new URL('/api/warehouse/stock-snapshot', window.location.origin);
        baseUrl.searchParams.set('skus', skus);
        if (asOfDate) {
          baseUrl.searchParams.set('asOfDate', asOfDate.toISOString());
        }
        LoggingService.warehouseMovementLog(`📌 Запит до: ${baseUrl.toString()}`);

        const r = await fetch(baseUrl.toString(), {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const baseData = await r.json();

        const stocks: Record<string, { mainStock: number; smallStock: number; storages?: Record<string, number> }> = baseData.stocks ?? {};

        // ДІАГНОСТИКА: що отримали
        LoggingService.warehouseMovementLog(`📌 Отримано stockSnapshot: ${Object.keys(stocks).length} SKU`);

        setProducts(prev => {
          const updated = prev.map(p => {
            const s = stocks[p.sku];
            if (!s) {
              LoggingService.warehouseMovementLog(`⚠️ SKU ${p.sku} не знайдено в stockSnapshot`);
              return p;
            }
            const storages = s.storages ?? {};
            const sourceStock = sourceStorageId ? (storages[sourceStorageId] ?? 0) : 0;
            const destStock = destStorageId ? (storages[destStorageId] ?? 0) : 0;
            
            // ДІАГНОСТИКА: що саме підставляємо
            if (sourceStock !== p.stockData?.sourceStock || destStock !== p.stockData?.destStock) {
              LoggingService.warehouseMovementLog(`📌 SKU ${p.sku}: ${p.stockData?.sourceStock ?? 0} → ${sourceStock} (source), ${p.stockData?.destStock ?? 0} → ${destStock} (dest)`);
            }
            
            return {
              ...p,
              stockData: {
                mainStock: s.mainStock,
                smallStock: s.smallStock,
                sourceStock,
                destStock,
              },
            };
          });
          return updated;
        });

        LoggingService.warehouseMovementLog(`✅ stockData оновлено для ${allProds.length} товарів (1 запит)`);
      } catch (err: any) {
        LoggingService.warehouseMovementLog(`🚨 Помилка оновлення stockData: ${err?.message}`);
        throw err;
      } finally {
        setIsRefreshingStock(false);
      }
    },
    [],
  );

  return {
    products,
    setProducts,
    productsLoading,
    productsError,
    filteredProducts,
    summaryItems,
    selectedProductIds,
    setSelectedProductIds,
    searchQuery,
    setSearchQuery,
    lastSavedSnapshotRef,
    loadProducts,
    handleToggleProduct,
    handleProductChange,
    refreshBatchQuantities,
    refreshStockData,
    isRefreshingStock,
    setIsRefreshingStock,
    loadDraftIntoProducts,
    collapseEmptyAccordionsWithProducts,
  };
};
