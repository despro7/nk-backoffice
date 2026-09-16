import { useRef, useState } from 'react';
import { ALargeSmall, AlignCenter, AlignLeft, AlignRight, Minus, Plus } from 'lucide-react';
import type { ProductLabelTitleAlign, ProductLabelTitleLayout } from '@shared/types/productLabel';
import {
  PORTION_TITLE_LINE1_MAX_PX,
  PORTION_TITLE_LINE2_MAX_PX,
  portionTitleFontSize,
} from '@shared/utils/productLabelPortionLayout';
import { LabelEditableZone } from './LabelEditableZone';

const MIN_FONT = 9;
const MAX_FONT = 18;

interface LabelTitleBlockProps {
  title: ProductLabelTitleLayout;
  onChange: (title: ProductLabelTitleLayout) => void;
  disabled?: boolean;
}

function alignClass(align: ProductLabelTitleAlign): string {
  if (align === 'left') return 'items-start text-left';
  if (align === 'right') return 'items-end text-right';
  return 'items-center text-center';
}

function ToolbarButton({
  active,
  ariaLabel,
  onClick,
  children,
  className = '',
}: {
  active?: boolean;
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={[
        'rounded-[3px] px-[3px] py-[2px] text-white/90 transition-colors',
        active ? 'bg-neutral-700 shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]' : 'hover:bg-neutral-500/30',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export function LabelTitleBlock({ title, onChange, disabled }: LabelTitleBlockProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [activeLine, setActiveLine] = useState<1 | 2>(1);

  const line1Size = portionTitleFontSize(title.line1FontSize, PORTION_TITLE_LINE1_MAX_PX);
  const line2Size = portionTitleFontSize(title.line2FontSize, PORTION_TITLE_LINE2_MAX_PX);

  const patchTitle = (patch: Partial<ProductLabelTitleLayout>) => {
    onChange({ ...title, ...patch });
  };

  const adjustFont = (delta: number) => {
    if (activeLine === 1) {
      patchTitle({
        line1FontSize: Math.min(MAX_FONT, Math.max(MIN_FONT, title.line1FontSize + delta)),
      });
      return;
    }
    patchTitle({
      line2FontSize: Math.min(MAX_FONT, Math.max(MIN_FONT, title.line2FontSize + delta)),
    });
  };

  const handleBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && rootRef.current?.contains(next)) return;
    setFocused(false);
  };

  return (
    <div
      ref={rootRef}
      className={`relative flex w-[181px] shrink-0 flex-col pr-[3px] ${alignClass(title.align)}`}
      onBlur={handleBlur}
    >
      {focused && !disabled ? (
        <div
          className="absolute bottom-full left-1/2 z-30 mb-[3px] flex -translate-x-1/2 items-center gap-[7px] rounded-[4px] bg-neutral-600 p-[3px]"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-[6px]">
            <ToolbarButton
              ariaLabel="Вирівняти ліворуч"
              active={title.align === 'left'}
              onClick={() => patchTitle({ align: 'left' })}
            >
              <AlignLeft className="h-[9px] w-[9px]" strokeWidth={2.25} />
            </ToolbarButton>
            <ToolbarButton
              ariaLabel="Вирівняти по центру"
              active={title.align === 'center'}
              onClick={() => patchTitle({ align: 'center' })}
            >
              <AlignCenter className="h-[9px] w-[9px]" strokeWidth={2.25} />
            </ToolbarButton>
            <ToolbarButton
              ariaLabel="Вирівняти праворуч"
              active={title.align === 'right'}
              onClick={() => patchTitle({ align: 'right' })}
            >
              <AlignRight className="h-[9px] w-[9px]" strokeWidth={2.25} />
            </ToolbarButton>
          </div>

          <span className="h-[14px] w-px bg-neutral-400/50" />

          <div className="flex items-center gap-[3px]">
            <ToolbarButton
              ariaLabel="Зменшити шрифт"
              onClick={() => adjustFont(-1)}
              className="bg-neutral-500/40"
            >
              <Minus className="h-[9px] w-[9px]" strokeWidth={2.25} />
            </ToolbarButton>
            <ALargeSmall className="h-[11px] w-[11px] text-white/90" strokeWidth={2} />
            <ToolbarButton
              ariaLabel="Збільшити шрифт"
              onClick={() => adjustFont(1)}
              className="bg-neutral-500/80"
            >
              <Plus className="h-[9px] w-[9px]" strokeWidth={2.25} />
            </ToolbarButton>
          </div>
        </div>
      ) : null}

      {title.line1 ? (
        <LabelEditableZone
          ariaLabel="Назва, рядок 1"
          value={title.line1}
          disabled={disabled}
          onFocus={() => {
            setFocused(true);
            setActiveLine(1);
          }}
          onBlur={handleBlur}
          onChange={(line1) => patchTitle({ line1 })}
          className="font-['Days_One',sans-serif] font-normal leading-[1.02] whitespace-nowrap"
          style={{ fontSize: line1Size, maxWidth: '100%' }}
        />
      ) : null}
      {title.line2 ? (
        <LabelEditableZone
          ariaLabel="Назва, рядок 2"
          value={title.line2}
          disabled={disabled}
          onFocus={() => {
            setFocused(true);
            setActiveLine(2);
          }}
          onBlur={handleBlur}
          onChange={(line2) => patchTitle({ line2 })}
          className="font-['Days_One',sans-serif] font-normal leading-[1.02] whitespace-nowrap"
          style={{ fontSize: line2Size, marginTop: 1, maxWidth: '100%' }}
        />
      ) : null}
    </div>
  );
}
