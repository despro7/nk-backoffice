import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Spinner } from '@heroui/react';
import ResizableAppDrawer from '@/components/drawer/ResizableAppDrawer';
import { drawerChildOverlayClassName } from '@/lib/drawerStacking';
import { useDebug } from '@/contexts/debug-context';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import useWarehouseMovementV2 from '@/pages/Warehouse/WarehouseMovementV2/useWarehouseMovementV2';
import MovementV2EditorPanel from '@/pages/Warehouse/WarehouseMovementV2/components/MovementV2EditorPanel';
import ActionsBar from '@/pages/Warehouse/WarehouseReleaseSets/components/ActionsBar';
import { useMovementV2SendFlow } from '@/pages/Warehouse/WarehouseMovementV2/hooks/useMovementV2SendFlow';

const WIDTH_STORAGE_KEY = 'warehouse-document-edit-drawer-width-v1';
const DEFAULT_WIDTH = 920;
const MIN_WIDTH = 640;
const MAX_WIDTH = 1200;

/** Відповідає stackLevel={1} нижче. */
const NESTED_OVERLAY_Z = drawerChildOverlayClassName(1);
const DOCUMENT_EDIT_STACK_LEVEL = 1;

interface MovementV2DilovodEditDrawerProps {
  isOpen: boolean;
  title: string;
  dilovodDocumentId: string;
  onClose: () => void;
}

export default function MovementV2DilovodEditDrawer({
  isOpen,
  title,
  dilovodDocumentId,
  onClose,
}: MovementV2DilovodEditDrawerProps) {
  const { isDebugMode } = useDebug();
  const { isAdmin } = useRoleAccess();
  const mov = useWarehouseMovementV2();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sendFacade = useMemo(() => ({
    storage: mov.storage,
    storageTo: mov.storageTo,
    selectedDateTime: mov.movementDateTime,
    summaryItems: mov.summaryItems,
    savedDraft: mov.savedDraft,
    handleSaveDraft: mov.handleSaveDraft,
  }), [mov]);

  const sendFlow = useMovementV2SendFlow(sendFacade, { onFinalized: onClose });

  useEffect(() => {
    if (!isOpen || !dilovodDocumentId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void mov.loadFromDilovodDocument(dilovodDocumentId)
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Не вдалося завантажити документ');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, dilovodDocumentId]);

  const editorReady = !loading && !error;

  const footer = editorReady ? (
    <div className="flex w-full justify-end">
      <ActionsBar
      onPreview={isDebugMode && isAdmin() ? () => void sendFlow.handleShowPayload() : undefined}
      onSend={() => void sendFlow.sendAndFinalize()}
      onCancel={onClose}
      sendLabel="Зберегти та відправити"
      sendLoading={sendFlow.isSendingToDilovod || mov.isSaving}
      sendDisabled={mov.summaryItems.length === 0 || sendFlow.isSendingToDilovod || mov.isSaving}
      previewDisabled={mov.summaryItems.length === 0}
      />
    </div>
  ) : (
    <Button variant="light" onPress={onClose}>
      Закрити
    </Button>
  );

  let body: ReactNode;
  if (loading) {
    body = (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-default-500">
        <Spinner label="Завантаження документа з Діловода..." />
      </div>
    );
  } else if (error) {
    body = (
      <div className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger">
        {error}
      </div>
    );
  } else {
    body = (
      <>
        {mov.linkedMobScan ? (
          <p className="mb-3 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-800">
            Документ створено через сканування (movement-mob). Штрих-коди та дані прийому збережуться при збереженні з v2.
          </p>
        ) : null}
        <MovementV2EditorPanel
          mov={mov}
          sendFlow={sendFlow}
          modalOverlayZClassName={NESTED_OVERLAY_Z}
          sendLabel="Зберегти та відправити"
          showDirectionHeading={false}
          hideInlineActions
          compactSummarySpacing={true}
        />
      </>
    );
  }

  return (
    <ResizableAppDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      initialPlacement="right"
      stackLevel={DOCUMENT_EDIT_STACK_LEVEL}
      widthStorageKey={WIDTH_STORAGE_KEY}
      defaultWidth={DEFAULT_WIDTH}
      minWidth={MIN_WIDTH}
      maxWidth={MAX_WIDTH}
      resizeAriaLabel="Змінити ширину панелі редагування документа"
      footer={footer}
    >
      {body}
    </ResizableAppDrawer>
  );
}
