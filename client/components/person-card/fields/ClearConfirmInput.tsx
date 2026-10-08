import { Input, type InputProps } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { MiniConfirmPopover } from '@/components/ui/MiniConfirmPopover';

type ClearConfirmInputProps = Omit<InputProps, 'isClearable' | 'onClear'> & {
  confirmTitle?: string;
  confirmMessage?: string;
  onClear?: () => void;
};

export function ClearConfirmInput({
  value,
  onValueChange,
  isReadOnly,
  confirmTitle = 'Очистити поле?',
  confirmMessage,
  onClear,
  endContent,
  ...props
}: ClearConfirmInputProps) {
  const hasValue = String(value ?? '').length > 0;
  const canClear = !isReadOnly && hasValue;

  const handleClear = () => {
    if (onClear) {
      onClear();
      return;
    }
    onValueChange?.('');
  };

  return (
    <Input
      {...props}
      value={value}
      onValueChange={onValueChange}
      isReadOnly={isReadOnly}
      endContent={
        canClear ? (
          <>
            {endContent}
            <MiniConfirmPopover
              title={confirmTitle}
              message={confirmMessage}
              onConfirm={handleClear}
              trigger={(
                <button
                  type="button"
                  aria-label="Очистити"
                  className="inline-flex shrink-0 rounded-full p-0.5 text-default-400 hover:text-default-600"
                >
                  <DynamicIcon name="circle-x" size={16} />
                </button>
              )}
            />
          </>
        ) : endContent
      }
    />
  );
}
