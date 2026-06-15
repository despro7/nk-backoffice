import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, } from "@heroui/react";
import { ReactNode } from "react";

interface BaseModalProps {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  icon?: ReactNode;
  confirmText?: string;
  confirmStartContent?: ReactNode;
  cancelText?: string;
  confirmColor?: "primary" | "danger" | "success" | "warning";
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmLoading?: boolean;
}

export function BaseModal({
  isOpen,
  title,
  message,
  icon,
  confirmText,
  confirmStartContent,
  cancelText,
  confirmColor = "primary",
  onConfirm,
  onCancel,
  confirmLoading = false,
}: BaseModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} classNames={{
      base: "max-w-md rounded-xl shadow-lg",
      header: "pl-4 pb-2 pr-8",
      body: "px-4 py-3",
      footer: "px-4 justify-start gap-3",
    }}>
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-lg font-semibold">
          {icon}
          {title}
        </ModalHeader>
        <ModalBody>{message}</ModalBody>
        <ModalFooter>
          {confirmText && (
            <Button color={confirmColor} onPress={onConfirm} isLoading={confirmLoading} startContent={confirmStartContent}>
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
