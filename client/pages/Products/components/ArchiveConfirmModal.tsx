import { ConfirmModal } from '@/components/modals/ConfirmModal';
import type { CatalogItemLabel } from '../ProductsUtils';
import { CatalogConfirmItemsList } from './CatalogConfirmItemsList';

interface ArchiveConfirmModalProps {
  isOpen: boolean;
  items: CatalogItemLabel[];
  archiveFolderName: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ArchiveConfirmModal({
  isOpen,
  items,
  archiveFolderName,
  loading,
  onConfirm,
  onClose,
}: ArchiveConfirmModalProps) {
  return (

    <ConfirmModal
        isOpen={isOpen}
        title="Архівувати вибрані?"
        message={
          <div className="space-y-1">
            <p>
              {items.length} елемент(ів) буде переміщено в папку «{archiveFolderName}».
            </p>
            <CatalogConfirmItemsList items={items} />
          </div>
        }
        confirmText="В архів"
        confirmColor="warning"
        cancelText="Скасувати"
        confirmLoading={loading}
        onCancel={onClose}
        onConfirm={onConfirm}
      />
  );
}
