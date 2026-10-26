import { useCallback, useMemo, useRef, useState } from 'react';
import { fetchWarehouseDocHistoryPage } from '@/pages/Warehouse/shared/fetchWarehouseDocHistoryPage';
import {
  DEFAULT_WAREHOUSE_DOC_HISTORY_FILTERS,
  type WarehouseDocHistoryFilters,
} from '@shared/utils/warehouseDocHistoryListQuery';
import { useApi } from '@/hooks/useApi';
import { ToastService } from '@/services/ToastService';
import type { WarehouseProductSearchHit } from '@shared/types/warehouseProductSearch';
import type { ReleaseComponentBatch } from '@shared/types/warehouseRelease';
import type { MovementDraft } from '../WarehouseMovement/WarehouseMovementTypes';
import { serializeMovementItems } from '../WarehouseMovement/WarehouseMovementUtils';
import { buildEffectiveNotes, formatLocalDateTime } from '../WarehouseMovement/hooks/useMovementDraftState';
import type { CreateWarehouseMovementRequest } from '@/types/warehouse';
import { linesFromGoodMovingDetails, linesToSummaryItems } from './movementV2Adapters';
import { enrichMovementV2LinesIsSet, fetchSkusIsSet } from './movementV2Catalog';
import { fetchGoodMovingDetailsForEdit } from '@/features/warehouse-document-edit/api/fetchGoodMovingDetailsForEdit';
import { goodMovingDocumentFromDetails } from '@/features/warehouse-document-edit/utils/goodMovingDocumentFromDetails';
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
  /** Локальний запис з mob-сканом (ШК у items) — v2 edit не затирає ці поля після merge на сервері. */
  const [linkedMobScan, setLinkedMobScan] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPagination, setHistoryPagination] = useState<MovementV2HistoryPagination>(DEFAULT_PAGINATION);
  const [historyDetailsLoading, setHistoryDetailsLoading] = useState<Record<string, boolean>>({});
  const [archiveSessions, setArchiveSessions] = useState<any[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archivePagination, setArchivePagination] = useState<MovementV2HistoryPagination>(DEFAULT_PAGINATION);
  const [historyFilters, setHistoryFilters] = useState<WarehouseDocHistoryFilters>(DEFAULT_WAREHOUSE_DOC_HISTORY_FILTERS);
  const historyFiltersRef = useRef(historyFilters);
  historyFiltersRef.current = historyFilters;

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
    const fromHit = String(hit.catalogGoodId ?? '').trim();
    const dilovodId = fromHit || await resolveDilovodId(hit.sku);
    const initialBatches: ReleaseComponentBatch[] = hit.batchId
      ? [{
        batchId: hit.batchId,
        batchNumber: hit.batchLabel ?? hit.batchId,
        quantity: 0,
      }]
      : [];

    const isSetBySku = await fetchSkusIsSet([hit.sku]);
    const line: MovementV2Line = {
      id: `line-${hit.sku}-${Date.now()}`,
      sku: hit.sku,
      name: hit.name,
      barcode: hit.barcodes[0] ?? '',
      dilovodId,
      portionsPerBox: hit.portionsPerBox > 0 ? hit.portionsPerBox : 1,
      isSet: isSetBySku.get(hit.sku) ?? false,
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

      if (savedDraft && savedDraft.id > 0) {
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
          ...(savedDraft?.dilovodDocId ? { dilovodDocId: savedDraft.dilovodDocId } : {}),
          ...(savedDraft?.docNumber ? { docNumber: String(savedDraft.docNumber) } : {}),
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
    filters: WarehouseDocHistoryFilters = historyFiltersRef.current,
  ) => fetchWarehouseDocHistoryPage(
    MOVEMENT_HISTORY_API,
    status,
    page,
    limit,
    filters,
    {
      sync: sync ? 'true' : 'false',
      ...(forceFullList ? { forceFullList: 'true' } : {}),
    },
  ), []);

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
    filters: WarehouseDocHistoryFilters = historyFiltersRef.current,
  ) => {
    setHistoryLoading(true);
    try {
      const result = await fetchHistoryPage('active', page, limit, sync, forceFullList, filters);
      setHistory(result.records);
      setHistoryPagination(result.pagination);
      void lazyEnrichHistoryPage(result.records, loadHistoryRecordDetails);
    } catch (e) {
      console.error('loadMovementV2History', e);
    } finally {
      setHistoryLoading(false);
    }
  }, [fetchHistoryPage, historyPagination.page, historyPagination.limit, loadHistoryRecordDetails]);

  const loadFromDilovodDocument = useCallback(async (dilovodDocumentId: string) => {
    let localRecord: {
      id?: number;
      status?: string;
      internalDocNumber?: string;
      sourceWarehouse?: string;
      destinationWarehouse?: string;
      hasMobScanItems?: boolean;
    } | null = null;
    try {
      const localRes = await fetch(
        `/api/warehouse/movement-by-dilovod/${encodeURIComponent(dilovodDocumentId)}`,
        { credentials: 'include' },
      );
      if (localRes.ok) {
        localRecord = await localRes.json();
      }
    } catch {
      localRecord = null;
    }
    setLinkedMobScan(Boolean(localRecord?.hasMobScanItems));

    const details = await fetchGoodMovingDetailsForEdit(dilovodDocumentId);
    const doc = goodMovingDocumentFromDetails(dilovodDocumentId, details);

    if (doc.storage) setStorage(doc.storage);
    if (doc.storageTo) setStorageTo(doc.storageTo);
    if (doc.date) {
      const parsed = new Date(doc.date.replace(' ', 'T'));
      if (!Number.isNaN(parsed.getTime())) setMovementDateTime(parsed);
    }

    const remark = doc.remark
      ? doc.remark.replace(/(?:\s*\|\s*)?(?:Додано|Оновлено) з Backoffice(?: \(сканування\))?.*$/, '').trim()
      : '';
    setNotes(remark);

    const nextLines = await enrichMovementV2LinesIsSet(linesFromGoodMovingDetails(details));
    setLines(nextLines);

    const draft: MovementDraft = {
      id: localRecord?.id ?? 0,
      internalDocNumber: localRecord?.internalDocNumber || doc.number || '0',
      docNumber: doc.number || undefined,
      dilovodDocId: dilovodDocumentId,
      status: (localRecord?.status as MovementDraft['status']) ?? 'draft',
      sourceWarehouse: localRecord?.sourceWarehouse || doc.storage || storage,
      destinationWarehouse: localRecord?.destinationWarehouse || doc.storageTo || storageTo,
      items: [],
      draftCreatedAt: new Date().toISOString(),
      movementDate: formatLocalDateTime(
        doc.date ? new Date(doc.date.replace(' ', 'T')) : movementDateTime,
      ),
    };
    setSavedDraft(draft);
    lastSavedSnapshotRef.current = JSON.stringify(nextLines.map((l) => l.sku));
  }, [movementDateTime, storage, storageTo]);

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

  const deleteHistoryRecord = useCallback(async (recordId: string) => {
    const id = String(recordId).trim();
    if (!id || !Number.isFinite(Number(id))) {
      throw new Error('Некоректний id запису');
    }
    const response = await apiCall(`${API_BASE}/${id}`, { method: 'DELETE' });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json?.success) {
      throw new Error(json?.error || `HTTP ${response.status}`);
    }
  }, [apiCall]);

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
    historyFilters,
    setHistoryFilters,
    loadHistory,
    loadHistoryRecordDetails,
    historyDetailsLoading,
    archiveSessions,
    archiveLoading,
    archivePagination,
    loadArchive,
    loadFromDilovodDocument,
    linkedMobScan,
    deleteHistoryRecord,
  };
}
