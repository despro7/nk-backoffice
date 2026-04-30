import { useCallback, useEffect, useMemo, useState } from 'react';
import { expandProductSets } from '@/lib/orderAssemblyUtils';
import { useApi } from '@/hooks/useApi';
import { ToastService } from '@/services/ToastService';
import type { ReturnDraft, ReturnItem, ReturnBatch, ReturnReason } from './WarehouseReturnsTypes';

interface OrderSearchResult {
  id: number;
  externalId?: string;
  orderNumber?: string;
  customerName?: string;
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

const DRAFT_STORAGE_KEY = 'warehouse-returns-draft';

function createReturnItem(item: { sku: string; productName?: string; quantity: number; price?: number; dilovodId?: string | null }, firmId: string | null): ReturnItem {
  return {
    id: crypto.randomUUID?.() ?? `${item.sku}-${Date.now()}`,
    sku: item.sku,
    name: item.productName || item.sku,
    dilovodId: item.dilovodId ?? null,
    quantity: item.quantity,
    portionsPerBox: 1,
    firmId,
    availableBatches: null,
    selectedBatchId: null,
    selectedBatchKey: null,
    price: Number(item.price ?? 0),
  };
}

export function useWarehouseReturns() {
  const { apiCall } = useApi();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OrderSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string>('');
  const [selectedOrderExternalId, setSelectedOrderExternalId] = useState<string>('');
	const [orderDate, setOrderDate] = useState<string | null>(null);
  const [dilovodDocId, setDilovodDocId] = useState<string>('');
  const [firmId, setFirmId] = useState<string | null>(null);
  const [firmName, setFirmName] = useState<string>('');
  const [ttn, setTtn] = useState<string>('');
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [comment, setComment] = useState('');
  const [returnReason, setReturnReason] = useState<ReturnReason | string>('Брак');
  const [customReason, setCustomReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const draftKey = useMemo(() => {
    return selectedOrderId ? `${DRAFT_STORAGE_KEY}-${selectedOrderId}` : undefined;
  }, [selectedOrderId]);

  const loadDraft = useCallback((orderId: number) => {
    if (!orderId) return null;
    try {
      const raw = localStorage.getItem(`${DRAFT_STORAGE_KEY}-${orderId}`);
      if (!raw) return null;
      return JSON.parse(raw) as ReturnDraft;
    } catch {
      return null;
    }
  }, []);

  const persistDraft = useCallback((draft: ReturnDraft) => {
    try {
      localStorage.setItem(`${DRAFT_STORAGE_KEY}-${draft.orderId}`, JSON.stringify(draft));
    } catch {
      // ignore
    }
  }, []);

  const clearDraft = useCallback((orderId: number) => {
    try {
      localStorage.removeItem(`${DRAFT_STORAGE_KEY}-${orderId}`);
    } catch {
      // ignore
    }
  }, []);

  const resetReturnDetails = useCallback(() => {
    setSelectedOrderId(null);
    setSelectedOrderNumber('');
		setOrderDate(null);
    setSelectedOrderExternalId('');
    setDilovodDocId('');
    setFirmId(null);
    setFirmName('');
    setTtn('');
    setItems([]);
    setComment('');
    setReturnReason('Брак');
    setCustomReason('');
    setError(null);
    setIsDirty(false);
    setConfirmOpen(false);
  }, []);

  const loadFirmName = useCallback(async (firmId: string) => {
    try {
      const response = await apiCall('/api/dilovod/directories');
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.error || `Помилка завантаження довідників (${response.status})`);
      }
      const firms = Array.isArray(data.data?.firms) ? data.data.firms : [];
      const firm = firms.find((item: any) => item.id === firmId);
      setFirmName(firm?.name ?? '');
      return firm?.name ?? null;
    } catch (error) {
      console.error('Помилка завантаження імені фірми:', error);
      setFirmName('');
      return null;
    }
  }, [apiCall]);

