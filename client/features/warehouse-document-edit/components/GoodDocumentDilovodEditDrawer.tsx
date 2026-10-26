import { useEffect, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import ResizableAppDrawer from '@/components/drawer/ResizableAppDrawer';
import type { WarehouseDocumentEditContextResponse } from '@shared/types/warehouseDocumentEdit';
import { useWarehouseReturns } from '@/pages/Warehouse/WarehouseReturns/useWarehouseReturns';
import useWarehouseWriteOff from '@/pages/Warehouse/WarehouseWriteOff/useWarehouseWriteOff';
import useWarehouseSurplus from '@/pages/Warehouse/WarehouseSurplus/useWarehouseSurplus';
import useWarehouseParams from '@/pages/Warehouse/shared/useWarehouseParams';
import WarehouseDetails from '@/pages/Warehouse/shared/WarehouseDetails';
import WriteOffItemsPanel from '@/pages/Warehouse/WarehouseWriteOff/components/WriteOffItemsPanel';
import ReasonSelector from '@/pages/Warehouse/WarehouseWriteOff/components/ReasonSelector';
import ActionsBar from '@/pages/Warehouse/WarehouseWriteOff/components/ActionsBar';
import { ToastService } from '@/services/ToastService';
import { formatKyivDateTime } from '@shared/utils/kyivDateTime';
import DilovodDocumentViewSections from './DilovodDocumentViewSections';

const SURPLUS_REASONS = [
  'Залишок після інвентаризації',
  'Повернення від клієнта',
  'Інше',
];

const DRAWER_WIDTH_KEY = 'warehouse-document-edit-drawer-width-v1';
const STACK_LEVEL = 1;

interface GoodDocumentDilovodEditDrawerProps {
  isOpen: boolean;
  title: string;
  variant: 'writeOff' | 'surplus';
  context: WarehouseDocumentEditContextResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSaved?: () => void;
}

export default function GoodDocumentDilovodEditDrawer({
  isOpen,
  title,
  variant,
  context,
  loading,
  error,
  onClose,
  onSaved,
}: GoodDocumentDilovodEditDrawerProps) {
  const returns = useWarehouseReturns();
  const writeoffHook = useWarehouseWriteOff({ returns });
  const surplusHook = useWarehouseSurplus({ returns });
  const docHook = variant === 'surplus' ? surplusHook : writeoffHook;
  const editingRecord = variant === 'surplus' ? surplusHook.editingRecord : writeoffHook.editingRecord;

  const { storages, selectedStorage, setSelectedStorage } = useWarehouseParams({
    returns,
    externalStorages: docHook.storages,
  });

  const [, setDisabledSkus] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [comment, setComment] = useState('');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setInitialized(false);
      return;
    }
    if (!context?.localRecord || initialized) return;

    if (variant === 'writeOff' && writeoffHook.beginEdit) {
      writeoffHook.beginEdit(context.localRecord);
      setReason(String(context.localRecord.writeOffReason ?? ''));
      setCustomReason(String(context.localRecord.customReason ?? ''));
      setComment(String(context.localRecord.comment ?? ''));
    } else if (variant === 'surplus' && surplusHook.beginEdit) {
      surplusHook.beginEdit(context.localRecord);
      setReason(String(context.localRecord.surplusReason ?? ''));
      setCustomReason(String(context.localRecord.customReason ?? ''));
      setComment(String(context.localRecord.comment ?? ''));
    }
    setInitialized(true);
  }, [isOpen, context, initialized, variant, writeoffHook, surplusHook]);

  const activeItems = (returns.items ?? []).filter((item: { quantity?: number }) => Number(item.quantity ?? 0) > 0);
  const formatLocalDate = (date: Date) => formatKyivDateTime(date);

  const handleSave = async () => {
    if (!editingRecord) return;
    if (!reason.trim()) {
      ToastService.show({ title: 'Оберіть причину', color: 'warning' });
      return;
    }
    try {
      const payload = {
        items: activeItems,
        comment,
        reason: reason === 'Інше' ? (customReason || reason) : reason,
        customReason,
        firmId: returns.receiveFirmId ?? undefined,
        storageId: selectedStorage ?? undefined,
        date: returns.returnDate ? String(returns.returnDate) : formatLocalDate(new Date()),
      };
      if (variant === 'surplus') {
        await surplusHook.saveEditedWriteOff?.(payload);
      } else {
        await writeoffHook.saveEditedWriteOff?.(payload);
      }
      ToastService.show({ title: 'Зміни збережено', color: 'success' });
      onSaved?.();
      onClose();
    } catch (err) {
      ToastService.show({
        title: 'Помилка збереження',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    }
  };

  let body: React.ReactNode;
  if (loading) {
    body = <Spinner label="Завантаження документа..." className="py-16" />;
  } else if (error) {
    body = <p className="text-sm text-danger">{error}</p>;
  } else if (!context?.localRecord) {
    body = (
      <div className="space-y-4">
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Локальний запис backoffice не знайдено. Нижче — таблична частина з Діловода.
        </p>
        <DilovodDocumentViewSections dilovod={context?.dilovod ?? null} hideHeader tableOnly />
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        <WarehouseDetails
          variant={variant}
          returns={returns}
          storages={storages}
          selectedStorage={selectedStorage}
          setSelectedStorage={setSelectedStorage}
        />
        {activeItems.length > 0 ? (
          <>
            <WriteOffItemsPanel returns={returns} setDisabledSkus={setDisabledSkus} variant={variant} />
            <ReasonSelector
              title={variant === 'surplus' ? 'Причина оприбуткування' : undefined}
              reasons={variant === 'surplus' ? SURPLUS_REASONS : undefined}
              commentPlaceholder={variant === 'surplus' ? 'Коментар до оприбуткування (необовʼязково)' : undefined}
              reason={reason}
              setReason={setReason}
              customReason={customReason}
              setCustomReason={setCustomReason}
              comment={comment}
              setComment={setComment}
            />
          </>
        ) : (
          <DilovodDocumentViewSections dilovod={context.dilovod} />
        )}
      </div>
    );
  }

  const canSave = Boolean(editingRecord && activeItems.length > 0);

  return (
    <ResizableAppDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      initialPlacement="right"
      stackLevel={STACK_LEVEL}
      widthStorageKey={DRAWER_WIDTH_KEY}
      defaultWidth={920}
      minWidth={640}
      maxWidth={1200}
      resizeAriaLabel="Змінити ширину панелі редагування документа"
      footer={
        canSave ? (
          <ActionsBar
            sendLabel="Зберегти зміни"
            onSend={() => void handleSave()}
            onCancel={onClose}
            sendDisabled={docHook.isSubmitting}
            sendLoading={docHook.isSubmitting}
          />
        ) : (
          <Button variant="light" onPress={onClose}>Закрити</Button>
        )
      }
    >
      {body}
    </ResizableAppDrawer>
  );
}
