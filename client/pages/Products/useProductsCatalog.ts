import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ToastService } from '@/services/ToastService';
import type {
  CatalogCreateGoodInput,
  CatalogGoodDetailDto,
  CatalogGoodDto,
  CatalogTreeNodeDto,
  CatalogUnitDto,
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
  const [trashOpen, setTrashOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [duplicateConfirmOpen, setDuplicateConfirmOpen] = useState(false);
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

  const trashQuery = useQuery({
    queryKey: ['catalog', 'trash'],
    queryFn: () => catalogFetch<CatalogGoodDto[]>('/api/catalog/trash'),
    enabled: trashOpen,
  });

  const unitsQuery = useQuery({
    queryKey: ['catalog', 'units'],
    queryFn: () => catalogFetch<CatalogUnitDto[]>('/api/catalog/units'),
    staleTime: 5 * 60_000,
  });

  const detailQuery = useQuery({
    queryKey: ['catalog', 'good', editingId],
    queryFn: () => catalogFetch<CatalogGoodDetailDto>(`/api/catalog/goods/${editingId}`),
    enabled: Boolean(editingId) && drawerMode === 'edit',
  });

  const treeItems = useMemo(
    () => buildTreeItems(treeQuery.data || []),
    [treeQuery.data]
  );

  const invalidateCatalog = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['catalog'] }),
    ]);
  }, [queryClient]);

  const refreshMutation = useMutation({
    mutationFn: (ids?: string[]) =>
      catalogFetch<{ upserted: number }>('/api/catalog/refresh', {
        method: 'POST',
        body: JSON.stringify(ids ? { ids } : {}),
      }),
    onSuccess: (data) => {
      ToastService.show({ title: 'Оновлено з Dilovod', description: `Записів: ${data.upserted}`, color: 'success' });
      void invalidateCatalog();
    },
    onError: (err: Error) => ToastService.show({ title: 'Помилка оновлення', description: err.message, color: 'danger' }),
  });

  const createMutation = useMutation({
    mutationFn: (input: CatalogCreateGoodInput) =>
      catalogFetch<CatalogGoodDetailDto>('/api/catalog/goods', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      ToastService.show({ title: 'Створено', color: 'success' });
      setDrawerMode(null);
      void invalidateCatalog();
    },
    onError: (err: Error) => ToastService.show({ title: 'Помилка створення', description: err.message, color: 'danger' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CatalogUpdateGoodInput }) =>
      catalogFetch<CatalogGoodDetailDto>(`/api/catalog/goods/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      ToastService.show({ title: 'Збережено', color: 'success' });
      setDrawerMode(null);
      setEditingId(null);
      void invalidateCatalog();
    },
    onError: (err: Error) => ToastService.show({ title: 'Помилка збереження', description: err.message, color: 'danger' }),
  });

  const moveMutation = useMutation({
    mutationFn: ({ ids, targetParentId }: { ids: string[]; targetParentId: string }) =>
      catalogFetch<{ moved: number }>('/api/catalog/goods/move', {
        method: 'POST',
        body: JSON.stringify({ ids, targetParentId }),
      }),
    onSuccess: (data) => {
      ToastService.show({ title: 'Переміщено', description: `Елементів: ${data.moved}`, color: 'success' });
      setSelectedIds([]);
      setPendingMove(null);
      void invalidateCatalog();
    },
    onError: (err: Error) => ToastService.show({ title: 'Помилка переміщення', description: err.message, color: 'danger' }),
  });

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
    trashOpen,
    setTrashOpen,
    archiveConfirmOpen,
    setArchiveConfirmOpen,
    trashConfirmOpen,
    setTrashConfirmOpen,
    duplicateConfirmOpen,
    setDuplicateConfirmOpen,
    pendingMove,
    setPendingMove,
    requestMove,
    treeItems,
    treeLoading: treeQuery.isLoading,
    treeError: treeQuery.error as Error | null,
    tableRows,
    tableLoading: searchQueryEnabled ? searchResultsQuery.isLoading : childrenQuery.isLoading,
    isSearchMode: searchQueryEnabled,
    trashItems: trashQuery.data || [],
    trashLoading: trashQuery.isLoading,
    units: unitsQuery.data || [],
    detail: detailQuery.data || null,
    detailLoading: detailQuery.isLoading,
    openCreate,
    openEdit,
    closeDrawer,
    refreshMutation,
    createMutation,
    updateMutation,
    moveMutation,
    archiveMutation,
    trashMutation,
    duplicateMutation,
    invalidateCatalog,
  };
}

export type ProductsCatalogState = ReturnType<typeof useProductsCatalog>;
