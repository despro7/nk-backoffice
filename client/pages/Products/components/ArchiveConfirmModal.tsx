import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@heroui/react';
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
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalContent>
        <ModalHeader>Архівувати вибрані?</ModalHeader>
        <ModalBody>
          <p className="text-sm text-default-600">
            Елементи ({items.length}) буде переміщено в папку «{archiveFolderName}»
            (створиться, якщо ще немає) і позначено як видалені в Dilovod.
          </p>
          <CatalogConfirmItemsList items={items} />
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose} isDisabled={loading}>
            Скасувати
          </Button>
          <Button color="warning" onPress={onConfirm} isLoading={loading}>
            В архів
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
