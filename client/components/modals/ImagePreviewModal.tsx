import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface ImagePreviewModalProps {
  isOpen: boolean;
  imageUrl: string | null;
  imageName?: string;
  overlayZClassName?: string;
  onClose: () => void;
}

export function ImagePreviewModal({
  isOpen,
  imageUrl,
  imageName,
  overlayZClassName,
  onClose,
}: ImagePreviewModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="5xl"
      scrollBehavior="inside"
      classNames={{
        base: overlayZClassName,
        wrapper: overlayZClassName,
        backdrop: overlayZClassName,
      }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-lg font-semibold">
          <DynamicIcon name="image" size={18} className="text-default-500" />
          <span className="truncate">{imageName || 'Перегляд зображення'}</span>
        </ModalHeader>
        <ModalBody className="flex items-center justify-center bg-default-50 p-2 sm:p-4">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={imageName || 'Зображення товару'}
              className="max-h-[75vh] w-auto max-w-full rounded-medium object-contain"
              draggable={false}
            />
          ) : null}
        </ModalBody>
        <ModalFooter>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
