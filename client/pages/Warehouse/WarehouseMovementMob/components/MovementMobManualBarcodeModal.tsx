import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { useEffect, useState } from 'react';

interface MovementMobManualBarcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (code: string) => void;
}

export default function MovementMobManualBarcodeModal({
  isOpen,
  onClose,
  onSubmit,
}: MovementMobManualBarcodeModalProps) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (isOpen) setValue('');
  }, [isOpen]);

  const submit = () => {
    const code = value.trim();
    if (!code) return;
    onSubmit(code);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
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
        <ModalHeader className="text-base">Ввести штрих-код вручну</ModalHeader>
        <ModalBody>
          <Input
            autoFocus
            aria-label="Штрих-код"
            placeholder="Наприклад 2200000000347"
            size="lg"
            value={value}
            onValueChange={setValue}
            inputMode="numeric"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="light" className="text-gray-400/75 hover:text-gray-600" onPress={onClose}>Скасувати</Button>
          <Button color="primary" isDisabled={!value.trim()} onPress={submit}>
            Знайти
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