  const loadOrderForReturn = useCallback(async (orderId: number) => {
    setSearchResults([]);
    setIsLoading(true);
    setError(null);
    setItems([]);
    setComment('');
    setFirmId(null);
    setFirmName('');
    setOrderDate(null);
    setSelectedOrderId(orderId);
    setSelectedOrderNumber('');
    setSelectedOrderExternalId('');
    setDilovodDocId('');
    setIsDirty(false);

    try {
      const response = await apiCall(`/api/warehouse/returns/prepare?orderId=${encodeURIComponent(String(orderId))}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        const message = data?.error || `Помилка підготовки повернення (${response.status})`;
        throw new Error(message);
      }

      const payload = data.data as PrepareReturnResponse;
      setFirmId(payload.firmId);
      setFirmName('');
      setOrderDate(payload.orderDate || null);
      setTtn(payload.ttn || '');
      setSelectedOrderNumber(payload.orderNumber || payload.externalId || String(payload.orderId));
      setSelectedOrderExternalId(payload.externalId || '');
      setDilovodDocId(payload.dilovodDocId);
      if (payload.firmId) {
        void loadFirmName(payload.firmId);
      }

      const priceBySku = new Map(payload.items.map((item) => [item.sku, Number(item.price ?? 0)]));
      const expanded = await expandProductSets(payload.items, apiCall, []);
      const preparedItems = expanded.map((item) => {
        return {
          id: crypto.randomUUID?.() ?? `${item.sku}-${Date.now()}-${Math.random()}`,
          sku: item.sku,
          name: item.name,
          dilovodId: null,
          quantity: item.quantity,
          portionsPerBox: item.portionsPerItem ?? 1,
          firmId: payload.firmId,
          availableBatches: null,
          selectedBatchId: null,
          selectedBatchKey: null,
          price: priceBySku.get(item.sku) ?? 0,
        } as ReturnItem;
      });

      setItems(preparedItems);
      setReturnReason('Брак');
      setCustomReason('');
      const batchDate = payload.dilovodSaleExportDate
        ? new Date(payload.dilovodSaleExportDate)
        : payload.orderDate
          ? new Date(payload.orderDate)
          : undefined;
      void loadBatchNumbersForItems(payload.firmId, preparedItems, batchDate);

      const draft = loadDraft(orderId);
      if (draft && draft.items.length > 0) {
        setItems(draft.items);
        setComment(draft.comment);
        setFirmId(draft.firmId);
        if (draft.firmId) {
          void loadFirmName(draft.firmId);
        }
        setSelectedOrderNumber(draft.orderDisplayId);
        setReturnReason(draft.returnReason || 'Брак');
        setCustomReason(draft.customReason || '');
        void loadBatchNumbersForItems(draft.firmId ?? payload.firmId, draft.items, batchDate);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Невідома помилка при підготовці повернення';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [apiCall, loadDraft]);

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
        if (orderFirmId) {
          url.searchParams.set('firmId', orderFirmId);
        }
        url.searchParams.set('onlySmallStorage', 'true');
        if (asOfDate) {
          url.searchParams.set('asOfDate', asOfDate.toISOString());
        }
        const response = await fetch(url.toString(), {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const batches = Array.isArray(data.batches) ? data.batches as any[] : [];
        results.push({
          sku,
          batches: batches.map((batch, index) => {
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
            } as ReturnBatch;
          }),
        });
      } catch (error) {
        console.error(`Помилка завантаження партій для SKU ${sku}:`, error);
        results.push({ sku, batches: [] });
      }
    }

    const batchMap = new Map(results.map((result) => [result.sku, result.batches]));

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

  const handleSearch = useCallback(async () => {
    resetReturnDetails();
    setSearchResults([]);

    if (!searchQuery.trim()) {
      return;
    }

    setSearchLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ search: searchQuery.trim(), limit: '20' });
      const response = await apiCall(`/api/orders?${params.toString()}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.error || `Помилка пошуку: ${response.status}`);
      }
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
      })));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Невідома помилка пошуку';
      setError(message);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [apiCall, resetReturnDetails, searchQuery]);
  const handleQuantityChange = useCallback((itemId: string, quantity: number) => {
    setItems((current) => current.map((item) => item.id === itemId ? { ...item, quantity } : item));
    setIsDirty(true);
  }, []);

  const handleBatchChange = useCallback((itemId: string, selectedBatchKey: string | null) => {
    setItems((current) => current.map((item) => {
      if (item.id !== itemId) return item;
      const selectedBatch = item.availableBatches?.find((batch) => batch.id === selectedBatchKey) ?? null;
      return {
        ...item,
        selectedBatchKey,
        selectedBatchId: selectedBatch?.batchId ?? null,
      };
    }));
    setIsDirty(true);
  }, []);

  const handleReturnReasonChange = useCallback((reason: ReturnReason | string) => {
    setReturnReason(reason);
    if (reason !== 'Інше') {
      setCustomReason('');
    }
    setIsDirty(true);
  }, []);

  const handleCustomReasonChange = useCallback((value: string) => {
    setCustomReason(value);
    setIsDirty(true);
  }, []);

  const handleSaveDraft = useCallback(async () => {
    if (!selectedOrderId) {
      ToastService.show({ title: 'Спершу виберіть замовлення', color: 'warning' });
      return;
    }

    setIsSavingDraft(true);
    try {
      const draft: ReturnDraft = {
        orderId: String(selectedOrderId),
        orderDisplayId: selectedOrderNumber || selectedOrderExternalId || String(selectedOrderId),
        dilovodDocId,
        firmId,
        items,
        returnReason,
        customReason: customReason || undefined,
        comment,
        status: 'draft',
      };
      persistDraft(draft);
      setIsDirty(false);
      ToastService.show({ title: 'Чернетка збережена', color: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Помилка при збереженні чернетки';
      ToastService.show({ title: message, color: 'danger' });
    } finally {
      setIsSavingDraft(false);
    }
  }, [comment, dilovodDocId, firmId, items, persistDraft, selectedOrderExternalId, selectedOrderId, selectedOrderNumber]);

  const validateItems = useCallback(() => {
    if (items.length === 0) {
      return 'Немає товарів для повернення.';
    }
    for (const item of items) {
      if (item.quantity <= 0) {
        return `Неправильна кількість для SKU ${item.sku}.`;
      }
      if (!item.selectedBatchId) {
        return `Оберіть партію для SKU ${item.sku}.`;
      }
    }
    if (!returnReason) {
      return 'Оберіть причину повернення.';
    }
    if (returnReason === 'Інше' && !customReason?.trim()) {
      return 'Вкажіть причину повернення.';
    }
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
      const payload = {
        orderId: String(selectedOrderId),
        comment,
        reason: returnReason === 'Інше' ? customReason || returnReason : returnReason,
        items: items.map((item) => ({
          sku: item.sku,
          batchId: item.selectedBatchId,
          quantity: item.quantity,
          price: item.price,
        })),
      };

      const response = await apiCall('/api/warehouse/returns/send', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.error || `Помилка відправки: ${response.status}`);
      }

      clearDraft(selectedOrderId);
      setIsDirty(false);
      ToastService.show({ title: 'Повернення успішно відправлено', color: 'success' });
      setConfirmOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Невідома помилка при відправці';
      ToastService.show({ title: message, color: 'danger' });
    } finally {
      setIsSubmitting(false);
    }
  }, [apiCall, clearDraft, comment, customReason, items, returnReason, selectedOrderId]);

  const orderSelected = Boolean(selectedOrderId);

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    searchLoading,
    handleSearch,
    selectedOrderId,
    selectedOrderNumber,
    selectedOrderExternalId,
		orderDate,
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
    isSavingDraft,
    isSubmitting,
    error,
    isDirty,
    confirmOpen,
    setConfirmOpen,
    orderSelected,
    loadOrderForReturn,
    handleQuantityChange,
    handleBatchChange,
    handleReturnReasonChange,
    handleCustomReasonChange,
    handleSaveDraft,
    handleSubmit,
    sendReturn,
    setSelectedOrderId,
  };
}
