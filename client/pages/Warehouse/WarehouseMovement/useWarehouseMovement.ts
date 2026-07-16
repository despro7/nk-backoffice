import { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { LoggingService } from '@/services/LoggingService';
import { useApi } from '@/hooks/useApi';
import { useMovementProducts } from './hooks/useMovementProducts';
import { useMovementDraftState } from './hooks/useMovementDraftState';
import { useMovementSync } from './hooks/useMovementSync';
import type { MovementProduct, MovementDraft, MovementStatus, MovementBatch } from './WarehouseMovementTypes';
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
//   * публічні обгортки handleReset / handleSaveDraft /
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

  // Флаг завантаження даних при ініціалізації
  isLoading: boolean;
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
  refreshStockData: (
    allProds: MovementProduct[],
    asOfDate?: Date,
    sourceStorageId?: string,
    destStorageId?: string,
  ) => Promise<void>;
  isRefreshingStock: boolean;
  setIsRefreshingStock: (v: boolean) => void;
  loadHistory: () => Promise<void>;
  loadMovementFromHistory: (doc: any) => Promise<void>;
  handleToggleProduct: (id: string) => void;
  handleProductChange: (id: string, batches: MovementBatch[]) => void;
  handleReset: () => Promise<void>;
  handleSaveDraft: () => Promise<MovementDraft | null>;
  handleSyncBalances: (stockDateMode?: 'movement' | 'now', selectedDateTime?: Date) => Promise<void>;
  handleSyncStockFromDilovod: () => Promise<void>;
  loadDraftObject: (draft: MovementDraft, direction?: { storage: string; storageTo: string }, preloadedProducts?: MovementProduct[]) => Promise<void>;

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

  // Напрямок переміщення (склад-донор → склад-реципієнт)
  storage: string;
  setStorage: (v: string) => void;
  storageTo: string;
  setStorageTo: (v: string) => void;

  // API-функції для дочірніх хуків (useMovementDrafts)
  getDrafts: () => Promise<any>;
  deleteDraft: (id: number) => Promise<any>;
}

