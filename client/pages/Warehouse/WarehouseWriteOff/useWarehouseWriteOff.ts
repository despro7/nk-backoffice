import { useState, useEffect } from 'react';

export default function useWarehouseWriteOff() {
  const [storages, setStorages] = useState<any[]>([]);
  const [selectedStorage, setSelectedStorage] = useState<string | null>(null);
  const [items, setItems] = useState<Array<any>>([]);
  const [productSearchResults, setProductSearchResults] = useState<any[]>([]);
  const [batchesBySku, setBatchesBySku] = useState<Record<string, any[]>>({});
  const [productSearchError, setProductSearchError] = useState<string | null>(null);
  const [batchesError, setBatchesError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const loadDirectories = async () => {
    try {
      const res = await fetch('/api/dilovod/directories', { credentials: 'include' });
      const json = await res.json();
      if (json?.success && json.data) {
        setStorages(json.data.storages || []);
        if (json.data.storages && json.data.storages.length > 0) setSelectedStorage(json.data.storages[0].id || json.data.storages[0].good_id || null);
      }
    } catch (e) {
      console.error('loadDirectories error', e);
    }
  };

  useEffect(() => { loadDirectories(); }, []);

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
      const list = json?.batches || [];
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

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/warehouse/writeoff/history', { credentials: 'include' });
      const json = await res.json();
      if (json?.success) setHistory(json.data || []);
    } catch (e) { console.error('loadHistory', e); }
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
  };
}
