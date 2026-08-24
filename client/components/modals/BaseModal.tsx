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
  /** z-index wrapper/backdrop, коли модалка відкривається поверх вкладених Drawer. */
  overlayZClassName?: string;
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
  overlayZClassName,
}: BaseModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} classNames={{
      base: "max-w-md rounded-xl shadow-lg",
      header: "pl-4 pb-2 pr-8",
      body: "px-4 py-3",
      footer: "px-4 justify-start gap-3",
      closeButton: "absolute right-3 top-3",
      wrapper: overlayZClassName,
      backdrop: overlayZClassName,
    }}>
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-lg font-semibold">
          {icon}
          {title}
        </ModalHeader>
        <ModalBody>{message}</ModalBody>
        <ModalFooter>
          {confirmText && (
            <Button 
              color={confirmColor} 
              className={`
                ${confirmColor === 'warning' ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''}
                ${confirmColor === 'success' ? 'bg-green-500 hover:bg-green-600 text-white' : ''}
              `} 
              onPress={onConfirm} 
              isLoading={confirmLoading} 
              startContent={confirmStartContent}
            >
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
