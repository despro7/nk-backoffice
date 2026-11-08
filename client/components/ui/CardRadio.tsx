import { Radio, type RadioProps } from '@heroui/react';

/** Radio як картка-варіант (назва + опис, вибраний – з рамкою). Обгортка `RadioGroup` – сітка карток. */
export function CardRadio({ children, ...props }: RadioProps) {
  return (
    <Radio
      {...props}
      classNames={{
        base: [
          'inline-flex m-0 bg-content2 items-start justify-between',
          'flex-row-reverse cursor-pointer rounded-lg gap-4 p-2 border-2 border-transparent hover:border-primary-200',
          'data-[selected=true]:border-primary',
        ],
        description: 'text-xs',
      }}
    >
      {children}
    </Radio>
  );
}

/** classNames для `RadioGroup` з картками: дві колонки на md+. */
export const CARD_RADIO_GROUP_CLASS_NAMES = {
  label: 'text-sm text-default-700 font-semibold',
  wrapper: 'grid grid-cols-1 md:grid-cols-2 gap-4',
} as const;
