import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DynamicIcon } from 'lucide-react/dynamic';

export interface TimesheetDayHeaderContextMenuState {
  date: string;
  x: number;
  y: number;
}

interface TimesheetDayHeaderContextMenuProps {
  state: TimesheetDayHeaderContextMenuState | null;
  onClose: () => void;
  onFillWeekend: () => void;
  onClearWeekend: () => void;
}

const MENU_PANEL =
  'min-w-[200px] overflow-hidden rounded-lg border border-default-200 bg-content1 p-2 shadow-lg';

const MENU_ITEM =
  'flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors hover:bg-default-100';

export function TimesheetDayHeaderContextMenu({
  state,
  onClose,
  onFillWeekend,
  onClearWeekend,
}: TimesheetDayHeaderContextMenuProps) {
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
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, state]);

  if (!state) return null;

  return createPortal(
    <div
      ref={menuRef}
      className={MENU_PANEL}
      style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 70 }}
      role="menu"
    >
      <button type="button" className={MENU_ITEM} onClick={() => { onFillWeekend(); onClose(); }}>
        <DynamicIcon name="calendar-plus" size={14} />
        Заповнити вихідні
      </button>
      <button type="button" className={MENU_ITEM} onClick={() => { onClearWeekend(); onClose(); }}>
        <DynamicIcon name="eraser" size={14} />
        Очистити вихідні
      </button>
    </div>,
    document.body,
  );
}
