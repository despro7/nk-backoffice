import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface Props {
  onPreview?: () => void;
  onSend: () => void;
  onCancel?: () => void;
  disabled?: boolean;
}

export default function ActionsBar({ onPreview, onSend, onCancel, disabled }: Props) {
  return (
    <div className="flex justify-end gap-3">
      {/** Optional cancel button (clears inputs) */}
      {typeof onCancel === 'function' && (
        <Button color="default" size="lg" onPress={onCancel}>
          Скасувати
        </Button>
      )}
      {onPreview && (
        <Button color="secondary" size="lg" onPress={onPreview} isDisabled={disabled}>
          <DynamicIcon name="code-2" className="w-4 h-4" />
          Payload
        </Button>
      )}
      <Button color="primary" size="lg" onPress={onSend} isDisabled={disabled}>
        <DynamicIcon name="send" className="w-4 h-4" />
        Відправити
      </Button>
    </div>
  );
}
