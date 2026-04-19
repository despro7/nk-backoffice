import { BaseModal } from "./BaseModal";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: "primary" | "danger" | "success" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Так",
  cancelText = "Ні",
  confirmColor = "danger",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <BaseModal
      isOpen={isOpen}
      title={title}
      message={message}
      confirmText={confirmText}
      cancelText={cancelText}
      confirmColor={confirmColor}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
