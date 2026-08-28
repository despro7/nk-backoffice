import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { DynamicIcon } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import { offsetStyle, useActionBubbleDock } from './ActionBubbleDock';
import { ACTION_BUBBLE_COLOR_PRESETS, DOCK_PLACEMENT_CLASS } from './presets';
import type { ActionConfirmBubbleProps } from './types';

function isInsideBubble(target: HTMLElement, id: string): boolean {
  const el = target.closest('[data-action-bubble-id]');
  return el?.getAttribute('data-action-bubble-id') === id;
}

export function ActionConfirmBubble({
  id: idProp,
  isOpen,
  onOpenChange,
  onConfirm,
  confirmLabel,
  icon = 'plus',
  iconSize = 22,
  labelSize = 14,
  hideIconWhenOpen = false,
  ariaLabel,
  colorPreset = 'lime',
  className,
  buttonClassName,
  placement = 'bottom-end',
  offset,
}: ActionConfirmBubbleProps) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const dock = useActionBubbleDock();
  const hideIcon = hideIconWhenOpen && isOpen;

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
  }, [id, isOpen, onOpenChange]);

  const button = (
    <span
      data-action-bubble-id={id}
      className={cn('relative inline-flex justify-end', dock ? className : undefined)}
    >
      <button
        type="button"
        aria-label={isOpen ? confirmLabel : ariaLabel}
        aria-expanded={isOpen}
        className={cn(
          'inline-flex h-14 max-w-[min(20rem,calc(100vw-5.5rem))] items-center overflow-hidden rounded-full',
          ACTION_BUBBLE_COLOR_PRESETS[colorPreset],
          buttonClassName
        )}
        onClick={() => {
          if (!isOpen) {
            onOpenChange(true);
            return;
          }
          onConfirm?.();
        }}
      >
        <span
          className={cn(
            'grid h-14 shrink-0 transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
            hideIcon ? 'grid-cols-[0fr]' : 'grid-cols-[3.5rem]'
          )}
        >
          <span className="min-w-0 overflow-hidden">
            <span className="flex h-14 w-14 items-center justify-center">
              <DynamicIcon
                name={icon}
                size={iconSize}
                className={cn(
                  'transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  hideIcon ? 'opacity-0' : 'opacity-100'
                )}
              />
            </span>
          </span>
        </span>
        <span
          className={cn(
            'grid min-w-0 transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
            isOpen ? 'grid-cols-[1fr]' : 'grid-cols-[0fr]'
          )}
        >
          <span className={cn('min-w-0 overflow-hidden', !hideIcon ? '-ml-2' : '')}>
            <span
              className={cn(
                'block whitespace-nowrap font-semibold leading-none',
                'transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                isOpen ? 'opacity-100' : 'opacity-0',
                hideIcon ? 'px-4' : 'pr-5'
              )}
              style={{ fontSize: labelSize }}
            >
              {confirmLabel}
            </span>
          </span>
        </span>
      </button>
    </span>
  );

  if (dock) {
    if (!dock.buttonsEl) return null;
    return createPortal(button, dock.buttonsEl);
  }

  return (
    <div
      data-action-bubble-id={id}
      className={cn(
        'fixed z-50 flex items-end',
        DOCK_PLACEMENT_CLASS[placement],
        className
      )}
      style={offsetStyle(offset)}
    >
      {button}
    </div>
  );
}
