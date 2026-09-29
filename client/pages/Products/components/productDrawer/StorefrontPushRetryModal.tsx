import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface StorefrontPushRetryModalProps {
  isOpen: boolean;
  error: string | null;
  loading?: boolean;
  onRetry: () => void;
  onClose: () => void;
}

export function StorefrontPushRetryModal({
  isOpen,
  error,
  loading,
  onRetry,
  onClose,
}: StorefrontPushRetryModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" classNames={{ base: 'max-w-md rounded-xl' }}>
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <DynamicIcon name="triangle-alert" size={18} className="text-warning-600" />
          Помилка синхронізації з сайтом
        </ModalHeader>
        <ModalBody>
          <p className="text-sm text-default-600">
            Товар збережено в Backoffice, але push на WooCommerce не вдався.
          </p>
          {error ? <p className="mt-2 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</p> : null}
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose} isDisabled={loading}>
            Закрити
          </Button>
          <Button color="primary" onPress={onRetry} isLoading={loading}>
            Повторити push
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
