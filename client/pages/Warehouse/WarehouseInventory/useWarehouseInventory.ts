import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ToastService } from '@/services/ToastService';
import { totalPortions, serializeItems, sortItems } from '../shared/WarehouseInventoryUtils';
import type { InventoryProduct, InventorySession, InventoryStatus } from '../shared/WarehouseInventoryTypes';

// ---------------------------------------------------------------------------
// Повертає весь стан та логіку для сторінки WarehouseInventory
// ---------------------------------------------------------------------------

export interface UseWarehouseInventoryReturn {
  // Стан сесії
  activeTab: 'current' | 'history';
  setActiveTab: (tab: 'current' | 'history') => void;
  sessionStatus: InventoryStatus | null;
  sessionId: number | null;
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
  /** true — є незбережені зміни відносно останнього збереження/завантаження */
  isDirty: boolean;
}

export const useWarehouseInventory = (): UseWarehouseInventoryReturn => {
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [sessionStatus, setSessionStatus] = useState<InventoryStatus | null>(null);
  /** ID поточної сесії в БД (null = ще не збережена) */
  const [sessionId, setSessionId] = useState<number | null>(null);
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

  /**
   * Snapshot серіалізованих items на момент останнього збереження або завантаження.
   * Використовується для визначення isDirty.
   * null = сесія неактивна (немає чого порівнювати).
   */
  const lastSavedSnapshotRef = useRef<string | null>(null);

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
      const savedItems: InventoryProduct[] = JSON.parse(draft.items ?? '[]');
      const savedMap = new Map(savedItems.map((p: InventoryProduct) => [p.id, p]));

      const mergedProducts = freshProducts.map((p) => {
        const saved = savedMap.get(p.id);
        if (!saved) return p;
        return { ...p, actualCount: saved.actualCount, boxCount: saved.boxCount, checked: saved.checked };
      });

      const mergedMaterials = freshMaterials.map((m) => {
        const saved = savedMap.get(m.id);
        if (!saved) return m;
        return { ...m, actualCount: saved.actualCount, boxCount: saved.boxCount, checked: saved.checked };
      });

      setProducts(mergedProducts);
      setMaterials(mergedMaterials);
      setSessionId(draft.id);
      setSessionStatus('in_progress');
      setComment(draft.comment ?? '');
      // Фіксуємо snapshot — щойно завантажена чернетка вважається "чистою"
      lastSavedSnapshotRef.current = JSON.stringify(serializeItems(mergedProducts, mergedMaterials));
    } catch {
      // Тихо ігноруємо — просто не відновлюємо чернетку
    }
  }, [loadProducts, loadMaterials]);

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
        createdAt: s.createdAt,
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
   * true — є незбережені зміни відносно lastSavedSnapshotRef.
   * Активний лише під час сесії (sessionStatus === 'in_progress').
   */
  const isDirty = useMemo(() => {
    if (sessionStatus !== 'in_progress') return false;
    if (lastSavedSnapshotRef.current === null) return false;
    return JSON.stringify(serializeItems(products, materials)) !== lastSavedSnapshotRef.current;
  }, [sessionStatus, products, materials]);

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
          body: JSON.stringify({ comment, items: serializeItems(products, materials) }),
        }),
      ]);
      if (!res.ok) return;
      const data = await res.json();
      setSessionId(data.session.id);
      // Фіксуємо snapshot щойно завантаженого "чистого" списку
      lastSavedSnapshotRef.current = JSON.stringify(serializeItems(loadedProducts, loadedMaterials));
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
          body: JSON.stringify({ comment, items: serializeItems(products, materials) }),
        });
      }
    } catch {
      // Не блокуємо UI — завершуємо локально
    }
    // Сесія завершена — більше не відстежуємо зміни
    lastSavedSnapshotRef.current = null;
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
    lastSavedSnapshotRef.current = null;
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
          body: JSON.stringify({ comment, items }),
        });
        if (!res.ok) throw new Error('Помилка збереження');
      } else {
        const res = await fetch('/api/warehouse/inventory/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ comment, items }),
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
      // Оновлюємо snapshot — поточний стан тепер вважається "чистим"
      lastSavedSnapshotRef.current = JSON.stringify(serializeItems(products, materials));
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

  return {
    activeTab, setActiveTab,
    sessionStatus, sessionId,
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
    isDirty,
  };
};
