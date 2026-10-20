import { useCallback, useMemo, useRef, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { ToastService } from '@/services/ToastService';
import type { WarehouseProductSearchHit } from '@shared/types/warehouseProductSearch';
import type { ReleaseComponentBatch } from '@shared/types/warehouseRelease';
import type { MovementDraft } from '../WarehouseMovement/WarehouseMovementTypes';
import { serializeMovementItems } from '../WarehouseMovement/WarehouseMovementUtils';
import { buildEffectiveNotes, formatLocalDateTime } from '../WarehouseMovement/hooks/useMovementDraftState';
import type { CreateWarehouseMovementRequest } from '@/types/warehouse';
import { linesToSummaryItems } from './movementV2Adapters';
import { lazyEnrichHistoryPage } from '@/pages/Warehouse/shared/lazyEnrichHistoryPage';
import type { MovementV2HistoryPagination, MovementV2Line } from './types';

const API_BASE = '/api/warehouse';
const MOVEMENT_HISTORY_API = `${API_BASE}/movements/history`;
const DEFAULT_STORAGE_FROM = '1100700000001005';
const DEFAULT_STORAGE_TO = '1100700000001019';

const DEFAULT_PAGINATION: MovementV2HistoryPagination = {
  page: 1,
  limit: 10,
  total: 0,
  pages: 1,
};

async function resolveDilovodId(sku: string): Promise<string | null> {
  const resp = await fetch(`/api/products?search=${encodeURIComponent(sku)}&limit=5`, { credentials: 'include' });
  const json = await resp.json().catch(() => ({}));
  const products = Array.isArray(json?.products) ? json.products : [];
  const exact = products.find((p: { sku?: string }) => String(p.sku) === sku);
  const row = exact ?? products[0];
  return row?.dilovodId ? String(row.dilovodId) : null;
}

export default function useWarehouseMovementV2() {
  const { apiCall } = useApi();
  const [storage, setStorage] = useState(DEFAULT_STORAGE_FROM);
  const [storageTo, setStorageTo] = useState(DEFAULT_STORAGE_TO);
  const [movementDateTime, setMovementDateTime] = useState(() => new Date());
  const [lines, setLines] = useState<MovementV2Line[]>([]);
  const [notes, setNotes] = useState('');
  const [savedDraft, setSavedDraft] = useState<MovementDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPagination, setHistoryPagination] = useState<MovementV2HistoryPagination>(DEFAULT_PAGINATION);
  const [historyDetailsLoading, setHistoryDetailsLoading] = useState<Record<string, boolean>>({});
  const [archiveSessions, setArchiveSessions] = useState<any[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archivePagination, setArchivePagination] = useState<MovementV2HistoryPagination>(DEFAULT_PAGINATION);

  const lastSavedSnapshotRef = useRef('');

  const summaryItems = useMemo(
    () => linesToSummaryItems(lines, storage),
    [lines, storage],
  );

  const storageName = storage;
  const storageToName = storageTo;

  const addProductFromSearch = useCallback(async (hit: WarehouseProductSearchHit) => {
    if (lines.some((line) => line.sku === hit.sku)) {
      ToastService.show({ title: 'Товар уже в реєстрі', color: 'warning' });
      return;
    }
    const dilovodId = await resolveDilovodId(hit.sku);
    const initialBatches: ReleaseComponentBatch[] = hit.batchId
      ? [{
        batchId: hit.batchId,
        batchNumber: hit.batchLabel ?? hit.batchId,
        quantity: 0,
      }]
      : [];

    const line: MovementV2Line = {
      id: `line-${hit.sku}-${Date.now()}`,
      sku: hit.sku,
      name: hit.name,
      barcode: hit.barcodes[0] ?? '',
      dilovodId,
      portionsPerBox: hit.portionsPerBox > 0 ? hit.portionsPerBox : 1,
      stockAtStorage: hit.stockAtStorage ?? null,
      batches: initialBatches,
    };
    setLines((prev) => [...prev, line]);
  }, [lines]);

  const updateLineBatches = useCallback((lineId: string, batches: ReleaseComponentBatch[]) => {
    setLines((prev) => prev.map((line) => (line.id === lineId ? { ...line, batches } : line)));
  }, []);

  const updateLinePortionsPerBox = useCallback((lineId: string, portionsPerBox: number) => {
    if (!Number.isFinite(portionsPerBox) || portionsPerBox <= 0) return;
    setLines((prev) => prev.map((line) => (
      line.id === lineId && line.portionsPerBox !== portionsPerBox
        ? { ...line, portionsPerBox }
        : line
    )));
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setLines((prev) => prev.filter((line) => line.id !== lineId));
  }, []);

  const clearAll = useCallback(() => {
    setLines([]);
    setNotes('');
    setSavedDraft(null);
    lastSavedSnapshotRef.current = '';
  }, []);

  const createMovement = useCallback(async (data: CreateWarehouseMovementRequest) => {
    const response = await apiCall(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, [apiCall]);

  const updateDraft = useCallback(async (id: number, data: { items: unknown[]; notes?: string; movementDate?: string }) => {
    const response = await apiCall(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, [apiCall]);

  const handleSaveDraft = useCallback(async (): Promise<MovementDraft | null> => {
    if (summaryItems.length === 0) {
      ToastService.show({
        title: 'Немає товарів для збереження',
        description: 'Додайте позиції з кількістю в партіях',
        color: 'danger',
      });
      return null;
    }

    setIsSaving(true);
    try {
      const items = serializeMovementItems(summaryItems);
      let result: MovementDraft & { _existing?: boolean };

      if (savedDraft && savedDraft.status !== 'finalized' && savedDraft.id > 0) {
        result = await updateDraft(savedDraft.id, {
          items,
          movementDate: movementDateTime.toISOString(),
          notes: buildEffectiveNotes(notes, false),
        });
      } else {
        result = await createMovement({
          sourceWarehouse: storage,
          destinationWarehouse: storageTo,
          items,
          movementDate: movementDateTime.toISOString(),
          notes: buildEffectiveNotes(notes, true),
        });
      }

      const saved: MovementDraft = {
        ...result,
        movementDate: formatLocalDateTime(movementDateTime),
      };
      setSavedDraft(saved);
      lastSavedSnapshotRef.current = JSON.stringify(summaryItems.map((p) => p.sku));
      return saved;
    } catch (error) {
      ToastService.show({
        title: 'Не вдалося зберегти чернетку',
        description: error instanceof Error ? error.message : undefined,
        color: 'danger',
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [createMovement, movementDateTime, notes, savedDraft, storage, storageTo, summaryItems, updateDraft]);

  const fetchHistoryPage = useCallback(async (
    status: 'active' | 'deleted',
    page: number,
    limit: number,
    sync = false,
    forceFullList = false,
    range?: { from?: string; to?: string },
  ) => {
    const url = new URL(MOVEMENT_HISTORY_API, window.location.origin);
    url.searchParams.set('status', status);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('sync', sync ? 'true' : 'false');
    if (forceFullList) url.searchParams.set('forceFullList', 'true');
    if (range?.from) url.searchParams.set('from', range.from);
    if (range?.to) url.searchParams.set('to', range.to);
    const response = await fetch(url.toString(), { credentials: 'include' });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json?.success) {
      throw new Error(json?.error || 'Не вдалося завантажити історію');
    }
    return {
      records: Array.isArray(json.data) ? json.data : [],
      pagination: json.pagination ?? { ...DEFAULT_PAGINATION, page, limit },
    };
  }, []);

  const loadHistoryRecordDetails = useCallback(async (
    record: { id: number | string },
    force = false,
    silent = false,
  ) => {
    const recordId = String(record.id);
    if (!silent) {
      setHistoryDetailsLoading((prev) => ({ ...prev, [recordId]: true }));
    }
    try {
      const url = `${MOVEMENT_HISTORY_API}/${encodeURIComponent(recordId)}/details${force ? '?force=true' : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'Не вдалося завантажити позиції');
      }
      const { items, itemsNormalized } = json.data ?? {};
      setHistory((prev) => prev.map((row) => (
        String(row.id) === recordId
          ? { ...row, items, itemsNormalized }
          : row
      )));
      return { ...record, items, itemsNormalized };
    } catch (e) {
      console.error('loadMovementHistoryRecordDetails', e);
      throw e;
    } finally {
      if (!silent) {
        setHistoryDetailsLoading((prev) => {
          const next = { ...prev };
          delete next[recordId];
          return next;
        });
      }
    }
  }, []);

  const loadHistory = useCallback(async (
    page = historyPagination.page,
    limit = historyPagination.limit,
    sync = false,
    forceFullList = false,
    range?: { from?: string; to?: string },
  ) => {
    setHistoryLoading(true);
    try {
      const result = await fetchHistoryPage('active', page, limit, sync, forceFullList, range);
      setHistory(result.records);
      setHistoryPagination(result.pagination);
      void lazyEnrichHistoryPage(result.records, loadHistoryRecordDetails);
    } catch (e) {
      console.error('loadMovementV2History', e);
    } finally {
      setHistoryLoading(false);
    }
  }, [fetchHistoryPage, historyPagination.page, historyPagination.limit, loadHistoryRecordDetails]);

  const loadArchive = useCallback(async (
    page = archivePagination.page,
    limit = archivePagination.limit,
  ) => {
    setArchiveLoading(true);
    try {
      const result = await fetchHistoryPage('deleted', page, limit, false, false);
      setArchiveSessions(result.records);
      setArchivePagination(result.pagination);
    } catch (e) {
      console.error('loadMovementV2Archive', e);
    } finally {
      setArchiveLoading(false);
    }
  }, [archivePagination.page, archivePagination.limit, fetchHistoryPage]);

  return {
    storage,
    setStorage,
    storageTo,
    setStorageTo,
    storageName,
    storageToName,
    movementDateTime,
    setMovementDateTime,
    lines,
    addProductFromSearch,
    updateLineBatches,
    updateLinePortionsPerBox,
    removeLine,
    clearAll,
    notes,
    setNotes,
    summaryItems,
    savedDraft,
    handleSaveDraft,
    isSaving,
    history,
    historyLoading,
    historyPagination,
    loadHistory,
    loadHistoryRecordDetails,
    historyDetailsLoading,
    archiveSessions,
    archiveLoading,
    archivePagination,
    loadArchive,
  };
}
