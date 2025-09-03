import { BaseModal } from "./BaseModal";

interface InfoModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  buttonText?: string;
  onClose: () => void;
}

export function InfoModal({
  isOpen,
  title,
  message,
  buttonText = "Ок",
  onClose,
}: InfoModalProps) {
  return (
    <BaseModal
      isOpen={isOpen}
      title={title}
      message={message}
      confirmText={buttonText}
      confirmColor="primary"
      onConfirm={onClose}
      onCancel={onClose}
    />
  );
}
