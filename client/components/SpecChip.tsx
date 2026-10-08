import { Chip, Tooltip } from '@heroui/react';
import type { ReactNode } from 'react';
import { specChipEditGradient, specColorToClassNames, type SpecColorTokens } from '@shared/utils/specColorPalette';
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

export interface EditableSpecChipProps extends SpecChipProps {
  editLabel?: string;
  onEdit?: () => void;
}

/** SpecChip з hover-кнопкою редагування (іконка repeat) у кольорах чіпа. */
export function EditableSpecChip({
  tokens,
  editLabel,
  onEdit,
  children,
  className,
  rounded = 'sm',
  ...rest
}: EditableSpecChipProps) {
  if (!onEdit || !editLabel) {
    return (
      <SpecChip tokens={tokens} rounded={rounded} className={className} {...rest}>
        {children}
      </SpecChip>
    );
  }

  const roundedAction = rounded === 'sm' ? 'rounded-r-sm' : 'rounded-r-full';

  return (
    <div className="group/chip relative inline-flex max-w-full">
      <SpecChip tokens={tokens} rounded={rounded} className={[className, 'pr-7'].filter(Boolean).join(' ')} {...rest}>
        {children}
      </SpecChip>
      <Tooltip content={editLabel} placement="top" size="sm">
        <button
          type="button"
          aria-label={editLabel}
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
          className={[
            'pointer-events-none absolute inset-y-[1px] right-[1px] z-10 flex w-9 items-center justify-end pr-1.5',
            roundedAction,
            specChipEditGradient(tokens.hue),
            'opacity-0 transition-opacity group-hover/chip:pointer-events-auto group-hover/chip:opacity-100',
          ].join(' ')}
        >
          <DynamicIcon name="repeat" size={12} strokeWidth={2.5} className={tokens.text} />
        </button>
      </Tooltip>
    </div>
  );
}