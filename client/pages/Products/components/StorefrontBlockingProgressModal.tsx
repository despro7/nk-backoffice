import { Modal, ModalBody, ModalContent, Progress, Spinner } from '@heroui/react';

interface StorefrontBlockingProgressModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  current: number;
  total: number;
}

export function StorefrontBlockingProgressModal({
  isOpen,
  title,
  subtitle,
  current,
  total,
}: StorefrontBlockingProgressModalProps) {
  const progress = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <Modal
      isOpen={isOpen}
      isDismissable={false}
      hideCloseButton
      placement="center"
      classNames={{ base: 'max-w-sm rounded-xl' }}
    >
      <ModalContent>
        <ModalBody className="gap-4 py-6">
          <div className="flex items-center gap-3">
            <Spinner size="sm" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{title}</p>
              {subtitle ? <p className="text-sm text-default-500">{subtitle}</p> : null}
            </div>
          </div>
          <Progress aria-label="Прогрес" value={progress} size="sm" color="primary" />
          <p className="text-center text-sm text-default-500">
            {current} / {total}
          </p>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
