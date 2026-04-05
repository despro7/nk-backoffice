import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { UnsavedGuardModalProps } from '@/hooks/useUnsavedGuard';

// ---------------------------------------------------------------------------
// UnsavedChangesModal — загальна модалка для блокування навігації.
//
// Показується коли користувач намагається покинути сторінку з незбереженими змінами.
// Пропонує три дії: зберегти чернетку і вийти, вийти без збереження, або скасувати.
//
// Props розширюють UnsavedGuardModalProps з useUnsavedGuard:
//   title           — заголовок (за замовчуванням: 'Незбережені зміни')
//   message         — текст попередження
//   saveText        — текст кнопки збереження (за замовчуванням: 'Зберегти і вийти')
//   leaveText       — текст кнопки виходу (за замовчуванням: 'Вийти без збереження')
//   cancelText      — текст кнопки скасування (за замовчуванням: 'Залишитись')
// ---------------------------------------------------------------------------

interface UnsavedChangesModalProps extends UnsavedGuardModalProps {
  title?: string;
  message?: string;
  saveText?: string;
  leaveText?: string;
  cancelText?: string;
}

export function UnsavedChangesModal({
  isOpen,
  isSaving,
  onSave,
  onLeave,
  onCancel,
  title = 'Незбережені зміни',
  message = 'Ви маєте незбережені зміни. Що зробити перед виходом?',
  saveText = 'Зберегти і вийти',
  leaveText = 'Вийти без збереження',
  cancelText = 'Залишитись',
}: UnsavedChangesModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
			size="xl"
      // Забороняємо закрити кліком на фон під час збереження
      isDismissable={!isSaving}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-lg font-semibold">
          <DynamicIcon name="triangle-alert" className="w-5 h-5 text-red-500 shrink-0" />
          {title}
        </ModalHeader>

        <ModalBody>
          <p className="text-sm text-gray-600">{message}</p>
        </ModalBody>

        <ModalFooter className="flex flex-col sm:flex-row gap-2">
          {/* Головна дія — зберегти чернетку і продовжити навігацію */}
          <Button
            color="primary"
            onPress={onSave}
            isLoading={isSaving}
            isDisabled={isSaving}
            startContent={!isSaving && <DynamicIcon name="save" className="w-4 h-4" />}
            className="w-full sm:w-auto"
          >
            {saveText}
          </Button>

          {/* Вийти без збереження */}
          <Button
            color="danger"
            variant="flat"
            onPress={onLeave}
            isDisabled={isSaving}
            startContent={<DynamicIcon name="log-out" className="w-4 h-4" />}
            className="w-full sm:w-auto"
          >
            {leaveText}
          </Button>

          {/* Скасувати — залишитись на сторінці */}
          <Button
            variant="flat"
            onPress={onCancel}
            isDisabled={isSaving}
            className="w-full sm:w-auto"
          >
            {cancelText}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
