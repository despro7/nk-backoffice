import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ToastService } from '@/services/ToastService';
import {
  factTotalForWarehouseScope,
  itemHasEnteredCountsForScope,
  normalizeInventoryItemsForScope,
  serializeItems,
  sortItems,
  systemBalanceForWarehouseScope,
  totalPortions,
} from './WarehouseInventoryUtils';
import { buildInventorySessionPath, urlPrefixToWarehouseScope } from './inventoryRoute';
import { parseSessionWarehouseFromApi, resolveSessionWarehouseScope } from './inventoryHistoryGroups';
import type { InventoryProduct, InventorySession, InventoryStatus, InventoryWarehouseScope } from './WarehouseInventoryTypes';
import { scrollInventoryRowIntoViewIfNeeded, type InventoryRowKind } from './inventoryRowScroll';
import { useReserveDraft } from '@/components/reserve-draft';
import {
  inventoryReserveAnchor,
  inventoryReserveDocumentKey,
  mergeInventoryReserveItems,
  parseInventoryReserveAnchor,
  toInventoryReserveData,
  type InventoryReserveData,
} from './inventoryReserveDraft';
import { enrichInventorySessionsWithCatalogFlags } from './inventoryCatalogFlagsEnrichment';

type InventoryAccordionKind = InventoryRowKind;
type LastOpenedInventoryRow = { kind: InventoryAccordionKind; id: string };

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
  /** Склад поточної сесії введення: МС або ГП */
  sessionWarehouse: InventoryWarehouseScope | null;
  /** Активні чернетки користувача по складах (для стартового екрану) */
  pendingWarehouseDrafts: Partial<Record<InventoryWarehouseScope, { id: number; updatedAt: string }>>;
  loadPendingDrafts: () => Promise<void>;
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
  showConfirmCloseWithoutSaving: boolean;
  setShowConfirmCloseWithoutSaving: (v: boolean) => void;
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
  handleStartSession: (warehouse: InventoryWarehouseScope) => Promise<void>;
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
  /** Сесія в режимі перегляду (деталі без редагування) */
  viewingSession: InventorySession | null;
  closeSessionDetail: () => void;
  openSessionDetail: (session: InventorySession) => void;
  /** Явний перехід у режим редагування (кнопка «Редагувати») */
  handleBeginSessionEdit: (session: InventorySession) => Promise<void>;
  /** @deprecated використовуйте handleBeginSessionEdit */
  handleAdminLoadSession: (session: InventorySession) => Promise<void>;
  /** Адмін: відновити архівну сесію */
  handleAdminRestoreSession: (sessionId: string) => Promise<void>;
  /** Адмін: остаточно видалити сесію з БД */
  handleAdminDeletePermanently: (sessionId: string) => Promise<void>;
  /** true поки виконується запит на оновлення залишків */
  isRefreshingBalances: boolean;
  /** true — є незбережені зміни відносно останнього збереження/завантаження */
  isDirty: boolean;
  /** Локальний резерв, який відрізняється від офіційного збереження */
  reserveOffer: {
    savedAt: string;
    placeLabel: string | null;
    placeAnchor: string | null;
  } | null;
  continueReserveDraft: () => void;
  dismissReserveDraft: () => void;
  /** true — поточна сесія редагується (active) або адмін редагує завершену */
  isEditable: boolean;
  /** Завантаження preview / редагування з URL або після reconcile */
  sessionBootstrapLoading: boolean;
  sessionBootstrapMessage: string | null;
}

function parseWarehouseFieldFromApi(value: unknown): InventoryWarehouseScope | undefined {
  if (value === 'gp') return 'gp';
  if (value === 'small') return 'small';
  return undefined;
}

function mapInventorySessionFromApi(s: any): InventorySession {
  const rawItems = s.items;
  const items = typeof rawItems === 'string' ? JSON.parse(rawItems ?? '[]') : (rawItems ?? []);
  return {
    id: String(s.id),
    inventoryDate: s.inventoryDate ?? s.createdAt,
    createdAt: s.createdAt,
    createdBy: String(s.createdBy ?? ''),
    warehouse: parseWarehouseFieldFromApi(s.warehouse),
    status: s.status as InventoryStatus,
    completedAt: s.completedAt ?? null,
    comment: s.comment ?? '',
    items,
  };
}

