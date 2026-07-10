import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ToastService } from '@/services/ToastService';
import { totalPortions, serializeItems, sortItems } from './WarehouseInventoryUtils';
import type { InventoryProduct, InventorySession, InventoryStatus } from './WarehouseInventoryTypes';

// ---------------------------------------------------------------------------
// Повертає весь стан та логіку для сторінки WarehouseInventory
// ---------------------------------------------------------------------------

export interface UseWarehouseInventoryReturn {
  // Стан сесії
  activeTab: 'current' | 'history' | 'archive';
  setActiveTab: (tab: 'current' | 'history' | 'archive') => void;
  sessionStatus: InventoryStatus | null;
  sessionOriginalStatus: InventoryStatus | null;
  sessionId: number | null;
  sessionDate: string | null; // ISO-дата створення активної сесії
  setSessionDate: (date: string | null) => void;
  comment: string;
  setComment: (v: string) => void;
  commentDraft: string;
  setCommentDraft: (v: string) => void;
  isSavingDraft: boolean;

  // Товари
  products: InventoryProduct[];
  productsLoading: boolean;
  productsError: string | null;
  filteredProducts: InventoryProduct[];
  openProductId: string | null;
  openProductIds: Set<string>;

  // Матеріали
  materials: InventoryProduct[];
  materialsLoading: boolean;
  materialsError: string | null;
  filteredMaterials: InventoryProduct[];
  openMaterialId: string | null;
  openMaterialIds: Set<string>;
  // Комплекти (sets)
  sets: InventoryProduct[];
  setsLoading: boolean;
  setsError: string | null;
  filteredSets: InventoryProduct[];
  openSetId: string | null;
  openSetIds: Set<string>;
  setCompositionBySku: Record<string, any[]>;

  // Пошук і сортування
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  selectedCategory: string;
  setSelectedCategory: (v: string) => void;
  categoryOptions: string[];
  sortBy: 'name' | 'sku' | 'balance' | 'deviation';
  setSortBy: (v: 'name' | 'sku' | 'balance' | 'deviation') => void;
  sortDirection: 'asc' | 'desc';
  setSortDirection: (v: 'asc' | 'desc') => void;
  showOutdated: boolean;
  setShowOutdated: (v: boolean) => void;

  // Прогрес
  checkedCount: number;
  totalCount: number;
  progressPercent: number;
  checkedSetsCount: number;
  totalSetsCount: number;
  setsProgressPercent: number;
  checkedMaterialsCount: number;
  totalMaterialsCount: number;
  materialsProgressPercent: number;
  totalCheckedAll: number;
  totalAll: number;
  totalProgressPercent: number;
  deviationCount: number;
  deviationMaterialsCount: number;
  deviationSetsCount: number;

  // Модалки
  showConfirmFinish: boolean;
  setShowConfirmFinish: (v: boolean) => void;
  showConfirmCancel: boolean;
  setShowConfirmCancel: (v: boolean) => void;
  showCommentModal: boolean;
  setShowCommentModal: (v: boolean) => void;
  /** Підтвердження при збереженні чернетки, якщо є непідтверджені позиції */
  showConfirmSaveUnconfirmed: boolean;
  setShowConfirmSaveUnconfirmed: (v: boolean) => void;
  /** Викликати підтвердження (save/finish) — користувач погодився продовжити незважаючи на непідтверджені позиції */
  handleConfirmUnconfirmedAction: () => Promise<void>;

  // Історія
  historySessions: InventorySession[];
  historyLoading: boolean;
  // Архів (видалені записи) — доступно лише адміну
  archiveSessions: InventorySession[];
  archiveLoading: boolean;

  // Handlers
  loadProducts: () => Promise<InventoryProduct[]>;
  loadMaterials: () => Promise<InventoryProduct[]>;
  loadSets: (asOfDate?: Date) => Promise<InventoryProduct[]>;
  loadHistory: () => Promise<void>;
  loadArchive: () => Promise<void>;
  handleStartSession: () => Promise<void>;
  handleToggleProduct: (id: string) => void;
  handleToggleMaterial: (id: string) => void;
  handleToggleSet: (id: string) => void;
  handleEnterPressProduct: (currentProductId: string) => void;
  handleEnterPressMaterial: (currentMaterialId: string) => void;
  handleEnterPressSet: (currentSetId: string) => void;
  handleProductChange: (id: string, field: 'boxCount' | 'actualCount' | 'boxCountGp' | 'actualCountGp', value: number) => void;
  handleSetChange: (id: string, field: 'boxCount' | 'actualCount' | 'boxCountGp' | 'actualCountGp', value: number) => void;
  handleMaterialChange: (id: string, field: 'boxCount' | 'actualCount' | 'boxCountGp' | 'actualCountGp', value: number) => void;
  handleCheckProduct: (id: string) => void;
  handleCheckSet: (id: string) => void;
  handleCheckMaterial: (id: string) => void;
  /** Скинути введені значення (boxCount, actualCount) для позиції — використовує для кнопки "обнулити" */
  handleResetItemValues: (id: string) => void;
  handleFinish: () => Promise<void>;
  handleReset: () => Promise<void>;
  handleCloseView: () => Promise<void>;
  handleSaveDraft: (force?: boolean) => Promise<void>;
  /** Викликати, коли користувач підтвердив збереження незавершених позицій */
  handleConfirmSaveDraft: () => Promise<void>;
  handleSaveComment: () => void;
  /** Оновлює залишки "За обліком" з Dilovod на вказану дату + встановлює isDirty */
  handleSessionDateChange: (date: Date) => void;
  /** Адмін: завантажує чужу сесію в поточний перегляд для редагування */
  handleAdminLoadSession: (session: InventorySession) => Promise<void>;
  /** Адмін: відновити архівну сесію */
  handleAdminRestoreSession: (sessionId: string) => Promise<void>;
  /** Адмін: остаточно видалити сесію з БД */
  handleAdminDeletePermanently: (sessionId: string) => Promise<void>;
  /** true поки виконується запит на оновлення залишків */
  isRefreshingBalances: boolean;
  /** true — є незбережені зміни відносно останнього збереження/завантаження */
  isDirty: boolean;
  /** true — поточна сесія редагується (active) або адмін редагує завершену */
  isEditable: boolean;
}

