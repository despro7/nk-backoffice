import { useCallback, useMemo, useState } from 'react';
import { expandProductSets } from '@/lib/orderAssemblyUtils';
import { useApi } from '@/hooks/useApi';
import { ToastService } from '@/services/ToastService';
import { ReturnsHistoryService } from '@/services/ReturnsHistoryService';
import type { ReturnItem, ReturnBatch, ReturnHistoryRecord } from './WarehouseReturnsTypes';

interface OrderSearchResult {
  id: number;
  externalId?: string;
  orderNumber?: string;
  customerName?: string;
  orderDate?: string;
  updatedAt?: string;
  ttn?: string;
  status?: string;
  statusText?: string;
  dilovodReturnDate?: string | null;
  dilovodReturnDocsCount?: number | null;
}

interface PrepareReturnResponse {
  orderId: string;
  externalId?: string;
  orderNumber?: string;
  ttn?: string | null;
  orderDate: string | null;
  dilovodSaleExportDate: string | null;
  dilovodDocId: string;
  firmId: string | null;
  storageId: string | null;
  items: Array<{ sku: string; productName?: string; quantity: number; price?: number; dilovodId?: string | null }>;
}

export function useWarehouseReturns() {
  const { apiCall } = useApi();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OrderSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearchExecuted, setHasSearchExecuted] = useState(false);

  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string>('');
  const [selectedOrderExternalId, setSelectedOrderExternalId] = useState<string>('');
  const [returnDate, setReturnDate] = useState<string | null>(null);
  const [dilovodSaleExportDate, setDilovodSaleExportDate] = useState<string | null>(null);
  const [dilovodDocId, setDilovodDocId] = useState<string>('');
  const [firmId, setFirmId] = useState<string | null>(null);
  const [firmName, setFirmName] = useState<string>('');
  const [ttn, setTtn] = useState<string>('');

  const [items, setItems] = useState<ReturnItem[]>([]);
  const [comment, setComment] = useState('');
  const [returnReason, setReturnReason] = useState<string>('Брак товару');
  const [customReason, setCustomReason] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const resetReturnDetails = useCallback(() => {
    setSelectedOrderId(null);
    setSelectedOrderNumber('');
    setReturnDate(null);
    setDilovodSaleExportDate(null);
    setSelectedOrderExternalId('');
    setDilovodDocId('');
    setFirmId(null);
    setFirmName('');
    setTtn('');
    setItems([]);
    setComment('');
    setReturnReason('Брак товару');
    setCustomReason('');
    setError(null);
    setIsDirty(false);
    setConfirmOpen(false);
  }, []);

  const resetAllState = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchLoading(false);
    setHasSearchExecuted(false);
    resetReturnDetails();
    setIsLoading(false);
    setIsSubmitting(false);
    setError(null);
    setIsDirty(false);
    setConfirmOpen(false);
    setShowSuccess(false);
  }, [resetReturnDetails]);

  const loadFirmName = useCallback(async (fid: string) => {
    try {
      const response = await apiCall('/api/dilovod/directories');
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.error || `Помилка завантаження довідників (${response.status})`);
      }
      const firms = Array.isArray(data.data?.firms) ? data.data.firms : [];
      const firm = firms.find((item: any) => item.id === fid);
      setFirmName(firm?.name ?? '');
      return firm?.name ?? null;
    } catch (err) {
      console.error('Помилка завантаження імені фірми:', err);
      setFirmName('');
      return null;
    }
  }, [apiCall]);

  const loadBatchNumbersForItems = useCallback(async (orderFirmId: string | null, itemsToLoad: ReturnItem[], asOfDate?: Date) => {
    const itemsNeedingBatches = itemsToLoad.filter((item) => item.availableBatches === null);
    if (itemsNeedingBatches.length === 0) return;

    const skuToItems = new Map<string, string[]>();
    for (const item of itemsNeedingBatches) {
      if (!item.sku) continue;
      const existing = skuToItems.get(item.sku) ?? [];
      existing.push(item.id);
      skuToItems.set(item.sku, existing);
    }

    const uniqueSkus = Array.from(skuToItems.keys());
    if (uniqueSkus.length === 0) return;

    const results: Array<{ sku: string; batches: ReturnBatch[] }> = [];

    for (const sku of uniqueSkus) {
      try {
        const url = new URL(`/api/warehouse/batch-numbers/${encodeURIComponent(sku)}`, window.location.origin);
        if (orderFirmId) url.searchParams.set('firmId', orderFirmId);
        url.searchParams.set('onlySmallStorage', 'true');
        if (asOfDate) url.searchParams.set('asOfDate', asOfDate.toISOString());
        const response = await fetch(url.toString(), { method: 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const batches = Array.isArray(data.batches) ? data.batches as any[] : [];
        results.push({
          sku,
          batches: batches.map((batch, index) => {
            const normalizedBatchId = batch.batchId || batch.id || '';
            const normalizedStorage = batch.storage || batch.storageDisplayName || '';
            const uniqueId = normalizedBatchId ? `${normalizedBatchId}-${normalizedStorage || index}` : `${sku}-${batch.batchNumber || 'unknown'}-${normalizedStorage || index}`;
            return {
              id: uniqueId,
              batchId: normalizedBatchId,
              batchNumber: batch.batchNumber || batch.goodPart__pr || batch.name || 'Невідома партія',
              quantity: Number(batch.quantity ?? batch.qty ?? 0),
              storage: normalizedStorage || undefined,
              storageDisplayName: batch.storageDisplayName || batch.storage__pr || undefined,
            } as ReturnBatch;
          }),
        });
      } catch (err) {
        console.error(`Помилка завантаження партій для SKU ${sku}:`, err);
        results.push({ sku, batches: [] });
      }
    }

    const batchMap = new Map(results.map((r) => [r.sku, r.batches]));
    setItems((current) => current.map((item) => {
      const batches = batchMap.get(item.sku) ?? [];
      return {
        ...item,
        availableBatches: batches,
        selectedBatchKey: item.selectedBatchKey ?? batches[0]?.id ?? null,
        selectedBatchId: item.selectedBatchId ?? batches[0]?.batchId ?? null,
      };
    }));
  }, []);

  const loadOrderForReturn = useCallback(async (orderId: number) => {
    setIsLoading(true);
    setError(null);
    setItems([]);
    setComment('');
    setFirmId(null);
    setFirmName('');
    setReturnDate(null);
    setSelectedOrderId(orderId);
    setSelectedOrderNumber('');
    setSelectedOrderExternalId('');
    setDilovodDocId('');
    setIsDirty(false);

    try {
      const response = await apiCall(`/api/warehouse/returns/prepare?orderId=${encodeURIComponent(String(orderId))}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data?.error || `Помилка підготовки повернення (${response.status})`);

      const payload = data.data as PrepareReturnResponse;
      setFirmId(payload.firmId);
      setFirmName('');
      // Do not prefill `returnDate` with server orderDate — keep picker default as current date
      setReturnDate(null);
      setDilovodSaleExportDate(payload.dilovodSaleExportDate || null);
      setTtn(payload.ttn || '');
      setSelectedOrderNumber(payload.orderNumber || payload.externalId || String(payload.orderId));
      setSelectedOrderExternalId(payload.externalId || '');
      setDilovodDocId(payload.dilovodDocId || '');
      if (payload.firmId) void loadFirmName(payload.firmId);

      const priceBySku = new Map(payload.items.map((item) => [item.sku, Number(item.price ?? 0)]));
      const expanded = await expandProductSets(payload.items, apiCall, []);
      const preparedItems = expanded.map((item) => ({
        id: crypto.randomUUID?.() ?? `${item.sku}-${Date.now()}-${Math.random()}`,
        sku: item.sku,
        name: item.name,
        dilovodId: null,
        quantity: item.quantity,
        orderedQuantity: item.quantity,
        portionsPerBox: item.portionsPerItem ?? 1,
        firmId: payload.firmId,
        availableBatches: null,
        selectedBatchId: null,
        selectedBatchKey: null,
        price: priceBySku.get(item.sku) ?? 0,
      } as ReturnItem));

      setItems(preparedItems);
      setReturnReason('Брак товару');
      setCustomReason('');
      const batchDate = payload.dilovodSaleExportDate ? new Date(payload.dilovodSaleExportDate) : payload.orderDate ? new Date(payload.orderDate) : undefined;
      void loadBatchNumbersForItems(payload.firmId, preparedItems, batchDate);

      // If some items lack prices (0), try to fetch costPerItem from products table
      try {
        const skusNeedingPrice = preparedItems.filter(it => !it.price || Number(it.price) === 0).map(it => it.sku).filter(Boolean);
        if (skusNeedingPrice.length > 0) {
          const url = `/api/products/batch?skus=${encodeURIComponent(skusNeedingPrice.join(','))}&fields=costPerItem`;
          const resp = await apiCall(url);
          const json = await resp.json().catch(() => ({}));
          if (resp.ok && Array.isArray(json.products)) {
            const priceMap = new Map<string, number>();
            for (const p of json.products) {
              const v = (p.costPerItem != null) ? Number(p.costPerItem) : null;
              if (v != null && !Number.isNaN(v)) priceMap.set(p.sku, v);
            }
            if (priceMap.size > 0) {
              setItems((current) => current.map(it => ({ ...it, price: (priceMap.has(it.sku) && (!it.price || Number(it.price) === 0)) ? priceMap.get(it.sku) : it.price })));
            }
          }
        }
      } catch (err) {
        console.warn('[useWarehouseReturns] price fetch failed:', err);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Невідома помилка при підготовці повернення';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [apiCall, loadBatchNumbersForItems, loadFirmName]);

  const handleSearch = useCallback(async () => {
    resetReturnDetails();
    setSearchResults([]);
    setHasSearchExecuted(false);

    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ search: searchQuery.trim(), limit: '20', status: 'all' });
      const response = await apiCall(`/api/orders?${params.toString()}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data?.error || `Помилка пошуку: ${response.status}`);
      setSearchResults((data.data || []).map((order: any) => ({
        id: Number(order.id),
        externalId: order.externalId,
        customerName: order.customerName,
        orderDate: order.orderDate,
        updatedAt: order.updatedAt,
        ttn: order.ttn,
        qty: order.qty,
        status: order.status,
        statusText: order.statusText,
        dilovodReturnDate: order.dilovodReturnDate,
        dilovodReturnDocsCount: order.dilovodReturnDocsCount,
      })));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Невідома помилка пошуку';
      setError(message);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
      setHasSearchExecuted(true);
    }
  }, [apiCall, resetReturnDetails, searchQuery]);

  const handleQuantityChange = useCallback((itemId: string, quantity: number) => {
    setItems((current) => current.map((item) => item.id === itemId ? { ...item, quantity } : item));
    setIsDirty(true);
  }, []);

  const handlePriceChange = useCallback((itemId: string, price: number) => {
    setItems((current) => current.map((item) => item.id === itemId ? { ...item, price } : item));
    setIsDirty(true);
  }, []);

  const handleBatchChange = useCallback((itemId: string, selectedBatchKey: string | null) => {
    setItems((current) => current.map((item) => {
      if (item.id !== itemId) return item;
      const selectedBatch = item.availableBatches?.find((batch) => batch.id === selectedBatchKey) ?? null;
      return { ...item, selectedBatchKey, selectedBatchId: selectedBatch?.batchId ?? null } as ReturnItem;
    }));
    setIsDirty(true);
  }, []);

  const handleReturnReasonChange = useCallback((reason: string) => {
    setReturnReason(reason);
    if (reason !== 'Інше') setCustomReason('');
    setIsDirty(true);
  }, []);

  const handleCustomReasonChange = useCallback((value: string) => {
    setCustomReason(value);
    setIsDirty(true);
  }, []);

  const validateItems = useCallback(() => {
    if (items.length === 0) return 'Немає товарів для повернення.';
    for (const item of items) {
      if (item.quantity <= 0) return `Неправильна кількість для SKU ${item.sku}.`;
      if (!item.selectedBatchId) return `Оберіть партію для SKU ${item.sku}.`;
    }
    if (!returnReason) return 'Оберіть причину повернення.';
    if (returnReason === 'Інше' && !customReason?.trim()) return 'Вкажіть причину повернення.';
    return null;
  }, [items, returnReason, customReason]);

  const handleSubmit = useCallback(() => {
    const validationError = validateItems();
    if (validationError) {
      ToastService.show({ title: validationError, color: 'danger' });
      return;
    }
    setConfirmOpen(true);
  }, [validateItems]);

  const sendReturn = useCallback(async () => {
    if (!selectedOrderId) return;
    setIsSubmitting(true);
    try {
      const pad = (n: number) => String(n).padStart(2, '0');
      const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      const parseStoredDate = (s?: string | null) => {
        if (!s) return null;
        try {
          if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
            const [datePart, timePart] = s.split(' ');
            const [y, m, d] = datePart.split('-').map(Number);
            const [hh, mm, ss] = timePart.split(':').map(Number);
            return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0);
          }
          const parsed = new Date(s);
          if (!Number.isNaN(parsed.getTime())) return parsed;
        } catch (e) {}
        return null;
      };
      const payloadDate = (() => {
        const parsed = parseStoredDate(returnDate);
        return parsed ? formatDate(parsed) : formatDate(new Date());
      })();
      const payload = {
        orderId: String(selectedOrderId),
        date: payloadDate,
        comment,
        reason: returnReason === 'Інше' ? customReason || returnReason : returnReason,
        items: items.map((item) => ({ sku: item.sku, batchId: item.selectedBatchId, quantity: item.quantity, price: item.price })),
      };

      const response = await apiCall('/api/warehouse/returns/send', { method: 'POST', body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok || !data.success) {
        if (data.error === 'already_returned_in_dilovod') throw new Error(data.message || 'Це замовлення вже було оприбутковано в Діловод');
        throw new Error(data?.error || `Помилка відправки: ${response.status}`);
      }

      try {
        const historyRecord: Omit<ReturnHistoryRecord, 'id' | 'createdAt' | 'createdBy' | 'createdByName'> = {
          orderId: selectedOrderId,
          orderNumber: selectedOrderNumber,
          ttn: ttn || undefined,
          firmId: firmId,
          firmName: firmName || undefined,
          returnDate: returnDate || undefined,
          items: items.map((item) => ({ sku: item.sku, name: item.name, quantity: item.quantity, batchId: item.selectedBatchId, batchNumber: item.availableBatches?.find((b) => b.id === item.selectedBatchKey)?.batchNumber, price: item.price })),
          returnReason: returnReason,
          customReason: returnReason === 'Інше' ? customReason : undefined,
          comment: comment || undefined,
          payload: data.payload || payload,
        };
        await ReturnsHistoryService.saveRecord(historyRecord);
      } catch (historyError) {
        console.error('[useWarehouseReturns] Error saving to history:', historyError);
      }

      setIsDirty(false);
      ToastService.show({ title: 'Повернення успішно відправлено', color: 'success' });
      setConfirmOpen(false);
      setShowSuccess(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Невідома помилка при відправці';
      ToastService.show({ title: 'Помилка оприбуткування', description: message, color: 'danger' });
    } finally {
      setIsSubmitting(false);
    }
  }, [apiCall, comment, customReason, firmId, firmName, items, returnDate, returnReason, selectedOrderId, selectedOrderNumber, ttn]);

  const handleNewReturn = useCallback(() => {
    // reset everything like a fresh page
    resetAllState();
  }, [resetAllState]);

  const orderSelected = Boolean(selectedOrderId);

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    setSearchResults,
    searchLoading,
    hasSearchExecuted,
    handleSearch,
    selectedOrderId,
    selectedOrderNumber,
    selectedOrderExternalId,
    returnDate,
    dilovodSaleExportDate,
    dilovodDocId,
    firmId,
    firmName,
    items,
    comment,
    setComment,
    ttn,
    returnReason,
    customReason,
    isLoading,
    isSubmitting,
    error,
    isDirty,
    confirmOpen,
    setConfirmOpen,
    showSuccess,
    setShowSuccess,
    resetAllState,
    orderSelected,
    loadOrderForReturn,
    setReturnDate,
    handleQuantityChange,
    handleBatchChange,
    handleReturnReasonChange,
    handleCustomReasonChange,
    handleSubmit,
    sendReturn,
    handleNewReturn,
    handlePriceChange,
    setSelectedOrderId,
    setItems,
    setReturnReason,
    setCustomReason,
  } as const;
}
