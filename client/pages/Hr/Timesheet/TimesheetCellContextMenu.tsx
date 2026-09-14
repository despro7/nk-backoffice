import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HrAuditLogDto } from '@shared/types/hr';
import { HrAuditLogList } from '../components/HrAuditLogEntry';
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
  employmentId: number;
  date: string;
}

interface TimesheetCellContextMenuProps {
  state: TimesheetCellContextMenuState | null;
  hueFor: (code: HrTimesheetKindCode) => string;
  canViewAudit?: boolean;
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
  canViewAudit = false,
  onClose,
  onClear,
  onEditHours,
  onSelectKind,
}: TimesheetCellContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: state?.x ?? 0, y: state?.y ?? 0 });
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<HrAuditLogDto[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

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
    if (!state) {
      setLogsOpen(false);
      setLogs([]);
      return;
    }
    if (!canViewAudit) return;

    let cancelled = false;
    setLogs([]);
    setLogsLoading(true);

    const load = async () => {
      try {
        const qs = new URLSearchParams({
          entityType: 'timesheet_entry',
          employmentId: String(state.employmentId),
          date: state.date,
          limit: '20',
        });
        const response = await fetch(`/api/hr/audit?${qs}`, { credentials: 'include' });
        const json = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) {
          setLogs(Array.isArray(json.data) ? json.data : []);
        }
      } finally {
        if (!cancelled) setLogsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [state, canViewAudit]);

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
      {canViewAudit ? (
        <>
          <button
            type="button"
            role="menuitem"
            className={`${TIMESHEET_CONTEXT_MENU_ITEM} text-foreground hover:bg-default-100`}
            onClick={() => setLogsOpen((v) => !v)}
          >
            <DynamicIcon name="history" size={14} className="shrink-0 text-default-500" />
            <span>
              Логи змін{' '}
              <span className="text-default-500 text-xs">
                ({logsLoading ? '…' : logs.length})
              </span>
            </span>
            <DynamicIcon name="chevron-right" size={14} className={`ml-auto shrink-0 text-default-500 transition-transform duration-200 ${logsOpen ? 'rotate-90' : ''}`} />
          </button>
          {logsOpen ? (
            <div className="max-h-48 overflow-y-auto rounded-md inset-shadow-sm bg-default-50 px-2 py-2 mt-1 mb-2 text-xs divide-y divide-secondary/15">
              {logsLoading ? (
                <div className="py-2 text-default-500">Завантаження...</div>
              ) : logs.length === 0 ? (
                <div className="py-2 text-default-500">Немає записів</div>
              ) : (
                <HrAuditLogList logs={logs} variant="timesheet" />
              )}
            </div>
          ) : null}
        </>
      ) : null}
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
