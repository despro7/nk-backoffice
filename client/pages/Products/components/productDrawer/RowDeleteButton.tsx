import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

/** Мікро-конфірм видалення рядка: перший клік розгортає «Видалити?», другий — виконує. */
export function RowDeleteButton({
  ariaLabel,
  className,
  confirming,
  isDisabled,
  onRequest,
  onConfirm,
}: {
  ariaLabel: string;
  className?: string;
  confirming: boolean;
  isDisabled?: boolean;
  onRequest: () => void;
  onConfirm: () => void;
}) {
  return (
    <Button
      size="sm"
      variant="light"
      color="danger"
      isDisabled={isDisabled}
      aria-label={confirming ? `Підтвердити: ${ariaLabel}` : ariaLabel}
      className={[
        'h-8 min-w-8 gap-0 overflow-hidden px-2.5 transition-[min-width,padding] duration-200 ease-out',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onPress={() => {
        if (!confirming) {
          onRequest();
          return;
        }
        onConfirm();
      }}
    >
      <DynamicIcon name="trash-2" size={14} className="shrink-0" />
      <span
        className={[
          'overflow-hidden whitespace-nowrap transition-all duration-200 ease-out',
          confirming ? 'max-w-[4.5rem] opacity-100 ml-2' : 'max-w-0 opacity-0 ml-0',
        ].join(' ')}
      >
        Видалити?
      </span>
    </Button>
  );
}
