import { Card, CardBody, CardHeader, Select, SelectItem, Spinner, Textarea, Input } from '@heroui/react';
import { useMemo, useState } from 'react';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { useDebug } from '@/contexts/DebugContext';
import { UnsavedChangesModal } from '@/components/modals/UnsavedChangesModal';
import { PayloadPreviewModal } from '@/components/modals/PayloadPreviewModal';
import { useWarehouseReturns } from './useWarehouseReturns';
import { OrderSearchInput } from './OrderSearchInput';
import { ReturnsActionBar } from './ReturnsActionBar';
import { ReturnsConfirmModal } from './ReturnsConfirmModal';
import { ReturnsItemRow } from './ReturnsItemRow';
import type { ReturnReason } from './WarehouseReturnsTypes';
import { DynamicIcon } from 'lucide-react/dynamic';
import { formatTrackingNumberWithIcon } from '@/lib/formatUtilsJSX';
import { ToastService } from '@/services/ToastService';

const RETURN_REASONS: ReturnReason[] = [
  'Брак',
  'Не забрали замовлення з пошти',
  'Не було зв\'язку з клієнтом',
  'Інше',
];

export default function WarehouseReturns() {
  const returns = useWarehouseReturns();

  const guard = useUnsavedGuard({
    isDirty: returns.isDirty,
    onSaveDraft: returns.handleSaveDraft,
  });

  const canSaveDraft = returns.orderSelected && returns.items.length > 0;
  const canSubmit = returns.orderSelected && returns.items.length > 0 && !returns.isSubmitting;

  const itemCount = returns.items.length;

  const { isDebugMode } = useDebug();
  const { isAdmin } = useRoleAccess();
  const [showPayloadPreview, setShowPayloadPreview] = useState(false);
  const [payloadPreview, setPayloadPreview] = useState<Record<string, any> | null>(null);
  const [isLoadingPayload, setIsLoadingPayload] = useState(false);

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
          dryRun: true,
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

  return (
    <div className="container">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">Швидкий інтерфейс для оприбуткування повернень клієнтів у Dilovod.</p>
      </div>

      <div className="flex flex-col gap-3 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="text-base font-semibold text-gray-900">Пошук замовлення</div>
        <OrderSearchInput
          searchQuery={returns.searchQuery}
          onSearchQueryChange={returns.setSearchQuery}
          onSearch={returns.handleSearch}
          searchResults={returns.searchResults}
          loading={returns.searchLoading}
          onSelectOrder={returns.loadOrderForReturn}
        />

        {returns.error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{returns.error}</div>
        )}

        {returns.isLoading ? (
          <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white p-10">
            <Spinner size="lg" />
          </div>
        ) : returns.orderSelected && (
          <div className="grid gap-6">
            <Card className="rounded-xl border border-gray-200 bg-white shadow-small p-1">
              <CardHeader className="text-lg font-semibold text-gray-900"><DynamicIcon name="info" size={20} className="mr-1" /> Деталі повернення</CardHeader>
              <CardBody className="flex flex-col gap-4">
                <div className="flex items-center gap-4 justify-between mb-4">
									<div className="space-y-1">
										<div className="text-xs">Замовлення</div>
										<div className="font-medium text-gray-900">№{returns.selectedOrderNumber}</div>
									</div>
									<div className="space-y-1">
										<div className="text-xs">Дата</div>
										<div className="font-medium text-gray-900">{returns.orderDate && new Date(returns.orderDate).toLocaleDateString('uk-UA')}</div>
									</div>
									<div className="space-y-1">
										<div className="text-xs">Фірма</div>
										<div className="text-gray-900">{returns.firmName || returns.firmId || 'Не визначено'}</div>
									</div>
									<div className="space-y-1">
										<div className="text-xs">Порцій</div>
										<div className="text-gray-900">{itemCount}</div>
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
              <CardHeader className="text-lg font-semibold text-gray-900"><DynamicIcon name="package" size={20} className="mr-1" /> Товари для повернення</CardHeader>
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
              canSaveDraft={canSaveDraft}
              canSubmit={canSubmit}
              isSavingDraft={returns.isSavingDraft}
              isSubmitting={returns.isSubmitting}
              onSaveDraft={returns.handleSaveDraft}
              onOpenConfirm={returns.handleSubmit}
              onShowPayload={isDebugMode && isAdmin() ? handleShowPayload : undefined}
            />
          </div>
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

      <UnsavedChangesModal {...guard.modalProps} />
    </div>
  );
}
