import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface Props {
  onPreview?: () => void;
  onSend?: () => void;
  onCancel?: () => void;
  disabled?: boolean;
  sendLabel?: string;
}

export default function ActionsBar({ onPreview, onSend, onCancel, disabled, sendLabel = 'Створити випуск' }: Props) {
  return (
    <div className="flex justify-end gap-3">
      {/** Optional cancel button (clears inputs) */}
      {typeof onCancel === 'function' && (
        <Button color="default" size="lg" onPress={onCancel}>
          Скасувати
        </Button>
      )}
      {onPreview && (
        <Button color="secondary" size="lg" onPress={onPreview} startContent={<DynamicIcon name="code-2" className="w-5 h-5" />} disabled={disabled}>
          Payload
        </Button>
      )}
      <Button color="primary" size="lg" onPress={onSend} startContent={<DynamicIcon name="package-plus" className="w-5 h-5" />} disabled={disabled}>
        {sendLabel}
      </Button>
    </div>
  );
}


