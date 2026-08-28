import { useEffect, useId, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import { offsetStyle, useActionBubbleDock } from './ActionBubbleDock';
import {
  ACTION_BUBBLE_COLOR_PRESETS,
  DEFAULT_IGNORE_CLOSE_SELECTOR,
  DEFAULT_PANEL_WIDTH,
  DOCK_PLACEMENT_CLASS,
} from './presets';
import type { ActionBubbleProps } from './types';

function shouldIgnoreClose(target: HTMLElement, extraSelector?: string): boolean {
  if (target.closest(DEFAULT_IGNORE_CLOSE_SELECTOR)) return true;
  if (extraSelector && target.closest(extraSelector)) return true;
  return false;
}

function isInsideBubble(target: HTMLElement, id: string): boolean {
  const el = target.closest('[data-action-bubble-id]');
  return el?.getAttribute('data-action-bubble-id') === id;
}

export function ActionBubble({
  children,
  id: idProp,
  isOpen,
  onOpenChange,
  icon,
  openIcon = 'x',
  iconSize = 22,
  ariaLabel,
  title,
  header,
  hideHeader = false,
  colorPreset = 'sky',
  className,
  buttonClassName,
  panelClassName,
  panelBodyClassName,
  panelWidth = DEFAULT_PANEL_WIDTH,
  ignoreCloseSelector,
  badge = false,
  placement = 'bottom-end',
  offset,
}: ActionBubbleProps) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const dock = useActionBubbleDock();

  useEffect(() => {
    if (!dock) return;
    if (isOpen) {
      dock.setActiveId(id);
      return;
    }
    if (dock.activeId === id) {
      dock.setActiveId(null);
    }
  }, [dock, id, isOpen]);

  useEffect(() => {
    if (!dock) return;
    if (dock.activeId !== null && dock.activeId !== id && isOpen) {
      onOpenChange(false);
    }
  }, [dock, dock?.activeId, id, isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (isInsideBubble(target, id)) return;
      if (shouldIgnoreClose(target, ignoreCloseSelector)) return;
      onOpenChange(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [id, ignoreCloseSelector, isOpen, onOpenChange]);

  const panel = isOpen ? (
    <div
      data-action-bubble-id={id}
      className={cn(
        'overflow-hidden rounded-xl border border-default-200 bg-content1 shadow-xl',
        panelClassName
      )}
      style={{ width: panelWidth } as CSSProperties}
    >
      {!hideHeader && (header ?? (
        <div className="flex items-center gap-2 border-b border-default-200 px-3 py-2">
          <DynamicIcon name={icon} size={16} className="text-default-500" />
          {title ? <span className="text-sm font-semibold">{title}</span> : null}
        </div>
      ))}
      <div className={cn('max-h-[min(60dvh,32rem)] overflow-auto', panelBodyClassName)}>
        {children}
      </div>
    </div>
  ) : null;

  const button = (
    <span data-action-bubble-id={id} className={cn('relative inline-flex', dock ? className : undefined)}>
      <Button
        isIconOnly
        radius="full"
        aria-label={isOpen ? `Закрити: ${ariaLabel}` : ariaLabel}
        aria-expanded={isOpen}
        className={cn(
          'relative h-14 w-14 min-w-14',
          ACTION_BUBBLE_COLOR_PRESETS[colorPreset],
          badge && !isOpen
            ? '[mask-image:radial-gradient(circle_at_calc(100%-6px)_6px,transparent_8px,black_8.5px)] [-webkit-mask-image:radial-gradient(circle_at_calc(100%-6px)_6px,transparent_8px,black_8.5px)]'
            : '',
          buttonClassName
        )}
        onPress={() => onOpenChange(!isOpen)}
      >
        <DynamicIcon name={isOpen ? openIcon : icon} size={iconSize} />
      </Button>
      {badge && !isOpen ? (
        <span className="pointer-events-none absolute top-0.5 right-0.5 h-2.5 w-2.5 rounded-full bg-rose-600" />
      ) : null}
    </span>
  );

  if (dock) {
    if (!dock.panelEl || !dock.buttonsEl) return null;
    return (
      <>
        {createPortal(panel, dock.panelEl)}
        {createPortal(button, dock.buttonsEl)}
      </>
    );
  }

  return (
    <div
      data-action-bubble-id={id}
      className={cn(
        'fixed z-50 flex items-end gap-3',
        placement.startsWith('top') ? 'flex-col-reverse' : 'flex-col',
        DOCK_PLACEMENT_CLASS[placement],
        className
      )}
      style={offsetStyle(offset)}
    >
      {panel}
      {button}
    </div>
  );
}
