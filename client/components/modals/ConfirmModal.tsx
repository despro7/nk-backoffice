import { BaseModal } from "./BaseModal";
import { ReactNode } from "react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  confirmText?: string;
  confirmStartContent?: ReactNode;
  cancelText?: string;
  confirmColor?: "primary" | "danger" | "success" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
  confirmLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Так",
  confirmStartContent,
  cancelText = "Ні",
  confirmColor = "danger",
  onConfirm,
  onCancel,
  confirmLoading = false,
}: ConfirmModalProps) {
  return (
    <BaseModal
      isOpen={isOpen}
      title={title}
      message={message}
      confirmText={confirmText}
      confirmStartContent={confirmStartContent}
      cancelText={cancelText}
      confirmColor={confirmColor}
      onConfirm={onConfirm}
      onCancel={onCancel}
      confirmLoading={confirmLoading}
    />
  );
}
