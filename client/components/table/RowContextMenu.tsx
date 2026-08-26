import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DynamicIcon } from 'lucide-react/dynamic';

export const ROW_CONTEXT_MENU_PANEL =
  'min-w-[200px] overflow-hidden rounded-lg border border-default-200 bg-content1 p-2 shadow-lg';

export interface RowContextMenuState {
  x: number;
  y: number;
  ids: string[];
}

interface RowContextMenuProps {
  state: RowContextMenuState | null;
  onClose: () => void;
  ariaLabel?: string;
  children: ReactNode;
}

export function RowContextMenu({ state, onClose, ariaLabel = 'Дії', children }: RowContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: state?.x ?? 0, y: state?.y ?? 0 });

  useLayoutEffect(() => {
    if (!state) return;
    setPos({ x: state.x, y: state.y });
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    setPos({
      x: Math.max(pad, Math.min(state.x, window.innerWidth - rect.width - pad)),
      y: Math.max(pad, Math.min(state.y, window.innerHeight - rect.height - pad)),
    });
  }, [state]);

  useEffect(() => {
    if (!state) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onScroll = () => onClose();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [state, onClose]);

  if (!state) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={ariaLabel}
      className={`fixed z-[100] ${ROW_CONTEXT_MENU_PANEL}`}
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {state.ids.length > 1 && (
        <div className="border-b border-default-100 px-3 py-1.5 text-xs text-default-500">
          Обрано: {state.ids.length}
        </div>
      )}
      {children}
    </div>,
    document.body,
  );
}

export function RowContextMenuItem({
  icon,
  label,
  danger,
  disabled,
  onSelect,
}: {
  icon: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={[
        'flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors',
        disabled
          ? 'cursor-not-allowed text-default-300'
          : danger
            ? 'text-danger hover:bg-danger-50'
            : 'text-foreground hover:bg-default-100',
      ].join(' ')}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onSelect();
      }}
    >
      <DynamicIcon name={icon as never} size={14} className="shrink-0" />
      <span>{label}</span>
    </button>
  );
}
