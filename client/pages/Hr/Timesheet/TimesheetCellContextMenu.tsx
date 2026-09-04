import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DynamicIcon } from 'lucide-react/dynamic';
import {
  HR_TIMESHEET_KIND_CODES,
  HR_TIMESHEET_KIND_LABELS,
  type HrTimesheetKindCode,
} from '@shared/types/hr';
import { specColorToClassNames } from '@shared/utils/specColorPalette';
import { hrKindTokens } from '../hrUi';

export interface TimesheetCellContextMenuState {
  row: number;
  col: number;
  x: number;
  y: number;
}

interface TimesheetCellContextMenuProps {
  state: TimesheetCellContextMenuState | null;
  hueFor: (code: HrTimesheetKindCode) => string;
  onClose: () => void;
  onClear: () => void;
  onEditHours: () => void;
  onSelectKind: (kind: HrTimesheetKindCode) => void;
}

const TIMESHEET_CONTEXT_MENU_PANEL =
  'min-w-[200px] overflow-hidden rounded-lg border border-default-200 bg-content1 p-2 shadow-lg';

const TIMESHEET_CONTEXT_MENU_ITEM =
  'flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors';

export function TimesheetCellContextMenu({
  state,
  hueFor,
  onClose,
  onClear,
  onEditHours,
  onSelectKind,
}: TimesheetCellContextMenuProps) {
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

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
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
      aria-label="Дії з коміркою табеля"
      className={`fixed z-[200] ${TIMESHEET_CONTEXT_MENU_PANEL}`}
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        className={`${TIMESHEET_CONTEXT_MENU_ITEM} text-foreground hover:bg-default-100`}
        onClick={() => {
          onEditHours();
          onClose();
        }}
      >
        <DynamicIcon name="pencil" size={14} className="shrink-0 text-default-500" />
        Редагувати години…
      </button>
      <button
        type="button"
        role="menuitem"
        className={`${TIMESHEET_CONTEXT_MENU_ITEM} text-danger hover:bg-danger-50`}
        onClick={() => {
          onClear();
          onClose();
        }}
      >
        <DynamicIcon name="eraser" size={14} className="shrink-0" />
        Очистити
      </button>
      <div className="my-1 border-t border-default-100" />
      {HR_TIMESHEET_KIND_CODES.map((code) => {
        const tokens = hrKindTokens(hueFor(code));
        return (
          <button
            key={code}
            type="button"
            role="menuitem"
            className={`${TIMESHEET_CONTEXT_MENU_ITEM} text-foreground hover:bg-default-100`}
            onClick={() => {
              onSelectKind(code);
              onClose();
            }}
          >
            <span
              className={`inline-flex min-w-[2rem] shrink-0 justify-center rounded px-1.5 py-0.5 text-xs font-semibold ${specColorToClassNames(tokens, { border: true })}`}
            >
              {code}
            </span>
            <span className="text-default-600">{HR_TIMESHEET_KIND_LABELS[code]}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
