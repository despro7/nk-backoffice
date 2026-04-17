import { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { LoggingService } from '@/services/LoggingService';
import { useApi } from '@/hooks/useApi';
import { useMovementProducts } from './hooks/useMovementProducts';
import { useMovementDraftState } from './hooks/useMovementDraftState';
import { useMovementSync } from './hooks/useMovementSync';
import type { MovementProduct, MovementDraft, MovementStatus, MovementBatch } from '../shared/WarehouseMovementTypes';
import type { CreateWarehouseMovementRequest, UpdateWarehouseMovementRequest } from '@/types/warehouse';

const API_BASE = '/api/warehouse';

// ---------------------------------------------------------------------------
// useWarehouseMovement — оркестратор сторінки переміщення товарів
//
// Збирає разом три спеціалізовані хуки:
//   * useMovementProducts  — список товарів, партії, фільтрація, snapshot
//   * useMovementDraftState — чернетка, нотатки, дата, відправка в Dilovod
//   * useMovementSync      — синхронізація залишків і зміна дати з debounce
//
// Також відповідає за:
//   * ініціалізацію при монтуванні (завантаження товарів + чернетки)
//   * обчислення похідних значень (sessionStatus, sessionId, isDirty)
//   * публічні обгортки handleFinish / handleReset / handleSaveDraft /
//     handleSyncBalances / handleSyncStockFromDilovod / handleDateChange /
//     loadMovementFromHistory / loadDraftObject
// ---------------------------------------------------------------------------

export interface UseWarehouseMovementReturn {
  // Стан сесії
  sessionStatus: MovementStatus | null;
  sessionId: number | null;

  // Товари
  products: MovementProduct[];
  productsLoading: boolean;
  productsError: string | null;
  filteredProducts: MovementProduct[];
  openProductId: string | null;

  // Пошук
  searchQuery: string;
  setSearchQuery: (v: string) => void;

  // Коментар до документа (remark у payload Dilovod)
  notes: string;
  setNotes: (v: string) => void;

  // Дата документа
  selectedDateTime: Date;
  setSelectedDateTime: (date: Date) => void;
  isRefreshingBatches: boolean;
  handleDateChange: (date: Date, stockDateMode?: 'movement' | 'now') => void;

  // Модалки підтвердження
  showConfirmFinish: boolean;
  setShowConfirmFinish: (v: boolean) => void;
  showConfirmCancel: boolean;
  setShowConfirmCancel: (v: boolean) => void;

  // Завершені переміщення (відображається у хуку)
  historySessions: MovementDraft[];
  historyLoading: boolean;

  // Handlers
  loadProducts: () => Promise<MovementProduct[]>;
  refreshBatchQuantities: (prods: MovementProduct[], selectedIds: Set<string>, asOfDate?: Date) => Promise<void>;
  refreshStockData: (allProds: MovementProduct[], asOfDate?: Date) => Promise<void>;
  isRefreshingStock: boolean;
  loadHistory: () => Promise<void>;
  loadMovementFromHistory: (doc: any) => Promise<void>;
  handleToggleProduct: (id: string) => void;
  handleProductChange: (id: string, batches: MovementBatch[]) => void;
  handleFinish: () => Promise<void>;
  handleReset: () => Promise<void>;
  handleSaveDraft: () => Promise<MovementDraft | null>;
  handleSyncBalances: (stockDateMode?: 'movement' | 'now', selectedDateTime?: Date) => Promise<void>;
  handleSyncStockFromDilovod: () => Promise<void>;
  loadDraftObject: (draft: MovementDraft) => Promise<void>;

  // Обрані товари (розгорнуті в акордіоні) + їх повні дані для таблиці
  selectedProductIds: Set<string>;
  setSelectedProductIds: (v: Set<string>) => void;
  summaryItems: MovementProduct[];

  // Активне поле вводу
  activeField: { productId: string; field: string } | null;
  setActiveField: (v: { productId: string; field: string } | null) => void;

  // Збережена чернетка
  savedDraft: MovementDraft | null;
  setSavedDraft: (v: MovementDraft | null) => void;
  isSaving: boolean;
  isSending: boolean;

  // Завершені переміщення
  completedMovements: MovementDraft[];
  loadingCompleted: boolean;

  // Статусні флаги
  isDirty: boolean;

  // API-функції для дочірніх хуків (useMovementDrafts)
  getDrafts: () => Promise<any>;
  deleteDraft: (id: number) => Promise<any>;
}

export const useWarehouseMovement = (): UseWarehouseMovementReturn => {
  const api = useApi();

  // ─── API-функції (раніше були у useWarehouse.ts) ──────────────────────

  const getProductsForMovement = useCallback(async (): Promise<any> => {
    const response = await api.apiCall(`${API_BASE}/products-for-movement`, { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, [api]);

  const getDrafts = useCallback(async (): Promise<any> => {
    const response = await api.apiCall(`${API_BASE}/drafts`, { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, [api]);

  const createMovement = useCallback(async (data: CreateWarehouseMovementRequest): Promise<any> => {
    const response = await api.apiCall(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, [api]);

  const updateDraft = useCallback(async (id: number, data: { items: any[]; deviations?: any[]; notes?: string }): Promise<any> => {
    const response = await api.apiCall(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, [api]);

  const sendToDilovod = useCallback(async (id: number): Promise<any> => {
    const response = await api.apiCall(`${API_BASE}/${id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, [api]);

  const getMovements = useCallback(async (params?: { status?: string; warehouse?: string; page?: number; limit?: number }): Promise<any> => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    if (params?.warehouse) searchParams.append('warehouse', params.warehouse);
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    const response = await api.apiCall(`${API_BASE}?${searchParams.toString()}`, { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, [api]);

  const syncStockFromDilovod = useCallback(async (): Promise<any> => {
    const response = await api.apiCall('/api/products/sync-stock', { method: 'POST' });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error || `HTTP ${response.status}`);
    }
    return response.json();
  }, [api]);

  const deleteDraft = useCallback(async (id: number): Promise<any> => {
    const response = await api.apiCall(`${API_BASE}/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, [api]);

  // ─── Спеціалізовані хуки ─────────────────────────────────────────────

  const products$ = useMovementProducts(getProductsForMovement);
  const draft$ = useMovementDraftState(createMovement, updateDraft, sendToDilovod);
  const sync$ = useMovementSync(syncStockFromDilovod);

  // ─── Локальний стан оркестратора ─────────────────────────────────────

  const [activeField, setActiveField] = useState<{ productId: string; field: string } | null>(null);
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [completedMovements, setCompletedMovements] = useState<MovementDraft[]>([]);
  const [loadingCompleted, setLoadingCompleted] = useState(false);

  // ─── Похідні значення ────────────────────────────────────────────────

  const sessionStatus: MovementStatus | null = draft$.savedDraft?.status ?? null;
  const sessionId: number | null = draft$.savedDraft?.id ?? null;

  const isDirty = useMemo(() => {
    // Враховуємо тільки товари, у яких є хоча б одна партія —
    // "порожні" відкриті акордіони не вважаються незбереженими змінами
    const selectedWithBatches = products$.products.filter(
      p => products$.selectedProductIds.has(p.id) && p.details.batches.length > 0,
    );
    if (selectedWithBatches.length === 0) return false;
    if (!draft$.savedDraft) return true;
    const currentSnapshot = JSON.stringify(
      selectedWithBatches.map(p => ({
        id: p.id,
        batches: p.details.batches.map(b => ({
          batchNumber: b.batchNumber,
          boxes: b.boxes,
          portions: b.portions,
        })),
      })),
    );
    return currentSnapshot !== products$.lastSavedSnapshotRef.current;
  }, [draft$.savedDraft, products$.selectedProductIds, products$.products]);

  // ─── Завантаження завершених переміщень ──────────────────────────────

  const loadHistory = async (): Promise<void> => {
    setLoadingCompleted(true);
    try {
      const result = await getMovements({ status: 'finalized', limit: 50 });
      setCompletedMovements(result?.movements || []);
    } catch (err: any) {
      LoggingService.warehouseMovementLog(`Помилка завантаження історії: ${err?.message}`);
    } finally {
      setLoadingCompleted(false);
    }
  };

  // ─── Ініціалізація при монтуванні ────────────────────────────────────

  useEffect(() => {
    const initData = async () => {
      try {
        // Якщо юзер раніше скасував — показуємо StartScreen, товари не завантажуємо
        const wasDismissed = sessionStorage.getItem('warehouse-draft-dismissed') === '1';

        const [productsData, draftsData] = await Promise.all([
          wasDismissed ? Promise.resolve(null) : products$.loadProducts(),
          getDrafts(),
        ]);

        await loadHistory();

        if (!wasDismissed && draftsData?.drafts?.length > 0) {
          const latestDraft: MovementDraft = draftsData.drafts[0];
          draft$.setSavedDraft(latestDraft);

          // Відновлюємо нотатку (без службового суфіксу)
          if (latestDraft.notes) {
            draft$.setNotes(
              latestDraft.notes
                .replace(/(?:\s*\|\s*)?(?:Додано|Оновлено) з Backoffice.*$/, '')
                .trim(),
            );
          }

          // Відновлюємо дату документа
          if (latestDraft.movementDate) {
            draft$.setSelectedDateTime(new Date(latestDraft.movementDate));
          }

          // Відновлюємо партії з чернетки
          let draftItems: any[] = [];
          try {
            if (typeof latestDraft.items === 'string') {
              draftItems = JSON.parse(latestDraft.items);
            } else if (Array.isArray(latestDraft.items)) {
              draftItems = latestDraft.items;
            }
          } catch (parseErr) {
            LoggingService.warehouseMovementLog(`Помилка розпарсення items: ${parseErr}`);
          }

          if (draftItems.length > 0 && productsData) {
            const draftDate = latestDraft.movementDate ? new Date(latestDraft.movementDate) : undefined;
            await products$.loadDraftIntoProducts(productsData, draftItems, draftDate);
          }
        }
      } catch (err: any) {
        LoggingService.warehouseMovementLog(`Помилка ініціалізації: ${err?.message}`);
      }
    };

    initData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Авто-згортання порожніх акордіонів при refresh сторінки ────────
  // Якщо товар відкритий, але жодної партії не додано — при оновленні
  // сторінки (F5) такий акордіон не повинен лишатись у selectedProductIds.
  // Використовуємо ref щоб мати доступ до актуального стану без підписки
  // на його зміни (уникаємо зайвих спрацьовувань під час завантаження).

  const productsRef = useRef(products$.products);
  productsRef.current = products$.products;
  const collapseEmptyRef = useRef(products$.collapseEmptyAccordionsWithProducts);
  collapseEmptyRef.current = products$.collapseEmptyAccordionsWithProducts;

  useEffect(() => {
    const handleBeforeUnload = () => {
      collapseEmptyRef.current(productsRef.current);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Публічні обгортки ────────────────────────────────────────────────

  const handleSaveDraft = (): Promise<MovementDraft | null> =>
    draft$.handleSaveDraft(products$.summaryItems, products$.lastSavedSnapshotRef);

  const handleFinish = (): Promise<void> =>
    draft$.handleFinish(loadHistory);

  const handleReset = async (): Promise<void> => {
    products$.setSelectedProductIds(new Set());
    products$.setProducts([]);
    products$.lastSavedSnapshotRef.current = '';
    await draft$.handleReset();
  };

  const handleSyncBalances = (stockDateMode?: 'movement' | 'now', selectedDateTime?: Date): Promise<void> =>
    sync$.handleSyncBalances(
      products$.loadProducts,
      draft$.savedDraft,
      products$.loadDraftIntoProducts,
      products$.refreshStockData,
      stockDateMode,
      selectedDateTime,
    );

  const handleSyncStockFromDilovod = (): Promise<void> =>
    sync$.handleSyncStockFromDilovod(
      products$.loadProducts,
      draft$.savedDraft,
      products$.loadDraftIntoProducts,
    );

  const handleDateChange = (date: Date, stockDateMode?: 'movement' | 'now'): void =>
    sync$.handleDateChange(
      date,
      products$.products,
      products$.selectedProductIds,
      products$.refreshBatchQuantities,
      draft$.setSelectedDateTime,
      stockDateMode,
    );

  const loadMovementFromHistory = (doc: any): Promise<void> =>
    draft$.loadMovementFromHistory(
      doc,
      products$.loadProducts,
      products$.setProducts,
      products$.setSelectedProductIds,
      products$.lastSavedSnapshotRef,
      products$.refreshBatchQuantities,
    );

  const loadDraftObject = (draft: MovementDraft): Promise<void> =>
    draft$.loadDraftObject(
      draft,
      products$.loadProducts,
      products$.loadDraftIntoProducts,
    );

  // ─── Публічне API ─────────────────────────────────────────────────────

  return {
    sessionStatus,
    sessionId,

    products: products$.products,
    productsLoading: products$.productsLoading,
    productsError: products$.productsError,
    filteredProducts: products$.filteredProducts,
    summaryItems: products$.summaryItems,
    openProductId: null,

    searchQuery: products$.searchQuery,
    setSearchQuery: products$.setSearchQuery,

    notes: draft$.notes,
    setNotes: draft$.setNotes,

    selectedDateTime: draft$.selectedDateTime,
    setSelectedDateTime: draft$.setSelectedDateTime,
    isRefreshingBatches: sync$.isRefreshingBatches,
    handleDateChange,

    showConfirmFinish,
    setShowConfirmFinish,
    showConfirmCancel,
    setShowConfirmCancel,

    historySessions: [],
    historyLoading: false,

    loadProducts: products$.loadProducts,
    refreshBatchQuantities: products$.refreshBatchQuantities,
    refreshStockData: products$.refreshStockData,
    isRefreshingStock: products$.isRefreshingStock,
    loadHistory,
    loadMovementFromHistory,
    handleToggleProduct: products$.handleToggleProduct,
    handleProductChange: products$.handleProductChange,
    handleFinish,
    handleReset,
    handleSaveDraft,
    handleSyncBalances,
    handleSyncStockFromDilovod,
    loadDraftObject,

    selectedProductIds: products$.selectedProductIds,
    setSelectedProductIds: products$.setSelectedProductIds,

    activeField,
    setActiveField,

    savedDraft: draft$.savedDraft,
    setSavedDraft: draft$.setSavedDraft,
    isSaving: draft$.isSaving,
    isSending: draft$.isSending,

    completedMovements,
    loadingCompleted,

    isDirty,

    getDrafts,
    deleteDraft,
  };
};