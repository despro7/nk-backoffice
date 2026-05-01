import { Card, CardBody, CardHeader, Select, SelectItem, Spinner, Textarea, Input, Tab, Tabs, Button } from '@heroui/react';
import { useMemo, useState } from 'react';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { useDebug } from '@/contexts/DebugContext';
import { PayloadPreviewModal } from '@/components/modals/PayloadPreviewModal';
import { useWarehouseReturns } from './useWarehouseReturns';
import { OrderSearchInput } from './OrderSearchInput';
import { ReturnsActionBar } from './ReturnsActionBar';
import { ReturnsConfirmModal } from './ReturnsConfirmModal';
import { ReturnsItemRow } from './ReturnsItemRow';
import { ReturnsHistoryTab } from './ReturnsHistoryTab';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatTrackingNumberWithIcon } from '@/lib/formatUtilsJSX';
import { ToastService } from '@/services/ToastService';
import { ReturnsHistoryService } from '@/services/ReturnsHistoryService';
import type { ReturnHistoryRecord } from './WarehouseReturnsTypes';

const RETURN_REASONS: string[] = [
  'Брак товару',
  'Не забрали замовлення з пошти',
  'Не було зв\'язку з клієнтом',
  'Совісті немає у людини 😄',
  'Інше',
];

