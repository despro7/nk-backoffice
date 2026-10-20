import { useMemo } from 'react';
import { Button } from '@heroui/react';
import ResizableAppDrawer from '@/components/drawer/ResizableAppDrawer';
import type { WarehouseDocumentEditOpenParams } from '../types';
import { resolveWarehouseDocumentKind } from '../resolveWarehouseDocumentKind';
import MovementDilovodEditDrawerContent from './MovementDilovodEditDrawerContent';

const WIDTH_STORAGE_KEY = 'warehouse-document-edit-drawer-width-v1';
const DEFAULT_WIDTH = 920;
const MIN_WIDTH = 640;
const MAX_WIDTH = 1200;

interface WarehouseDocumentEditDrawerProps {
  isOpen: boolean;
  params: WarehouseDocumentEditOpenParams | null;
  onClose: () => void;
}

export default function WarehouseDocumentEditDrawer({
  isOpen,
  params,
  onClose,
}: WarehouseDocumentEditDrawerProps) {
  const kind = useMemo(
    () => (params ? resolveWarehouseDocumentKind(params.documentLabel, params.documentTypeId) : 'unknown'),
    [params],
  );

  const title = params?.documentLabel?.trim() || 'Документ';

  const body = (() => {
    if (!params) return null;
    switch (kind) {
      case 'goodMoving':
        return (
          <MovementDilovodEditDrawerContent
            key={params.dilovodDocumentId}
            dilovodDocumentId={params.dilovodDocumentId}
            onClose={onClose}
          />
        );
      default:
        return (
          <p className="text-sm text-default-500">
            Редагування цього типу документа ще не підключено. Тип: {kind}.
          </p>
        );
    }
  })();

  return (
    <ResizableAppDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      initialPlacement="right"
      stackLevel={1}
      widthStorageKey={WIDTH_STORAGE_KEY}
      defaultWidth={DEFAULT_WIDTH}
      minWidth={MIN_WIDTH}
      maxWidth={MAX_WIDTH}
      resizeAriaLabel="Змінити ширину панелі редагування документа"
      footer={
        <Button variant="light" onPress={onClose}>
          Закрити
        </Button>
      }
    >
      {body}
    </ResizableAppDrawer>
  );
}
