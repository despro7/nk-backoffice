import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
import type { CatalogItemLabel } from '../ProductsUtils';
import { ArchiveStockWarningBanner } from './ArchiveStockWarningBanner';

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
  const singleProduct = items.length === 1 && !items[0]?.isGroup;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      scrollBehavior="inside"
      classNames={{
        base: 'max-h-[85vh] max-w-2xl',
        body: 'py-3',
      }}
    >
      <ModalContent>
        <ModalHeader>
          {singleProduct ? 'Архівувати товар?' : `Архівувати вибрані (${items.length})?`}
        </ModalHeader>
        <ModalBody className="gap-3">
          <ArchiveStockWarningBanner items={items} archiveFolderName={archiveFolderName} />
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={loading}>
            Скасувати
          </Button>
          <Button
            color="warning"
            className="bg-amber-500 text-white hover:bg-amber-600"
            isLoading={loading}
            onPress={onConfirm}
          >
            В архів
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
