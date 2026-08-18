import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ToastService } from '@/services/ToastService';
import type {
  CatalogCreateGoodInput,
  CatalogDictionariesDto,
  CatalogGoodDetailDto,
  CatalogGoodDto,
  CatalogTreeNodeDto,
  CatalogUpdateGoodInput,
  DrawerMode,
} from './ProductsTypes';
import { CATALOG_ROOT_ID } from './ProductsTypes';
import { buildTreeItems } from './ProductsUtils';

async function catalogFetch<T>(url: string, init?: Parameters<typeof fetch>[1]): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return json.data as T;
}

export function useProductsCatalog() {
  const queryClient = useQueryClient();
  const [selectedFolderId, setSelectedFolderId] = useState<string>(CATALOG_ROOT_ID);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [duplicateConfirmOpen, setDuplicateConfirmOpen] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [pendingMove, setPendingMove] = useState<{
    ids: string[];
    targetParentId: string;
  } | null>(null);

  const treeQuery = useQuery({
    queryKey: ['catalog', 'tree'],
    queryFn: () => catalogFetch<CatalogTreeNodeDto[]>('/api/catalog/tree'),
  });

  const childrenQuery = useQuery({
    queryKey: ['catalog', 'children', selectedFolderId],
    queryFn: () =>
      catalogFetch<CatalogGoodDto[]>(
        `/api/catalog/folder/${selectedFolderId === CATALOG_ROOT_ID ? 'root' : selectedFolderId}/children`
      ),
  });

  const searchQueryEnabled = searchQuery.trim().length >= 2;
  const searchResultsQuery = useQuery({
    queryKey: ['catalog', 'search', searchQuery.trim()],
    queryFn: () =>
      catalogFetch<CatalogGoodDto[]>(
        `/api/catalog/search?q=${encodeURIComponent(searchQuery.trim())}`
      ),
    enabled: searchQueryEnabled,
  });

  const dictionariesQuery = useQuery({
    queryKey: ['catalog', 'dictionaries'],
    queryFn: () => catalogFetch<CatalogDictionariesDto>('/api/catalog/dictionaries'),
    staleTime: 30 * 60_000,
  });

  const detailQuery = useQuery({
    queryKey: ['catalog', 'good', editingId],
    queryFn: () => catalogFetch<CatalogGoodDetailDto>(`/api/catalog/goods/${editingId}`),
    enabled: Boolean(editingId) && drawerMode === 'edit',
    // Live-pull на сервері лише при відкритті картки — без фонового refetch
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const treeItems = useMemo(
    () => buildTreeItems(treeQuery.data || []),
    [treeQuery.data]
  );

  /** Повне дерево з архівами як окремими папками (picker / move). */
  const treeItemsFull = useMemo(
    () => buildTreeItems(treeQuery.data || [], { hideArchives: false }),
    [treeQuery.data]
  );

  /**
   * Інвалідація каталогу.
   * `skipLiveDetail` — після create/update: не рефетчити картку з live-pull
   * (локальне дзеркало вже оновлене відповіддю мутації).
   */
  const invalidateCatalog = useCallback(
    async (opts?: { skipLiveDetail?: boolean }) => {
      if (opts?.skipLiveDetail) {
        await queryClient.cancelQueries({ queryKey: ['catalog', 'good'] });
        queryClient.removeQueries({ queryKey: ['catalog', 'good'] });
        await queryClient.invalidateQueries({
          queryKey: ['catalog'],
          predicate: (query) => query.queryKey[1] !== 'good',
        });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['catalog'] });
    },
    [queryClient]
  );

  const refreshBranchMutation = useMutation({
    mutationFn: (folderId: string | null) =>
      catalogFetch<{
        upserted: number;
        orphansResolved: number;
        capped: boolean;
        legacySkuCount?: number;
        legacyOutdatedCount?: number;
        legacyError?: string | null;
        legacySync?: {
          success?: boolean;
          message?: string;
          createdProducts?: number;
          updatedProducts?: number;
          skippedProducts?: number;
          syncedSets?: number;
          errors?: string[];
        } | null;
      }>('/api/catalog/refresh', {
        method: 'POST',
        body: JSON.stringify({
          folderId: folderId ?? 'root',
          recursive: true,
        }),
      }),
    onSuccess: (data) => {
      const extra = data.capped ? ' (досягнуто ліміт глибини/вузлів)' : '';
      const legacy = data.legacySync;
      const legacyParts = legacy
        ? [
            legacy.createdProducts ? `створено ${legacy.createdProducts}` : null,
            legacy.updatedProducts ? `оновлено ${legacy.updatedProducts}` : null,
            legacy.skippedProducts ? `без змін ${legacy.skippedProducts}` : null,
          ].filter(Boolean)
        : [];
      const outdatedNote =
        data.legacyOutdatedCount && data.legacyOutdatedCount > 0
          ? `, архівних isOutdated: ${data.legacyOutdatedCount}`
          : '';
      const legacyNote =
        data.legacyError
          ? ` Legacy: помилка (${data.legacyError})`
          : data.legacySkuCount
            ? ` Legacy: ${data.legacySkuCount} SKU${legacyParts.length ? ` (${legacyParts.join(', ')})` : ''}${outdatedNote}`
            : outdatedNote
              ? ` Legacy${outdatedNote}`
              : '';
      ToastService.show({
        title: 'Гілку оновлено',
        description: `Записів каталогу: ${data.upserted}${extra}.${legacyNote}`,
        color: data.capped || data.legacyError || (legacy?.errors?.length ?? 0) > 0 ? 'warning' : 'success',
      });
      void invalidateCatalog();
    },
    onError: (err: Error) =>
      ToastService.show({ title: 'Помилка оновлення гілки', description: err.message, color: 'danger' }),
  });

  const syncSelectedMutation = useMutation({
    mutationFn: (ids: string[]) =>
      catalogFetch<{ upserted: number }>('/api/catalog/refresh', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: (data) => {
      ToastService.show({
        title: 'Синхронізовано з Діловодом',
        description: `Записів: ${data.upserted}`,
        color: 'success',
      });
      void invalidateCatalog();
    },
    onError: (err: Error) =>
      ToastService.show({ title: 'Помилка синхронізації', description: err.message, color: 'danger' }),
  });

  /** Legacy Dilovod sync → таблиця `products` (set/ціни/ШК/hash) по списку SKU. Force за замовчуванням. */
  const legacySyncMutation = useMutation({
    mutationFn: async (skus: string[]) => {
      const res = await fetch('/api/products/sync-manual', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus, force: true }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        error?: string;
        syncedProducts?: number;
        syncedSets?: number;
        createdProducts?: number;
        updatedProducts?: number;
        skippedProducts?: number;
        outdatedProducts?: number;
        errors?: string[];
      };
      if (!res.ok || json.success === false) {
        throw new Error(json.error || json.message || `HTTP ${res.status}`);
      }
      return json;
    },
    onSuccess: (data) => {
      const parts = [
        data.createdProducts ? `створено ${data.createdProducts}` : null,
        data.updatedProducts ? `оновлено ${data.updatedProducts}` : null,
        data.skippedProducts ? `без змін ${data.skippedProducts}` : null,
        data.outdatedProducts ? `архівних isOutdated ${data.outdatedProducts}` : null,
        data.syncedSets ? `комплектів ${data.syncedSets}` : null,
      ].filter(Boolean);
      ToastService.show({
        title: 'Синхронізація товарів завершена',
        description: parts.length > 0 ? parts.join(', ') : data.message || 'Готово',
        color: (data.errors?.length ?? 0) > 0 ? 'warning' : 'success',
      });
      if (data.errors && data.errors.length > 0) {
        ToastService.show({
          title: 'Є помилки синхронізації товарів',
          description: data.errors.slice(0, 3).join('; '),
          color: 'danger',
        });
      }
    },
    onError: (err: Error) =>
      ToastService.show({
        title: 'Помилка синхронізації товарів',
        description: err.message,
        color: 'danger',
      }),
  });

  const refreshFullMutation = useMutation({
    mutationFn: () =>
      catalogFetch<{ upserted: number }>('/api/catalog/refresh', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: (data) => {
      ToastService.show({
        title: 'Повний refresh завершено',
        description: `Записів: ${data.upserted}`,
        color: 'success',
      });
      void invalidateCatalog();
    },
    onError: (err: Error) =>
      ToastService.show({ title: 'Помилка повного refresh', description: err.message, color: 'danger' }),
  });

  const createMutation = useMutation({
    mutationFn: (input: CatalogCreateGoodInput) =>
      catalogFetch<CatalogGoodDetailDto>('/api/catalog/goods', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      const skuPart = data.sku ? ` · SKU ${data.sku}` : '';
      ToastService.show({
        title: 'Створено',
        description: data.isGroup
          ? `Група «${data.name}» збережена в Dilovod`
          : `«${data.name}»${skuPart} збережено в Dilovod`,
        color: 'success',
      });
      setDrawerMode(null);
      void invalidateCatalog({ skipLiveDetail: true });
    },
    onError: (err: Error) => ToastService.show({ title: 'Помилка створення', description: err.message, color: 'danger' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CatalogUpdateGoodInput }) =>
      catalogFetch<CatalogGoodDetailDto>(`/api/catalog/goods/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      const skuPart = data.sku ? ` · SKU ${data.sku}` : '';
      ToastService.show({
        title: 'Збережено',
        description: data.isGroup
          ? `Група «${data.name}» оновлена в Dilovod`
          : `«${data.name}»${skuPart} оновлено в Dilovod`,
        color: 'success',
      });
      setDrawerMode(null);
      setEditingId(null);
      void invalidateCatalog({ skipLiveDetail: true });
    },
    onError: (err: Error) => ToastService.show({ title: 'Помилка збереження', description: err.message, color: 'danger' }),
  });

  const moveMutation = useMutation({
    mutationFn: ({ ids, targetParentId }: { ids: string[]; targetParentId: string }) =>
      catalogFetch<{ moved: number; deactivated?: number }>('/api/catalog/goods/move', {
        method: 'POST',
        body: JSON.stringify({ ids, targetParentId }),
      }),
    onSuccess: (data) => {
      const deactivated = data.deactivated ?? 0;
      ToastService.show({
        title: 'Переміщено',
        description:
          deactivated > 0
            ? `Елементів: ${data.moved} (в архів: ${deactivated})`
            : `Елементів: ${data.moved}`,
        color: 'success',
      });
      setSelectedIds([]);
      setPendingMove(null);
      void invalidateCatalog();
    },
    onError: (err: Error) => ToastService.show({ title: 'Помилка переміщення', description: err.message, color: 'danger' }),
  });

  const reorderMutation = useMutation({
    mutationFn: (input: {
      parentId: string | null;
      id: string;
      beforeId?: string | null;
      afterId?: string | null;
    }) =>
      catalogFetch<{ id: string; sortOrder: number }>('/api/catalog/reorder', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void invalidateCatalog();
    },
    onError: (err: Error) =>
      ToastService.show({ title: 'Помилка сортування', description: err.message, color: 'danger' }),
  });

  const requestReorder = useCallback(
    (params: {
      parentId: string | null;
      id: string;
      beforeId?: string | null;
      afterId?: string | null;
    }) => {
      reorderMutation.mutate(params);
    },
    [reorderMutation]
  );

  const archiveMutation = useMutation({
    mutationFn: (ids: string[]) =>
      catalogFetch<{ archived: number }>('/api/catalog/goods/archive', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: (data) => {
      ToastService.show({ title: 'В архів', description: `Елементів: ${data.archived}`, color: 'success' });
      setSelectedIds([]);
      setArchiveConfirmOpen(false);
      void invalidateCatalog();
    },
    onError: (err: Error) => ToastService.show({ title: 'Помилка архівування', description: err.message, color: 'danger' }),
  });

  const restoreMutation = useMutation({
    mutationFn: (ids: string[]) =>
      catalogFetch<{ restored: number }>('/api/catalog/goods/restore', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: (data) => {
      ToastService.show({
        title: 'Відновлено з архіву',
        description: `Елементів: ${data.restored}`,
        color: 'success',
      });
      setSelectedIds([]);
      setRestoreConfirmOpen(false);
      void invalidateCatalog();
    },
    onError: (err: Error) =>
      ToastService.show({ title: 'Помилка відновлення', description: err.message, color: 'danger' }),
  });

  const trashMutation = useMutation({
    mutationFn: (ids: string[]) =>
      catalogFetch<{ trashed: number }>('/api/catalog/goods/trash', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: (data) => {
      ToastService.show({ title: 'У смітник', description: `Елементів: ${data.trashed}`, color: 'success' });
      setSelectedIds([]);
      setTrashConfirmOpen(false);
      void invalidateCatalog();
    },
    onError: (err: Error) => ToastService.show({ title: 'Помилка', description: err.message, color: 'danger' }),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) =>
      catalogFetch<CatalogGoodDetailDto>(`/api/catalog/goods/${id}/duplicate`, {
        method: 'POST',
        body: '{}',
      }),
    onSuccess: () => {
      ToastService.show({ title: 'Створено копію', color: 'success' });
      setDuplicateConfirmOpen(false);
      void invalidateCatalog();
    },
    onError: (err: Error) => ToastService.show({ title: 'Помилка дублювання', description: err.message, color: 'danger' }),
  });

  const requestMove = useCallback((ids: string[], targetParentId: string) => {
    const uniqueIds = [...new Set(ids.filter(Boolean))].filter((id) => id !== CATALOG_ROOT_ID);
    if (uniqueIds.length === 0) return;
    setPendingMove({ ids: uniqueIds, targetParentId });
  }, []);
  const openCreate = useCallback((asFolder = false) => {
    setEditingId(null);
    setDrawerMode(asFolder ? 'create-folder' : 'create');
  }, []);

  const openEdit = useCallback((id: string) => {
    setEditingId(id);
    setDrawerMode('edit');
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerMode(null);
    setEditingId(null);
  }, []);

  const tableRows = searchQueryEnabled
    ? searchResultsQuery.data || []
    : childrenQuery.data || [];

  return {
    selectedFolderId,
    setSelectedFolderId,
    selectedIds,
    setSelectedIds,
    searchQuery,
    setSearchQuery,
    drawerMode,
    editingId,
    archiveConfirmOpen,
    setArchiveConfirmOpen,
    trashConfirmOpen,
    setTrashConfirmOpen,
    duplicateConfirmOpen,
    setDuplicateConfirmOpen,
    restoreConfirmOpen,
    setRestoreConfirmOpen,
    pendingMove,
    setPendingMove,
    requestMove,
    requestReorder,
    treeItems,
    treeItemsFull,
    treeNodes: treeQuery.data || [],
    treeLoading: treeQuery.isLoading,
    treeError: treeQuery.error as Error | null,
    tableRows,
    tableLoading: searchQueryEnabled ? searchResultsQuery.isLoading : childrenQuery.isLoading,
    isSearchMode: searchQueryEnabled,
    dictionaries: dictionariesQuery.data || {
      units: [],
      priceTypes: [],
      currencies: [],
      accPolicies: [],
    },
    detail: detailQuery.data || null,
    // isFetching: і перше відкриття, і повторне (кеш є, але live-pull ще йде)
    detailLoading: detailQuery.isFetching,
    openCreate,
    openEdit,
    closeDrawer,
    refreshBranchMutation,
    syncSelectedMutation,
    legacySyncMutation,
    refreshFullMutation,
    createMutation,
    updateMutation,
    moveMutation,
    reorderMutation,
    archiveMutation,
    restoreMutation,
    trashMutation,
    duplicateMutation,
    invalidateCatalog,
  };
}

export type ProductsCatalogState = ReturnType<typeof useProductsCatalog>;
