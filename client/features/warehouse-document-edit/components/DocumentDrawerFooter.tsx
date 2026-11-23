import { useState, type ReactNode } from 'react';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { drawerChildOverlayClassName } from '@/lib/drawerStacking';
import {
  useWarehouseDocumentDelete,
  type DeletableWarehouseDocumentKind,
} from '../hooks/useWarehouseDocumentDelete';

const STACK_LEVEL = 1;
const MODAL_Z = drawerChildOverlayClassName(STACK_LEVEL);

interface DocumentDrawerFooterProps {
  kind: DeletableWarehouseDocumentKind;
  localId: number | null | undefined;
  onDeleted: () => void;
  /** Праві дії (ActionsBar або кнопка «Закрити»). */
  children: ReactNode;
}

/** Футер drawer документа: ліворуч «Видалити» (лише admin), праворуч основні дії. */
export default function DocumentDrawerFooter({
  kind,
  localId,
  onDeleted,
  children,
}: DocumentDrawerFooterProps) {
  const { isAdmin } = useRoleAccess();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const del = useWarehouseDocumentDelete({ kind, localId, onDeleted });
  const showDelete = isAdmin() && del.canDelete;

  return (
    <div className="flex w-full items-center justify-between gap-3">
      <div>
        {showDelete && (
          <Button
            color="danger"
            variant="light"
            size="md"
            isDisabled={del.isDeleting}
            onPress={() => setConfirmOpen(true)}
            startContent={<DynamicIcon name="trash-2" className="w-4 h-4" />}
          >
            Видалити
          </Button>
        )}
      </div>
      <div className="flex justify-end">{children}</div>

      <ConfirmModal
        isOpen={confirmOpen}
        title="Видалити документ?"
        message="Документ буде позначено на видалення в Діловоді та в backoffice. Цю дію неможливо скасувати."
        confirmText="Видалити"
        cancelText="Скасувати"
        confirmLoading={del.isDeleting}
        overlayZClassName={MODAL_Z}
        onConfirm={() => {
          setConfirmOpen(false);
          void del.deleteDocument();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmModal
        isOpen={del.forceLocalPending}
        title="Видалити локальний запис?"
        message="Діловод повідомив, що документ не знайдено. Видалити лише локальний запис у backoffice?"
        confirmText="Видалити локально"
        cancelText="Скасувати"
        confirmLoading={del.isDeleting}
        overlayZClassName={MODAL_Z}
        onConfirm={() => void del.deleteLocalOnly()}
        onCancel={del.cancelForceLocal}
      />
    </div>
  );
}
