import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface Props {
  onPreview?: () => void;
  onSend?: () => void;
  onCancel?: () => void;
  sendDisabled?: boolean;
  previewDisabled?: boolean;
  sendLabel?: string;
  sendLoading?: boolean;
}

export default function ActionsBar({
  onPreview,
  onSend,
  onCancel,
  sendDisabled = false,
  previewDisabled = false,
  sendLabel = 'Створити випуск',
  sendLoading = false,
}: Props) {
  return (
    <div className="flex justify-end gap-3">
      {/** Optional cancel button (clears inputs) */}
      {typeof onCancel === 'function' && (
        <Button color="default" size="lg" onPress={onCancel}>
          Скасувати
        </Button>
      )}
      {onPreview && (
        <Button
          color="secondary"
          size="lg"
          onPress={onPreview}
          startContent={<DynamicIcon name="code-2" className="w-5 h-5" />}
          isDisabled={previewDisabled}
        >
          Payload
        </Button>
      )}
      <Button
        color="primary"
        size="lg"
        onPress={onSend}
        isLoading={sendLoading}
        startContent={sendLoading ? undefined : <DynamicIcon name="package-plus" className="w-5 h-5" />}
        isDisabled={sendDisabled}
        className="data-[disabled=true]:opacity-50"
      >
        {sendLabel}
      </Button>
    </div>
  );
}


