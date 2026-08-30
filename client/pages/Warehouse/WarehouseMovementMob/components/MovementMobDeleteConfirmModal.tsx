import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';

interface MovementMobDeleteConfirmModalProps {
  isOpen: boolean;
  displayNumber?: string;
  deleting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function MovementMobDeleteConfirmModal({
  isOpen,
  displayNumber,
  deleting = false,
  onClose,
  onConfirm,
}: MovementMobDeleteConfirmModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open && !deleting) onClose(); }}
      placement="center"
      hideCloseButton
      classNames={{
        base: 'rounded-xl',
        body: 'px-4',
        footer: 'px-4',
        header: 'px-4',
      }}
    >
      <ModalContent>
        <ModalHeader className="text-base">Видалити документ?</ModalHeader>
        <ModalBody>
          <p className="text-sm text-default-600">
            {displayNumber ? `«${displayNumber}» ` : 'Документ '}
            буде позначено як видалений. У Діловоді, якщо документ уже відправлено,
            ставиться <b>позначка на видалення</b>. Запис у бек-офісі збережеться для архіву.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" isDisabled={deleting} onPress={onClose}>
            Скасувати
          </Button>
          <Button color="danger" isLoading={deleting} onPress={onConfirm}>
            Видалити
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
