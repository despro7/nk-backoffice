import { useState, type ReactNode } from 'react';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@heroui/react';

interface MiniConfirmPopoverProps {
  trigger: ReactNode;
  title: string;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: 'primary' | 'danger' | 'success' | 'warning';
  onConfirm: () => void;
}

export function MiniConfirmPopover({
  trigger,
  title,
  message,
  confirmText = 'Очистити',
  cancelText = 'Скасувати',
  confirmColor = 'danger',
  onConfirm,
}: MiniConfirmPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      isOpen={open}
      onOpenChange={setOpen}
      placement="top"
      showArrow
      offset={6}
      classNames={{
        content: 'p-3 max-w-xs',
      }}
    >
      <PopoverTrigger>{trigger}</PopoverTrigger>
      <PopoverContent>
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-default-900">{title}</p>
            {message ? (
              <div className="text-xs text-default-500">{message}</div>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="flat" onPress={() => setOpen(false)}>
              {cancelText}
            </Button>
            <Button
              size="sm"
              color={confirmColor}
              variant="flat"
              onPress={() => {
                onConfirm();
                setOpen(false);
              }}
            >
              {confirmText}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