export default function WarehouseReturns() {
  const returns = useWarehouseReturns();

  const canSubmit = returns.orderSelected && returns.items.length > 0 && !returns.isSubmitting;

  const itemCount = returns.items.length;
  const portionCount = returns.items.reduce((sum, item) => sum + item.quantity, 0);
  const orderedPortionCount = returns.items.reduce((sum, item) => sum + (item.orderedQuantity ?? item.quantity), 0);
  const portionDiff = orderedPortionCount - portionCount;

  const { isDebugMode } = useDebug();
  const { isAdmin } = useRoleAccess();
  const [showPayloadPreview, setShowPayloadPreview] = useState(false);
  const [payloadPreview, setPayloadPreview] = useState<Record<string, any> | null>(null);
  const [isLoadingPayload, setIsLoadingPayload] = useState(false);
  const [history, setHistory] = useState<ReturnHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'main' | 'history'>('main');

  const pageTitle = useMemo(() => {
    if (returns.selectedOrderNumber) {
      return `Повернення для замовлення ${returns.selectedOrderNumber}`;
    }
    return 'Оприбуткування повернень';
  }, [returns.selectedOrderNumber]);

  const handleShowPayload = async () => {
    if (!returns.selectedOrderId) return;
    setIsLoadingPayload(true);
    try {
      const response = await fetch('/api/warehouse/returns/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          orderId: returns.selectedOrderId,
          items: returns.items.map((item) => ({
            sku: item.sku,
            batchId: item.selectedBatchId,
            quantity: item.quantity,
            price: item.price,
          })),
          comment: returns.comment,
          dryRun: isDebugMode,
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
          firmId: record.firmId,
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
    // Спочатку робимо dry run, щоб показати payload
    setIsLoadingDeletePayload(true);
    try {
      const url = isDebugMode
        ? `/api/warehouse/returns/history/${recordId}?dryRun=true`
        : `/api/warehouse/returns/history/${recordId}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await response.json();
      if (response.ok && data.success && data.payload) {
        setDeletePayloadPreview(data.payload);
        setPendingDeleteRecordId(recordId);
        setShowDeletePayloadPreview(true);
      } else {
        // Якщо dry run не вдався — видаляємо одразу
        console.warn('[WarehouseReturns] Dry run failed, deleting directly:', data.error);
        await performDelete(recordId);
      }
    } catch (error) {
      console.error('[WarehouseReturns] Dry run error:', error);
      // При помилці — видаляємо одразу
      await performDelete(recordId);
    } finally {
      setIsLoadingDeletePayload(false);
    }
  };

  const performDelete = async (recordId: string) => {
    try {
      await ReturnsHistoryService.deleteRecord(recordId);
      setHistory(history.filter((r) => r.id !== recordId));
      ToastService.show({ title: 'Успішно', description: 'Запис видалено', color: 'success' });
    } catch (error) {
      console.error('[WarehouseReturns] handleDeleteSession error:', error);
      ToastService.show({ title: 'Помилка видалення', description: 'Не вдалось видалити запис', color: 'danger' });
    }
  };

  const handleConfirmDeleteWithPayload = async () => {
    if (!pendingDeleteRecordId) return;
    setShowDeletePayloadPreview(false);
    setIsLoadingDeletePayload(true);
    try {
      await ReturnsHistoryService.deleteRecord(pendingDeleteRecordId);
      setHistory(history.filter((r) => r.id !== pendingDeleteRecordId));
      ToastService.show({ title: 'Успішно', description: 'Запис видалено', color: 'success' });
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

      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => {
          const tab = key as 'main' | 'history';
          setActiveTab(tab);
          if (tab === 'history' && history.length === 0) {
            loadHistory();
          }
        }}
        variant="solid"
        color="default"
        size="lg"
        classNames={{
          base: 'mb-4',
          tabList: "gap-2 p-[6px] bg-gray-100 rounded-lg",
          cursor: "bg-secondary text-white shadow-sm rounded-md",
          tab: "px-3 py-1.5 text-sm font-normal data-[hover-unselected=true]:opacity-100 text-neutral-500",
          tabContent: "group-data-[selected=true]:text-white text-neutral-400",
        }}
      >
        <Tab key="main" title="Оприбуткування" />
        <Tab key="history" title="Історія" />
      </Tabs>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4">
          {activeTab === 'main' && (
            <div className="flex flex-col gap-3">
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
                    <CardHeader className="text-lg font-semibold text-gray-900">
                      <DynamicIcon name="info" size={20} className="mr-1" /> Деталі повернення
                    </CardHeader>
                    <CardBody className="flex flex-col gap-4">
                      <div className="flex items-center gap-4 justify-between mb-4">
                        <div className="space-y-1">
                          <div className="text-xs">Замовлення</div>
                          <div className="font-medium text-gray-900">№{returns.selectedOrderNumber}</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs">Дата</div>
                          <div className="font-medium text-gray-900">
                            {returns.orderDate && new Date(returns.orderDate).toLocaleDateString('uk-UA')}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs">Фірма</div>
                          <div className="text-gray-900">{returns.firmName || returns.firmId || 'Не визначено'}</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs">ТТН</div>
                          <div className="text-gray-900">
                            {returns.ttn && formatTrackingNumberWithIcon(returns.ttn, {
                              showIcon: false,
                              compactMode: false,
                              boldLastGroup: true
                            }) || 'Не визначено'}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs">Позицій</div>
                          <div className="text-gray-900">{itemCount}</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs">Порцій</div>
                          <div className="flex items-baseline gap-1">
                            <div className="text-gray-900">{orderedPortionCount}</div>
                            {portionDiff > 0 && (<div className="text-red-500">(-{portionDiff})</div>)}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className={`${returns.returnReason === 'Інше' ? 'sm:col-span-1' : 'sm:col-span-2'} space-y-1`}>
                          <Select
                            id="return-reason"
                            label="Причина повернення"
                            labelPlacement="outside"
                            value={returns.returnReason}
                            onChange={(event) => returns.handleReturnReasonChange(event.target.value)}
                            selectedKeys={[returns.returnReason]}
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
                          <div className="sm:col-span-1 space-y-1">
                            <Input
                              label="Додаткова причина"
                              labelPlacement="outside"
                              value={returns.customReason}
                              onValueChange={returns.handleCustomReasonChange}
                              placeholder="Опишіть причину повернення"
                              classNames={{
                                label: 'text-xs font-medium text-gray-500 mb-1',
                                inputWrapper: 'w-full border border-gray-200 bg-white',
                              }}
                            />
                          </div>
                        )}
                        <div className="sm:col-span-2">
                          <Input
                            label="Коментар до повернення"
                            labelPlacement="outside"
                            value={returns.comment}
                            onValueChange={returns.setComment}
                            placeholder="За бажанням, коментар для операції повернення"
                            classNames={{
                              label: 'text-xs font-medium text-gray-500',
                              inputWrapper: 'w-full border border-gray-200 bg-white',
                              input: 'placeholder:opacity-50!',
                            }}
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
                          onBatchChange={returns.handleBatchChange}
                        />
                      ))}
                    </CardBody>
                  </Card>

                  <ReturnsActionBar
                    canSubmit={canSubmit}
                    isSubmitting={returns.isSubmitting}
                    onOpenConfirm={returns.handleSubmit}
                    onShowPayload={isDebugMode && isAdmin() ? handleShowPayload : undefined}
                  />
                </div>
              )}
            </div>
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
