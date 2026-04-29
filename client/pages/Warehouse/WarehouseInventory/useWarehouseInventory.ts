import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ToastService } from '@/services/ToastService';
import { totalPortions, serializeItems, sortItems } from './WarehouseInventoryUtils';
import type { InventoryProduct, InventorySession, InventoryStatus } from './WarehouseInventoryTypes';

// ---------------------------------------------------------------------------
// Повертає весь стан та логіку для сторінки WarehouseInventory
// ---------------------------------------------------------------------------

export interface UseWarehouseInventoryReturn {
  // Стан сесії
  activeTab: 'current' | 'history';
  setActiveTab: (tab: 'current' | 'history') => void;
  sessionStatus: InventoryStatus | null;
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

  // Матеріали
  materials: InventoryProduct[];
  materialsLoading: boolean;
  materialsError: string | null;
  filteredMaterials: InventoryProduct[];
  openMaterialId: string | null;

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

  // Прогрес
  checkedCount: number;
  totalCount: number;
  progressPercent: number;
  checkedMaterialsCount: number;
  totalMaterialsCount: number;
  materialsProgressPercent: number;
  totalCheckedAll: number;
  totalAll: number;
  totalProgressPercent: number;
  deviationCount: number;
  deviationMaterialsCount: number;

  // Модалки
  showConfirmFinish: boolean;
  setShowConfirmFinish: (v: boolean) => void;
  showConfirmCancel: boolean;
  setShowConfirmCancel: (v: boolean) => void;
  showCommentModal: boolean;
  setShowCommentModal: (v: boolean) => void;

  // Історія
  historySessions: InventorySession[];
  historyLoading: boolean;

  // Handlers
  loadProducts: () => Promise<InventoryProduct[]>;
  loadMaterials: () => Promise<InventoryProduct[]>;
  loadHistory: () => Promise<void>;
  handleStartSession: () => Promise<void>;
  handleToggleProduct: (id: string) => void;
  handleToggleMaterial: (id: string) => void;
  handleEnterPressProduct: (currentProductId: string) => void;
  handleEnterPressMaterial: (currentMaterialId: string) => void;
  handleProductChange: (id: string, field: 'boxCount' | 'actualCount', value: number) => void;
  handleCheckProduct: (id: string) => void;
  handleMaterialChange: (id: string, field: 'boxCount' | 'actualCount', value: number) => void;
  handleCheckMaterial: (id: string) => void;
  handleFinish: () => Promise<void>;
  handleReset: () => Promise<void>;
  handleSaveDraft: () => Promise<void>;
  handleSaveComment: () => void;
  /** Оновлює залишки "За обліком" з Dilovod на вказану дату + встановлює isDirty */
  handleSessionDateChange: (date: Date) => void;
  /** Адмін: завантажує чужу сесію в поточний перегляд для редагування */
  handleAdminLoadSession: (session: InventorySession) => Promise<void>;
  /** true поки виконується запит на оновлення залишків */
  isRefreshingBalances: boolean;
  /** true — є незбережені зміни відносно останнього збереження/завантаження */
  isDirty: boolean;
}

