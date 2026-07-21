import { Card, CardBody, CardHeader, Select, SelectItem, Spinner, Input, Tab, Button, Tooltip, Alert } from '@heroui/react';
import PageTabs from '@/components/PageTabs';
import { useMemo, useState, useEffect } from 'react';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { useDebug } from '@/contexts/DebugContext';
import { PayloadPreviewModal } from '@/components/modals/PayloadPreviewModal';
import { useWarehouseReturns } from './useWarehouseReturns';
import { OrderSearchInput } from './components/OrderSearchInput';
import { ReturnsActionBar } from './components/ReturnsActionBar';
import { ReturnsConfirmModal } from './components/ReturnsConfirmModal';
import { ReturnsItemRow } from './components/ReturnsItemRow';
import { ReturnsHistoryTab } from './components/ReturnsHistoryTab';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatTrackingNumberWithIcon } from '@/lib/formatUtilsJSX';
import { ToastService } from '@/services/ToastService';
import { ReturnsHistoryService } from '@/services/ReturnsHistoryService';
import { DateTimePicker } from '@/components/DateTimePicker';
import { isMonolithicForReturn, type ReturnHistoryRecord } from './WarehouseReturnsTypes';

const RETURN_REASONS: string[] = [
  '😩 Брак товару',
  '📦 Не забрали з пошти',
  '📵 Не було зв\'язку з клієнтом',
  '😡 Совісті немає у людини!',
  '📝 Інше',
];

// Remove emoji and other pictographic Unicode characters from user-provided text
const sanitizeText = (s?: string | null) => {
  if (s == null) return s;
  try {
    return s.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F900}-\u{1F9FF}]/gu, '').trim();
  } catch (e) {
    return s.replace(/[\uFE0F\u200D]/g, '').trim();
  }
};

