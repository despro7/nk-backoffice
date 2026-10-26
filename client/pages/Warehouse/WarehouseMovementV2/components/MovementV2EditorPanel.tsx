import { useMemo } from 'react';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { PayloadPreviewModal } from '@/components/modals/PayloadPreviewModal';
import { useDebug } from '@/contexts/debug-context';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { useDilovodDirectories } from '@/contexts/DilovodDirectoriesContext';
import { getStorageDisplayName } from '@shared/utils/directoryUtils';
import ActionsBar from '../../WarehouseReleaseSets/components/ActionsBar';
import MovementDirectionDetails from './MovementDirectionDetails';
import MovementRegisterPanel from './MovementRegisterPanel';
import MovementSummaryPanel from './MovementSummaryPanel';
import useWarehouseMovementV2 from '../useWarehouseMovementV2';
import { useMovementV2SendFlow } from '../hooks/useMovementV2SendFlow';

type Mov = ReturnType<typeof useWarehouseMovementV2>;
type SendFlow = ReturnType<typeof useMovementV2SendFlow>;

interface MovementV2EditorPanelProps {
  mov: Mov;
  sendFlow: SendFlow;
  showClearConfirm?: boolean;
  onShowClearConfirm?: (open: boolean) => void;
  modalOverlayZClassName?: string;
  sendLabel?: string;
  showDirectionHeading?: boolean;
  hideInlineActions?: boolean;
  compactSummarySpacing?: boolean;
}

export default function MovementV2EditorPanel({
  mov,
  sendFlow,
  showClearConfirm = false,
  onShowClearConfirm,
  modalOverlayZClassName,
  sendLabel = 'Створити переміщення',
  showDirectionHeading = true,
  hideInlineActions = false,
  compactSummarySpacing = false,
}: MovementV2EditorPanelProps) {
  const { isDebugMode } = useDebug();
  const { isAdmin } = useRoleAccess();
  const dirsCtx = useDilovodDirectories();

  const movementStorages = useMemo(() => {
    const src = Array.isArray(dirsCtx.directories?.storages) ? dirsCtx.directories!.storages : [];
    return src.map((s: { id: string; name?: string; code?: string }) => ({
      id: String(s.id),
      code: s.code ?? '',
      name: s.name ?? '',
    }));
  }, [dirsCtx.directories]);

  const sourceStorageName = useMemo(
    () => getStorageDisplayName(mov.storage, undefined, dirsCtx.directories) ?? mov.storage,
    [mov.storage, dirsCtx.directories],
  );

  // Drawer: hideInlineActions + compactSummarySpacing; головна вкладка — без compact.
  const compactLayout = compactSummarySpacing || hideInlineActions;

  return (
    <>
      <MovementDirectionDetails
        storages={movementStorages}
        storage={mov.storage}
        storageTo={mov.storageTo}
        onStorageChange={mov.setStorage}
        onStorageToChange={mov.setStorageTo}
        movementDateTime={mov.movementDateTime}
        onMovementDateTimeChange={mov.setMovementDateTime}
        showSectionTitle={showDirectionHeading}
        compactSpacing={compactLayout}
      />

      <MovementRegisterPanel
        lines={mov.lines}
        storageId={mov.storage}
        storageName={sourceStorageName}
        movementDateTime={mov.movementDateTime}
        onAdd={(hit) => void mov.addProductFromSearch(hit)}
        onBatchesChange={mov.updateLineBatches}
        onPortionsPerBoxChange={mov.updateLinePortionsPerBox}
        onRemoveLine={mov.removeLine}
        overlayZClassName={modalOverlayZClassName}
        batchPickerShouldBlockScroll={modalOverlayZClassName ? false : undefined}
        compactSpacing={compactLayout}
      />

      <MovementSummaryPanel
        items={mov.summaryItems}
        sourceStorageId={mov.storage}
        destStorageId={mov.storageTo}
        compactSpacing={compactLayout}
      />

      {!hideInlineActions ? (
        <ActionsBar
          onPreview={isDebugMode && isAdmin() ? () => void sendFlow.handleShowPayload() : undefined}
          onSend={() => void sendFlow.sendAndFinalize()}
          onCancel={mov.lines.length > 0 && onShowClearConfirm
            ? () => onShowClearConfirm(true)
            : undefined}
          sendLabel={sendLabel}
          sendLoading={sendFlow.isSendingToDilovod || mov.isSaving}
          sendDisabled={mov.summaryItems.length === 0 || sendFlow.isSendingToDilovod || mov.isSaving}
          previewDisabled={mov.summaryItems.length === 0}
        />
      ) : null}

      {onShowClearConfirm ? (
        <ConfirmModal
          isOpen={showClearConfirm}
          title="Очистити реєстр?"
          message="Усі позиції та незбережені зміни будуть видалені з форми."
          confirmText="Очистити"
          cancelText="Скасувати"
          confirmColor="danger"
          onConfirm={() => {
            mov.clearAll();
            onShowClearConfirm(false);
          }}
          onCancel={() => onShowClearConfirm(false)}
          overlayZClassName={modalOverlayZClassName}
        />
      ) : null}

      <PayloadPreviewModal
        isOpen={sendFlow.showPayloadPreview}
        onClose={() => sendFlow.setShowPayloadPreview(false)}
        payload={sendFlow.payloadPreview}
        title="Перегляд Payload переміщення (goodMoving)"
        isLoading={sendFlow.isLoadingPayload}
        overlayZClassName={modalOverlayZClassName}
      />
    </>
  );
}
