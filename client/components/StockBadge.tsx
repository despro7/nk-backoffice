import { cn } from '@/lib/utils';

export type StockBadgeVariant = 'ms' | 'gp' | 'both';
export type StockBadgeSize = '9px' | '10px';

interface StockBadgeProps {
  variant: StockBadgeVariant;
  /** Розмір тексту бейджа */
  size?: StockBadgeSize;
  className?: string;
}

const SIZE_CLASS: Record<StockBadgeSize, string> = {
  '9px': 'text-[9px]',
  '10px': 'text-[10px]',
};

const VARIANT_SINGLE_CLASS: Record<'ms' | 'gp', string> = {
  ms: 'text-lime-800/50 bg-lime-500/10',
  gp: 'text-blue-800/50 bg-blue-500/10',
};

const LABELS: Record<'ms' | 'gp', string> = {
  ms: 'МС',
  gp: 'ГП',
};

/**
 * Бейдж складу: МС (малий), ГП (готова продукція) або комбінований МС | ГП.
 */
export function StockBadge({ variant, size = '9px', className }: StockBadgeProps) {
  if (variant === 'both') {
    return (
      <span
        className={cn(
          'text-gray-900/65 font-medium px-1 py-0.5 whitespace-nowrap rounded bg-gradient-to-r from-lime-100 to-blue-100 border shadow-accent',
          SIZE_CLASS[size],
          className,
        )}
      >
        МС <small className="mx-0.5">|</small> ГП
      </span>
    );
  }

  return (
    <span
      className={cn(
        'px-1 rounded ring-1',
        size === '9px' ? 'py-[1px]' : 'py-0.5',
        SIZE_CLASS[size],
        VARIANT_SINGLE_CLASS[variant],
        className,
      )}
    >
      {LABELS[variant]}
    </span>
  );
}
