import { useMemo } from 'react';
import { Button } from '@heroui/react';
import ResizableAppDrawer from '@/components/drawer/ResizableAppDrawer';
import type { WarehouseDocumentEditOpenParams } from '../types';
import { resolveWarehouseDocumentKind } from '../resolveWarehouseDocumentKind';
import MovementV2DilovodEditDrawer from './MovementV2DilovodEditDrawer';

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

  if (kind === 'goodMoving' && params) {
    return (
      <MovementV2DilovodEditDrawer
        isOpen={isOpen}
        title={title}
        dilovodDocumentId={params.dilovodDocumentId}
        onClose={onClose}
      />
    );
  }

  const body = params ? (
    <p className="text-sm text-default-500">
      Редагування цього типу документа ще не підключено. Тип: {kind}.
    </p>
  ) : null;

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
