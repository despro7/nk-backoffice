import { useState, useEffect, useCallback } from 'react';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';
import { lazyEnrichHistoryPage } from '@/pages/Warehouse/shared/lazyEnrichHistoryPage';
import {
  DEFAULT_WAREHOUSE_DOC_HISTORY_PAGINATION,
  type WarehouseDocHistoryPagination,
} from '@/pages/Warehouse/shared/warehouseDocHistoryTypes';

export type EditingWarehouseSurplus = {
  id: number;
  surplusNumber?: string | null;
  docNumber?: string | null;
};

export type { WarehouseDocHistoryPagination };

const API = '/api/warehouse/surplus';

export default function useWarehouseSurplus(opts: { returns?: any } = {}) {
  const { returns: returnsOpt } = opts;
  const dirsCtx = useDilovodDirectories();

  const formatLocalDate = (date: Date): string => {
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };

  const [storages, setStorages] = useState<any[]>([]);
  const [productSearchResults, setProductSearchResults] = useState<any[]>([]);
  const [productSearchError, setProductSearchError] = useState<string | null>(null);
  const [batchesError, setBatchesError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyPagination, setHistoryPagination] = useState<WarehouseDocHistoryPagination>(DEFAULT_WAREHOUSE_DOC_HISTORY_PAGINATION);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [archiveRecords, setArchiveRecords] = useState<any[]>([]);
  const [archivePagination, setArchivePagination] = useState<WarehouseDocHistoryPagination>(DEFAULT_WAREHOUSE_DOC_HISTORY_PAGINATION);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EditingWarehouseSurplus | null>(null);
  const [historyDetailsLoading, setHistoryDetailsLoading] = useState<Record<string, boolean>>({});

  const parseHistoryItems = (record: { items?: unknown }) => {
    if (Array.isArray(record.items)) return record.items;
    try {
      const parsed = JSON.parse(String(record.items ?? '[]'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  useEffect(() => { void dirsCtx.loadDirectories(); }, []);
  useEffect(() => {
    const s = dirsCtx.directories?.storages || [];
    if (s.length > 0) setStorages(s);
  }, [dirsCtx.directories]);

  const searchProducts = async (query: string) => {
    if (!query?.trim()) { setProductSearchResults([]); return []; }
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(query)}&limit=20`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const json = await res.json();
      const list = json?.products || [];
      setProductSearchResults(list);
      setProductSearchError(null);
      return list;
    } catch (e: any) {
      setProductSearchResults([]);
      setProductSearchError(e?.message || String(e));
      return [];
    }
  };

  const getBatchesForSku = async (sku: string, firmId?: string) => {
    if (!sku) return [];
    try {
      const params = new URLSearchParams();
      if (firmId) params.set('firmId', firmId);
      const url = `/api/warehouse/batch-numbers/${encodeURIComponent(sku)}${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`Batches fetch failed: ${res.status}`);
      const json = await res.json();
      return json?.batches || [];
    } catch (e: any) {
      setBatchesError(e?.message || String(e));
      return [];
    }
  };

  const sendSurplus = async (body: any) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API}/send`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.json();
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestSend = async (params: any) => {
    const effectiveItems = params.items;
    if (!effectiveItems?.length) throw new Error('Немає товарів для оприбуткування');
    for (const it of effectiveItems) {
      if (!it.sku || !it.quantity || Number(it.quantity) <= 0) {
        throw new Error(`Невірна кількість для SKU ${it.sku || ''}`);
      }
    }
    return sendSurplus({
      items: effectiveItems.map((item: any) => ({
        sku: item.sku,
        batchId: item.selectedBatchId ?? item.batchId ?? null,
        quantity: item.quantity,
      })),
      comment: params.comment,
      reason: params.reason,
      customReason: params.customReason,
      firmId: params.firmId,
      storageId: params.storageId,
      date: params.date,
      dryRun: false,
    });
  };

  const previewWriteOff = async (params: any) => sendSurplus({
    ...params,
    items: (params.items || []).map((item: any) => ({
      sku: item.sku,
      batchId: item.selectedBatchId ?? item.batchId ?? null,
      quantity: item.quantity,
    })),
    dryRun: true,
  });

  const fetchHistoryPage = async (
    status: 'active' | 'deleted',
    page: number,
    limit: number,
    sync = false,
    forceFullList = false,
  ) => {
    const url = new URL(`${API}/history`, window.location.origin);
    url.searchParams.set('status', status);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('sync', sync ? 'true' : 'false');
    if (forceFullList) url.searchParams.set('forceFullList', 'true');
    const res = await fetch(url.toString(), { credentials: 'include' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) {
      throw new Error(json?.error || 'Не вдалося завантажити історію');
    }
    return {
      records: Array.isArray(json.data) ? json.data : [],
      pagination: json.pagination ?? { ...DEFAULT_WAREHOUSE_DOC_HISTORY_PAGINATION, page, limit },
    };
  };

  const loadArchive = async (page = archivePagination.page, limit = archivePagination.limit) => {
    setArchiveLoading(true);
    try {
      const result = await fetchHistoryPage('deleted', page, limit);
      setArchiveRecords(result.records);
      setArchivePagination(result.pagination);
    } catch (e) {
      console.error('loadSurplusArchive', e);
    } finally {
      setArchiveLoading(false);
    }
  };

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
      const url = `${API}/history/${encodeURIComponent(recordId)}/details${force ? '?force=true' : ''}`;
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
      console.error('loadHistoryRecordDetails', e);
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

  const loadHistory = async (
    page = historyPagination.page,
    limit = historyPagination.limit,
    sync = false,
    forceFullList = false,
  ) => {
    setHistoryLoading(true);
    try {
      const result = await fetchHistoryPage('active', page, limit, sync, forceFullList);
      setHistory(result.records);
      setHistoryPagination(result.pagination);
      void lazyEnrichHistoryPage(result.records, loadHistoryRecordDetails);
    } catch (e) {
      console.error('loadSurplusHistory', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const ensureHistoryRecordDetails = useCallback(async (record: any) => {
    const existing = parseHistoryItems(record);
    const normalized = Array.isArray(record.itemsNormalized) ? record.itemsNormalized : [];
    if (existing.length > 0 || normalized.length > 0) return record;
    const updated = await loadHistoryRecordDetails(record);
    return updated ?? record;
  }, [loadHistoryRecordDetails]);

  const cancelEdit = () => setEditingRecord(null);

  const beginEdit = (record: any) => {
    const rawItems = Array.isArray(record.items)
      ? record.items
      : (() => { try { return JSON.parse(record.items || '[]'); } catch { return []; } })();

    const prepared = rawItems.map((it: any) => ({
      id: crypto.randomUUID?.() ?? `${it.sku}-${Date.now()}`,
      sku: it.sku,
      name: it.name || it.productName || it.sku,
      quantity: Number(it.quantity || 0),
      orderedQuantity: Number(it.quantity || 0),
      portionsPerBox: 1,
      firmId: record.firmId ?? null,
      availableBatches: null,
      selectedBatchId: it.batchId ?? null,
      selectedBatchKey: null,
      price: 0,
    }));

    returnsOpt?.setItems?.(prepared);
    returnsOpt?.setReceiveFirmId?.(record.firmId ?? null);
    if (record.surplusDate || record.writeOffDate) {
      returnsOpt?.setReturnDate?.(String(record.surplusDate || record.writeOffDate));
    }

    setEditingRecord({
      id: Number(record.id),
      surplusNumber: record.surplusNumber ?? record.writeOffNumber ?? null,
      docNumber: record.docNumber ?? null,
    });
  };

  const saveEditedWriteOff = async (params: {
    items: any[];
    comment: string;
    reason: string;
    customReason?: string;
    firmId?: string | null;
    storageId?: string | null;
    date?: string;
  }) => {
    if (!editingRecord) throw new Error('Немає запису для редагування');
    const resp = await fetch(`${API}/history/${encodeURIComponent(String(editingRecord.id))}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: params.items.map((item) => ({
          sku: item.sku,
          batchId: item.selectedBatchId ?? item.batchId ?? null,
          quantity: item.quantity,
        })),
        comment: params.comment,
        reason: params.reason,
        customReason: params.customReason,
        firmId: params.firmId,
        storageId: params.storageId,
        date: params.date,
      }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || !json?.success) {
      throw new Error(json?.error || 'Не вдалося зберегти оприбуткування');
    }
    setEditingRecord(null);
    await loadHistory();
    return json;
  };

  return {
    storages,
    productSearchResults,
    setProductSearchResults,
    searchProducts,
    getBatchesForSku,
    productSearchError,
    batchesError,
    isSubmitting,
    history,
    loadHistory,
    historyPagination,
    historyLoading,
    archiveRecords,
    loadArchive,
    archivePagination,
    archiveLoading,
    loadHistoryRecordDetails,
    ensureHistoryRecordDetails,
    historyDetailsLoading,
    requestSend,
    previewWriteOff,
    editingRecord,
    beginEdit,
    cancelEdit,
    saveEditedWriteOff,
    formatLocalDate,
  };
}
