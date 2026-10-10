import { useState, useEffect, useCallback } from 'react';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';
import { filterWarehouseSelectableBatches } from '@/pages/Warehouse/shared/filterWarehouseSelectableBatches';
import { lazyEnrichHistoryPage } from '@/pages/Warehouse/shared/lazyEnrichHistoryPage';

export type EditingWarehouseWriteOff = {
  id: number;
  writeOffNumber?: string | null;
  docNumber?: string | null;
};

export interface WarehouseDocHistoryPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const DEFAULT_PAGINATION: WarehouseDocHistoryPagination = {
  page: 1,
  limit: 10,
  total: 0,
  pages: 1,
};

const HISTORY_API = '/api/warehouse/writeoff/history';

interface Opts {
  returns?: any;
}

export default function useWarehouseWriteOff(opts: Opts = {}) {
  const { returns: returnsOpt } = opts;
  // useDilovodDirectories на верхньому рівні хука (правило хуків)
  const dirsCtx = useDilovodDirectories();

  const formatLocalDate = (date: Date): string => {
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };

  const [storages, setStorages] = useState<any[]>([]);
  const [selectedStorage, setSelectedStorage] = useState<string | null>(null);
  const [items, setItems] = useState<Array<any>>([]);
  const [productSearchResults, setProductSearchResults] = useState<any[]>([]);
  const [batchesBySku, setBatchesBySku] = useState<Record<string, any[]>>({});
  const [productSearchError, setProductSearchError] = useState<string | null>(null);
  const [batchesError, setBatchesError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyPagination, setHistoryPagination] = useState<WarehouseDocHistoryPagination>(DEFAULT_PAGINATION);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [archiveRecords, setArchiveRecords] = useState<any[]>([]);
  const [archivePagination, setArchivePagination] = useState<WarehouseDocHistoryPagination>(DEFAULT_PAGINATION);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [orderDetails, setOrderDetails] = useState<any | null>(null);
  const [editingRecord, setEditingRecord] = useState<EditingWarehouseWriteOff | null>(null);
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

  // Ініціює завантаження один раз при монтуванні через централізований провайдер
  useEffect(() => { void dirsCtx.loadDirectories(); }, []);

  // Синхронізує локальний стан складів щоразу, коли провайдер отримує дані
  useEffect(() => {
    const s = dirsCtx.directories?.storages || [];
    if (s.length > 0) {
      setStorages(s);
      setSelectedStorage((prev) => prev ?? String(s[0].id ?? null));
    }
  }, [dirsCtx.directories]);

  // Load order details by externalId (used by UI)
  const loadOrderDetails = async (externalId: string | null) => {
    if (!externalId) { setOrderDetails(null); return null; }
    try {
      const res = await fetch(`/api/orders/${externalId}`, { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!res.ok) { console.error('order details fetch not ok', res.status); setOrderDetails(null); return null; }
      const body = await res.json();
      let order = body?.data || body;
      if (Array.isArray(order) && order.length > 0) order = order[0];
      setOrderDetails(order);
      return order;
    } catch (e) {
      console.error('load order details', e);
      setOrderDetails(null);
      return null;
    }
  };

  const addItem = (item: any) => {
    setItems((s) => [...s, { id: crypto.randomUUID?.() ?? Date.now().toString(), ...item }]);
  };

  const addItemFromProduct = (product: any, quantity: number, batchId: string | null) => {
    const item = {
      sku: product.sku || product.code || product.id,
      name: product.name || product.title || product.displayName || product.sku,
      quantity: Number(quantity || 0),
      batchId: batchId ?? null,
      productId: product.id || null,
    };
    addItem(item);
  };

  // Add order line into returns (preferred) or local items if returns not provided
  const addOrderLineFromOrder = async (sku: string, line: any, maxQty: number, qtyArg?: number, returnsParam?: any) => {
    const qty = typeof qtyArg === 'number' ? qtyArg : 1;
    if (!qty || qty <= 0) return;
    const id = crypto.randomUUID?.() ?? `${sku}-${Date.now()}-${Math.random()}`;
    const newItem = {
      id,
      sku,
      name: line.productName || line.text || line.title || line.name || sku,
      dilovodId: line.dilovodId ?? null,
      quantity: qty,
      orderedQuantity: maxQty,
      portionsPerBox: line.portionsPerItem ?? 1,
      firmId: line.firmId ?? (returnsParam?.shipFirmId ?? returnsParam?.receiveFirmId) ?? null,
      availableBatches: null,
      selectedBatchId: null,
      selectedBatchKey: null,
      price: 0,
    };

    // If returns provided, add into returns and fetch batches for it
    const targetReturns = returnsParam ?? returnsOpt ?? null;
    if (targetReturns && typeof targetReturns.setItems === 'function') {
      targetReturns.setItems([...(targetReturns.items || []), newItem]);
      return;
    }

    // Fallback: add to local items and fetch batches into local map
    addItem(newItem);
    try {
      const batches = await getBatchesForSku(sku, newItem.firmId || undefined);
      setBatchesBySku((prev) => ({ ...prev, [sku]: batches }));
    } catch (e) {
      // ignore
    }
  };

  const searchProducts = async (query: string) => {
    if (!query || query.trim() === '') { setProductSearchResults([]); return []; }
    try {
      // Use products listing endpoint for search
      const res = await fetch(`/api/products?search=${encodeURIComponent(query)}&limit=20`, { credentials: 'include' });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Search failed: ${res.status} ${txt}`);
      }
      if (!contentType.includes('application/json')) {
        const txt = await res.text();
        throw new Error(`Expected JSON but got: ${txt.slice(0,200)}`);
      }
      const json = await res.json();
      const list = json?.products || [];
      setProductSearchResults(list);
      setProductSearchError(null);
      return list;
    } catch (e:any) {
      console.error('searchProducts error', e);
      setProductSearchResults([]);
      setProductSearchError(e?.message || String(e));
      return [];
    }
  };

  const getBatchesForSku = async (sku: string, firmId?: string) => {
    if (!sku) return [];
    try {
      // Call warehouse batch-numbers endpoint
      const params = new URLSearchParams();
      if (firmId) params.set('firmId', firmId);
      // asOfDate omitted; can be passed if needed
      const url = `/api/warehouse/batch-numbers/${encodeURIComponent(sku)}${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Batches fetch failed: ${res.status} ${txt}`);
      }
      if (!contentType.includes('application/json')) {
        const txt = await res.text();
        throw new Error(`Expected JSON but got: ${txt.slice(0,200)}`);
      }
      const json = await res.json();
      const raw = Array.isArray(json?.batches) ? json.batches : [];
      const list = filterWarehouseSelectableBatches(
        raw.map((batch: any, index: number) => {
          const normalizedBatchId = batch.batchId || batch.id || '';
          const normalizedStorage = batch.storage || batch.storageDisplayName || '';
          const uniqueId = normalizedBatchId
            ? `${normalizedBatchId}-${normalizedStorage || index}`
            : `${sku}-${batch.batchNumber || 'unknown'}-${normalizedStorage || index}`;
          return {
            id: uniqueId,
            batchId: normalizedBatchId,
            batchNumber: batch.batchNumber || batch.goodPart__pr || batch.name || 'Невідома партія',
            quantity: Number(batch.quantity ?? batch.qty ?? 0),
            storage: normalizedStorage || undefined,
            storageDisplayName: batch.storageDisplayName || batch.storage__pr || undefined,
          };
        }),
      );
      setBatchesBySku((s) => ({ ...s, [sku]: list }));
      setBatchesError(null);
      return list;
    } catch (e:any) {
      console.error('getBatchesForSku error', e);
      setBatchesError(e?.message || String(e));
      return [];
    }
  };

  const removeItem = (id: string) => setItems((s) => s.filter(i => i.id !== id));

  const sendWriteOff = async ({ items: payloadItems, comment, reason, customReason, firmId, storageId, date, dryRun }: any) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/warehouse/writeoff/send', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payloadItems || items, comment, reason, customReason, firmId, storageId: storageId ?? selectedStorage, date, dryRun }),
      });
      const json = await res.json();
      return json;
    } catch (e) {
      console.error('sendWriteOff error', e);
      throw e;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Build preview (dryRun) — returns server response JSON
  const buildPreview = async ({ items: payloadItems, comment, reason, customReason, firmId, storageId, date }: any) => {
    // Reuse sendWriteOff with dryRun flag
    return await sendWriteOff({ items: payloadItems || items, comment, reason, customReason, firmId, storageId: storageId ?? selectedStorage, date, dryRun: true });
  };

  // Preview wrapper that uses returns when provided
  const previewWriteOff = async ({ returns: returnsParam, orderId, date, firmId, storageId, items: payloadItems, comment, reason, customReason }: any) => {
    const effectiveDate = date ?? (returnsParam?.returnDate ?? formatLocalDate(new Date()));
    const effectiveFirm = firmId ?? (returnsParam?.receiveFirmId ?? undefined);
    const effectiveStorage = storageId ?? selectedStorage ?? (returnsParam?.selectedStorage ?? undefined);
    const effectiveItems = payloadItems ?? (returnsParam?.items || items);
    return await buildPreview({ items: effectiveItems, comment, reason, customReason, firmId: effectiveFirm, storageId: effectiveStorage, date: effectiveDate });
  };

  const sendConfirmWriteOff = async ({ returns: returnsParam, orderId, date, firmId, storageId, items: payloadItems, comment, reason, customReason, dryRun }: any) => {
    const effectiveDate = date ?? (returnsParam?.returnDate ?? formatLocalDate(new Date()));
    const effectiveFirm = firmId ?? (returnsParam?.receiveFirmId ?? undefined);
    const effectiveStorage = storageId ?? selectedStorage ?? (returnsParam?.selectedStorage ?? undefined);
    const effectiveItems = payloadItems ?? (returnsParam?.items || items);
    return await sendWriteOffWithClientValidation({ items: effectiveItems, comment, reason, customReason, firmId: effectiveFirm, storageId: effectiveStorage, date: effectiveDate, dryRun: dryRun ?? false });
  };

  // High-level send helper with minimal validation for write-offs (used by UI)
  const sendWriteOffWithClientValidation = async ({ items: payloadItems, comment, reason, customReason, firmId, storageId, date, dryRun }: any) => {
    const effectiveItems = payloadItems || items;
    if (!effectiveItems || effectiveItems.length === 0) {
      throw new Error('Немає товарів для списання');
    }
    for (const it of effectiveItems) {
      if (!it.sku || !it.quantity || Number(it.quantity) <= 0) {
        throw new Error(`Невірна кількість для SKU ${it.sku || ''}`);
      }
    }
    return await sendWriteOff({ items: effectiveItems, comment, reason, customReason, firmId, storageId, date, dryRun });
  };

  // Helper to request send and optionally control clearing externally
  const requestSend = async (params: any) => {
    // Calls sendWriteOffWithClientValidation and returns response
    return await sendWriteOffWithClientValidation(params);
  };

  const fetchHistoryPage = async (
    status: 'active' | 'deleted',
    page: number,
    limit: number,
    sync = false,
    forceFullList = false,
  ) => {
    const url = new URL(HISTORY_API, window.location.origin);
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
      pagination: json.pagination ?? { ...DEFAULT_PAGINATION, page, limit },
    };
  };

  const loadArchive = async (page = archivePagination.page, limit = archivePagination.limit) => {
    setArchiveLoading(true);
    try {
      const result = await fetchHistoryPage('deleted', page, limit);
      setArchiveRecords(result.records);
      setArchivePagination(result.pagination);
    } catch (e) {
      console.error('loadArchive', e);
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
      const url = `/api/warehouse/writeoff/history/${encodeURIComponent(recordId)}/details${force ? '?force=true' : ''}`;
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
      console.error('loadHistory', e);
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

  const cancelEdit = () => {
    setEditingRecord(null);
  };

  const beginEdit = (record: any): void => {
    const items = Array.isArray(record.items)
      ? record.items
      : (() => {
        try { return JSON.parse(record.items || '[]'); } catch { return []; }
      })();

    const prepared = (items || []).map((it: any) => ({
      id: crypto.randomUUID?.() ?? `${it.sku}-${Date.now()}-${Math.random()}`,
      sku: it.sku,
      name: it.name || it.productName || it.sku,
      dilovodId: it.dilovodId ?? null,
      quantity: Number(it.quantity || 0),
      orderedQuantity: Number(it.quantity || it.orderedQuantity || 0),
      portionsPerBox: it.portionsPerBox ?? 1,
      firmId: record.firmId ?? null,
      availableBatches: null,
      selectedBatchId: it.batchId ?? null,
      selectedBatchKey: null,
      price: it.price ?? 0,
    }));

    const targetReturns = returnsOpt ?? null;
    if (targetReturns?.setItems) {
      targetReturns.setItems(prepared);
      targetReturns.setReceiveFirmId?.(record.firmId ?? null);
      if (record.writeOffDate) {
        targetReturns.setReturnDate?.(String(record.writeOffDate));
      }
    } else {
      setItems(prepared);
    }

    setEditingRecord({
      id: Number(record.id),
      writeOffNumber: record.writeOffNumber ?? null,
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
    if (!editingRecord) {
      throw new Error('Немає запису для редагування');
    }
    const resp = await fetch(`/api/warehouse/writeoff/history/${encodeURIComponent(String(editingRecord.id))}`, {
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
      throw new Error(json?.error || 'Не вдалося зберегти списання');
    }
    setEditingRecord(null);
    await loadHistory();
    return json;
  };

  return {
    storages,
    selectedStorage,
    setSelectedStorage,
    items,
    setItems,
    addItem,
    addItemFromProduct,
    productSearchResults,
    setProductSearchResults,
    searchProducts,
    getBatchesForSku,
    batchesBySku,
    productSearchError,
    batchesError,
    removeItem,
    isSubmitting,
    sendWriteOff,
    sendWriteOffWithClientValidation,
    buildPreview,
    requestSend,
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
    // new helpers
    orderDetails,
    setOrderDetails,
    loadOrderDetails,
    addOrderLineFromOrder,
    previewWriteOff,
    sendConfirmWriteOff,
    editingRecord,
    beginEdit,
    cancelEdit,
    saveEditedWriteOff,
  };
}
