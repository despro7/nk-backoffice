import { Chip } from '@heroui/react';
import type { ReactNode } from 'react';
import { specColorToClassNames, type SpecColorTokens } from '@shared/utils/specColorPalette';
import { DynamicIcon } from 'lucide-react/dynamic';

const SPEC_CHIP_LUCIDE_ICONS = {
  success: 'circle-check',
  warning: 'triangle-alert',
  error: 'circle-x',
  info: 'info',
  default: 'circle',
  merge: 'merge',
} as const;

export type SpecChipIcon = keyof typeof SPEC_CHIP_LUCIDE_ICONS;

export interface SpecChipProps {
  tokens: SpecColorTokens;
  icon?: SpecChipIcon;
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md';
  rounded?: 'full' | 'sm';
  selected?: boolean;
  onClick?: () => void;
}

/** Семантичний chip на базі specColorPalette (колір через tokens, не inline). */
export function SpecChip({
  tokens,
  icon,
  children,
  className,
  size = 'sm',
  rounded = 'full',
  selected = false,
  onClick,
}: SpecChipProps) {
  const lucideIcon = icon ? SPEC_CHIP_LUCIDE_ICONS[icon] : undefined;

  return (
    <Chip
      size={size}
      variant="flat"
      className={onClick ? 'cursor-pointer' : undefined}
      onClick={onClick}
      startContent={lucideIcon ? <DynamicIcon name={lucideIcon} size={13} /> : undefined}
      classNames={{
        base: [
          rounded ? `rounded-${rounded}` : 'rounded-full',
          specColorToClassNames(tokens, { border: true, intensity: selected ? 'medium' : tokens.intensity }),
          selected ? 'ring-2 ring-slate-800 ring-offset-1' : '',
          className ?? rounded === 'full' ? 'px-1.5' : 'px-1',
        ].join(' '),
        content: 'font-medium leading-none ml-0.5',
      }}
    >
      {children}
    </Chip>
  );
}

/** @deprecated Використовуйте SpecChip — alias для зворотної сумісності HR-модуля. */
export const HrSpecChip = SpecChip;
