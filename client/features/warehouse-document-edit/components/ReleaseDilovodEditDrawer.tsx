import { useEffect, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import ResizableAppDrawer from '@/components/drawer/ResizableAppDrawer';
import type { WarehouseDocumentEditContextResponse } from '@shared/types/warehouseDocumentEdit';
import useReleaseSets from '@/pages/Warehouse/WarehouseReleaseSets/useReleaseSets';
import WarehouseDetails from '@/pages/Warehouse/shared/WarehouseDetails';
import ReleaseItemsPanel from '@/pages/Warehouse/WarehouseReleaseSets/components/ReleaseItemsPanel';
import ActionsBar from '@/pages/Warehouse/WarehouseReleaseSets/components/ActionsBar';
import { ToastService } from '@/services/ToastService';
import DilovodDocumentViewSections from './DilovodDocumentViewSections';

const DRAWER_WIDTH_KEY = 'warehouse-document-edit-drawer-width-v1';
const STACK_LEVEL = 1;

interface ReleaseDilovodEditDrawerProps {
  isOpen: boolean;
  title: string;
  context: WarehouseDocumentEditContextResponse | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

export default function ReleaseDilovodEditDrawer({
  isOpen,
  title,
  context,
  loading,
  error,
  onClose,
}: ReleaseDilovodEditDrawerProps) {
  const rs = useReleaseSets();
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setInitialized(false);
      return;
    }
    if (!context?.localRecord || initialized) return;
    rs.beginEdit(context.localRecord);
    setInitialized(true);
  }, [isOpen, context, initialized, rs]);

  const handleSave = async () => {
    if (!rs.editingRelease) return;
    setSaving(true);
    try {
      await rs.saveEditedRelease?.();
      ToastService.show({ title: 'Зміни збережено', color: 'success' });
      onClose();
    } catch (err) {
      ToastService.show({
        title: 'Помилка збереження',
        description: err instanceof Error ? err.message : undefined,
        color: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  const isUnKit = rs.operationKey === 'goodUnKit';

  let body: React.ReactNode;
  if (loading) {
    body = <Spinner label="Завантаження документа..." className="py-16" />;
  } else if (error) {
    body = <p className="text-sm text-danger">{error}</p>;
  } else if (!context?.localRecord) {
    body = (
      <div className="space-y-4">
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Запис комплектування в backoffice не знайдено — перегляд даних Діловода.
        </p>
        <DilovodDocumentViewSections dilovod={context?.dilovod ?? null} title="Комплектація" hideHeader tableOnly />
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        <WarehouseDetails
          returns={rs.returns}
          storages={rs.storages}
          selectedStorage={rs.selectedStorage}
          setSelectedStorage={rs.setSelectedStorage}
          dateStateKey="operDate"
          dateLabel={isUnKit ? 'Дата розукомплектування' : 'Дата комплектування'}
        />
        {rs.items.length > 0 ? (
          <ReleaseItemsPanel
            items={rs.items}
            selectedStorage={rs.selectedStorage}
            selectedStorageName={rs.selectedStorageName}
            smallStorageId={rs.defaultSmallStorageId}
            returns={rs.returns}
            summaryLabel={isUnKit ? 'Разом до розукомплектування' : 'Разом до комплектування'}
            emptyMessage="Додайте набір"
            operationKey={rs.operationKey}
            componentBatches={rs.componentBatches}
            onComponentBatchesChange={rs.setComponentBatches}
            previewComponents={rs.previewComponents}
            lastKitPrefillInfo={rs.lastKitPrefillInfo}
            correctionMode={rs.correctionMode}
            correctionStep={rs.correctionStep}
          />
        ) : (
          <DilovodDocumentViewSections dilovod={context.dilovod} title="Комплектація" hideHeader tableOnly />
        )}
      </div>
    );
  }

  const canSave = Boolean(rs.editingRelease && rs.items.length > 0);

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
            onSend={() => void handleSave()}
            onCancel={onClose}
            sendLabel="Зберегти зміни"
            sendLoading={saving}
            sendDisabled={saving || rs.items.length === 0}
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
