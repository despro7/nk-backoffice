import { Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Textarea } from '@heroui/react';

// ---------------------------------------------------------------------------
// InventoryCommentModal — модалка для введення/редагування коментаря
// ---------------------------------------------------------------------------

interface InventoryCommentModalProps {
  isOpen: boolean;
  commentDraft: string;
  onCommentDraftChange: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export const InventoryCommentModal = ({
  isOpen, commentDraft, onCommentDraftChange, onSave, onClose,
}: InventoryCommentModalProps) => (
  <Modal isOpen={isOpen} onClose={onClose}>
    <ModalContent>
      <ModalHeader>Коментар до інвентаризації</ModalHeader>
      <ModalBody>
        <Textarea
          placeholder="Введіть коментар до інвентаризації..."
          value={commentDraft}
          onValueChange={onCommentDraftChange}
          minRows={3}
        />
      </ModalBody>
      <ModalFooter>
        <Button variant="flat" onPress={onClose}>
          Скасувати
        </Button>
        <Button color="primary" onPress={onSave}>
          Зберегти
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
);
