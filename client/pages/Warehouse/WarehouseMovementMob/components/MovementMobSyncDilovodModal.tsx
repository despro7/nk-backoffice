import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';

interface MovementMobSyncDilovodModalProps {
  isOpen: boolean;
  displayNumber?: string;
  saving?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function MovementMobSyncDilovodModal({
  isOpen,
  displayNumber,
  saving = false,
  onClose,
  onConfirm,
}: MovementMobSyncDilovodModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open && !saving) onClose(); }}
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
        <ModalHeader className="text-base">Зберегти в Dilovod?</ModalHeader>
        <ModalBody>
          <p className="text-sm text-default-600">
            {displayNumber ? `«${displayNumber}» ` : 'Документ '}
            буде перезаписано в Dilovod з <b>фактично отриманими</b> кількостями.
            Відправлений список лишається лише в бек-офісі.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" isDisabled={saving} onPress={onClose}>
            Скасувати
          </Button>
          <Button color="primary" isLoading={saving} onPress={onConfirm}>
            Зберегти
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
