import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, } from "@heroui/react";
import { ReactNode } from "react";

interface BaseModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  icon?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: "primary" | "danger" | "success" | "warning";
  onConfirm?: () => void;
  onCancel?: () => void;
}

export function BaseModal({
  isOpen,
  title,
  message,
  icon,
  confirmText,
  cancelText,
  confirmColor = "primary",
  onConfirm,
  onCancel,
}: BaseModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel}>
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-lg font-semibold">
          {icon}
          {title}
        </ModalHeader>
        <ModalBody>{message}</ModalBody>
        <ModalFooter>
          {confirmText && (
            <Button color={confirmColor} onPress={onConfirm}>
              {confirmText}
            </Button>
          )}
          {cancelText && (
            <Button variant="flat" onPress={onCancel}>
              {cancelText}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
