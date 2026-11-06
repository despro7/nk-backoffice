import { Tooltip } from '@heroui/react';
import { cn } from '@/lib/utils';

/**
 * ms / gp: склади готової продукції; sp / vp: склади інгредієнтів;
 * both: комбінований МС | ГП.
 */
export type StockBadgeVariant = 'ms' | 'gp' | 'sp' | 'vp' | 'both';
export type StockBadgeSize = '9px' | '10px';
type SingleVariant = Exclude<StockBadgeVariant, 'both'>;

interface StockBadgeProps {
  variant: StockBadgeVariant;
  /** Розмір тексту бейджа */
  size?: StockBadgeSize;
  className?: string;
  /** Підказка з повною назвою складу при наведенні */
  withTooltip?: boolean;
}

const SIZE_CLASS: Record<StockBadgeSize, string> = {
  '9px': 'text-[9px]',
  '10px': 'text-[10px]',
};

const VARIANT_SINGLE_CLASS: Record<SingleVariant, string> = {
  ms: 'text-lime-800/50 bg-lime-500/10',
  gp: 'text-blue-800/50 bg-blue-500/10',
  sp: 'text-amber-800/60 bg-amber-500/10',
  vp: 'text-violet-800/50 bg-violet-500/10',
};

const LABELS: Record<SingleVariant, string> = {
  ms: 'МС',
  gp: 'ГП',
  sp: 'СП',
  vp: 'ВП',
};

/** Повні назви складів (як у Dilovod) для підказок. */
export const STOCK_BADGE_FULL_NAMES: Record<SingleVariant, string> = {
  ms: 'Малий склад',
  gp: 'Склад готової продукції',
  sp: 'Склад сировини/пакування',
  vp: 'Виробництво продукції',
};

const TOOLTIP_CLASS_NAMES = {
  base: 'before:bg-gray-700 before:rounded-[2px]',
  content: 'bg-gray-700 border-0 text-white text-xs',
};

/**
 * Бейдж складу: МС (малий), ГП (готова продукція), СП (сировина/пакування),
 * ВП (виробництво продукції) або комбінований МС | ГП.
 */
export function StockBadge({ variant, size = '9px', className, withTooltip = false }: StockBadgeProps) {
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

  const badge = (
    <span
      className={cn(
        'px-1 rounded ring-1',
        size === '9px' ? 'py-[1px]' : 'py-0.5',
        SIZE_CLASS[size],
        VARIANT_SINGLE_CLASS[variant],
        withTooltip && 'cursor-help',
        className,
      )}
      aria-label={withTooltip ? STOCK_BADGE_FULL_NAMES[variant] : undefined}
    >
      {LABELS[variant]}
    </span>
  );

  if (!withTooltip) return badge;

  return (
    <Tooltip
      content={STOCK_BADGE_FULL_NAMES[variant]}
      placement="top"
      delay={300}
      showArrow
      classNames={TOOLTIP_CLASS_NAMES}
    >
      {badge}
    </Tooltip>
  );
}