export const useWarehouseInventory = (isAdmin: boolean = false): UseWarehouseInventoryReturn => {
  const navigate = useNavigate();
  const { warehousePrefix: urlWarehousePrefix, sessionId: urlSessionId } = useParams<{
    warehousePrefix?: string;
    sessionId?: string;
  }>();
  const urlBootstrapRef = useRef(false);

  const syncInventoryUrl = useCallback((scope: InventoryWarehouseScope | null, id: number | null) => {
    if (!scope) {
      navigate('/warehouse/inventory', { replace: true });
      return;
    }
    navigate(buildInventorySessionPath(scope, id), { replace: true });
  }, [navigate]);

  const [activeTab, setActiveTab] = useState<'current' | 'history' | 'archive'>('current');
  const [sessionStatus, setSessionStatus] = useState<InventoryStatus | null>(null);
  const [sessionOriginalStatus, setSessionOriginalStatus] = useState<InventoryStatus | null>(null);
  /** ID поточної сесії в БД (null = ще не збережена) */
  const [sessionId, setSessionId] = useState<number | null>(null);
  /** Дата створення активної сесії (ISO-рядок) */
  const [sessionDate, setSessionDate] = useState<string | null>(null);
  const [sessionWarehouse, setSessionWarehouse] = useState<InventoryWarehouseScope | null>(null);
  const [pendingWarehouseDrafts, setPendingWarehouseDrafts] = useState<
    Partial<Record<InventoryWarehouseScope, { id: number; updatedAt: string }>>
  >({});
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
  /** Останній рядок, акордеон якого користувач відкрив (для гарячих клавіш) */
  const [lastOpenedRow, setLastOpenedRow] = useState<LastOpenedInventoryRow | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [comment, setComment] = useState('');
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [showConfirmCloseWithoutSaving, setShowConfirmCloseWithoutSaving] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [showConfirmSaveUnconfirmed, setShowConfirmSaveUnconfirmed] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [historySessions, setHistorySessions] = useState<InventorySession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [archiveSessions, setArchiveSessions] = useState<InventorySession[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  /** Деталі документа без режиму редагування (напр. відкриття за URL) */
  const [viewingSession, setViewingSession] = useState<InventorySession | null>(null);
  const [sessionBootstrapLoading, setSessionBootstrapLoading] = useState(() => Boolean(urlSessionId));
  const [sessionBootstrapMessage, setSessionBootstrapMessage] = useState<string | null>(() =>
    (urlSessionId ? 'Завантаження інвентаризації…' : null),
  );
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
  /** Офіційний знімок для локального резерву. null — редактор ще не готовий. */
  const [reserveBaseline, setReserveBaseline] = useState<InventoryReserveData | null>(null);
  const rememberReserveBaseline = useCallback((
    nextProducts: InventoryProduct[],
    nextMaterials: InventoryProduct[],
    nextSets: InventoryProduct[],
    nextComment: string,
    nextDate: string | null,
  ) => {
    setReserveBaseline(toInventoryReserveData(nextProducts, nextMaterials, nextSets, nextComment, nextDate));
  }, []);

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
        doNotPublish: !!p.doNotPublish,
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
        isOutdated: !!m.isOutdated,
        doNotPublish: !!m.doNotPublish,
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
        doNotPublish: !!s.doNotPublish,
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

  const loadPendingDrafts = useCallback(async () => {
    try {
      const res = await fetch('/api/warehouse/inventory/drafts', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const next: Partial<Record<InventoryWarehouseScope, { id: number; updatedAt: string }>> = {};
      for (const draft of data.drafts ?? []) {
        const wh = parseSessionWarehouseFromApi(draft.warehouse);
        next[wh] = { id: Number(draft.id), updatedAt: String(draft.updatedAt) };
      }
      setPendingWarehouseDrafts(next);
    } catch {
      // ignore
    }
  }, []);

  const applyDraftFromServer = useCallback(async (draft: any, warehouse: InventoryWarehouseScope) => {
    const draftDateRaw = draft.inventoryDate ?? draft.createdAt ?? null;
    const draftDate = draftDateRaw ? new Date(draftDateRaw) : null;
    const effectiveDate = draftDate && !isNaN(draftDate.getTime()) ? draftDate : undefined;
    const [freshProducts, freshMaterials, freshSets] = await Promise.all([loadProducts(), loadMaterials(), loadSets(effectiveDate)]);

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

    const mergedSets = freshSets.map((s) => {
      const saved = savedSetsMap.get(s.id);
      if (!saved) return s;
      return { ...s, actualCount: saved.actualCount, boxCount: saved.boxCount, actualCountGp: saved.actualCountGp ?? null, boxCountGp: saved.boxCountGp ?? null, checked: saved.checked };
    });

    const scopedProducts = normalizeInventoryItemsForScope(mergedProducts, warehouse);
    const scopedMaterials = normalizeInventoryItemsForScope(mergedMaterials, warehouse);
    const scopedSets = normalizeInventoryItemsForScope(mergedSets, warehouse);

    setProducts(scopedProducts);
    setMaterials(scopedMaterials);
    setSets(scopedSets);

    const unconfirmedProductIds = scopedProducts.filter((p) => !p.checked && itemHasEnteredCountsForScope(p, warehouse)).map((p) => p.id);
    const unconfirmedMaterialIds = scopedMaterials.filter((m) => !m.checked && itemHasEnteredCountsForScope(m, warehouse)).map((m) => m.id);
    const unconfirmedSetIds = scopedSets.filter((s) => !s.checked && itemHasEnteredCountsForScope(s, warehouse)).map((s) => s.id);
    setOpenProductIds(new Set(unconfirmedProductIds));
    setOpenMaterialIds(new Set(unconfirmedMaterialIds));
    setOpenSetIds(new Set(unconfirmedSetIds));

    setSessionId(Number(draft.id));
    setSessionWarehouse(warehouse);
    setSessionStatus(draft.status !== 'revising' ? 'in_progress' : draft.status);
    setSessionOriginalStatus(null);
    setSessionDate(draft.inventoryDate ?? draft.createdAt ?? null);
    setComment(draft.comment ?? '');
    setLastSavedSnapshot(JSON.stringify([
      ...scopedProducts.map(({ id, actualCount, boxCount, actualCountGp, boxCountGp, checked }) => ({ id, actualCount, boxCount, actualCountGp, boxCountGp, checked })),
      ...scopedMaterials.map(({ id, actualCount, boxCount, actualCountGp, boxCountGp, checked }) => ({ id, actualCount, boxCount, actualCountGp, boxCountGp, checked })),
      ...scopedSets.map(({ id, actualCount, boxCount, actualCountGp, boxCountGp, checked }) => ({ id, actualCount, boxCount, actualCountGp, boxCountGp, checked })),
    ]));
    rememberReserveBaseline(scopedProducts, scopedMaterials, scopedSets, draft.comment ?? '', draft.inventoryDate ?? draft.createdAt ?? null);

    syncInventoryUrl(warehouse, Number(draft.id));

    if (effectiveDate) {
      await refreshSystemBalancesRef.current(effectiveDate, scopedProducts, scopedMaterials);
    }
  }, [loadProducts, loadMaterials, loadSets, syncInventoryUrl, rememberReserveBaseline]);

  useEffect(() => {
    void loadPendingDrafts();
  }, [loadPendingDrafts]);

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
      const sessions: InventorySession[] = (data.sessions ?? []).map(mapInventorySessionFromApi);
      setHistorySessions(await enrichInventorySessionsWithCatalogFlags(sessions));
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
      const sessions: InventorySession[] = (data.sessions ?? []).map(mapInventorySessionFromApi);
      setArchiveSessions(await enrichInventorySessionsWithCatalogFlags(sessions));
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

  const isLegacyCatalogItem = (item: InventoryProduct): boolean =>
    Boolean(item.isOutdated || item.doNotPublish);

  const isVisibleInInventoryList = (item: InventoryProduct): boolean =>
    showOutdated || !isLegacyCatalogItem(item) || item.checked || hasStockSomewhere(item);

  const visibleProducts = useMemo(
    () => products.filter(isVisibleInInventoryList),
    [products, showOutdated]
  );
  const checkedCount = useMemo(() => visibleProducts.filter((p) => p.checked).length, [visibleProducts]);
  const totalCount = visibleProducts.length;
  const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  const checkedMaterialsCount = useMemo(() => materials.filter((m) => m.checked).length, [materials]);
  const totalMaterialsCount = materials.length;
  const materialsProgressPercent = totalMaterialsCount > 0 ? Math.round((checkedMaterialsCount / totalMaterialsCount) * 100) : 0;

  const visibleSets = useMemo(
    () => sets.filter(isVisibleInInventoryList),
    [sets, showOutdated]
  );
  const checkedSetsCount = useMemo(() => visibleSets.filter((s) => s.checked).length, [visibleSets]);
  const totalSetsCount = visibleSets.length;
  const setsProgressPercent = totalSetsCount > 0 ? Math.round((checkedSetsCount / totalSetsCount) * 100) : 0;

  const totalCheckedAll = checkedCount + checkedMaterialsCount + checkedSetsCount;
  const totalAll = totalCount + totalMaterialsCount + totalSetsCount;
  const totalProgressPercent = totalAll > 0 ? Math.round((totalCheckedAll / totalAll) * 100) : 0;

  const activeWarehouseScope: InventoryWarehouseScope = sessionWarehouse ?? 'small';

  const deviationCount = useMemo(
    () => visibleProducts.filter((p) => {
      const total = factTotalForWarehouseScope(p, activeWarehouseScope);
      return total !== null && total !== systemBalanceForWarehouseScope(p, activeWarehouseScope);
    }).length,
    [visibleProducts, activeWarehouseScope]
  );

  const deviationMaterialsCount = useMemo(
    () => materials.filter((m) => {
      const total = factTotalForWarehouseScope(m, activeWarehouseScope);
      return total !== null && total !== systemBalanceForWarehouseScope(m, activeWarehouseScope);
    }).length,
    [materials, activeWarehouseScope]
  );

  const deviationSetsCount = useMemo(
    () => sets.filter((s) => {
      const total = factTotalForWarehouseScope(s, activeWarehouseScope);
      return total !== null && total !== systemBalanceForWarehouseScope(s, activeWarehouseScope);
    }).length,
    [sets, activeWarehouseScope]
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
          isVisibleInInventoryList(m) &&
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

  const reserveValue = useMemo(
    () => toInventoryReserveData(products, materials, sets, comment, sessionDate),
    [products, materials, sets, comment, sessionDate],
  );

  const reservePlace = useMemo(() => {
    if (!lastOpenedRow) return { label: null as string | null, anchor: null as string | null };
    const item = products.find((entry) => entry.id === lastOpenedRow.id)
      ?? materials.find((entry) => entry.id === lastOpenedRow.id)
      ?? sets.find((entry) => entry.id === lastOpenedRow.id);
    return {
      label: item?.name ?? null,
      anchor: inventoryReserveAnchor(lastOpenedRow),
    };
  }, [lastOpenedRow, products, materials, sets]);

  const reserveEditing = sessionStatus === 'in_progress' || sessionStatus === 'revising' || sessionStatus === 'completed';
  const reserveEnabled = reserveEditing && !sessionBootstrapLoading;
  const reserveDocumentKey = reserveEnabled
    ? inventoryReserveDocumentKey(sessionId, sessionWarehouse)
    : null;

  const {
    offer: reserveOfferRecord,
    acceptOffer: acceptReserveOffer,
    dismissOffer: dismissReserveDraft,
    clearReserve: clearReserveDraft,
  } = useReserveDraft({
    documentKey: reserveDocumentKey,
    value: reserveValue,
    baseline: reserveBaseline,
    enabled: reserveEnabled,
    placeLabel: reservePlace.label,
    placeAnchor: reservePlace.anchor,
  });

  const continueReserveDraft = useCallback(() => {
    if (!reserveOfferRecord || !sessionWarehouse) return;
    const scope = sessionWarehouse;
    const nextProducts = normalizeInventoryItemsForScope(
      mergeInventoryReserveItems(products, 'product', reserveOfferRecord.data.items),
      scope,
    );
    const nextMaterials = normalizeInventoryItemsForScope(
      mergeInventoryReserveItems(materials, 'material', reserveOfferRecord.data.items),
      scope,
    );
    const nextSets = normalizeInventoryItemsForScope(
      mergeInventoryReserveItems(sets, 'set', reserveOfferRecord.data.items),
      scope,
    );
    setProducts(nextProducts);
    setMaterials(nextMaterials);
    setSets(nextSets);
    setComment(reserveOfferRecord.data.comment);
    setSessionDate(reserveOfferRecord.data.sessionDate);

    const focus = parseInventoryReserveAnchor(reserveOfferRecord.placeAnchor);
    const unconfirmedIds = (list: InventoryProduct[]) => list
      .filter((item) => !item.checked && itemHasEnteredCountsForScope(item, scope))
      .map((item) => item.id);
    setOpenProductIds(new Set(
      focus?.kind === 'product' ? [...unconfirmedIds(nextProducts), focus.id] : unconfirmedIds(nextProducts),
    ));
    setOpenMaterialIds(new Set(
      focus?.kind === 'material' ? [...unconfirmedIds(nextMaterials), focus.id] : unconfirmedIds(nextMaterials),
    ));
    setOpenSetIds(new Set(
      focus?.kind === 'set' ? [...unconfirmedIds(nextSets), focus.id] : unconfirmedIds(nextSets),
    ));
    if (focus) {
      setLastOpenedRow(focus);
      scrollInventoryRowIntoViewIfNeeded(focus.kind, focus.id);
    }
    acceptReserveOffer();
  }, [reserveOfferRecord, sessionWarehouse, products, materials, sets, acceptReserveOffer]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleStartSession = async (warehouse: InventoryWarehouseScope) => {
    setSessionWarehouse(warehouse);
    setSessionOriginalStatus(null);
    try {
      const draftRes = await fetch(`/api/warehouse/inventory/draft?warehouse=${warehouse}`, { credentials: 'include' });
      if (draftRes.ok) {
        const draftData = await draftRes.json();
        if (draftData.draft) {
          await applyDraftFromServer(draftData.draft, warehouse);
          return;
        }
      }

      const startedAt = new Date().toISOString();
      setSessionStatus('in_progress');
      setSessionId(null);
      setSessionDate(startedAt);
      const [loadedProducts, loadedMaterials, loadedSets] = await Promise.all([
        loadProducts(),
        loadMaterials(),
        loadSets(),
      ]);
      setLastSavedSnapshot(JSON.stringify([
        ...loadedProducts.map(({ id, actualCount, boxCount, actualCountGp, boxCountGp, checked }) => ({ id, actualCount, boxCount, actualCountGp, boxCountGp, checked })),
        ...loadedMaterials.map(({ id, actualCount, boxCount, actualCountGp, boxCountGp, checked }) => ({ id, actualCount, boxCount, actualCountGp, boxCountGp, checked })),
        ...loadedSets.map(({ id, actualCount, boxCount, actualCountGp, boxCountGp, checked }) => ({ id, actualCount, boxCount, actualCountGp, boxCountGp, checked })),
      ]));
      rememberReserveBaseline(loadedProducts, loadedMaterials, loadedSets, comment, startedAt);
      syncInventoryUrl(warehouse, null);
    } catch {
      setSessionStatus('in_progress');
      syncInventoryUrl(warehouse, null);
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
          body: JSON.stringify({ comment, items: serializeItems(products, materials, sets), inventoryDate: sessionDate, warehouse: sessionWarehouse ?? 'small' }),
        });
      } else {
        await fetch('/api/warehouse/inventory/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ comment, items: serializeItems(products, materials, sets), inventoryDate: sessionDate, warehouse: sessionWarehouse ?? 'small' }),
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
    await loadPendingDrafts();
    await handleCloseView();
  };

  const handleToggleProduct = (id: string) => {
    const unconfirmedIds = products.filter((p) => !p.checked && (p.actualCount !== null || p.boxCount !== null)).map(p => p.id);
    setOpenProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        setLastOpenedRow({ kind: 'product', id });
      }
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
      else {
        next.add(id);
        setLastOpenedRow({ kind: 'material', id });
      }
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
      else {
        next.add(id);
        setLastOpenedRow({ kind: 'set', id });
      }
      for (const uid of unconfirmedIds) next.add(uid);
      return next;
    });
    setOpenSetId((prev) => (prev === id ? null : id));
  };

  const openSingleInventoryRow = useCallback((kind: InventoryAccordionKind, id: string) => {
    setOpenSetIds(kind === 'set' ? new Set([id]) : new Set());
    setOpenSetId(kind === 'set' ? id : null);
    setOpenProductIds(kind === 'product' ? new Set([id]) : new Set());
    setOpenProductId(kind === 'product' ? id : null);
    setOpenMaterialIds(kind === 'material' ? new Set([id]) : new Set());
    setOpenMaterialId(kind === 'material' ? id : null);
    setLastOpenedRow({ kind, id });
    scrollInventoryRowIntoViewIfNeeded(kind, id);
  }, []);

  const handleEnterPressProduct = (currentProductId: string) => {
    const currentIndex = filteredProducts.findIndex((p) => p.id === currentProductId);
    if (currentIndex === -1) return;

    if (currentIndex < filteredProducts.length - 1) {
      openSingleInventoryRow('product', filteredProducts[currentIndex + 1].id);
      return;
    }

    if (filteredMaterials.length > 0) {
      openSingleInventoryRow('material', filteredMaterials[0].id);
    }
  };

  const handleEnterPressMaterial = (currentMaterialId: string) => {
    const currentIndex = filteredMaterials.findIndex((m) => m.id === currentMaterialId);
    if (currentIndex === -1) return;

    if (currentIndex < filteredMaterials.length - 1) {
      openSingleInventoryRow('material', filteredMaterials[currentIndex + 1].id);
    }
  };

  const handleEnterPressSet = (currentSetId: string) => {
    const currentIndex = filteredSets.findIndex((s) => s.id === currentSetId);
    if (currentIndex === -1) return;

    if (currentIndex < filteredSets.length - 1) {
      openSingleInventoryRow('set', filteredSets[currentIndex + 1].id);
      return;
    }

    const productsSectionVisible = selectedCategory !== 'Коробки';
    if (productsSectionVisible && filteredProducts.length > 0) {
      openSingleInventoryRow('product', filteredProducts[0].id);
      return;
    }

    if (filteredMaterials.length > 0) {
      openSingleInventoryRow('material', filteredMaterials[0].id);
    }
  };

  const handleProductChange = (id: string, field: 'boxCount' | 'actualCount' | 'boxCountGp' | 'actualCountGp', value: number | null) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const handleCheckProduct = (id: string) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, checked: !p.checked } : p)));
  };

  const handleMaterialChange = (id: string, field: 'boxCount' | 'actualCount' | 'boxCountGp' | 'actualCountGp', value: number | null) => {
    setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const handleCheckMaterial = (id: string) => {
    setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, checked: !m.checked } : m)));
  };

  const handleSetChange = (id: string, field: 'boxCount' | 'actualCount' | 'boxCountGp' | 'actualCountGp', value: number | null) => {
    setSets((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const handleCheckSet = (id: string) => {
    setSets((prev) => prev.map((s) => (s.id === id ? { ...s, checked: !s.checked } : s)));
  };

  const handleResetItemValues = (id: string) => {
    const wh = sessionWarehouse ?? 'small';
    const scopeReset = wh === 'gp'
      ? { actualCountGp: null as null, boxCountGp: null as null }
      : { actualCount: null as null, boxCount: null as null };
    let found = false;
    setProducts(prev => prev.map(p => {
      if (p.id === id) {
        found = true;
        return { ...p, ...scopeReset };
      }
      return p;
    }));
    if (found) return;
    setMaterials(prev => prev.map(m => (m.id === id ? { ...m, ...scopeReset } : m)));
    setSets(prev => prev.map(s => (s.id === id ? { ...s, ...scopeReset } : s)));
  };

  const findInventoryItemById = useCallback((id: string): InventoryProduct | undefined => {
    return products.find((p) => p.id === id)
      ?? materials.find((m) => m.id === id)
      ?? sets.find((s) => s.id === id);
  }, [products, materials, sets]);

  const isAccordionOpen = useCallback((row: LastOpenedInventoryRow): boolean => {
    switch (row.kind) {
      case 'product':
        return openProductIds.has(row.id);
      case 'material':
        return openMaterialIds.has(row.id);
      case 'set':
        return openSetIds.has(row.id);
      default: {
        const _exhaustive: never = row.kind;
        return _exhaustive;
      }
    }
  }, [openProductIds, openMaterialIds, openSetIds]);

  useEffect(() => {
    if (activeTab !== 'current') return;
    if (sessionStatus !== 'in_progress' && sessionStatus !== 'revising' && sessionStatus !== 'completed') return;

    const uncheckLastOpenedRow = () => {
      if (!lastOpenedRow) return;
      switch (lastOpenedRow.kind) {
        case 'product':
          handleCheckProduct(lastOpenedRow.id);
          break;
        case 'material':
          handleCheckMaterial(lastOpenedRow.id);
          break;
        case 'set':
          handleCheckSet(lastOpenedRow.id);
          break;
        default: {
          const _never: never = lastOpenedRow.kind;
          return _never;
        }
      }
    };

    const advanceFromLastOpenedRow = () => {
      if (!lastOpenedRow) return;
      switch (lastOpenedRow.kind) {
        case 'product':
          handleEnterPressProduct(lastOpenedRow.id);
          break;
        case 'material':
          handleEnterPressMaterial(lastOpenedRow.id);
          break;
        case 'set':
          handleEnterPressSet(lastOpenedRow.id);
          break;
        default: {
          const _never: never = lastOpenedRow.kind;
          return _never;
        }
      }
    };

    const isInventoryToolbarTextInput = (el: HTMLInputElement): boolean => {
      const type = el.type;
      return type === 'text' || type === 'search' || type === 'email' || type === 'password';
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;

      if (e.key === 'Enter') {
        if (!lastOpenedRow || !isAccordionOpen(lastOpenedRow)) return;
        const item = findInventoryItemById(lastOpenedRow.id);
        if (!item?.checked) return;

        if (target instanceof HTMLTextAreaElement) return;
        if (target instanceof HTMLButtonElement) return;
        if (target instanceof HTMLInputElement && isInventoryToolbarTextInput(target)) return;
        if (target instanceof HTMLElement && target.isContentEditable) return;

        e.preventDefault();
        advanceFromLastOpenedRow();
        return;
      }

      if (e.key !== 'Delete' && e.key !== '-') return;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (target instanceof HTMLElement && target.isContentEditable) return;

      if (!lastOpenedRow || !sessionWarehouse) return;
      if (!isAccordionOpen(lastOpenedRow)) return;

      const item = findInventoryItemById(lastOpenedRow.id);
      if (!item) return;

      if (e.key === '-') {
        if (!item.checked) return;
        e.preventDefault();
        uncheckLastOpenedRow();
        return;
      }

      e.preventDefault();
      const rowId = lastOpenedRow.id;

      if (item.checked) {
        uncheckLastOpenedRow();
        handleResetItemValues(rowId);
        return;
      }

      if (itemHasEnteredCountsForScope(item, sessionWarehouse)) {
        handleResetItemValues(rowId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeTab,
    sessionStatus,
    sessionWarehouse,
    lastOpenedRow,
    isAccordionOpen,
    findInventoryItemById,
  ]);

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
    clearReserveDraft();
    setReserveBaseline(null);
    // Сесію скасовано — скидаємо snapshot, guard більше не активний
    setLastSavedSnapshot(null);
    setSessionId(null);
    setSessionStatus(null);
    setSessionOriginalStatus(null);
    setSessionWarehouse(null);
    setViewingSession(null);
    setComment('');
    setOpenProductId(null);
    setOpenProductIds(new Set());
    setOpenMaterialId(null);
    setOpenMaterialIds(new Set());
    setSearchQuery('');
    loadProducts();
    loadMaterials();
    void loadPendingDrafts();
    navigate('/warehouse/inventory', { replace: true });
  };

  // Зберегти чернетку (створити або оновити)
  const handleSaveDraft = async (force: boolean = false) => {
    setIsSavingDraft(true);
    try {
      // Перевіряємо, чи є позиції з введеними значеннями, але без підтвердження
      const scope = sessionWarehouse ?? 'small';
      const unconfirmed = [...products, ...materials, ...sets].filter((it) => !it.checked && itemHasEnteredCountsForScope(it, scope));
      if (unconfirmed.length > 0 && !force) {
        // Показуємо модальне підтвердження — користувач вирішує, чи продовжувати збереження
        pendingUnconfirmedActionRef.current = 'save';
        setShowConfirmSaveUnconfirmed(true);
        setIsSavingDraft(false);
        return;
      }

      // Видаляємо непідтверджені позиції перед збереженням (вони не повинні потрапляти в масив чернетки)
      const filterUnconfirmed = (arr: InventoryProduct[]) => arr.filter((it) => !( !it.checked && itemHasEnteredCountsForScope(it, scope) ));
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
        syncInventoryUrl(sessionWarehouse ?? 'small', sessionId);
      } else {
        const res = await fetch('/api/warehouse/inventory/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ comment, items, inventoryDate: sessionDate, warehouse: sessionWarehouse ?? 'small' }),
        });
        if (!res.ok) throw new Error('Помилка збереження');
        const data = await res.json();
        const newId = Number(data.session.id);
        setSessionId(newId);
        syncInventoryUrl(sessionWarehouse ?? 'small', newId);
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
      setLastSavedSnapshot(serializeForDirtyCheck(productsToSave, materialsToSave, setsToSave));
      clearReserveDraft();
      rememberReserveBaseline(productsToSave, materialsToSave, setsToSave, comment, sessionDate);
      void loadPendingDrafts();
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
    const revertSessionId = sessionId;
    const shouldRevertCompleted =
      revertSessionId != null
      && (sessionStatus === 'revising' || sessionOriginalStatus === 'completed');

    if (shouldRevertCompleted) {
      try {
        await fetch(`/api/warehouse/inventory/${revertSessionId}/abort-revision`, {
          method: 'POST',
          credentials: 'include',
        });
      } catch {
        // локально все одно закриваємо перегляд
      }
    }

    clearReserveDraft();
    setReserveBaseline(null);
    // Скидаємо локальний стан сесії — повний unmount поточного перегляду
    setLastSavedSnapshot(null);
    setSessionId(null);
    setSessionStatus(null);
    setSessionOriginalStatus(null);
    setSessionWarehouse(null);
    setViewingSession(null);
    setComment('');
    setOpenProductId(null);
    setOpenProductIds(new Set());
    setOpenMaterialId(null);
    setOpenMaterialIds(new Set());
    setSearchQuery('');
    try {
      await Promise.all([loadProducts(), loadMaterials(), loadSets()]);
      await loadPendingDrafts();
      if (shouldRevertCompleted) {
        await loadHistory();
      }
    } catch {
      // ігноруємо помилки при оновленні списків
    }
    navigate('/warehouse/inventory', { replace: true });
  }, [sessionId, sessionStatus, sessionOriginalStatus, loadProducts, loadMaterials, loadSets, loadPendingDrafts, loadHistory, navigate, clearReserveDraft]);

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

  const fetchReconciledSession = useCallback(async (session: InventorySession): Promise<InventorySession> => {
    try {
      const res = await fetch(`/api/warehouse/inventory/${session.id}/reconcile`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return session;
      const data = await res.json();
      return mapInventorySessionFromApi(data.session);
    } catch {
      return session;
    }
  }, []);

  const openSessionDetail = useCallback((session: InventorySession) => {
    void (async () => {
      setSessionBootstrapLoading(true);
      setSessionBootstrapMessage('Завантаження деталей інвентаризації…');
      try {
        const prepared = await fetchReconciledSession(session);
        setViewingSession(prepared);
        setActiveTab('current');
        const scope = resolveSessionWarehouseScope(prepared);
        syncInventoryUrl(scope, Number(prepared.id));
        void loadHistory();
      } finally {
        setSessionBootstrapLoading(false);
        setSessionBootstrapMessage(null);
      }
    })();
  }, [syncInventoryUrl, loadHistory, fetchReconciledSession]);

  const closeSessionDetail = useCallback(() => {
    setViewingSession(null);
    navigate('/warehouse/inventory', { replace: true });
  }, [navigate]);

  const handleBeginSessionEdit = useCallback(async (session: InventorySession): Promise<void> => {
    setViewingSession(null);
    setSessionBootstrapLoading(true);
    setSessionBootstrapMessage('Підготовка документа до редагування…');
    try {
    const sessionPrepared = await fetchReconciledSession(session);
    const sessionDateRaw = sessionPrepared.inventoryDate ?? sessionPrepared.createdAt ?? null;
    const sessionDateValue = sessionDateRaw ? new Date(sessionDateRaw) : null;
    const effectiveDate = sessionDateValue && !isNaN(sessionDateValue.getTime()) ? sessionDateValue : undefined;

    const [freshProducts, freshMaterials, freshSets] = await Promise.all([loadProducts(), loadMaterials(), loadSets(effectiveDate)]);

    const savedItems: Array<{ type?: string; id: string; actualCount: number | null; boxCount: number | null; actualCountGp?: number | null; boxCountGp?: number | null; checked: boolean }>
      = sessionPrepared.items as any;
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

    const adminScope = resolveSessionWarehouseScope(sessionPrepared);
    const scopedProducts = normalizeInventoryItemsForScope(mergedProducts, adminScope);
    const scopedMaterials = normalizeInventoryItemsForScope(mergedMaterials, adminScope);
    const scopedSets = normalizeInventoryItemsForScope(mergedSets, adminScope);

    setProducts(scopedProducts);
    setMaterials(scopedMaterials);
    setSets(scopedSets);
    setSessionId(Number(sessionPrepared.id));
    setSessionWarehouse(adminScope);
    setSessionOriginalStatus(sessionPrepared.status);
    const isActiveDraft = sessionPrepared.status === 'in_progress' || sessionPrepared.status === 'draft';
    if (!isActiveDraft && isAdmin) {
      try {
        await fetch(`/api/warehouse/inventory/${sessionPrepared.id}/revision`, { method: 'POST', credentials: 'include' });
      } catch {
        // Ignore server failure — client will still allow editing locally
      }
    }
    setSessionStatus(isActiveDraft ? 'in_progress' : 'revising');
    setSessionDate(sessionPrepared.inventoryDate ?? sessionPrepared.createdAt ?? null);
    setComment(sessionPrepared.comment ?? '');
    setLastSavedSnapshot(serializeForDirtyCheck(scopedProducts, scopedMaterials, scopedSets));
    rememberReserveBaseline(
      scopedProducts,
      scopedMaterials,
      scopedSets,
      sessionPrepared.comment ?? '',
      sessionPrepared.inventoryDate ?? sessionPrepared.createdAt ?? null,
    );
    setActiveTab('current');
    syncInventoryUrl(adminScope, Number(sessionPrepared.id));
    // Відкриваємо всі непідтверджені позиції після завантаження сесії адміністратором
    const unconfirmedProductIds = scopedProducts.filter((p) => !p.checked && itemHasEnteredCountsForScope(p, adminScope)).map((p) => p.id);
    const unconfirmedMaterialIds = scopedMaterials.filter((m) => !m.checked && itemHasEnteredCountsForScope(m, adminScope)).map((m) => m.id);
    setOpenProductIds(new Set(unconfirmedProductIds));
    setOpenMaterialIds(new Set(unconfirmedMaterialIds));
    const unconfirmedSetIds = scopedSets.filter((s) => !s.checked && itemHasEnteredCountsForScope(s, adminScope)).map((s) => s.id);
    setOpenSetIds(new Set(unconfirmedSetIds));
    // Завантажуємо залишки за обліком на дату сесії (через ref, щоб уникнути TDZ)
    if (effectiveDate) {
      await refreshSystemBalancesRef.current(effectiveDate, scopedProducts, scopedMaterials);
    }
    } finally {
      setSessionBootstrapLoading(false);
      setSessionBootstrapMessage(null);
    }
  }, [loadProducts, loadMaterials, loadSets, syncInventoryUrl, isAdmin, fetchReconciledSession, rememberReserveBaseline]);

  const handleAdminLoadSession = handleBeginSessionEdit;

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

  // Відкриття сесії з URL (/warehouse/inventory/sm|gp/:id або /warehouse/inventory/sm|gp)
  useEffect(() => {
    if (urlBootstrapRef.current) return;
    const scopeFromUrl = urlPrefixToWarehouseScope(urlWarehousePrefix);
    if (!scopeFromUrl) return;

    urlBootstrapRef.current = true;

    if (urlSessionId) {
      setActiveTab('current');
      setSessionBootstrapLoading(true);
      setSessionBootstrapMessage('Завантаження інвентаризації…');
      void (async () => {
        let opened = false;
        try {
          const res = await fetch('/api/warehouse/inventory/history', { credentials: 'include' });
          if (!res.ok) return;
          const data = await res.json();
          const sessions: InventorySession[] = (data.sessions ?? []).map(mapInventorySessionFromApi);
          const found = sessions.find((s) => String(s.id) === String(urlSessionId));
          if (found) {
            opened = true;
            openSessionDetail(found);
            return;
          }
          const draftRes = await fetch(`/api/warehouse/inventory/draft?warehouse=${scopeFromUrl}`, { credentials: 'include' });
          if (draftRes.ok) {
            const draftData = await draftRes.json();
            if (draftData.draft && String(draftData.draft.id) === String(urlSessionId)) {
              opened = true;
              openSessionDetail(mapInventorySessionFromApi({
                ...draftData.draft,
                warehouse: draftData.draft.warehouse ?? scopeFromUrl,
              }));
            }
          }
        } catch {
          // ignore
        } finally {
          if (!opened) {
            setSessionBootstrapLoading(false);
            setSessionBootstrapMessage(null);
          }
        }
      })();
      return;
    }

    if (sessionStatus === null) {
      void handleStartSession(scopeFromUrl);
    }
  }, [urlWarehousePrefix, urlSessionId, sessionStatus, openSessionDetail]);

  return {
    activeTab, setActiveTab,
    sessionStatus, sessionOriginalStatus, sessionId, sessionDate, setSessionDate,
    sessionWarehouse, pendingWarehouseDrafts, loadPendingDrafts,
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
    showConfirmCloseWithoutSaving, setShowConfirmCloseWithoutSaving,
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
    handleSessionDateChange,
    viewingSession, openSessionDetail, closeSessionDetail, handleBeginSessionEdit, handleAdminLoadSession,
    isRefreshingBalances,
    isDirty,
    reserveOffer: reserveOfferRecord
      ? {
          savedAt: reserveOfferRecord.savedAt,
          placeLabel: reserveOfferRecord.placeLabel,
          placeAnchor: reserveOfferRecord.placeAnchor,
        }
      : null,
    continueReserveDraft,
    dismissReserveDraft,
    handleCloseView,
    isEditable,
    handleAdminRestoreSession,
    handleAdminDeletePermanently,
    sessionBootstrapLoading,
    sessionBootstrapMessage,
  };
};
