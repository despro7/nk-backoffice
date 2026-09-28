import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { HtmlCodeMirror } from '@/components/editor/HtmlCodeMirror';

interface StorefrontHtmlPreviewModalProps {
  isOpen: boolean;
  html: string;
  overlayZClassName?: string;
  onClose: () => void;
}

export function StorefrontHtmlPreviewModal({
  isOpen,
  html,
  overlayZClassName,
  onClose,
}: StorefrontHtmlPreviewModalProps) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(html);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="3xl"
      scrollBehavior="inside"
      classNames={{
        base: 'max-w-4xl rounded-xl shadow-lg',
        header: 'pl-4 pb-2 pr-8',
        body: 'px-4 py-3',
        footer: 'px-4 justify-end gap-2',
        closeButton: 'absolute right-3 top-3',
        wrapper: overlayZClassName,
        backdrop: overlayZClassName,
      }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-lg font-semibold">
          <DynamicIcon name="file-code-2" size={18} className="text-gray-500" />
          HTML для WooCommerce
        </ModalHeader>
        <ModalBody>
          <p className="text-xs text-gray-500 mb-2">
            Фінальний HTML опису після підстановки даних товару — саме він синхронізується з WC.
          </p>
          <HtmlCodeMirror value={html} minHeight="480px" />
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={() => void handleCopy()} startContent={<DynamicIcon name="copy" size={14} />}>
            Копіювати
          </Button>
          <Button variant="light" onPress={onClose}>
            Закрити
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