export default function WarehouseReturns() {
  const returns = useWarehouseReturns();

  const itemsBatchesReady = returns.items.length > 0 && returns.items.every((item) => Array.isArray(item.availableBatches) && item.availableBatches.length > 0 && Boolean(item.selectedBatchId));

  const canSubmit = returns.orderSelected && returns.items.length > 0 && !returns.isSubmitting
    && itemsBatchesReady
    && Boolean(returns.returnReason) && (!returns.returnReason.includes('Інше') || (returns.customReason && returns.customReason.trim() !== ''));

  const isOtherReason = Boolean(returns.returnReason && returns.returnReason.includes('Інше'));
  const missingReasonMessage = !returns.returnReason
    ? 'Оберіть причину повернення!'
    : (isOtherReason && (!returns.customReason || returns.customReason.trim() === ''))
      ? 'Вкажіть додаткову причину повернення.'
      : '';

  const itemCount = returns.items.length;
  const portionCount = returns.items.reduce((sum, item) => sum + item.quantity, 0);
  const orderedPortionCount = returns.items.reduce((sum, item) => sum + (item.orderedQuantity ?? item.quantity), 0);
  const portionDiff = orderedPortionCount - portionCount;

  const { isDebugMode } = useDebug();
  const { isAdmin } = useRoleAccess();
  // load available firms on mount
  useEffect(() => {
    returns.loadAvailableFirms?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showPayloadPreview, setShowPayloadPreview] = useState(false);
  const [payloadPreview, setPayloadPreview] = useState<Record<string, any> | null>(null);
  const [isLoadingPayload, setIsLoadingPayload] = useState(false);
  const [history, setHistory] = useState<ReturnHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'main' | 'history'>('main');

  // When a return is successfully sent, ensure main tab shows updated (cleared) state
  // but keep the success screen visible. This prevents old form data from remaining.
  useEffect(() => {
    if (returns.showSuccess) {
      setActiveTab('main');
      // Clear form fields but keep showSuccess=true so success screen is shown
      returns.setSelectedOrderId(null);
      returns.setItems([]);
      returns.setComment('');
      returns.setReturnReason('');
      returns.setCustomReason('');
      // Clear search state
      returns.setSearchQuery('');
      returns.setSearchResults([]);

      // Auto-hide success after 5 seconds and fully reset transient state
      const t = setTimeout(() => {
        returns.setShowSuccess(false);
        // ensure form is fully reset
        returns.resetAllState?.();
      }, 5000);

      return () => clearTimeout(t);
    }
  }, [returns.showSuccess]);

  const handleShowPayload = async () => {
    if (!returns.selectedOrderId) return;
    setIsLoadingPayload(true);
      try {
      console.debug('[WarehouseReturns] handleShowPayload - returns.returnDate:', returns.returnDate);
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
const dateValue = (() => {
        const parsed = parseStoredDate(returns.returnDate);
        return parsed ? formatDate(parsed) : formatDate(new Date());
      })();

      // Build shipment.bySku for monolithic sets (accGood = 1119000000001079)
      // — той самий логіки, що й у sendReturn, щоб прев'ю збігався з реальним payload
      const monolithicItems = returns.items.filter(isMonolithicForReturn);
      const shipmentBySku: Record<string, { accGood: string; quantity: number }> = {};
      for (const item of monolithicItems) {
        shipmentBySku[item.sku] = {
          accGood: '1119000000001079',
          quantity: item.quantity,
        };
      }

      const response = await fetch('/api/warehouse/returns/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
          body: JSON.stringify({
          orderId: returns.selectedOrderId,
          date: dateValue,
          firmId: returns.receiveFirmId || undefined,
          shipFirmId: returns.shipFirmId || undefined,
          items: returns.items.map((item) => ({
            sku: item.sku,
            batchId: item.selectedBatchId,
            quantity: item.quantity,
            price: item.price,
          })),
          comment: sanitizeText(returns.comment) || undefined,
          dryRun: isDebugMode,
          // Include shipment payload for monolithic sets (як у sendReturn)
          shipment: Object.keys(shipmentBySku).length > 0 ? { bySku: shipmentBySku } : undefined,
        }),
      });
      const data = await response.json();
      if (response.ok && data.success && data.payload) {
        setPayloadPreview(data.payload);
        setShowPayloadPreview(true);
      } else {
        const message = data.error || 'Не вдалось завантажити payload';
        throw new Error(message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Помилка при завантаженні payload';
      console.error('[WarehouseReturns] handleShowPayload:', message);
      ToastService.show({ title: 'Помилка завантаження payload', description: message, color: 'danger' });
      setPayloadPreview(null);
      setShowPayloadPreview(false);
    } finally {
      setIsLoadingPayload(false);
    }
  };

  // Обробники для історії повернень
  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const data = await ReturnsHistoryService.getHistory();
      setHistory(data);
    } catch (error) {
      console.error('[WarehouseReturns] loadHistory error:', error);
      ToastService.show({ title: 'Помилка завантаження історії', description: 'Не вдалось завантажити історію повернень', color: 'danger' });
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleLoadSession = async (record: ReturnHistoryRecord) => {
    try {
      // Відновити дані з історії
      const parsedItems = record.items || [];
      returns.setSearchQuery(record.orderNumber);
      returns.setComment(record.comment || '');
      returns.setReturnReason(record.returnReason);
      returns.setCustomReason(record.customReason || '');

      // restore selected firm from history record
      // legacy: record.firmId was payload firm (receiving). New records may contain shipFirmId/shipFirmName
      returns.setShipFirmId?.(record.shipFirmId ?? record.firmId ?? null);
      returns.setShipFirmName?.(record.shipFirmName ?? '');
      returns.setReceiveFirmId?.(record.receiveFirmId ?? record.firmId ?? null);
      returns.setReceiveFirmName?.(record.receiveFirmName ?? '');

      // Завантажити замовлення
      await returns.handleSearch();

      // Якщо замовлення знайдено, відновити товари
      if (returns.selectedOrderId) {
        // Очистити поточні товари
        returns.setItems([]);

        // Додати товари з історії
        const newItems = parsedItems.map((item: any) => ({
          id: crypto.randomUUID?.() ?? `${item.sku}-${Date.now()}-${Math.random()}`,
          sku: item.sku,
          name: item.name,
          dilovodId: null,
          quantity: item.quantity,
          orderedQuantity: item.quantity,
          portionsPerBox: 1,
          firmId: record.shipFirmId ?? record.firmId,
          availableBatches: null,
          selectedBatchId: null,
          selectedBatchKey: null,
          price: item.price,
        }));
        returns.setItems(newItems);
      }
    } catch (error) {
      console.error('[WarehouseReturns] handleLoadSession error:', error);
      ToastService.show({ title: 'Помилка відновлення', description: 'Не вдалось відновити дані повернення', color: 'danger' });
    }
  };

  const [deletePayloadPreview, setDeletePayloadPreview] = useState<Record<string, any> | null>(null);
  const [showDeletePayloadPreview, setShowDeletePayloadPreview] = useState(false);
  const [isLoadingDeletePayload, setIsLoadingDeletePayload] = useState(false);
  const [pendingDeleteRecordId, setPendingDeleteRecordId] = useState<string | null>(null);

  const handleDeleteSession = async (recordId: string) => {
    setIsLoadingDeletePayload(true);
    try {
      if (isDebugMode) {
        // Dry run in debug mode: request payload preview from server
        const url = `/api/warehouse/returns/history/${recordId}?dryRun=true`;
        const response = await fetch(url, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        const data = await response.json().catch(() => ({}));

        if (response.ok && data.success && data.payload) {
          setDeletePayloadPreview(data.payload);
          setPendingDeleteRecordId(recordId);
          setShowDeletePayloadPreview(true);
        } else if (response.ok && data.success) {
          // Server returned success but no payload -> treat as deleted
          setHistory((h) => h.filter((r) => r.id !== recordId));
          ToastService.show({ title: 'Успішно', description: 'Запис успішно видалено', color: 'success', hideIcon: false });
        } else {
          const message = data.error || 'Не вдалось отримати попередній перегляд для видалення';
          throw new Error(message);
        }
      } else {
        // Normal mode: perform deletion immediately without dry run
        try {
          const result = await ReturnsHistoryService.deleteRecord(recordId);
          if (result && result.success) {
            setHistory((h) => h.filter((r) => r.id !== recordId));
            ToastService.show({ title: 'Успішно', description: 'Запис успішно видалено', color: 'success', hideIcon: false });
          } else {
            const message = (result && result.error) || 'Не вдалось видалити запис';
            throw new Error(message);
          }
        } catch (err: any) {
          // If Dilovod reports the document not found, offer to delete the local record anyway
          const resp = err?.response;
          const isNotFound = resp?.error === 'dilovod_object_not_found' || (resp?.message && resp.message.toString().toLowerCase().includes('не знайдено')) || (err?.message && err.message.toString().toLowerCase().includes('not found'));
          if (isNotFound) {
            const confirmDelete = window.confirm('Документ не знайдено в Діловоді. Видалити локальний запис все одно?');
            if (confirmDelete) {
              try {
                const res2 = await ReturnsHistoryService.deleteRecord(recordId, { forceLocal: true });
                if (res2 && res2.success) {
                  setHistory((h) => h.filter((r) => r.id !== recordId));
                  ToastService.show({ title: 'Успішно', description: 'Локальний запис видалено', color: 'success' });
                } else {
                  ToastService.show({ title: 'Помилка', description: 'Не вдалось видалити локальний запис', color: 'danger' });
                }
              } catch (err2) {
                ToastService.show({ title: 'Помилка', description: err2 instanceof Error ? err2.message : 'Не вдалось видалити локальний запис', color: 'danger' });
              }
            }
          } else {
            const message = err instanceof Error ? err.message : 'Не вдалось видалити запис';
            throw new Error(message);
          }
        }
      }
    } catch (error) {
      console.error('[WarehouseReturns] Delete error:', error);
      ToastService.show({ title: 'Помилка видалення', description: error instanceof Error ? error.message : 'Не вдалось видалити запис', color: 'danger', hideIcon: false, icon: 'x-circle' });
    } finally {
      setIsLoadingDeletePayload(false);
    }
  };

  const performDelete = async (recordId: string) => {
    try {
      await ReturnsHistoryService.deleteRecord(recordId);
      setHistory(history.filter((r) => r.id !== recordId));
      ToastService.show({ title: 'Успішно', description: 'Запис успішно видалено', color: 'success', hideIcon: false });
    } catch (error) {
      console.error('[WarehouseReturns] handleDeleteSession error:', error);
      ToastService.show({ title: 'Помилка видалення', description: 'Не вдалось видалити запис', color: 'danger', hideIcon: false, icon: 'x-circle' });
    }
  };

  const handleConfirmDeleteWithPayload = async () => {
    if (!pendingDeleteRecordId) return;
    setShowDeletePayloadPreview(false);
    setIsLoadingDeletePayload(true);
    try {
      await ReturnsHistoryService.deleteRecord(pendingDeleteRecordId);
      setHistory(history.filter((r) => r.id !== pendingDeleteRecordId));
      ToastService.show({ title: 'Успішно', description: 'Запис успішно видалено', color: 'success' });
    } catch (error) {
      console.error('[WarehouseReturns] Delete with payload error:', error);
      ToastService.show({ title: 'Помилка видалення', description: 'Не вдалось видалити запис', color: 'danger' });
    } finally {
      setIsLoadingDeletePayload(false);
      setPendingDeleteRecordId(null);
      setDeletePayloadPreview(null);
    }
  };

  const handleCancelDeletePayload = () => {
    setShowDeletePayloadPreview(false);
    setPendingDeleteRecordId(null);
    setDeletePayloadPreview(null);
  };

  return (
    <div className="container">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">Швидкий інтерфейс для оприбуткування повернень клієнтів у Dilovod.</p>
      </div>

      <PageTabs className="mb-4" selectedKey={activeTab} onSelectionChange={(key) => {
        const tab = key as 'main' | 'history';
        setActiveTab(tab);
        if (tab === 'history') {
          loadHistory();
        }
      }}>
        <Tab key="main" title="Оприбуткування" />
        <Tab key="history" title="Історія" />
      </PageTabs>
      
      <div key={activeTab}>
        {activeTab === 'main' && (
          <Card className="flex flex-col gap-5 rounded-xl border border-gray-200 bg-white shadow-small p-4">
            <div className="text-base font-semibold text-gray-900">Пошук замовлення</div>
            <OrderSearchInput
              searchQuery={returns.searchQuery}
              onSearchQueryChange={returns.setSearchQuery}
              onSearch={returns.handleSearch}
              searchResults={returns.searchResults}
              loading={returns.searchLoading}
              hasSearchExecuted={returns.hasSearchExecuted}
              orderSelected={returns.orderSelected}
              selectedOrderId={returns.selectedOrderId}
              onSelectOrder={returns.loadOrderForReturn}
            />

            {returns.error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{returns.error}</div>
            )}

            {returns.isLoading ? (
              <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white p-10">
                <Spinner size="lg" />
              </div>
            ) : returns.showSuccess ? (
              // Екран успішного відправлення
              <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
                <DynamicIcon name="check-circle" className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-green-700 mb-2">Повернення успішно створено!</h3>
                <p className="text-green-700 mb-6">Документ повернення для замовлення №{returns.selectedOrderNumber} відправлено в Діловод.</p>
                <Button
                  color="success"
                  variant="solid"
                  onPress={returns.handleNewReturn}
                  startContent={<DynamicIcon name="plus-circle" className="w-4 h-4" />}
                  className="text-white"
                >
                  Нове повернення
                </Button>
              </div>
            ) : returns.orderSelected && (
              <div className="grid gap-6">
                <Card className="rounded-xl border border-gray-200 bg-white shadow-small p-1">
                  <CardHeader className="text-lg font-medium text-gray-900">
                    <DynamicIcon name="info" size={20} className="mr-1" /> Деталі повернення
                  </CardHeader>
                  <CardBody className="flex flex-col gap-4">
                    <div className="flex items-start gap-4 justify-between mb-4">
                      <div className="space-y-1">
                        <div className="text-xs font-medium">Замовлення</div>
                        <div className="font-medium text-gray-900 h-10 flex items-center">№{returns.selectedOrderNumber}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-medium">Відвантажено</div>
                        <div className="font-medium text-gray-900 h-10 flex items-center">
                          {returns.dilovodSaleExportDate && new Date(returns.dilovodSaleExportDate).toLocaleDateString('uk-UA')}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-medium">Фірма відвантаження</div>
                        {returns.availableFirms && returns.availableFirms.length > 0 ? (
                          <Select
                            id="select-ship-firm"
                            labelPlacement="outside"
                            aria-label="Фірма відвантаження"
                            disallowEmptySelection={true}
                            value={returns.shipFirmId ?? ''}
                            onChange={(e) => {
                              const v = e.target.value || null;
                              returns.setShipFirmId?.(v);
                              const f = returns.availableFirms.find((x) => x.id === v);
                              returns.setShipFirmName?.(f?.name || '');
                            }}
                            selectedKeys={returns.shipFirmId ? [returns.shipFirmId] : []}
                            classNames={{ trigger: 'w-full min-w-[200px] border border-gray-200 bg-white' }}
                          >
                            <SelectItem key="" textValue="Не визначено">Не визначено</SelectItem>
                            <>
                              {returns.availableFirms.map((f) => (
                                <SelectItem key={f.id} textValue={f.name}>{f.name}</SelectItem>
                              ))}
                            </>
                          </Select>
                        ) : (
                          <div className="text-gray-900">{returns.shipFirmName || returns.shipFirmId || 'Не визначено'}</div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-medium">Фірма оприбуткування</div>
                        {returns.availableFirms && returns.availableFirms.length > 0 ? (
                          <Select
                            id="select-receive-firm"
                            labelPlacement="outside"
                            aria-label="Фірма оприбуткування"
                            disallowEmptySelection={true}
                            value={returns.receiveFirmId ?? ''}
                            onChange={(e) => {
                              const v = e.target.value || null;
                              returns.setReceiveFirmId?.(v);
                              const f = returns.availableFirms.find((x) => x.id === v);
                              returns.setReceiveFirmName?.(f?.name || '');
                            }}
                            selectedKeys={returns.receiveFirmId ? [returns.receiveFirmId] : []}
                            classNames={{ trigger: 'w-full min-w-[200px] border border-gray-200 bg-white' }}
                          >
                            <SelectItem key="" textValue="Не визначено">Не визначено</SelectItem>
                            <>
                              {returns.availableFirms.map((f) => (
                                <SelectItem key={f.id} textValue={f.name}>{f.name}</SelectItem>
                              ))}
                            </>
                          </Select>
                        ) : (
                          <div className="text-gray-900">{returns.receiveFirmName || returns.receiveFirmId || 'Не визначено'}</div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-medium">ТТН</div>
                        <div className="text-gray-900 h-10 flex items-center">
                          {returns.ttn && formatTrackingNumberWithIcon(returns.ttn, {
                            showIcon: false,
                            compactMode: false,
                            boldLastGroup: true
                          }) || 'Не визначено'}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-medium">Позицій</div>
                        <div className="text-gray-900 h-10 flex items-center">{itemCount}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs font-medium">Порцій</div>
                        <div className="flex items-baseline gap-1">
                          <div className="text-gray-900 h-10 flex items-center">{orderedPortionCount}</div>
                          {portionDiff > 0 && (<div className="text-red-500">(-{portionDiff})</div>)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className={`${returns.returnReason === 'Інше' ? 'w-60' : 'min-w-[300px]'} space-y-1`}>
                        <Select
                          id="return-reason"
                          label={<span>Причина повернення <span className="text-red-500">(обов'язково)</span></span>}
                          placeholder="Оберіть причину повернення"
                          labelPlacement="outside"
                          value={returns.returnReason}
                          onChange={(event) => returns.handleReturnReasonChange(event.target.value)}
                          selectedKeys={returns.returnReason ? [returns.returnReason] : []}
                          disallowEmptySelection={true}
                          classNames={{
                            label: 'text-xs font-medium text-gray-500 mb-1',
                            trigger: 'w-full border border-gray-200 bg-white',
                          }}
                        >
                          {RETURN_REASONS.map((reason) => (
                            <SelectItem key={reason} textValue={reason}>{reason}</SelectItem>
                          ))}
                        </Select>
                      </div>
                      {returns.returnReason === 'Інше' && (
                        <div className="flex-1">
                          <Input
                            label="Додаткова причина"
                            labelPlacement="outside"
                            value={returns.customReason}
                            onValueChange={returns.handleCustomReasonChange}
                            placeholder="Опишіть причину повернення"
                            classNames={{
                              label: 'text-xs font-medium text-gray-500 mb-1',
                              inputWrapper: 'w-full border border-gray-200 bg-white',
                              input: 'placeholder:opacity-50!',
                            }}
                          />
                        </div>
                      )}
                      <div className="flex-1">
                        <Input
                          label="Коментар до повернення"
                          labelPlacement="outside"
                          value={returns.comment}
                          onValueChange={returns.setComment}
                          placeholder="Коментар для операції повернення (необов'язково)"
                          classNames={{
                            label: 'text-xs font-medium text-gray-500',
                            inputWrapper: 'w-full border border-gray-200 bg-white',
                            input: 'placeholder:opacity-50!',
                          }}
                        />
                      </div>
                      <div className="flex">
                        <DateTimePicker
                          label={<span className="flex gap-1">Дата оприбуткування <Tooltip content="Уважно оберіть дату та час, це вплине на облік повернених товарів" color="primary" className="max-w-80"><DynamicIcon name="info" size={14} className="text-red-500" /></Tooltip></span>}
                          labelPlacement="outside"
                          size="md"
                          labelStyle="text-xs font-medium text-gray-800"
                          inputStyle="border border-gray-200 bg-white hover:bg-gray-100 focus-within:bg-gray-100"
                          value={(() => {
                            const s = returns.returnDate;
                            if (!s) return new Date();
                            // Accept either our formatted `YYYY-MM-DD HH:mm:ss` or ISO strings
                            try {
                              if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
                                const [datePart, timePart] = s.split(' ');
                                const [y, m, d] = datePart.split('-').map(Number);
                                const [hh, mm, ss] = timePart.split(':').map(Number);
                                return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0);
                              }
                              // fallback to Date parsing (handles ISO)
                              const parsed = new Date(s);
                              if (!Number.isNaN(parsed.getTime())) return parsed;
                            } catch (e) {
                              // ignore
                            }
                            return new Date();
                          })()}
                          onChange={(d) => {
                            const pad = (n: number) => String(n).padStart(2, '0');
                            const formatted = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                            console.debug('[WarehouseReturns] DateTimePicker onChange -> formatted:', formatted);
                            returns.setReturnDate?.(formatted);
                          }}
                          isDisabled={returns.isSubmitting}
                        />
                      </div>
                    </div>
                  </CardBody>
                </Card>

                <Card className="rounded-xl border border-gray-200 bg-white shadow-small p-1">
                  <CardHeader className="text-lg font-semibold text-gray-900">
                    <DynamicIcon name="package" size={20} className="mr-1" /> Товари для повернення
                  </CardHeader>
                  <CardBody>
                    {returns.items.map((item) => (
                      <ReturnsItemRow
                        key={item.id}
                        item={item}
                        onQuantityChange={returns.handleQuantityChange}
                        onPriceChange={returns.handlePriceChange}
                        onBatchChange={returns.handleBatchChange}
                      />
                    ))}
                  </CardBody>
                </Card>

                {(() => {
                  const itemsWithNoBatches = returns.items.filter((it) => Array.isArray(it.availableBatches) && it.availableBatches.length === 0);
                  if (itemsWithNoBatches.length > 0 || missingReasonMessage) {
                    return (
                      <Alert color="danger" classNames={{ base: "text-sm" }}>
                        {missingReasonMessage && <div className="mb-1">{missingReasonMessage}</div>}
                        {itemsWithNoBatches.length > 0 && <div>Не знайдено партій для товарів: {itemsWithNoBatches.map(i => i.sku).join(', ')} <br />Спробуйте обрати іншу фірму відвантаження в деталях повернення ↑</div>}
                      </Alert>
                    );
                  }
                  return null;
                })()}

                <ReturnsActionBar
                  canSubmit={canSubmit}
                  isSubmitting={returns.isSubmitting}
                  onOpenConfirm={returns.handleSubmit}
                  onShowPayload={isDebugMode && isAdmin() ? handleShowPayload : undefined}
                />
              </div>
            )}
          </Card>
        )}

        {activeTab === 'history' && (
          <ReturnsHistoryTab
            records={history}
            loading={historyLoading}
            onRefresh={loadHistory}
            onLoadRecord={handleLoadSession}
            onDeleteRecord={handleDeleteSession}
          />
        )}
      </div>

      <ReturnsConfirmModal
        isOpen={returns.confirmOpen}
        isSubmitting={returns.isSubmitting}
        orderNumber={returns.selectedOrderNumber}
        items={returns.items}
        returnReason={returns.returnReason === 'Інше' ? returns.customReason || returns.returnReason : returns.returnReason}
        comment={returns.comment}
        onClose={() => returns.setConfirmOpen(false)}
        onConfirm={returns.sendReturn}
      />

      <PayloadPreviewModal
        isOpen={showPayloadPreview}
        onClose={() => setShowPayloadPreview(false)}
        payload={payloadPreview}
        title="Перегляд Payload повернення"
        isLoading={isLoadingPayload}
      />

      <PayloadPreviewModal
        isOpen={showDeletePayloadPreview}
        onClose={handleCancelDeletePayload}
        onSend={handleConfirmDeleteWithPayload}
        payload={deletePayloadPreview}
        title="Попередній перегляд (видалення)"
        isLoading={isLoadingDeletePayload}
        isSending={isLoadingDeletePayload}
      />
    </div>
  );
}