export const useWarehouseInventory = (isAdmin: boolean = false): UseWarehouseInventoryReturn => {
  const [activeTab, setActiveTab] = useState<'current' | 'history' | 'archive'>('current');
  const [sessionStatus, setSessionStatus] = useState<InventoryStatus | null>(null);
  const [sessionOriginalStatus, setSessionOriginalStatus] = useState<InventoryStatus | null>(null);
  /** ID поточної сесії в БД (null = ще не збережена) */
  const [sessionId, setSessionId] = useState<number | null>(null);
  /** Дата створення активної сесії (ISO-рядок) */
  const [sessionDate, setSessionDate] = useState<string | null>(null);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('Усі категорії');
  const [sortBy, setSortBy] = useState<'name' | 'sku' | 'balance' | 'deviation'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showOutdated, setShowOutdated] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [materials, setMaterials] = useState<InventoryProduct[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState<string | null>(null);
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [openMaterialId, setOpenMaterialId] = useState<string | null>(null);
  // Нові множини відкритих елементів, щоб дозволити розкривати багато рядків одночасно
  const [openProductIds, setOpenProductIds] = useState<Set<string>>(new Set());
  const [openMaterialIds, setOpenMaterialIds] = useState<Set<string>>(new Set());
  // Sets (готові комплекти)
  const [sets, setSets] = useState<InventoryProduct[]>([]);
  const [setsLoading, setSetsLoading] = useState(false);
  const [setsError, setSetsError] = useState<string | null>(null);
  const [openSetId, setOpenSetId] = useState<string | null>(null);
  const [openSetIds, setOpenSetIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [comment, setComment] = useState('');
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [showConfirmSaveUnconfirmed, setShowConfirmSaveUnconfirmed] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [historySessions, setHistorySessions] = useState<InventorySession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [archiveSessions, setArchiveSessions] = useState<InventorySession[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [isRefreshingBalances, setIsRefreshingBalances] = useState(false);
  /** Debounce-таймер для оновлення залишків після зміни дати (1 сек) */
  const balancesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Якщо користувач підтвердив продовжити збереження незавершених позицій — в цій змінній зберігаємо, що саме підтверджено
  // 'save' | 'finish' | null
  const pendingUnconfirmedActionRef = useRef<'save' | 'finish' | null>(null);
  /**
   * Ref для refreshSystemBalances — щоб loadDraft/handleAdminLoadSession могли викликати функцію,
   * яка оголошується пізніше (уникнення TDZ для const useCallback).
   */
  const refreshSystemBalancesRef = useRef<(asOfDate: Date, overrideProducts?: InventoryProduct[], overrideMaterials?: InventoryProduct[]) => Promise<void>>(async () => {});

  /**
   * Snapshot серіалізованих items на момент останнього збереження або завантаження.
   * Використовується для визначення isDirty.
   * null = сесія неактивна (немає чого порівнювати).
   * ВАЖЛИВО: useState (не useRef) — щоб зміна тригерила перерахунок isDirty.
   */
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(null);

  const setCompositionBySku = useMemo(() => {
    return sets.reduce<Record<string, any[]>>((accumulator, setItem) => {
      if (setItem.sku) {
        accumulator[setItem.sku] = Array.isArray(setItem.componentsSnapshot) ? setItem.componentsSnapshot : [];
      }
      return accumulator;
    }, {});
  }, [sets]);

  // ---------------------------------------------------------------------------
  // API: завантаження товарів
  // ---------------------------------------------------------------------------

  const loadProducts = useCallback(async (): Promise<InventoryProduct[]> => {
    setProductsLoading(true);
    setProductsError(null);
    try {
      const res = await fetch('/api/warehouse/inventory/products', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const loaded: InventoryProduct[] = (data.products ?? []).map((p: any) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        categoryName: p.categoryName ?? 'Без категорії',
        isOutdated: !!p.isOutdated,
        systemBalance: p.systemBalance,
        systemBalanceGp: p.systemBalanceGp ?? 0,
        isBalanceRefreshing: false,
        unit: p.unit as 'portions' | 'pcs',
        portionsPerBox: p.portionsPerBox,
        actualCount: null,
        boxCount: null,
        actualCountGp: null,
        boxCountGp: null,
        checked: false,
      }));
      setProducts(loaded);
      return loaded;
    } catch (err: any) {
      setProductsError(err.message ?? 'Помилка завантаження товарів');
      return [];
    } finally {
      setProductsLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // API: завантаження матеріалів
  // ---------------------------------------------------------------------------

  const loadMaterials = useCallback(async (): Promise<InventoryProduct[]> => {
    setMaterialsLoading(true);
    setMaterialsError(null);
    try {
      const res = await fetch('/api/warehouse/inventory/materials', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const loaded: InventoryProduct[] = (data.materials ?? []).map((m: any) => ({
        id: m.id,
        sku: m.sku,
        name: m.name,
        systemBalance: m.systemBalance,
        systemBalanceGp: m.systemBalanceGp ?? 0,
        isBalanceRefreshing: false,
        unit: m.unit as 'portions' | 'pcs',
        portionsPerBox: m.portionsPerBox,
        actualCount: null,
        boxCount: null,
        actualCountGp: null,
        boxCountGp: null,
        checked: false,
      }));
      setMaterials(loaded);
      return loaded;
    } catch (err: any) {
      setMaterialsError(err.message ?? 'Помилка завантаження матеріалів');
      return [];
    } finally {
      setMaterialsLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // API: завантаження комплектів (sets)
  // ---------------------------------------------------------------------------

  const loadSets = useCallback(async (asOfDate?: Date): Promise<InventoryProduct[]> => {
    setSetsLoading(true);
    setSetsError(null);
    try {
      const res = await fetch('/api/warehouse/inventory/sets', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let data: any;
      try {
        data = await res.json();
      } catch (err) {
        const text = await res.text();
        throw new Error(`Non-JSON response from /api/warehouse/inventory/sets: ${text.slice(0,200)}`);
      }
      let loaded: InventoryProduct[] = (data.sets ?? []).map((s: any) => ({
        id: s.id,
        sku: s.sku,
        name: s.name,
        isOutdated: !!s.isOutdated,
        systemBalance: s.systemBalance,
        systemBalanceGp: s.systemBalanceGp ?? 0,
        isBalanceRefreshing: false,
        unit: s.unit as 'portions' | 'pcs',
        portionsPerBox: s.portionsPerBox,
        actualCount: null,
        boxCount: null,
        actualCountGp: null,
        boxCountGp: null,
        checked: false,
        componentsSnapshot: Array.isArray(s.componentsSnapshot) ? s.componentsSnapshot : [],
      }));

      const effectiveDate = asOfDate ?? (sessionDate ? new Date(sessionDate) : null);
      if (effectiveDate && !isNaN(effectiveDate.getTime()) && loaded.length > 0) {
        const skus = loaded.map((set) => set.sku).filter(Boolean).join(',');
        if (skus) {
          const snapshotUrl = new URL('/api/warehouse/stock-snapshot', window.location.origin);
          snapshotUrl.searchParams.set('skus', skus);
          snapshotUrl.searchParams.set('asOfDate', effectiveDate.toISOString());

          const snapshotRes = await fetch(snapshotUrl.toString(), { credentials: 'include' });
          if (snapshotRes.ok) {
            const snapshotData = await snapshotRes.json();
            const stocks: Record<string, { mainStock: number; smallStock: number }> = snapshotData.stocks ?? {};
            loaded = loaded.map((set) => {
              const stock = stocks[set.sku];
              return stock ? { ...set, systemBalance: stock.smallStock } : set;
            });
          }
        }
      }

      setSets(loaded);
      return loaded;
    } catch (err: any) {
      setSetsError(err.message ?? 'Помилка завантаження комплектів');
      return [];
    } finally {
      setSetsLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // API: завантаження незавершеної чернетки при mount
  // ---------------------------------------------------------------------------

  const loadDraft = useCallback(async () => {
    try {
      const res = await fetch('/api/warehouse/inventory/draft', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.draft) return;

      const draft = data.draft;
      const draftDateRaw = draft.inventoryDate ?? draft.createdAt ?? null;
      const draftDate = draftDateRaw ? new Date(draftDateRaw) : null;
      const effectiveDate = draftDate && !isNaN(draftDate.getTime()) ? draftDate : undefined;
      // Завантажуємо актуальні залишки з API
      const [freshProducts, freshMaterials, freshSets] = await Promise.all([loadProducts(), loadMaterials(), loadSets(effectiveDate)]);

      // Відновлюємо введені дані з чернетки
      // ВАЖЛИВО: savedProductsMap і savedMaterialsMap — окремо, бо id товарів і матеріалів можуть збігатися
      const savedItems: Array<{ type?: string; id: string; actualCount: number | null; boxCount: number | null; actualCountGp?: number | null; boxCountGp?: number | null; checked: boolean }> = JSON.parse(draft.items ?? '[]');
      const savedProductsMap = new Map(savedItems.filter((i) => i.type === 'product' || i.type === undefined).map((i) => [i.id, i]));
      const savedMaterialsMap = new Map(savedItems.filter((i) => i.type === 'material').map((i) => [i.id, i]));
      const savedSetsMap = new Map(savedItems.filter((i) => i.type === 'set').map((i) => [i.id, i]));

      const mergedProducts = freshProducts.map((p) => {
        const saved = savedProductsMap.get(p.id);
        if (!saved) return p;
        return { ...p, actualCount: saved.actualCount, boxCount: saved.boxCount, actualCountGp: saved.actualCountGp ?? null, boxCountGp: saved.boxCountGp ?? null, checked: saved.checked };
      });

      const mergedMaterials = freshMaterials.map((m) => {
        const saved = savedMaterialsMap.get(m.id);
        if (!saved) return m;
        return { ...m, actualCount: saved.actualCount, boxCount: saved.boxCount, actualCountGp: saved.actualCountGp ?? null, boxCountGp: saved.boxCountGp ?? null, checked: saved.checked };
      });

      setProducts(mergedProducts);
      setMaterials(mergedMaterials);
      const mergedSets = freshSets.map((s) => {
        const saved = savedSetsMap.get(s.id);
        if (!saved) return s;
        return { ...s, actualCount: saved.actualCount, boxCount: saved.boxCount, actualCountGp: saved.actualCountGp ?? null, boxCountGp: saved.boxCountGp ?? null, checked: saved.checked };
      });
      setSets(mergedSets);
      // Відкриваємо всі непідтверджені позиції після завантаження чернетки
      const unconfirmedProductIds = mergedProducts.filter((p) => !p.checked && (p.actualCount !== null || p.boxCount !== null)).map(p => p.id);
      const unconfirmedMaterialIds = mergedMaterials.filter((m) => !m.checked && (m.actualCount !== null || m.boxCount !== null)).map(m => m.id);
      setOpenProductIds(new Set(unconfirmedProductIds));
      setOpenMaterialIds(new Set(unconfirmedMaterialIds));
      const unconfirmedSetIds = mergedSets.filter((s) => !s.checked && (s.actualCount !== null || s.boxCount !== null)).map(s => s.id);
      setOpenSetIds(new Set(unconfirmedSetIds));
      setSessionId(draft.id);
      setSessionStatus(draft.status !== 'revising' ? 'in_progress' : draft.status); // Якщо чернетка була в статусі "редагується", вважаємо її "в процесі" для поточного перегляду
      setSessionOriginalStatus(null);
      // Пріоритет: inventoryDate (обрана користувачем) > createdAt (технічна дата)
      setSessionDate(draft.inventoryDate ?? draft.createdAt ?? null);
      setComment(draft.comment ?? '');
      // Фіксуємо snapshot лише user-editable полів — щоб оновлення systemBalance не тригерило isDirty
      setLastSavedSnapshot(JSON.stringify(
        [...mergedProducts, ...mergedMaterials, ...mergedSets].map(({ id, actualCount, boxCount, checked }) => ({ id, actualCount, boxCount, checked })),
      ));
      // Завантажуємо залишки за обліком на дату чернетки (через ref, щоб уникнути TDZ)
      if (effectiveDate) {
        await refreshSystemBalancesRef.current(effectiveDate, mergedProducts, mergedMaterials);
      }
    } catch {
      // Тихо ігноруємо — просто не відновлюємо чернетку
    }  }, [loadProducts, loadMaterials, loadSets]);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  useEffect(() => {
    void loadSets();
  }, [loadSets]);

  // ---------------------------------------------------------------------------
  // API: завантаження історії
  // ---------------------------------------------------------------------------

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/warehouse/inventory/history', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const sessions: InventorySession[] = (data.sessions ?? []).map((s: any) => ({
        id: String(s.id),
        inventoryDate: s.inventoryDate ?? s.createdAt,
        createdAt: s.createdAt,
        createdBy: String(s.createdBy ?? ''),
        
        status: s.status as InventoryStatus,
        completedAt: s.completedAt ?? null,
        comment: s.comment ?? '',
        items: JSON.parse(s.items ?? '[]'),
      }));
      setHistorySessions(sessions);
    } catch {
      // Тихо ігноруємо
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // API: завантаження архівних (removed) сесій — адмін only
  // ---------------------------------------------------------------------------

  const loadArchive = useCallback(async () => {
    setArchiveLoading(true);
    try {
      const res = await fetch('/api/warehouse/inventory/archive', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const sessions: InventorySession[] = (data.sessions ?? []).map((s: any) => ({
        id: String(s.id),
        inventoryDate: s.inventoryDate ?? s.createdAt,
        createdAt: s.createdAt,
        createdBy: String(s.createdBy ?? ''),
        
        status: s.status as InventoryStatus,
        completedAt: s.completedAt ?? null,
        comment: s.comment ?? '',
        items: JSON.parse(s.items ?? '[]'),
      }));
      setArchiveSessions(sessions);
    } catch {
      // Ігноруємо помилки — покажемо пустий список
    } finally {
      setArchiveLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  // За замовчуванням (showOutdated=false) показуємо застарілі позиції, у яких є залишок
  // за обліком хоча б на одному складі (малий або ГП). Повністю приховані лише ті
  // застарілі, у яких залишків немає на жодному складі.
  const hasStockSomewhere = (item: InventoryProduct): boolean =>
    (item.systemBalance ?? 0) > 0 || (item.systemBalanceGp ?? 0) > 0;

  const visibleProducts = useMemo(
    () => products.filter((p) => showOutdated || !p.isOutdated || p.checked || hasStockSomewhere(p)),
    [products, showOutdated]
  );
  const checkedCount = useMemo(() => visibleProducts.filter((p) => p.checked).length, [visibleProducts]);
  const totalCount = visibleProducts.length;
  const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  const checkedMaterialsCount = useMemo(() => materials.filter((m) => m.checked).length, [materials]);
  const totalMaterialsCount = materials.length;
  const materialsProgressPercent = totalMaterialsCount > 0 ? Math.round((checkedMaterialsCount / totalMaterialsCount) * 100) : 0;

  const visibleSets = useMemo(
    () => sets.filter((s) => showOutdated || !s.isOutdated || s.checked || hasStockSomewhere(s)),
    [sets, showOutdated]
  );
  const checkedSetsCount = useMemo(() => visibleSets.filter((s) => s.checked).length, [visibleSets]);
  const totalSetsCount = visibleSets.length;
  const setsProgressPercent = totalSetsCount > 0 ? Math.round((checkedSetsCount / totalSetsCount) * 100) : 0;

  const totalCheckedAll = checkedCount + checkedMaterialsCount + checkedSetsCount;
  const totalAll = totalCount + totalMaterialsCount + totalSetsCount;
  const totalProgressPercent = totalAll > 0 ? Math.round((totalCheckedAll / totalAll) * 100) : 0;

  const deviationCount = useMemo(
    () => visibleProducts.filter((p) => {
      const total = totalPortions(p);
      return total !== null && total !== p.systemBalance;
    }).length,
    [visibleProducts]
  );

  const deviationMaterialsCount = useMemo(
    () => materials.filter((m) => {
      const total = totalPortions(m);
      return total !== null && total !== m.systemBalance;
    }).length,
    [materials]
  );

  const deviationSetsCount = useMemo(
    () => sets.filter((s) => {
      const total = totalPortions(s);
      return total !== null && total !== s.systemBalance;
    }).length,
    [sets]
  );

  const categoryOptions = useMemo(() => {
    const categories = new Set<string>();
    categories.add('Усі категорії');
    categories.add('Коробки');
    visibleProducts.forEach((p) => {
      if (p.categoryName && p.categoryName.trim()) {
        categories.add(p.categoryName);
      }
    });
    return Array.from(categories);
  }, [visibleProducts]);

  const filteredProducts = useMemo(
    () => {
      let result = visibleProducts.filter((p) => {
        if (selectedCategory === 'Коробки') {
          return false;
        }
        const matchesSearch =
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.sku.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;
        if (selectedCategory === 'Усі категорії') return true;
        return p.categoryName === selectedCategory;
      });
      return sortItems(result, sortBy, sortDirection);
    },
    [visibleProducts, searchQuery, selectedCategory, sortBy, sortDirection]
  );

  const filteredMaterials = useMemo(
    () => {
      const result = materials.filter(
        (m) =>
          (showOutdated || !m.isOutdated || m.checked || hasStockSomewhere(m)) &&
          (m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.sku.toLowerCase().includes(searchQuery.toLowerCase()))
      );
      return sortItems(result, sortBy, sortDirection);
    },
    [materials, searchQuery, sortBy, sortDirection, showOutdated]
  );

  const filteredSets = useMemo(
    () => {
      const result = visibleSets.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.sku.toLowerCase().includes(searchQuery.toLowerCase())
      );
      return sortItems(result, sortBy, sortDirection);
    },
    [visibleSets, searchQuery, sortBy, sortDirection]
  );

  /**
   * true — є незбережені зміни відносно lastSavedSnapshot.
   * Активний лише під час сесії (sessionStatus === 'in_progress').
   * ВАЖЛИВО: порівнюємо лише поля, що редагує користувач (actualCount, boxCount, checked).
   * systemBalance виключено — воно оновлюється системою при завантаженні і не повинно впливати на dirty-flag.
   */
  const serializeForDirtyCheck = (prods: InventoryProduct[], mats: InventoryProduct[], setsList: InventoryProduct[]) =>
    JSON.stringify([
      ...prods.map(({ id, actualCount, boxCount, actualCountGp, boxCountGp, checked }) => ({ id, actualCount, boxCount, actualCountGp, boxCountGp, checked })),
      ...mats.map(({ id, actualCount, boxCount, actualCountGp, boxCountGp, checked }) => ({ id, actualCount, boxCount, actualCountGp, boxCountGp, checked })),
      ...setsList.map(({ id, actualCount, boxCount, actualCountGp, boxCountGp, checked }) => ({ id, actualCount, boxCount, actualCountGp, boxCountGp, checked })),
    ]);

  // Дозвіл редагування: звичайна активна сесія або завершена сесія, яка редагується адміном
  const isEditable = useMemo(() => {
    return sessionStatus === 'in_progress' || sessionStatus === 'revising' || (sessionStatus === 'completed' && isAdmin);
  }, [sessionStatus, isAdmin]);

  const isDirty = useMemo(() => {
    if (!isEditable) return false;
    if (lastSavedSnapshot === null) return false;
    return serializeForDirtyCheck(products, materials, sets) !== lastSavedSnapshot;
  }, [isEditable, products, materials, sets, lastSavedSnapshot]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleStartSession = async () => {
    setSessionStatus('in_progress');
    setSessionOriginalStatus(null);
    try {
      // Завантажуємо каталоги без створення запису в БД.
      const [loadedProducts, loadedMaterials, loadedSets] = await Promise.all([
        loadProducts(),
        loadMaterials(),
        loadSets(),
      ]);
      // Фіксуємо snapshot лише user-editable полів, щоб dirty-state працював до першого save/finish.
      setLastSavedSnapshot(JSON.stringify(
        [...loadedProducts, ...loadedMaterials, ...loadedSets].map(({ id, actualCount, boxCount, checked }) => ({ id, actualCount, boxCount, checked })),
      ));
    } catch {
      // Не критично — запис буде створено при першому збереженні або завершенні
    }
  };

  const handleConfirmSaveDraft = async (): Promise<void> => {
    // Закриваємо модал і зберігаємо, ігноруючи попередження про непідтверджені позиції
    setShowConfirmSaveUnconfirmed(false);
    await handleSaveDraft(true);
  };

  // Виконати завершення (core logic) — винесено тут, щоб ми могли викликати його і з confirm-path
  const finishProceed = async () => {
    try {
      if (sessionId) {
        await fetch(`/api/warehouse/inventory/draft/${sessionId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ comment, items: serializeItems(products, materials, sets), inventoryDate: sessionDate }),
        });
      } else {
        await fetch('/api/warehouse/inventory/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ comment, items: serializeItems(products, materials, sets), inventoryDate: sessionDate }),
        });
      }
    } catch {
      // Не блокуємо UI — завершуємо локально
    }
    // Сесія завершена — більше не відстежуємо зміни
    // setLastSavedSnapshot(null);
    // setSessionStatus('completed');
    // setSessionOriginalStatus(null);
    await loadHistory();
    await handleCloseView();
  };

  const handleToggleProduct = (id: string) => {
    const unconfirmedIds = products.filter((p) => !p.checked && (p.actualCount !== null || p.boxCount !== null)).map(p => p.id);
    setOpenProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Завжди додаємо всі непідтверджені позиції до відкритих
      for (const uid of unconfirmedIds) next.add(uid);
      return next;
    });
    setOpenProductId((prev) => (prev === id ? null : id));
  };

  const handleToggleMaterial = (id: string) => {
    const unconfirmedIds = materials.filter((m) => !m.checked && (m.actualCount !== null || m.boxCount !== null)).map(m => m.id);
    setOpenMaterialIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      for (const uid of unconfirmedIds) next.add(uid);
      return next;
    });
    setOpenMaterialId((prev) => (prev === id ? null : id));
  };

  const handleToggleSet = (id: string) => {
    const unconfirmedIds = sets.filter((s) => !s.checked && (s.actualCount !== null || s.boxCount !== null)).map(s => s.id);
    setOpenSetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      for (const uid of unconfirmedIds) next.add(uid);
      return next;
    });
    setOpenSetId((prev) => (prev === id ? null : id));
  };

  const handleEnterPressProduct = (currentProductId: string) => {
    const currentIndex = filteredProducts.findIndex((p) => p.id === currentProductId);
    if (currentIndex !== -1 && currentIndex < filteredProducts.length - 1) {
      const nextId = filteredProducts[currentIndex + 1].id;
      setOpenProductIds(new Set([nextId]));
      setOpenProductId(nextId);
    }
  };

  const handleEnterPressMaterial = (currentMaterialId: string) => {
    const currentIndex = filteredMaterials.findIndex((m) => m.id === currentMaterialId);
    if (currentIndex !== -1 && currentIndex < filteredMaterials.length - 1) {
      const nextId = filteredMaterials[currentIndex + 1].id;
      setOpenMaterialIds(new Set([nextId]));
      setOpenMaterialId(nextId);
    }
  };

  const handleEnterPressSet = (currentSetId: string) => {
    const currentIndex = filteredSets.findIndex((s) => s.id === currentSetId);
    if (currentIndex !== -1 && currentIndex < filteredSets.length - 1) {
      const nextId = filteredSets[currentIndex + 1].id;
      setOpenSetIds(new Set([nextId]));
      setOpenSetId(nextId);
    }
  };

  const handleProductChange = (id: string, field: 'boxCount' | 'actualCount' | 'boxCountGp' | 'actualCountGp', value: number) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const handleCheckProduct = (id: string) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, checked: !p.checked } : p)));
  };

  const handleMaterialChange = (id: string, field: 'boxCount' | 'actualCount' | 'boxCountGp' | 'actualCountGp', value: number) => {
    setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const handleCheckMaterial = (id: string) => {
    setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, checked: !m.checked } : m)));
  };

  const handleSetChange = (id: string, field: 'boxCount' | 'actualCount' | 'boxCountGp' | 'actualCountGp', value: number) => {
    setSets((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const handleCheckSet = (id: string) => {
    setSets((prev) => prev.map((s) => (s.id === id ? { ...s, checked: !s.checked } : s)));
  };

  const handleResetItemValues = (id: string) => {
    let found = false;
    setProducts(prev => prev.map(p => {
      if (p.id === id) {
        found = true;
        return { ...p, actualCount: null, boxCount: null, actualCountGp: null, boxCountGp: null };
      }
      return p;
    }));
    if (found) return;
    setMaterials(prev => prev.map(m => (m.id === id ? { ...m, actualCount: null, boxCount: null, actualCountGp: null, boxCountGp: null } : m)));
    // Also reset for sets
    setSets(prev => prev.map(s => (s.id === id ? { ...s, actualCount: null, boxCount: null, actualCountGp: null, boxCountGp: null } : s)));
  };

  // Завершити інвентаризацію: відправляємо дані на бек, але навіть при помилці локально вважаємо сесію завершеною, щоб не блокувати UI
  const handleFinish = async () => {
    setShowConfirmFinish(false);
    // Якщо це ревізована (admin) сесія і є непідтверджені позиції — спершу просимо підтвердження
    const unconfirmed = [...products, ...materials, ...sets].filter((it) => !it.checked && (it.actualCount !== null || it.boxCount !== null));
    if (unconfirmed.length > 0 && sessionStatus === 'revising') {
      pendingUnconfirmedActionRef.current = 'finish';
      setShowConfirmSaveUnconfirmed(true);
      return;
    }
    await finishProceed();
  };

  // Виклик після того, як користувач підтвердив, що хоче продовжити незважаючи на непідтверджені позиції
  const handleConfirmUnconfirmedAction = async (): Promise<void> => {
    const action = pendingUnconfirmedActionRef.current;
    pendingUnconfirmedActionRef.current = null;
    setShowConfirmSaveUnconfirmed(false);
    if (action === 'save') {
      await handleSaveDraft(true);
      return;
    }
    if (action === 'finish') {
      await finishProceed();
      return;
    }
    // Якщо нічого не стояло в pending — за замовчуванням збережемо чернетку
    await handleSaveDraft(true);
  };

  // Скасувати інвентаризацію: видаляємо чернетку на бекенді (якщо вона була збережена) і скидаємо весь локальний стан
  const handleReset = async () => {
    setShowConfirmCancel(false);
    if (sessionId) {
      try {
        await fetch(`/api/warehouse/inventory/draft/${sessionId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
      } catch { /* ігноруємо */ }
    }
    // Сесію скасовано — скидаємо snapshot, guard більше не активний
    setLastSavedSnapshot(null);
    setSessionId(null);
    setSessionStatus(null);
    setSessionOriginalStatus(null);
    setComment('');
    setOpenProductId(null);
    setOpenProductIds(new Set());
    setOpenMaterialId(null);
    setOpenMaterialIds(new Set());
    setSearchQuery('');
    loadProducts();
    loadMaterials();
  };

  // Зберегти чернетку (створити або оновити)
  const handleSaveDraft = async (force: boolean = false) => {
    setIsSavingDraft(true);
    try {
      // Перевіряємо, чи є позиції з введеними значеннями, але без підтвердження
      const unconfirmed = [...products, ...materials].filter((it) => !it.checked && (it.actualCount !== null || it.boxCount !== null));
      if (unconfirmed.length > 0 && !force) {
        // Показуємо модальне підтвердження — користувач вирішує, чи продовжувати збереження
        pendingUnconfirmedActionRef.current = 'save';
        setShowConfirmSaveUnconfirmed(true);
        setIsSavingDraft(false);
        return;
      }

      // Видаляємо непідтверджені позиції перед збереженням (вони не повинні потрапляти в масив чернетки)
      const filterUnconfirmed = (arr: InventoryProduct[]) => arr.filter((it) => !( !it.checked && (it.actualCount !== null || it.boxCount !== null) ));
      const productsToSave = filterUnconfirmed(products);
      const materialsToSave = filterUnconfirmed(materials);
      const setsToSave = filterUnconfirmed(sets);
      const items = serializeItems(productsToSave, materialsToSave, setsToSave);
      if (sessionId) {
        const res = await fetch(`/api/warehouse/inventory/draft/${sessionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ comment, items, inventoryDate: sessionDate }),
        });
        if (!res.ok) throw new Error('Помилка збереження');
      } else {
        const res = await fetch('/api/warehouse/inventory/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ comment, items, inventoryDate: sessionDate }),
        });
        if (!res.ok) throw new Error('Помилка збереження');
        const data = await res.json();
        setSessionId(data.session.id);
      }
      ToastService.show({
        title: 'Чернетку збережено',
        description: 'Ви можете повернутись до інвентаризації пізніше',
        color: 'success',
      });
      // Оновлюємо локальний стан так, щоб він відповідав тому, що зберегли (видаляємо непідтверджені позиції)
      setProducts(productsToSave);
      setMaterials(materialsToSave);
      setSets(setsToSave);
      // Оновлюємо snapshot лише user-editable полів — записано чистий стан (без непідтверджених)
      setLastSavedSnapshot(JSON.stringify(
        [...productsToSave, ...materialsToSave, ...setsToSave].map(({ id, actualCount, boxCount, checked }) => ({ id, actualCount, boxCount, checked })),
      ));
      // Закриваємо модальне вікно попередження, якщо воно було відкрито
      setShowConfirmSaveUnconfirmed(false);
    } catch {
      ToastService.show({ title: 'Помилка збереження чернетки', color: 'danger' });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSaveComment = () => {
    setComment(commentDraft);
    setShowCommentModal(false);
    ToastService.show({ title: 'Коментар додано', color: 'success' });
  };

  // Закрити локальний перегляд сесії без видалення запису в БД (не робить DELETE)
  const handleCloseView = useCallback(async (): Promise<void> => {
    // Скидаємо локальний стан сесії — повний unmount поточного перегляду
    setLastSavedSnapshot(null);
    setSessionId(null);
    setSessionStatus(null);
    setSessionOriginalStatus(null);
    setComment('');
    setOpenProductId(null);
    setOpenProductIds(new Set());
    setOpenMaterialId(null);
    setOpenMaterialIds(new Set());
    setSearchQuery('');
    // Поновлюємо каталоги товарів/матеріалів для чистого стану
    try {
      await Promise.all([loadProducts(), loadMaterials(), loadSets()]);
    } catch {
      // ігноруємо помилки при оновленні списків
    }
  }, [loadProducts, loadMaterials, loadSets]);

  // ---------------------------------------------------------------------------
  // Оновлення залишків "За обліком" з Dilovod на вказану дату
  // ---------------------------------------------------------------------------

  const refreshSystemBalances = useCallback(async (
    asOfDate: Date,
    overrideProducts?: InventoryProduct[],
    overrideMaterials?: InventoryProduct[],
  ): Promise<void> => {
    // Якщо передано override — використовуємо їх (дані ще не потрапили в стан)
    const allProducts = overrideProducts ?? (products.length > 0 ? products : []);
    const allMaterials = overrideMaterials ?? (materials.length > 0 ? materials : []);
    if (allProducts.length === 0 && allMaterials.length === 0) return;

    setIsRefreshingBalances(true);
    setProducts((prev) => prev.map((product) => ({ ...product, isBalanceRefreshing: true })));
    setMaterials((prev) => prev.map((material) => ({ ...material, isBalanceRefreshing: true })));
    try {
      const allSets = sets.length > 0 ? sets : [];
      const skus = [
        ...allProducts.map(p => p.sku),
        ...allMaterials.map(m => m.sku),
        ...allSets.map(s => s.sku),
      ].filter(Boolean).join(',');

      const url = new URL('/api/warehouse/stock-snapshot', window.location.origin);
      url.searchParams.set('skus', skus);
      url.searchParams.set('asOfDate', asOfDate.toISOString());

      const res = await fetch(url.toString(), { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const stocks: Record<string, { mainStock: number; smallStock: number }> = data.stocks ?? {};

      // Оновлюємо systemBalance для товарів (smallStock = малий склад "2", mainStock = склад ГП "1")
      setProducts(prev => prev.map(p => {
        const s = stocks[p.sku];
        return s ? { ...p, systemBalance: s.smallStock, systemBalanceGp: s.mainStock, isBalanceRefreshing: false } : { ...p, isBalanceRefreshing: false };
      }));

      // Оновлюємо systemBalance для матеріалів
      setMaterials(prev => prev.map(m => {
        const s = stocks[m.sku];
        return s ? { ...m, systemBalance: s.smallStock, systemBalanceGp: s.mainStock, isBalanceRefreshing: false } : { ...m, isBalanceRefreshing: false };
      }));
    } catch (err: any) {
      ToastService.show({
        title: 'Не вдалось оновити залишки на дату',
        description: err.message ?? 'Невідома помилка',
        color: 'danger',
      });
    } finally {
      setProducts((prev) => prev.map((product) => ({ ...product, isBalanceRefreshing: false })));
      setMaterials((prev) => prev.map((material) => ({ ...material, isBalanceRefreshing: false })));
      setIsRefreshingBalances(false);
    }
  }, [products, materials]);

  const refreshSetBalances = useCallback(async (asOfDate: Date): Promise<void> => {
    const currentSets = sets.length > 0 ? sets : [];
    if (currentSets.length === 0) return;

    setSets((prev) => prev.map((set) => ({ ...set, isBalanceRefreshing: true })));

    try {
      const skus = currentSets.map((set) => set.sku).filter(Boolean).join(',');
      if (!skus) return;

      const url = new URL('/api/warehouse/stock-snapshot', window.location.origin);
      url.searchParams.set('skus', skus);
      url.searchParams.set('asOfDate', asOfDate.toISOString());

      const res = await fetch(url.toString(), { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const stocks: Record<string, { mainStock: number; smallStock: number }> = data.stocks ?? {};

      setSets((prev) => prev.map((set) => {
        const stock = stocks[set.sku];
        return stock
          ? { ...set, systemBalance: stock.smallStock, systemBalanceGp: stock.mainStock, isBalanceRefreshing: false }
          : { ...set, isBalanceRefreshing: false };
      }));
    } catch (err: any) {
      ToastService.show({
        title: 'Не вдалось оновити залишки комплектів на дату',
        description: err.message ?? 'Невідома помилка',
        color: 'danger',
      });
      setSets((prev) => prev.map((set) => ({ ...set, isBalanceRefreshing: false })));
    }
  }, [sets]);

  // Оновлюємо ref при кожній зміні refreshSystemBalances
  // (щоб loadDraft та handleAdminLoadSession завжди мали актуальну версію)
  useEffect(() => {
    refreshSystemBalancesRef.current = refreshSystemBalances;
  }, [refreshSystemBalances]);

  // ---------------------------------------------------------------------------
  // Зміна дати сесії: оновлює sessionDate, ставить isDirty, запускає debounce
  // ---------------------------------------------------------------------------

  const handleSessionDateChange = useCallback((date: Date): void => {
    setSessionDate(date.toISOString());
    // Ставимо isDirty через скидання snapshot (якщо сесія активна)
    setLastSavedSnapshot(prev => prev === null ? null : '');

    if (balancesDebounceRef.current !== null) {
      clearTimeout(balancesDebounceRef.current);
    }
    balancesDebounceRef.current = setTimeout(() => {
      balancesDebounceRef.current = null;
      refreshSystemBalances(date);
      void refreshSetBalances(date);
    }, 1000);
  }, [refreshSystemBalances, refreshSetBalances]);

  // ---------------------------------------------------------------------------
  // Адмін: завантажити чужу сесію (in_progress) у поточний перегляд
  // ---------------------------------------------------------------------------

  const handleAdminLoadSession = useCallback(async (session: InventorySession): Promise<void> => {
    const sessionDateRaw = session.inventoryDate ?? session.createdAt ?? null;
    const sessionDateValue = sessionDateRaw ? new Date(sessionDateRaw) : null;
    const effectiveDate = sessionDateValue && !isNaN(sessionDateValue.getTime()) ? sessionDateValue : undefined;

    const [freshProducts, freshMaterials, freshSets] = await Promise.all([loadProducts(), loadMaterials(), loadSets(effectiveDate)]);

    const savedItems: Array<{ type?: string; id: string; actualCount: number | null; boxCount: number | null; actualCountGp?: number | null; boxCountGp?: number | null; checked: boolean }>
      = session.items as any;
    const savedProductsMap = new Map(
      savedItems.filter((i) => i.type === 'product' || i.type === undefined).map((i) => [i.id, i]),
    );
    const savedMaterialsMap = new Map(
      savedItems.filter((i) => i.type === 'material').map((i) => [i.id, i]),
    );
    const savedSetsMap = new Map(
      savedItems.filter((i) => i.type === 'set').map((i) => [i.id, i]),
    );

    const mergedProducts = freshProducts.map((p) => {
      const saved = savedProductsMap.get(p.id);
      if (!saved) return p;
      return { ...p, actualCount: saved.actualCount, boxCount: saved.boxCount, actualCountGp: saved.actualCountGp ?? null, boxCountGp: saved.boxCountGp ?? null, checked: saved.checked };
    });
    const mergedMaterials = freshMaterials.map((m) => {
      const saved = savedMaterialsMap.get(m.id);
      if (!saved) return m;
      return { ...m, actualCount: saved.actualCount, boxCount: saved.boxCount, actualCountGp: saved.actualCountGp ?? null, boxCountGp: saved.boxCountGp ?? null, checked: saved.checked };
    });

    const mergedSets = freshSets.map((s) => {
      const saved = savedSetsMap.get(s.id);
      if (!saved) return s;
      return { ...s, actualCount: saved.actualCount, boxCount: saved.boxCount, actualCountGp: saved.actualCountGp ?? null, boxCountGp: saved.boxCountGp ?? null, checked: saved.checked };
    });

    setProducts(mergedProducts);
    setMaterials(mergedMaterials);
    setSets(mergedSets);
    setSessionId(Number(session.id));
    // Remember original status (to know if we're editing a completed session)
    setSessionOriginalStatus(session.status);
    // If admin is loading a historical session for revision, notify server to mark it as revising
    if (isAdmin) {
      try {
        await fetch(`/api/warehouse/inventory/${session.id}/revision`, { method: 'POST', credentials: 'include' });
      } catch {
        // Ignore server failure — client will still allow editing locally
      }
    }
    // When an admin loads a historical session for editing, mark it as 'revising'
    // so client UI treats it similarly to a draft and enables edit flows.
    setSessionStatus('revising');
    setSessionDate(session.inventoryDate ?? session.createdAt ?? null);
    setComment(session.comment ?? '');
    setLastSavedSnapshot(JSON.stringify(
      [...mergedProducts, ...mergedMaterials, ...mergedSets].map(({ id, actualCount, boxCount, checked }) => ({ id, actualCount, boxCount, checked })),
    ));
    setActiveTab('current');
    // Відкриваємо всі непідтверджені позиції після завантаження сесії адміністратором
    const unconfirmedProductIds = mergedProducts.filter((p) => !p.checked && (p.actualCount !== null || p.boxCount !== null)).map(p => p.id);
    const unconfirmedMaterialIds = mergedMaterials.filter((m) => !m.checked && (m.actualCount !== null || m.boxCount !== null)).map(m => m.id);
    setOpenProductIds(new Set(unconfirmedProductIds));
    setOpenMaterialIds(new Set(unconfirmedMaterialIds));
    const unconfirmedSetIds = mergedSets.filter((s) => !s.checked && (s.actualCount !== null || s.boxCount !== null)).map(s => s.id);
    setOpenSetIds(new Set(unconfirmedSetIds));
    // Завантажуємо залишки за обліком на дату сесії (через ref, щоб уникнути TDZ)
    if (effectiveDate) {
      await refreshSystemBalancesRef.current(effectiveDate, mergedProducts, mergedMaterials);
    }
  }, [loadProducts, loadMaterials, loadSets]);

  // ---------------------------------------------------------------------------
  // Адмін: відновити архівну (removed) сесію або видалити остаточно
  // ---------------------------------------------------------------------------

  const handleAdminRestoreSession = useCallback(async (sessionId: string): Promise<void> => {
    try {
      const res = await fetch(`/api/warehouse/inventory/${sessionId}/restore`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ToastService.show({ title: 'Сесію відновлено', color: 'success' });
      await loadArchive();
      await loadHistory();
    } catch {
      ToastService.show({ title: 'Помилка відновлення сесії', color: 'danger' });
    }
  }, [loadArchive, loadHistory]);

  const handleAdminDeletePermanently = useCallback(async (sessionId: string): Promise<void> => {
    try {
      const res = await fetch(`/api/warehouse/inventory/${sessionId}/permanent`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ToastService.show({ title: 'Сесію видалено назавжди', color: 'success' });
      await loadArchive();
    } catch {
      ToastService.show({ title: 'Помилка остаточного видалення', color: 'danger' });
    }
  }, [loadArchive]);

  return {
    activeTab, setActiveTab,
    sessionStatus, sessionOriginalStatus, sessionId, sessionDate, setSessionDate,
    comment, setComment,
    commentDraft, setCommentDraft,
    isSavingDraft,
    products, productsLoading, productsError, filteredProducts, openProductId, openProductIds,
    selectedCategory, setSelectedCategory, categoryOptions,
    sortBy, setSortBy, sortDirection, setSortDirection,
    materials, materialsLoading, materialsError, filteredMaterials, openMaterialId, openMaterialIds,
    sets, setsLoading, setsError, filteredSets, openSetId, openSetIds,
    setCompositionBySku,
    searchQuery, setSearchQuery,
    showOutdated, setShowOutdated,
    checkedCount, totalCount, progressPercent,
    checkedMaterialsCount, totalMaterialsCount, materialsProgressPercent,
    checkedSetsCount, totalSetsCount, setsProgressPercent,
    totalCheckedAll, totalAll, totalProgressPercent,
    deviationCount, deviationMaterialsCount, deviationSetsCount,
    showConfirmFinish, setShowConfirmFinish,
    showConfirmCancel, setShowConfirmCancel,
    showCommentModal, setShowCommentModal,
    showConfirmSaveUnconfirmed, setShowConfirmSaveUnconfirmed,
    historySessions, historyLoading,
    archiveSessions, archiveLoading,
    loadProducts, loadMaterials, loadHistory,
    loadArchive,
    handleStartSession,
    loadSets,
    handleToggleProduct, handleToggleMaterial,
    handleToggleSet,
    handleEnterPressProduct, handleEnterPressMaterial, handleEnterPressSet,
    handleProductChange, handleCheckProduct,
    handleSetChange, handleCheckSet,
    handleMaterialChange, handleCheckMaterial,
    handleFinish, handleReset, handleSaveDraft, handleConfirmSaveDraft, handleConfirmUnconfirmedAction, handleSaveComment,
    handleResetItemValues,
    handleSessionDateChange, handleAdminLoadSession, isRefreshingBalances,
    isDirty,
    handleCloseView,
    isEditable,
    handleAdminRestoreSession,
    handleAdminDeletePermanently,
  };
};
