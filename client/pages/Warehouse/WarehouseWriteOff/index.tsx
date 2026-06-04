import { useState, useEffect } from 'react';
import { useWarehouseReturns } from '../WarehouseReturns/useWarehouseReturns';
import useWarehouseWriteOff from './useWarehouseWriteOff';
import { Tabs, Tab, Card } from '@heroui/react';
import PageTabs from '@/components/PageTabs';
import OrderSearchPanel from './components/OrderSearchPanel';
import ProductSearchPanel from './components/ProductSearchPanel';
import OrderLinesList from './components/OrderLinesList';
import WriteOffItemsPanel from './components/WriteOffItemsPanel';
import ReasonSelector from './components/ReasonSelector';
import ActionsBar from './components/ActionsBar';
import WriteOffDetails from '../shared/WarehouseDetails';
import { WriteOffHistoryTab } from './components/WriteOffHistoryTab';
import { PayloadPreviewModal } from '@/components/modals/PayloadPreviewModal';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { ToastService } from '@/services/ToastService';
import { useDebug } from '@/contexts/DebugContext';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { pluralize } from '@/lib';

export default function WarehouseWriteOff() {
  const returns = useWarehouseReturns();
  const writeoff = useWarehouseWriteOff();
  // selectedQuantities removed — add button will always add 1 unit from order lines
  const [disabledSkus, setDisabledSkus] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'byOrder'|'byProduct'>('byOrder');
  const [pageTab, setPageTab] = useState<'main'|'history'>('main');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedOrderIdState, setSelectedOrderIdState] = useState<number | null>(null);
  const [selectedOrderExternalId, setSelectedOrderExternalId] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<any | null>(null);
  const [storages, setStorages] = useState<any[]>([]);
  const [selectedStorage, setSelectedStorage] = useState<string | null>(null);

  // Показувати читабельну назву обраного складу (якщо selectedStorage зберігає id)
  const selectedStorageName = (() => {
    if (!selectedStorage) return 'не вибрано';
    const found = storages.find(st => String(st.id) === String(selectedStorage) || String(st.good_id) === String(selectedStorage));
    if (!found) return String(selectedStorage);
    // Випробовуємо кілька полів які можуть містити назву
    return found.name || found.title || found.storageDisplayName || found.storage_display_name || found.good_name || String(found.id);
  })();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!selectedOrderExternalId) { setOrderDetails(null); return; }
      try {
        const res = await fetch(`/api/orders/${selectedOrderExternalId}`, { credentials: 'include', headers: { Accept: 'application/json' } });
        if (!res.ok) { console.error('order details fetch not ok', res.status); setOrderDetails(null); return; }
        const body = await res.json();
        let order = body?.data || body;
        if (Array.isArray(order) && order.length > 0) order = order[0];
        if (mounted) setOrderDetails(order);
      } catch (e) {
        console.error('load order details', e);
        if (mounted) setOrderDetails(null);
      }
    };
    void load();
    // load dilovod directories for storages
    (async () => {
      try {
        const res = await fetch('/api/dilovod/directories', { credentials: 'include' });
        const json = await res.json().catch(() => ({}));
          if (res.ok && json?.success && json.data) {
            const s = Array.isArray(json.data.storages) ? json.data.storages : [];
            setStorages(s);
            // Try to fetch dilovod settings to find configured smallStorageId and preselect it
            try {
              const setRes = await fetch('/api/dilovod/settings', { credentials: 'include' });
              const setJson = await setRes.json().catch(() => ({}));
              const smallId = setJson?.data?.smallStorageId || setJson?.data?.smallStorageId || null;
              if (smallId) {
                const found = s.find(st => String(st.id) === String(smallId) || String(st.good_id) === String(smallId));
                if (found) setSelectedStorage(String(found.id ?? found.good_id ?? smallId));
              }
            } catch (e) {
              // ignore
            }
          }
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [selectedOrderExternalId]);

  // load firms list for selects
  useEffect(() => {
    returns.loadAvailableFirms?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // reuse returns hook state for search and items
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [comment, setComment] = useState('');
  // manual add removed — use product/order search flows to add items

  const handleSendPreview = async () => {
    setIsLoadingPayload(true);
    try {
      const dateValue = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const resp = await writeoff.buildPreview({
        orderId: selectedOrderIdState ?? undefined,
        date: dateValue,
        firmId: returns.receiveFirmId ?? undefined,
        storageId: selectedStorage ?? undefined,
        items: (returns.items || []).map((item: any) => ({ sku: item.sku, batchId: item.selectedBatchId, quantity: item.quantity, price: item.price })),
        comment,
        reason: reason === 'Інше' ? (customReason || reason) : reason,
      });
      if (resp?.success && resp.payload) {
        setPayloadPreview(resp.payload);
        setShowPayloadPreview(true);
      } else {
        const message = resp?.error || 'Не вдалось завантажити payload';
        throw new Error(message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Помилка при завантаженні payload';
      console.error('[WarehouseWriteOff] handleSendPreview:', message);
      ToastService.show({ title: 'Помилка завантаження payload', description: message, color: 'danger' });
      setPayloadPreview(null);
      setShowPayloadPreview(false);
    } finally {
      setIsLoadingPayload(false);
    }
  };

  // Confirm/send flow
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [sendConfirmLoading, setSendConfirmLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Функція для очищення всіх введених даних та станів (можна викликати з кнопки)
  const clearAllInputs = () => {
    returns.resetAllState?.();
    writeoff.setProductSearchResults?.([]);
    setOrderDetails(null);
    setDisabledSkus({});
    setProductSearchReset((c) => c + 1);
  };

  // Сигнал для очищення ProductSearchPanel локального query
  const [productSearchReset, setProductSearchReset] = useState(0);

  const { isDebugMode } = useDebug();
  const { isAdmin } = useRoleAccess();
  const [showPayloadPreview, setShowPayloadPreview] = useState(false);
  const [payloadPreview, setPayloadPreview] = useState<Record<string, any> | null>(null);
  const [isLoadingPayload, setIsLoadingPayload] = useState(false);
  const [pendingForceDeleteId, setPendingForceDeleteId] = useState<string | null>(null);

  // Винесена логіка додавання рядка замовлення у товари для списання
  const handleAddOrderLine = async (sku: string, line: any, maxQty: number, qtyArg?: number) => {
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
      firmId: orderDetails?.firmId ?? returns.shipFirmId ?? returns.receiveFirmId ?? null,
      availableBatches: null,
      selectedBatchId: null,
      selectedBatchKey: null,
      price: 0,
    };
    // append item
    returns.setItems([...(returns.items || []), newItem]);
    // disable this sku in order lines
    setDisabledSkus((s)=>({ ...s, [sku]: true }));
    // fetch batches for added item and update it
    try {
      const firmId = newItem.firmId || undefined;
      const url = new URL(`/api/warehouse/batch-numbers/${encodeURIComponent(sku)}`, window.location.origin);
      if (firmId) url.searchParams.set('firmId', String(firmId));
      url.searchParams.set('onlySmallStorage', 'true');
      const resp = await fetch(url.toString(), { credentials: 'include' });
      if (resp.ok) {
        const data = await resp.json();
        const batches = Array.isArray(data.batches) ? data.batches : [];
        const normalized = batches.map((batch:any, index:number) => {
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
          };
        });
        // update item in returns.items with batches and adjust orderedQuantity to batch size when available
        returns.setItems((prev:any[]) => (prev || []).map(it => it.id === id ? { ...it, availableBatches: normalized, selectedBatchKey: normalized[0]?.id ?? null, selectedBatchId: normalized[0]?.batchId ?? null, orderedQuantity: normalized[0]?.quantity ?? it.orderedQuantity } : it));
      }
    } catch (err) {
      console.error('batch fetch error', err);
    }
  };

  return (
    <div className="container">
			<div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">Зручний інтерфейс для списання товарів у Dilovod.</p>
      </div>

      <PageTabs selectedKey={pageTab} onSelectionChange={(key) => {
        const tab = key as 'main' | 'history';
        setPageTab(tab);
        if (tab === 'history') {
          if (writeoff.history?.length === 0) {
            void (async () => {
              setHistoryLoading(true);
              try { await writeoff.loadHistory?.(); } catch (e) { /* ignore */ } finally { setHistoryLoading(false); }
            })();
          }
        }
      }}>
        <Tab key="main" title="Списання" />
        <Tab key="history" title="Історія" />
      </PageTabs>

      {pageTab === 'main' && (
        <>
          <Card className="p-4 bg-white rounded-xl mb-6">
            <Tabs
              aria-label="Тип пошуку"
              size="lg"
              fullWidth
              selectedKey={activeTab}
              onSelectionChange={(k:any)=>setActiveTab(k)}
              classNames={{ base: "mb-6", cursor: "bg-white", tab: "h-12" }}
            >
              <Tab key="byOrder" title="Пошук по замовленню" />
              <Tab key="byProduct" title="Пошук по товару" />
            </Tabs>
            {activeTab === 'byOrder' && (
              <OrderSearchPanel
              returns={returns}
              setOrderDetails={setOrderDetails}
              setSelectedOrderExternalId={setSelectedOrderExternalId}
              setSelectedOrderIdState={setSelectedOrderIdState}
              />
            )}
            {activeTab === 'byProduct' && (
              <ProductSearchPanel writeoff={writeoff} returns={returns} resetSignal={productSearchReset} />
            )}
          </Card>

          {/* Рядки замовлення */}
          {activeTab === 'byOrder' && orderDetails && Array.isArray(orderDetails.items) && (
            <OrderLinesList orderDetails={orderDetails} disabledSkus={disabledSkus} onAddLine={handleAddOrderLine} />
          )}
          {orderDetails && !Array.isArray(orderDetails.items) && (
            <div className="text-sm text-gray-500">Немає доступних рядків замовлення для списання.</div>
          )}

          {/* Параметри списання */}
          <WriteOffDetails returns={returns} storages={storages && storages.length > 0 ? storages : writeoff.storages} selectedStorage={selectedStorage} setSelectedStorage={setSelectedStorage} />

          {/* Товари для списання */}
          {returns.items && returns.items.length > 0 && (
            <>
              <WriteOffItemsPanel returns={returns} setDisabledSkus={setDisabledSkus} />
              <ReasonSelector reason={reason} setReason={setReason} customReason={customReason} setCustomReason={setCustomReason} comment={comment} setComment={setComment} />
            </>
          )}

          {/* Дії */}
          <ActionsBar
            onPreview={isDebugMode && isAdmin() ? handleSendPreview : undefined}
            onSend={async () => {
              // Validate reason selection before opening confirm modal for sending to Dilovod
              const selectedReason = reason;
              const selectedCustom = customReason;
              if (!selectedReason || selectedReason.trim() === '') {
                ToastService.show({ title: 'Оберіть причину списання', color: 'warning' });
                return;
              }
              if (selectedReason === 'Інше' && (!selectedCustom || selectedCustom.trim() === '')) {
                ToastService.show({ title: 'Вкажіть додаткову причину', color: 'warning' });
                return;
              }
              setShowSendConfirm(true);
            }}
            onCancel={() => setShowClearConfirm(true)}
            disabled={returns.items.length===0}
          />
        </>
      )}

      {pageTab === 'history' && (
        <WriteOffHistoryTab
          records={writeoff.history || []}
          loading={historyLoading}
          onRefresh={async () => {
            setHistoryLoading(true);
            try { await writeoff.loadHistory?.(); } catch (e) { /* ignore */ } finally { setHistoryLoading(false); }
          }}
          onLoadRecord={async (record: any) => {
            try {
              // Populate returns state with selected history record
              const items = Array.isArray(record.items) ? record.items : JSON.parse(record.items || '[]');
              const prepared = (items || []).map((it: any) => ({
                id: crypto.randomUUID?.() ?? `${it.sku}-${Date.now()}-${Math.random()}`,
                sku: it.sku,
                name: it.name || it.sku,
                dilovodId: it.dilovodId ?? null,
                quantity: Number(it.quantity || 0),
                orderedQuantity: Number(it.quantity || it.orderedQuantity || it.qty || 0),
                portionsPerBox: it.portionsPerBox ?? 1,
                firmId: record.firmId ?? returns.shipFirmId ?? returns.receiveFirmId ?? null,
                availableBatches: null,
                selectedBatchId: it.batchId ?? null,
                selectedBatchKey: null,
                price: it.price ?? 0,
              }));
              returns.setItems(prepared);
              // set other return details
              returns.setSelectedOrderId?.(record.orderId ?? null);
              setSelectedOrderExternalId(record.orderNumber ?? record.orderExternalId ?? null);
              returns.setReturnDate?.(record.writeOffDate ? String(record.writeOffDate) : null);
              returns.setShipFirmId?.(record.shipFirmId ?? null);
              returns.setReceiveFirmId?.(record.firmId ?? null);
              // switch to main tab so user can edit
              setPageTab('main');
              setActiveTab(record.orderId ? 'byOrder' : 'byProduct');
            } catch (err) {
              console.error('Error loading history record into form', err);
            }
          }}
          onDeleteRecord={async (recordId: string) => {
            try {
              const resp = await fetch(`/api/warehouse/writeoff/history/${encodeURIComponent(String(recordId))}`, { method: 'DELETE', credentials: 'include' });
              const json = await resp.json().catch(() => ({}));
              if (resp.ok && json.success) {
                ToastService.show({ title: 'Запис видалено', color: 'success' });
                await writeoff.loadHistory?.();
                return;
              }

              // If Dilovod reports object not found, offer to delete local record only
              if (json?.canDeleteLocal) {
                setPendingForceDeleteId(String(recordId));
                return;
              }

              throw new Error(json?.error || `Delete failed ${resp.status}`);
            } catch (e:any) {
              ToastService.show({ title: 'Помилка видалення', description: e?.message || String(e), color: 'danger' });
              throw e;
            }
          }}
        />
      )}

      <ConfirmModal
        isOpen={!!pendingForceDeleteId}
        title="Видалити локальний запис?"
        message="Dilovod повідомив, що документ не знайдено. Видалити локальний запис історії списання?"
        confirmText="Видалити локально"
        cancelText="Скасувати"
        confirmColor="danger"
        onConfirm={async () => {
          if (!pendingForceDeleteId) return;
          try {
            const resp = await fetch(`/api/warehouse/writeoff/history/${encodeURIComponent(String(pendingForceDeleteId))}?forceLocal=true`, { method: 'DELETE', credentials: 'include' });
            const json = await resp.json().catch(() => ({}));
            if (!resp.ok || !json.success) throw new Error(json?.error || `Delete failed ${resp.status}`);
            ToastService.show({ title: 'Локальний запис видалено', color: 'success' });
            await writeoff.loadHistory?.();
          } catch (err:any) {
            ToastService.show({ title: 'Не вдалося видалити локальний запис', description: err?.message || String(err), color: 'danger' });
          } finally {
            setPendingForceDeleteId(null);
          }
        }}
        onCancel={() => setPendingForceDeleteId(null)}
      />

      <ConfirmModal
        isOpen={showSendConfirm}
        title="Підтвердіть відправку"
        message={`Ви впевнені, що хочете зробити списання (${returns.items.length} ${pluralize(returns.items.length, 'товар', 'товари', 'товарів')})? Склад: ${selectedStorageName}. Причина: ${reason}`}
        confirmText="Відправити"
        cancelText="Скасувати"
        confirmColor="danger"
        onConfirm={async () => {
          setSendConfirmLoading(true);
          try {
            const body = {
              orderId: selectedOrderIdState ?? undefined,
              date: new Date().toISOString().replace('T', ' ').substring(0, 19),
              firmId: returns.receiveFirmId ?? undefined,
              storageId: selectedStorage ?? undefined,
              items: (returns.items || []).map((item: any) => ({ sku: item.sku, batchId: item.selectedBatchId, quantity: item.quantity, price: item.price })),
              comment,
              reason: reason === 'Інше' ? (customReason || reason) : reason,
              dryRun: false,
            };
            const resp = await writeoff.requestSend({ ...body, items: body.items });
            if (resp?.success) {
              ToastService.show({ title: 'Списання успішно відправлено', color: 'success' });
              setShowSendConfirm(false);
              setShowClearConfirm(true);
            } else {
              const err = resp?.error || 'Не вдалося відправити списання';
              ToastService.show({ title: 'Помилка відправки', description: err, color: 'danger' });
            }
          } catch (err:any) {
            ToastService.show({ title: 'Помилка відправки', description: err?.message || String(err), color: 'danger' });
          } finally {
            setSendConfirmLoading(false);
          }
        }}
        onCancel={() => setShowSendConfirm(false)}
        confirmLoading={sendConfirmLoading}
      />

      <ConfirmModal
        isOpen={showClearConfirm}
        title="Очистити список товарів?"
        message="Списання успішно відправлено. Очистити список товарів зараз?"
        confirmText="Очистити"
        cancelText="Залишити"
        confirmColor="primary"
        onConfirm={() => {
          clearAllInputs();
          setShowClearConfirm(false);
        }}
        onCancel={() => setShowClearConfirm(false)}
      />

      <PayloadPreviewModal
        isOpen={showPayloadPreview}
        onClose={() => setShowPayloadPreview(false)}
        payload={payloadPreview}
        title="Перегляд Payload списання"
        isLoading={isLoadingPayload}
      />
    </div>
  );
}
