import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';

interface MovementMobCancelReceiptModalProps {
  isOpen: boolean;
  displayNumber?: string;
  canceling?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function MovementMobCancelReceiptModal({
  isOpen,
  displayNumber,
  canceling = false,
  onClose,
  onConfirm,
}: MovementMobCancelReceiptModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open && !canceling) onClose(); }}
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
        <ModalHeader className="text-base">Скасувати підтвердження отримання?</ModalHeader>
        <ModalBody>
          <p className="text-sm text-default-600">
            {displayNumber ? `«${displayNumber}» ` : 'Документ '}
            повернеться на етап очікування отримання. У Діловоді, якщо документ уже був
            проведений, <b>скасовується проведення</b>. Після цього можна знову відредагувати
            прийняті кількості та підтвердити отримання — документ буде проведений повторно.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" isDisabled={canceling} onPress={onClose}>
            Ні
          </Button>
          <Button color="warning" isLoading={canceling} onPress={onConfirm}>
            Скасувати підтвердження
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
