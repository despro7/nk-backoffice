import { Tooltip, type TooltipProps } from '@heroui/react';
import { cn } from '@/lib/utils';
import { isNavBadgeVisible, type NavBadge, type NavBadgeColor } from '@/routes.config';

const NAV_BADGE_COLOR_CLASS: Record<NavBadgeColor, string> = {
  danger: 'bg-danger text-danger-foreground',
  primary: 'bg-primary text-primary-foreground',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  default: 'bg-default-500 text-white',
};

export function NavBadgePill({
  badge,
  tooltipPlacement = 'right',
}: {
  badge: NavBadge;
  tooltipPlacement?: TooltipProps['placement'];
}) {
  if (!isNavBadgeVisible(badge)) return null;
  const color = badge.color ?? 'danger';
  const isNumeric = /^\d+$/.test(badge.label.trim());
  const pill = (
    <span
      className={cn(
        'shrink-0 rounded-full px-1.5 py-1 text-[10px] font-semibold leading-none',
        isNumeric ? 'tabular-nums tracking-normal' : 'uppercase tracking-wide',
        NAV_BADGE_COLOR_CLASS[color] ?? NAV_BADGE_COLOR_CLASS.danger,
      )}
    >
      {badge.label}
    </span>
  );

  if (!badge.tooltip) return pill;

  return (
    <Tooltip
      content={badge.tooltip}
      delay={200}
      closeDelay={0}
      placement={tooltipPlacement}
      showArrow
      classNames={{ content: 'pointer-events-none' }}
    >
      {pill}
    </Tooltip>
  );
}
