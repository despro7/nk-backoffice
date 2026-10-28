import { Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

export const BARCODE_KIND_PORTION_TOOLTIP =
  'ШК порції – синхронізується з Dilovod, привʼязка до партії';
export const BARCODE_KIND_BOX_TOOLTIP =
  'Окремий ШК коробки для сканування у переміщеннях';

interface BarcodeKindIconProps {
  kind: 'portion' | 'box';
  size?: number;
  className?: string;
}

export function BarcodeKindIcon({ kind, size = 16, className = '' }: BarcodeKindIconProps) {
  const isBox = kind === 'box';
  const label = isBox ? 'Штрихкод коробки' : 'Штрихкод порції';
  return (
    <Tooltip
      content={isBox ? BARCODE_KIND_BOX_TOOLTIP : BARCODE_KIND_PORTION_TOOLTIP}
      placement="top"
      showArrow
      delay={200}
      classNames={{ 
        base: 'before:rounded-[3px] before:z-[10] before:shadow-none',
        content: 'text-xs max-w-50 text-center shadow-lg p-2'
      }}
    >
      <span
        className={`inline-flex shrink-0 items-center justify-center ${className}`}
        aria-label={label}
        role="img"
      >
        <DynamicIcon
          name={isBox ? 'package' : 'scan-barcode'}
          size={size}
          className={isBox ? 'text-warning-600' : 'text-default-400'}
        />
      </span>
    </Tooltip>
  );
}