export const useWarehouseMovement = (): UseWarehouseMovementReturn => {
  const api = useApi();

  // Реф для поточної обраної дати документа — використовується в getProductsForMovement
  const selectedDateTimeRef = useRef<Date | null>(null);
  const dateLoadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // true під час початкової ініціалізації — щоб effect [storage, storageTo] не робив
  // зайвий refreshStockData при програмній зміні складу з чернетки (loadDraftObject уже оновлює)
  const initPhaseRef = useRef(true);

  // ─── API-функції (раніше були у useWarehouse.ts) ──────────────────────

  const getProductsForMovement = useCallback(async (): Promise<any> => {
    let path = `${API_BASE}/products-for-movement`;
    if (selectedDateTimeRef.current) {
      path += `?asOfDate=${encodeURIComponent(selectedDateTimeRef.current.toISOString())}`;
    }
    const response = await api.apiCall(path, { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    // Зберігаємо ID складів для використання при створенні чернетки
    if (data?.warehouseConfig) {
      warehouseConfigRef.current = data.warehouseConfig;
    }
    return data;
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

  const updateDraft = useCallback(async (id: number, data: { items: any[]; notes?: string }): Promise<any> => {
    const response = await api.apiCall(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
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

  // ID складів, завантажені разом з товарами (/products-for-movement)
  const warehouseConfigRef = useRef<{ storageFrom: string; storageTo: string } | null>(null);
  // Прапор: напрямок уже застосовано з чернетки (блокує перезапис дефолтом із warehouseConfigRef)
  const draftDirectionAppliedRef = useRef(false);

  // ─── Напрямок переміщення (склад-донор → склад-реципієнт) ────────────
  // Дефолт беремо з серверного warehouseConfig (налаштування Dilovod),
  // якщо він ще не завантажився — фолбек на відомі ID основного/малого складів.
  const DEFAULT_STORAGE_FROM = '1100700000001005';
  const DEFAULT_STORAGE_TO = '1100700000001019';
  const [storage, setStorage] = useState<string>(warehouseConfigRef.current?.storageFrom || DEFAULT_STORAGE_FROM);
  const [storageTo, setStorageTo] = useState<string>(warehouseConfigRef.current?.storageTo || DEFAULT_STORAGE_TO);

  // Флаг завантаження даних при ініціалізації
  const [isLoading, setIsLoading] = useState(true);

  const products$ = useMovementProducts(getProductsForMovement);
  const draft$ = useMovementDraftState(createMovement, updateDraft, warehouseConfigRef, { storage, storageTo });
  const sync$ = useMovementSync(syncStockFromDilovod);

  // Оновлюємо реф при зміні дати в draft$
  useEffect(() => {
    selectedDateTimeRef.current = draft$.selectedDateTime ?? null;
  }, [draft$.selectedDateTime]);

  // Очистка debounce таймера при розмонтуванні
  useEffect(() => {
    return () => {
      if (dateLoadDebounceRef.current) {
        clearTimeout(dateLoadDebounceRef.current as any);
        dateLoadDebounceRef.current = null;
      }
    };
  }, []);

  // ─── Локальний стан оркестратора ─────────────────────────────────────

  const [activeField, setActiveField] = useState<{ productId: string; field: string } | null>(null);
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [completedMovements, setCompletedMovements] = useState<MovementDraft[]>([]);
  const [loadingCompleted, setLoadingCompleted] = useState(false);

  // Синхронізуємо дефолтний напрямок із серверним warehouseConfig, коли той підвантажиться.
  // Застосовуємо лише якщо юзер ще не змінив напрямок вручну (порівнюємо з поточним дефолтом).
  useEffect(() => {
    // Якщо напрямок уже застосовано з чернетки — не перезаписуємо дефолтом із warehouseConfig
    if (draftDirectionAppliedRef.current) return;
    const cfg = warehouseConfigRef.current;
    if (!cfg?.storageFrom || !cfg?.storageTo) return;
    setStorage((prev) => (prev === DEFAULT_STORAGE_FROM ? cfg!.storageFrom : prev));
    setStorageTo((prev) => (prev === DEFAULT_STORAGE_TO ? cfg!.storageTo : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseConfigRef.current?.storageFrom, warehouseConfigRef.current?.storageTo]);

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

        // ТИМЧАСОВО (DIAG): сирі дані чернеток із БД — перевіряємо реальні поля напрямку
        console.log('[DIAG] getDrafts raw:', JSON.stringify(
          (draftsData as any)?.drafts?.map((d: any) => ({
            id: d.id, status: d.status,
            source: d.sourceWarehouse, dest: d.destinationWarehouse,
          })),
        ));

        await loadHistory();

        // ─── Пріоритет авто-завантаження: чернетка → останній запис → стартова сторінка ───
        // 1. Спочатку шукаємо активну чернетку користувача (status === 'active')
        // ─── АВТО-ЗАВАНТАЖЕННЯ ЧЕРНЕТКИ ─────────────────────────────────────
        // Пріоритет: найновіша чернетка (status: 'active' або 'draft') → нова сесія
        // ВАЖЛИВО: finalized записи НЕ завантажуються автоматично!
        if (!wasDismissed) {
          // 1. Шукаємо найновішу активну/чернетку (status: 'active' або 'draft')
          // Сортуємо за draftCreatedAt DESC, беремо перший
          const allDrafts = draftsData?.drafts || [];
          const sortedDrafts = [...allDrafts].sort((a: any, b: any) => 
            new Date(b.draftCreatedAt).getTime() - new Date(a.draftCreatedAt).getTime()
          );
          const latestDraft = sortedDrafts.find((d: any) => d.status === 'active' || d.status === 'draft');
          
          if (latestDraft) {
            LoggingService.warehouseMovementLog(`🔄 Авто-завантаження найновішої чернетки #${latestDraft.id} (status: ${latestDraft.status})`);
            
            const draftStorage = latestDraft.sourceWarehouse;
            const draftStorageTo = latestDraft.destinationWarehouse;
            
            // ЛОГУВАННЯ: що ми отримали про напрямок
            LoggingService.warehouseMovementLog(`📌 Напрямок з чернетки: ${draftStorage} → ${draftStorageTo}`);
            
            // Оновлюємо стани складів
            if (draftStorage && draftStorageTo) {
              setStorage(draftStorage);
              setStorageTo(draftStorageTo);
              draftDirectionAppliedRef.current = true; // блокуємо перезапис дефолтом
            }
            
            // ВАЖЛИВЕ: передаємо preloadedProducts, щоб не робити зайвий запит
            await loadDraftObject(
              latestDraft,
              { storage: draftStorage || storage, storageTo: draftStorageTo || storageTo },
              productsData ?? undefined,
            );
            
            // Додаткове логування для діагностики
            LoggingService.warehouseMovementLog(`✅ Завантажена чернетка #${latestDraft.id}: ${products$.products.filter(p => products$.selectedProductIds.has(p.id)).length} вибраних товарів`);
          } else if (completedMovements.length > 0) {
            // Немає активних/чернеток, але є завершені записи — беремо останній
            const lastCompleted = completedMovements[completedMovements.length - 1];
            LoggingService.warehouseMovementLog(`🔄 Авто-завантаження останнього завершеного запису #${lastCompleted.id}`);
            // Автоматично обираємо склади з запису
            if (lastCompleted.sourceWarehouse && lastCompleted.destinationWarehouse) {
              setStorage(lastCompleted.sourceWarehouse);
              setStorageTo(lastCompleted.destinationWarehouse);
            }
            // Оновлюємо залишки для правильного напряму
            if (productsData && productsData.length > 0) {
              await products$.refreshStockData(
                productsData,
                undefined,
                lastCompleted.sourceWarehouse || storage,
                lastCompleted.destinationWarehouse || storageTo,
              );
            }
          } else {
            // Немає жодної чернетки/запису — оновлюємо залишки для дефолтного напряму
            if (productsData && productsData.length > 0) {
              await products$.refreshStockData(productsData, undefined, storage, storageTo);
            }
          }
        }
      } catch (err: any) {
        LoggingService.warehouseMovementLog(`Помилка ініціалізації: ${err?.message}`);
      } finally {
        // Ініціалізація завершена — тепер effect [storage, storageTo] реагує на зміну користувача
        initPhaseRef.current = false;
        setIsLoading(false);
      }
    };

    initData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Оновлюємо sourceStock/destStock при зміні напряму переміщення (синхронно з MovementDirectionSelector).
  // Пропускаємо перший запуск та програмну зміну складу під час initData —
  // там refreshStockData уже викликається через loadDraftObject / явний блок.
  useEffect(() => {
    if (initPhaseRef.current) return;
    if (products$.products.length > 0) {
      products$.refreshStockData(products$.products, undefined, storage, storageTo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage, storageTo]);

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
    draft$.handleSaveDraft(products$.summaryItems, products$.lastSavedSnapshotRef, { storage, storageTo });

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
      storage,
      storageTo,
    );

  const handleSyncStockFromDilovod = (): Promise<void> =>
    sync$.handleSyncStockFromDilovod(
      products$.loadProducts,
      draft$.savedDraft,
      products$.loadDraftIntoProducts,
    );

  const handleDateChange = (date: Date, stockDateMode?: 'movement' | 'now'): void => {
    // Зберігаємо дату в чернетці та оновлюємо реф для запиту товарів
    draft$.setSelectedDateTime(date);
    selectedDateTimeRef.current = date;

    if (stockDateMode === 'movement') {
      // Показуємо індикатор завантаження одразу, ще до debounce,
      // щоб уникнути візуального скидання залишків на 0.
      products$.setIsRefreshingStock(true);
      // Debounce: чекаємо 1 секунду після останньої зміни дати, щоб не кидати одразу запит
      if (dateLoadDebounceRef.current) {
        clearTimeout(dateLoadDebounceRef.current as any);
      }
      dateLoadDebounceRef.current = setTimeout(() => {
        dateLoadDebounceRef.current = null;
        // Завантажуємо список товарів на цю дату (щоб включити застарілі з наявністю залишку),
        // потім перераховуємо партії та stockData через useMovementSync
        products$.loadProducts().then(() => {
          sync$.handleDateChange(
            date,
            products$.products,
            products$.selectedProductIds,
            products$.refreshBatchQuantities,
            draft$.setSelectedDateTime,
            stockDateMode,
            products$.refreshStockData,
            storage,
            storageTo,
          );
        }).catch(() => {
          // Якщо loadProducts впав — гарантовано ховаємо спінер
          products$.setIsRefreshingStock(false);
        });
      }, 1000);
      return;
    }

    sync$.handleDateChange(
      date,
      products$.products,
      products$.selectedProductIds,
      products$.refreshBatchQuantities,
      draft$.setSelectedDateTime,
      stockDateMode,
      products$.refreshStockData,
      storage,
      storageTo,
    );
  };

  const loadMovementFromHistory = (doc: any): Promise<void> =>
    draft$.loadMovementFromHistory(
      doc,
      products$.loadProducts,
      products$.setProducts,
      products$.setSelectedProductIds,
      products$.lastSavedSnapshotRef,
      products$.refreshBatchQuantities,
    );

  const loadDraftObject = (draft: MovementDraft, direction?: { storage: string; storageTo: string }, preloadedProducts?: MovementProduct[]): Promise<void> =>
    draft$.loadDraftObject(
      draft,
      products$.loadProducts,
      products$.loadDraftIntoProducts,
      (prods, sourceStorageId, destStorageId) =>
        products$.refreshStockData(prods, undefined, sourceStorageId, destStorageId),
      direction,
      preloadedProducts,
    );

  // Обгортка loadProducts: після завантаження товарів одразу оновлюємо
  // залишки (stockData) для поточного напрямку переміщення. Без цього кнопка
  // «Розпочати переміщення» на стартовому екрані відкривала накладну з порожніми
  // залишками (initData робить refreshStockData окремим викликом, а прямий виклик
  // loadProducts — ні).
  const loadProductsWithStock = useCallback(async (): Promise<MovementProduct[]> => {
    const prods = await products$.loadProducts();
    if (prods.length > 0) {
      await products$.refreshStockData(prods, undefined, storage, storageTo);
    }
    return prods;
  }, [products$, storage, storageTo]);

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

    loadProducts: loadProductsWithStock,
    refreshBatchQuantities: products$.refreshBatchQuantities,
    refreshStockData: (prods, asOfDate, sourceStorageId, destStorageId) =>
      products$.refreshStockData(prods, asOfDate, sourceStorageId, destStorageId),
    isRefreshingStock: products$.isRefreshingStock,
    setIsRefreshingStock: products$.setIsRefreshingStock,
    loadHistory,
    loadMovementFromHistory,
    handleToggleProduct: products$.handleToggleProduct,
    handleProductChange: products$.handleProductChange,
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

    // Напрямок переміщення (склад-донор → склад-реципієнт)
    storage,
    setStorage,
    storageTo,
    setStorageTo,

    isDirty,

    isLoading,

    getDrafts,
    deleteDraft,
  };
};