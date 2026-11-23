import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface Props {
  onPreview?: () => void;
  onSend?: () => void;
  onCancel?: () => void;
  /** Ліворуч: повернення на попередній крок (коригування, крок 2 → крок 1). */
  onBack?: () => void;
  backLabel?: string;
  sendDisabled?: boolean;
  previewDisabled?: boolean;
  sendLabel?: string;
  sendLoading?: boolean;
  /** Розмір кнопок. За замовчуванням `lg` (сторінки складу); у drawer передавати `md`. */
  size?: 'md' | 'lg';
}

export default function ActionsBar({
  onPreview,
  onSend,
  onCancel,
  onBack,
  backLabel = 'Повернутися на крок 1',
  sendDisabled = false,
  previewDisabled = false,
  sendLabel = 'Створити випуск',
  sendLoading = false,
  size = 'lg',
}: Props) {
  const iconCls = size === 'md' ? 'w-4 h-4' : 'w-5 h-5';
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        {typeof onBack === 'function' && (
          <Button
            color="warning"
            variant="light"
            size={size}
            onPress={onBack}
            startContent={<DynamicIcon name="arrow-left" className={iconCls} />}
          >
            {backLabel}
          </Button>
        )}
      </div>
      <div className="flex justify-end gap-3">
      {/** Optional cancel button (clears inputs) */}
      {typeof onCancel === 'function' && (
        <Button color="default" size={size} onPress={onCancel}>
          Скасувати
        </Button>
      )}
      {onPreview && (
        <Button
          color="secondary"
          size={size}
          onPress={onPreview}
          startContent={<DynamicIcon name="code-2" className={iconCls} />}
          isDisabled={previewDisabled}
        >
          Payload
        </Button>
      )}
      <Button
        color="primary"
        size={size}
        onPress={onSend}
        isLoading={sendLoading}
        startContent={sendLoading ? undefined : <DynamicIcon name="package-plus" className={iconCls} />}
        isDisabled={sendDisabled}
        className="data-[disabled=true]:opacity-50"
      >
        {sendLabel}
      </Button>
      </div>
    </div>
  );
}