export const useWarehouseInventory = (): UseWarehouseInventoryReturn => {
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [sessionStatus, setSessionStatus] = useState<InventoryStatus | null>(null);
  /** ID поточної сесії в БД (null = ще не збережена) */
  const [sessionId, setSessionId] = useState<number | null>(null);
  /** Дата створення активної сесії (ISO-рядок) */
  const [sessionDate, setSessionDate] = useState<string | null>(null);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('Усі категорії');
  const [sortBy, setSortBy] = useState<'name' | 'sku' | 'balance' | 'deviation'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [materials, setMaterials] = useState<InventoryProduct[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState<string | null>(null);
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [openMaterialId, setOpenMaterialId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [comment, setComment] = useState('');
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [historySessions, setHistorySessions] = useState<InventorySession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isRefreshingBalances, setIsRefreshingBalances] = useState(false);
  /** Debounce-таймер для оновлення залишків після зміни дати (1 сек) */
  const balancesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        systemBalance: p.systemBalance,
        unit: p.unit as 'portions' | 'pcs',
        portionsPerBox: p.portionsPerBox,
        actualCount: null,
        boxCount: null,
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
        unit: m.unit as 'portions' | 'pcs',
        portionsPerBox: m.portionsPerBox,
        actualCount: null,
        boxCount: null,
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
  // API: завантаження незавершеної чернетки при mount
  // ---------------------------------------------------------------------------

  const loadDraft = useCallback(async () => {
    try {
      const res = await fetch('/api/warehouse/inventory/draft', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.draft) return;

      const draft = data.draft;
      // Завантажуємо актуальні залишки з API
      const freshProducts = await loadProducts();
      const freshMaterials = await loadMaterials();

      // Відновлюємо введені дані з чернетки
      // ВАЖЛИВО: savedProductsMap і savedMaterialsMap — окремо, бо id товарів і матеріалів можуть збігатися
      const savedItems: Array<{ type?: string; id: string; actualCount: number | null; boxCount: number | null; checked: boolean }> = JSON.parse(draft.items ?? '[]');
      const savedProductsMap = new Map(savedItems.filter((i) => i.type === 'product' || i.type === undefined).map((i) => [i.id, i]));
      const savedMaterialsMap = new Map(savedItems.filter((i) => i.type === 'material').map((i) => [i.id, i]));

      const mergedProducts = freshProducts.map((p) => {
        const saved = savedProductsMap.get(p.id);
        if (!saved) return p;
        return { ...p, actualCount: saved.actualCount, boxCount: saved.boxCount, checked: saved.checked };
      });

      const mergedMaterials = freshMaterials.map((m) => {
        const saved = savedMaterialsMap.get(m.id);
        if (!saved) return m;
        return { ...m, actualCount: saved.actualCount, boxCount: saved.boxCount, checked: saved.checked };
      });

      setProducts(mergedProducts);
      setMaterials(mergedMaterials);
      setSessionId(draft.id);
      setSessionStatus('in_progress');
      // Пріоритет: inventoryDate (обрана користувачем) > createdAt (технічна дата)
      setSessionDate(draft.inventoryDate ?? draft.createdAt ?? null);
      setComment(draft.comment ?? '');
      // Фіксуємо snapshot лише user-editable полів — щоб оновлення systemBalance не тригерило isDirty
      setLastSavedSnapshot(JSON.stringify(
        [...mergedProducts, ...mergedMaterials].map(({ id, actualCount, boxCount, checked }) => ({ id, actualCount, boxCount, checked })),
      ));
      // Завантажуємо залишки за обліком на дату чернетки (через ref, щоб уникнути TDZ)
      const dateToUse = new Date(draft.inventoryDate ?? draft.createdAt);
      if (!isNaN(dateToUse.getTime())) {
        await refreshSystemBalancesRef.current(dateToUse, mergedProducts, mergedMaterials);
      }
    } catch {
      // Тихо ігноруємо — просто не відновлюємо чернетку
    }  }, [loadProducts, loadMaterials]);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

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
        createdByName: s.createdByName ?? null,
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
  // Computed
  // ---------------------------------------------------------------------------

  const checkedCount = useMemo(() => products.filter((p) => p.checked).length, [products]);
  const totalCount = products.length;
  const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  const checkedMaterialsCount = useMemo(() => materials.filter((m) => m.checked).length, [materials]);
  const totalMaterialsCount = materials.length;
  const materialsProgressPercent = totalMaterialsCount > 0 ? Math.round((checkedMaterialsCount / totalMaterialsCount) * 100) : 0;

  const totalCheckedAll = checkedCount + checkedMaterialsCount;
  const totalAll = totalCount + totalMaterialsCount;
  const totalProgressPercent = totalAll > 0 ? Math.round((totalCheckedAll / totalAll) * 100) : 0;

  const deviationCount = useMemo(
    () => products.filter((p) => {
      const total = totalPortions(p);
      return total !== null && total !== p.systemBalance;
    }).length,
    [products]
  );

  const deviationMaterialsCount = useMemo(
    () => materials.filter((m) => {
      const total = totalPortions(m);
      return total !== null && total !== m.systemBalance;
    }).length,
    [materials]
  );

  const categoryOptions = useMemo(() => {
    const categories = new Set<string>();
    categories.add('Усі категорії');
    categories.add('Коробки');
    products.forEach((p) => {
      if (p.categoryName && p.categoryName.trim()) {
        categories.add(p.categoryName);
      }
    });
    return Array.from(categories);
  }, [products]);

  const filteredProducts = useMemo(
    () => {
      let result = products.filter((p) => {
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
    [products, searchQuery, selectedCategory, sortBy, sortDirection]
  );

  const filteredMaterials = useMemo(
    () => {
      const result = materials.filter(
        (m) =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.sku.toLowerCase().includes(searchQuery.toLowerCase())
      );
      return sortItems(result, sortBy, sortDirection);
    },
    [materials, searchQuery, sortBy, sortDirection]
  );

  /**
   * true — є незбережені зміни відносно lastSavedSnapshot.
   * Активний лише під час сесії (sessionStatus === 'in_progress').
   * ВАЖЛИВО: порівнюємо лише поля, що редагує користувач (actualCount, boxCount, checked).
   * systemBalance виключено — воно оновлюється системою при завантаженні і не повинно впливати на dirty-flag.
   */
  const serializeForDirtyCheck = (prods: InventoryProduct[], mats: InventoryProduct[]) =>
    JSON.stringify([
      ...prods.map(({ id, actualCount, boxCount, checked }) => ({ id, actualCount, boxCount, checked })),
      ...mats.map(({ id, actualCount, boxCount, checked }) => ({ id, actualCount, boxCount, checked })),
    ]);

  const isDirty = useMemo(() => {
    if (sessionStatus !== 'in_progress') return false;
    if (lastSavedSnapshot === null) return false;
    return serializeForDirtyCheck(products, materials) !== lastSavedSnapshot;
  }, [sessionStatus, products, materials, lastSavedSnapshot]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleStartSession = async () => {
    setSessionStatus('in_progress');
    try {
      // Завантажуємо товари та матеріали паралельно зі створенням чернетки
      const [loadedProducts, loadedMaterials, res] = await Promise.all([
        loadProducts(),
        loadMaterials(),
        fetch('/api/warehouse/inventory/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ comment, items: serializeItems(products, materials), inventoryDate: sessionDate }),
        }),
      ]);
      if (!res.ok) return;
      const data = await res.json();
      setSessionId(data.session.id);
      setSessionDate(data.session.createdAt ?? new Date().toISOString());
      // Фіксуємо snapshot лише user-editable полів
      setLastSavedSnapshot(JSON.stringify(
        [...loadedProducts, ...loadedMaterials].map(({ id, actualCount, boxCount, checked }) => ({ id, actualCount, boxCount, checked })),
      ));
    } catch {
      // Не критично — ID збережеться при першому збереженні чернетки
    }
  };

  const handleToggleProduct = (id: string) => {
    setOpenProductId((prev) => (prev === id ? null : id));
  };

  const handleToggleMaterial = (id: string) => {
    setOpenMaterialId((prev) => (prev === id ? null : id));
  };

  const handleEnterPressProduct = (currentProductId: string) => {
    const currentIndex = filteredProducts.findIndex((p) => p.id === currentProductId);
    if (currentIndex !== -1 && currentIndex < filteredProducts.length - 1) {
      setOpenProductId(filteredProducts[currentIndex + 1].id);
    }
  };

  const handleEnterPressMaterial = (currentMaterialId: string) => {
    const currentIndex = filteredMaterials.findIndex((m) => m.id === currentMaterialId);
    if (currentIndex !== -1 && currentIndex < filteredMaterials.length - 1) {
      setOpenMaterialId(filteredMaterials[currentIndex + 1].id);
    }
  };

  const handleProductChange = (id: string, field: 'boxCount' | 'actualCount', value: number) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const handleCheckProduct = (id: string) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, checked: !p.checked } : p)));
  };

  const handleMaterialChange = (id: string, field: 'boxCount' | 'actualCount', value: number) => {
    setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const handleCheckMaterial = (id: string) => {
    setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, checked: !m.checked } : m)));
  };

  const handleFinish = async () => {
    setShowConfirmFinish(false);
    try {
      if (sessionId) {
        await fetch(`/api/warehouse/inventory/draft/${sessionId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ comment, items: serializeItems(products, materials), inventoryDate: sessionDate }),
        });
      }
    } catch {
      // Не блокуємо UI — завершуємо локально
    }
    // Сесія завершена — більше не відстежуємо зміни
    setLastSavedSnapshot(null);
    setSessionStatus('completed');
  };

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
    setComment('');
    setOpenProductId(null);
    setOpenMaterialId(null);
    setSearchQuery('');
    loadProducts();
    loadMaterials();
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    try {
      const items = serializeItems(products, materials);
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
      // Оновлюємо snapshot лише user-editable полів — поточний стан тепер вважається "чистим"
      setLastSavedSnapshot(JSON.stringify(
        [...products, ...materials].map(({ id, actualCount, boxCount, checked }) => ({ id, actualCount, boxCount, checked })),
      ));
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
    try {
      const skus = [
        ...allProducts.map(p => p.sku),
        ...allMaterials.map(m => m.sku),
      ].join(',');

      const url = new URL('/api/warehouse/stock-snapshot', window.location.origin);
      url.searchParams.set('skus', skus);
      url.searchParams.set('asOfDate', asOfDate.toISOString());

      const res = await fetch(url.toString(), { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const stocks: Record<string, { mainStock: number; smallStock: number }> = data.stocks ?? {};

      // Оновлюємо systemBalance для товарів (використовуємо smallStock = склад "2")
      setProducts(prev => prev.map(p => {
        const s = stocks[p.sku];
        return s ? { ...p, systemBalance: s.smallStock } : p;
      }));

      // Оновлюємо systemBalance для матеріалів
      setMaterials(prev => prev.map(m => {
        const s = stocks[m.sku];
        return s ? { ...m, systemBalance: s.smallStock } : m;
      }));
    } catch (err: any) {
      ToastService.show({
        title: 'Не вдалось оновити залишки на дату',
        description: err.message ?? 'Невідома помилка',
        color: 'danger',
      });
    } finally {
      setIsRefreshingBalances(false);
    }
  }, [products, materials]);

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
    }, 1000);
  }, [refreshSystemBalances]);

  // ---------------------------------------------------------------------------
  // Адмін: завантажити чужу сесію (in_progress) у поточний перегляд
  // ---------------------------------------------------------------------------

  const handleAdminLoadSession = useCallback(async (session: InventorySession): Promise<void> => {
    const freshProducts = await loadProducts();
    const freshMaterials = await loadMaterials();

    const savedItems: Array<{ type?: string; id: string; actualCount: number | null; boxCount: number | null; checked: boolean }>
      = session.items as any;
    const savedProductsMap = new Map(
      savedItems.filter((i) => i.type === 'product' || i.type === undefined).map((i) => [i.id, i]),
    );
    const savedMaterialsMap = new Map(
      savedItems.filter((i) => i.type === 'material').map((i) => [i.id, i]),
    );

    const mergedProducts = freshProducts.map((p) => {
      const saved = savedProductsMap.get(p.id);
      if (!saved) return p;
      return { ...p, actualCount: saved.actualCount, boxCount: saved.boxCount, checked: saved.checked };
    });
    const mergedMaterials = freshMaterials.map((m) => {
      const saved = savedMaterialsMap.get(m.id);
      if (!saved) return m;
      return { ...m, actualCount: saved.actualCount, boxCount: saved.boxCount, checked: saved.checked };
    });

    setProducts(mergedProducts);
    setMaterials(mergedMaterials);
    setSessionId(Number(session.id));
    setSessionStatus(session.status);
    setSessionDate(session.inventoryDate ?? session.createdAt ?? null);
    setComment(session.comment ?? '');
    setLastSavedSnapshot(JSON.stringify(
      [...mergedProducts, ...mergedMaterials].map(({ id, actualCount, boxCount, checked }) => ({ id, actualCount, boxCount, checked })),
    ));
    setActiveTab('current');
    // Завантажуємо залишки за обліком на дату сесії (через ref, щоб уникнути TDZ)
    const dateToUse = new Date(session.inventoryDate ?? session.createdAt);
    if (!isNaN(dateToUse.getTime())) {
      await refreshSystemBalancesRef.current(dateToUse, mergedProducts, mergedMaterials);
    }
  }, [loadProducts, loadMaterials]);

  return {
    activeTab, setActiveTab,
    sessionStatus, sessionId, sessionDate, setSessionDate,
    comment, setComment,
    commentDraft, setCommentDraft,
    isSavingDraft,
    products, productsLoading, productsError, filteredProducts, openProductId,
    selectedCategory, setSelectedCategory, categoryOptions,
    sortBy, setSortBy, sortDirection, setSortDirection,
    materials, materialsLoading, materialsError, filteredMaterials, openMaterialId,
    searchQuery, setSearchQuery,
    checkedCount, totalCount, progressPercent,
    checkedMaterialsCount, totalMaterialsCount, materialsProgressPercent,
    totalCheckedAll, totalAll, totalProgressPercent,
    deviationCount, deviationMaterialsCount,
    showConfirmFinish, setShowConfirmFinish,
    showConfirmCancel, setShowConfirmCancel,
    showCommentModal, setShowCommentModal,
    historySessions, historyLoading,
    loadProducts, loadMaterials, loadHistory,
    handleStartSession,
    handleToggleProduct, handleToggleMaterial,
    handleEnterPressProduct, handleEnterPressMaterial,
    handleProductChange, handleCheckProduct,
    handleMaterialChange, handleCheckMaterial,
    handleFinish, handleReset, handleSaveDraft, handleSaveComment,
    handleSessionDateChange, handleAdminLoadSession, isRefreshingBalances,
    isDirty,
  };
};
