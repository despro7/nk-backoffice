import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';
import {
  HR_PAY_GROUP_LABELS,
  HR_PAY_GROUPS,
  HR_TIMESHEET_KIND_CODES,
  HR_TIMESHEET_KIND_LABELS,
  type HrPayGroup,
  type HrTimesheetDayDto,
  type HrTimesheetKindCode,
  type HrTimesheetRowDto,
  type HrTimesheetWeekDto,
} from '@shared/types/hr';
import { hrPayGroupTokens, kindHueOrDefault, timesheetKindCellClass } from '../hrUi';
import {
  applyTimesheetKey,
  cellsEqual,
  codeCell,
  emptyCell,
  formatTimesheetHours,
  parseTimesheetHours,
  workCell,
  type HrTimesheetCellValue,
} from '@shared/utils/hrTimesheetCell';
import { TimesheetCell } from './TimesheetCell';
import {
  TimesheetCellContextMenu,
  type TimesheetCellContextMenuState,
} from './TimesheetCellContextMenu';

const NAME_W = 220;
const DAY_W = 36;
const TOTAL_W = 42;
const LETTER_DEBOUNCE_MS = 400;
const TOTAL_CODES = HR_TIMESHEET_KIND_CODES;
const TOTALS_SIDEBAR_STORAGE_KEY = 'hr.timesheet.totalsSidebarExpanded';

const tableClass = 'w-full border-separate border-spacing-0 text-xs table-fixed';

function readTotalsSidebarExpanded(): boolean {
  try {
    return localStorage.getItem(TOTALS_SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function totalsSidebarWidth(expanded: boolean): number {
  return TOTAL_W + (expanded ? TOTAL_CODES.length * TOTAL_W : 0);
}

function TotalsSidebarToggle({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex w-full items-center justify-center gap-1 rounded-sm px-1 py-0.5 text-[10px] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      aria-expanded={expanded}
      aria-label={expanded ? 'Згорнути підсумки кодів' : 'Розгорнути підсумки кодів'}
      onClick={onToggle}
    >
      <DynamicIcon name={expanded ? 'chevrons-right' : 'chevrons-left'} size={12} />
      {expanded ? <span>Згорнути</span> : null}
    </button>
  );
}

function stickyTotalStyle(right: number, width = TOTAL_W) {
  return {
    right,
    width,
    minWidth: width,
    maxWidth: width,
  };
}

function kindColStyle(right: number, expanded: boolean) {
  const width = expanded ? TOTAL_W : 0;
  return {
    ...stickyTotalStyle(right, width),
    opacity: expanded ? 1 : 0,
    paddingLeft: expanded ? undefined : 0,
    paddingRight: expanded ? undefined : 0,
    overflow: 'hidden' as const,
    transition: 'width 300ms ease-in-out, min-width 300ms ease-in-out, opacity 250ms ease-in-out',
  };
}

function NameColumnScrollShadow({ visible, offset }: { visible: boolean; offset: number }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none col-start-1 row-start-1 z-[2] w-5 self-stretch justify-self-start sticky transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        left: offset,
        marginLeft: offset,
        background:
          'linear-gradient(to right, rgba(15, 23, 42, 0.16), rgba(15, 23, 42, 0.07) 32%, rgba(15, 23, 42, 0.02) 62%, transparent)',
      }}
    />
  );
}

function cellKey(employmentId: number, date: string): string {
  return `${employmentId}:${date}`;
}

function appendHoursText(current: string, key: string): string | null {
  if (key === 'Backspace') return current.slice(0, -1);
  if (key === 'Delete') return '';
  if (/^[0-9]$/.test(key)) {
    const next = current + key;
    return /^\d{1,2}(,\d?)?$/.test(next) ? next : null;
  }
  if (key === ',' || key === '.') {
    if (current.includes(',')) return null;
    return current ? `${current},` : '0,';
  }
  return null;
}

function summarize(values: HrTimesheetCellValue[]): { hours: number; counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  for (const code of TOTAL_CODES) counts[code] = 0;
  let hours = 0;
  for (const value of values) {
    if (value.kind === 'work' && value.hours) {
      hours += Number(String(value.hours).replace(',', '.')) || 0;
    } else if (value.kind && value.kind !== 'work') {
      counts[value.kind] = (counts[value.kind] ?? 0) + 1;
    }
  }
  return { hours, counts };
}

export type TimesheetFocus = { row: number; col: number };

interface TimesheetGridProps {
  days: HrTimesheetDayDto[];
  weeks: HrTimesheetWeekDto[];
  rows: HrTimesheetRowDto[];
  draft: Record<string, HrTimesheetCellValue>;
  original: Record<string, HrTimesheetCellValue>;
  readOnly: boolean;
  canEdit: boolean;
  onChangeCell: (employmentId: number, date: string, value: HrTimesheetCellValue) => void;
  liveMessage: string;
  onLiveMessage: (message: string) => void;
  kindHues: Partial<Record<HrTimesheetKindCode, string>>;
}

function ariaCellLabel(name: string, day: HrTimesheetDayDto, value: HrTimesheetCellValue): string {
  const shown =
    value.kind === 'work'
      ? `${formatTimesheetHours(value.hours) || '0'} годин`
      : value.kind
        ? `${value.kind}, ${HR_TIMESHEET_KIND_LABELS[value.kind]}`
        : day.isWeekend
          ? 'вихідний, не заповнено'
          : 'порожньо';
  return `${name}, ${day.day} ${day.weekdayLabel}, ${shown}`;
}

export function TimesheetGrid({
  days,
  weeks,
  rows,
  draft,
  original,
  readOnly,
  canEdit,
  onChangeCell,
  liveMessage,
  onLiveMessage,
  kindHues,
}: TimesheetGridProps) {
  const [focus, setFocus] = useState<TimesheetFocus>({ row: 0, col: 0 });
  const [hoursEdit, setHoursEdit] = useState<{ row: number; col: number; text: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<TimesheetCellContextMenuState | null>(null);
  const [totalsSidebarExpanded, setTotalsSidebarExpanded] = useState(readTotalsSidebarExpanded);
  const [scrolled, setScrolled] = useState(false);
  const [isStuck, setIsStuck] = useState(false);
  const bufferRef = useRef('');
  const bufferTimer = useRef<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);

  const grouped = useMemo(() => {
    const byGroup = new Map<HrPayGroup, HrTimesheetRowDto[]>();
    for (const group of HR_PAY_GROUPS) byGroup.set(group, []);
    for (const row of rows) {
      const list = byGroup.get(row.payGroup) ?? [];
      list.push(row);
      byGroup.set(row.payGroup, list);
    }
    return HR_PAY_GROUPS.map((group) => ({ group, rows: byGroup.get(group) ?? [] })).filter(
      (item) => item.rows.length > 0,
    );
  }, [rows]);

  const flatRows = useMemo(() => grouped.flatMap((item) => item.rows), [grouped]);

  const sidebarWidth = totalsSidebarWidth(totalsSidebarExpanded);
  const kindColsWidth = totalsSidebarExpanded ? TOTAL_CODES.length * TOTAL_W : 0;
  const hoursStickyRight = kindColsWidth;
  const totalsRight = useCallback(
    (index: number) => (totalsSidebarExpanded ? (TOTAL_CODES.length - index) * TOTAL_W : 0),
    [totalsSidebarExpanded],
  );
  const tableMinWidth = NAME_W + days.length * DAY_W + TOTAL_W + kindColsWidth;

  const getValue = useCallback(
    (employmentId: number, date: string): HrTimesheetCellValue => {
      return draft[cellKey(employmentId, date)] ?? emptyCell();
    },
    [draft],
  );

  const isDirtyCell = useCallback(
    (employmentId: number, date: string) => {
      const key = cellKey(employmentId, date);
      const current = draft[key] ?? emptyCell();
      const base = original[key] ?? emptyCell();
      return !cellsEqual(current, base);
    },
    [draft, original],
  );

  const syncHorizontalScroll = useCallback((source: 'header' | 'body') => {
    const header = headerScrollRef.current;
    const body = bodyScrollRef.current;
    if (!header || !body || syncingScroll.current) return;
    syncingScroll.current = true;
    if (source === 'header') {
      body.scrollLeft = header.scrollLeft;
      setScrolled(header.scrollLeft > 0);
    } else {
      header.scrollLeft = body.scrollLeft;
      setScrolled(body.scrollLeft > 0);
    }
    syncingScroll.current = false;
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      setIsStuck(!entry.isIntersecting);
    }, { threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [rows.length]);

  useEffect(() => {
    const header = headerScrollRef.current;
    const body = bodyScrollRef.current;
    if (!header || !body) return;
    const alignGutter = () => {
      const gutter = body.offsetWidth - body.clientWidth;
      header.style.paddingRight = gutter > 0 ? `${gutter}px` : '';
    };
    alignGutter();
    window.addEventListener('resize', alignGutter);
    return () => window.removeEventListener('resize', alignGutter);
  }, [rows.length, days.length, tableMinWidth, totalsSidebarExpanded]);

  const toggleTotalsSidebar = () => {
    setTotalsSidebarExpanded((current) => {
      const next = !current;
      try {
        localStorage.setItem(TOTALS_SIDEBAR_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const commitHours = useCallback(
    (rowIndex: number, colIndex: number, text: string) => {
      const row = flatRows[rowIndex];
      const day = days[colIndex];
      if (!row || !day || !canEdit) return;
      const parsed = parseTimesheetHours(text);
      if (!parsed) {
        onChangeCell(row.employmentId, day.date, emptyCell());
      } else {
        onChangeCell(row.employmentId, day.date, workCell(parsed));
      }
      setHoursEdit(null);
    },
    [canEdit, days, flatRows, onChangeCell],
  );

  const changeCellAt = useCallback(
    (rowIndex: number, colIndex: number, value: HrTimesheetCellValue) => {
      const row = flatRows[rowIndex];
      const day = days[colIndex];
      if (!row || !day || !canEdit) return;
      onChangeCell(row.employmentId, day.date, value);
    },
    [canEdit, days, flatRows, onChangeCell],
  );

  const moveFocus = useCallback(
    (rowDelta: number, colDelta: number) => {
      setFocus((current) => {
        const row = Math.max(0, Math.min(flatRows.length - 1, current.row + rowDelta));
        const col = Math.max(0, Math.min(days.length - 1, current.col + colDelta));
        return { row, col };
      });
    },
    [days.length, flatRows.length],
  );

  const announce = useCallback(
    (rowIndex: number, colIndex: number) => {
      const row = flatRows[rowIndex];
      const day = days[colIndex];
      if (!row || !day) return;
      onLiveMessage(ariaCellLabel(row.displayName, day, getValue(row.employmentId, day.date)));
    },
    [days, flatRows, getValue, onLiveMessage],
  );

  useEffect(() => {
    announce(focus.row, focus.col);
  }, [announce, focus.col, focus.row]);

  useEffect(() => {
    if (hoursEdit) {
      requestAnimationFrame(() => gridRef.current?.focus());
    }
  }, [hoursEdit]);

  const clearBuffer = () => {
    bufferRef.current = '';
    if (bufferTimer.current) {
      window.clearTimeout(bufferTimer.current);
      bufferTimer.current = null;
    }
  };

  const applyAtFocus = (value: HrTimesheetCellValue) => {
    changeCellAt(focus.row, focus.col, value);
  };

  const startHours = (rowIndex: number, colIndex: number, seed: string) => {
    if (!canEdit) return;
    setFocus({ row: rowIndex, col: colIndex });
    setHoursEdit({ row: rowIndex, col: colIndex, text: seed });
    setContextMenu(null);
  };

  const openContextMenu = (event: MouseEvent, rowIndex: number, colIndex: number) => {
    if (!canEdit || readOnly) return;
    event.preventDefault();
    if (hoursEdit) commitHours(hoursEdit.row, hoursEdit.col, hoursEdit.text);
    setFocus({ row: rowIndex, col: colIndex });
    setContextMenu({ row: rowIndex, col: colIndex, x: event.clientX, y: event.clientY });
  };

  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const { key } = event;

    if (key === 'Escape') {
      event.preventDefault();
      setHoursEdit(null);
      setContextMenu(null);
      clearBuffer();
      return;
    }

    if (key === 'F2') {
      event.preventDefault();
      const row = flatRows[focus.row];
      const day = days[focus.col];
      if (row && day && canEdit) {
        const value = getValue(row.employmentId, day.date);
        startHours(focus.row, focus.col, value.kind === 'work' ? formatTimesheetHours(value.hours) : '');
      }
      return;
    }

    if (
      key === 'ArrowLeft' ||
      key === 'ArrowRight' ||
      key === 'ArrowUp' ||
      key === 'ArrowDown' ||
      key === 'Enter' ||
      key === 'Tab'
    ) {
      if (hoursEdit) {
        commitHours(hoursEdit.row, hoursEdit.col, hoursEdit.text);
      }
      event.preventDefault();
      if (key === 'ArrowLeft' || (key === 'Tab' && event.shiftKey)) moveFocus(0, -1);
      else if (key === 'ArrowRight' || key === 'Tab') moveFocus(0, 1);
      else if (key === 'ArrowUp') moveFocus(-1, 0);
      else if (key === 'ArrowDown' || key === 'Enter') moveFocus(1, 0);
      clearBuffer();
      return;
    }

    if (hoursEdit) {
      const nextText = appendHoursText(hoursEdit.text, key);
      if (nextText !== null) {
        event.preventDefault();
        setHoursEdit((current) => (current ? { ...current, text: nextText } : current));
        return;
      }
    }

    if (!canEdit || readOnly) return;

    const result = applyTimesheetKey(key, bufferRef.current);
    if (result.type === 'ignore') return;
    event.preventDefault();

    if (hoursEdit) {
      commitHours(hoursEdit.row, hoursEdit.col, hoursEdit.text);
    }

    if (result.type === 'clear') {
      applyAtFocus(emptyCell());
      clearBuffer();
      return;
    }
    if (result.type === 'hours') {
      clearBuffer();
      startHours(focus.row, focus.col, result.hours);
      return;
    }
    if (result.type === 'kind') {
      applyAtFocus(codeCell(result.kind));
      clearBuffer();
      return;
    }
    if (result.type === 'buffer') {
      bufferRef.current = result.buffer;
      if (bufferTimer.current) window.clearTimeout(bufferTimer.current);
      bufferTimer.current = window.setTimeout(() => {
        bufferRef.current = '';
        bufferTimer.current = null;
      }, LETTER_DEBOUNCE_MS);
    }
  };

  const renderColGroup = () => (
    <colgroup>
      <col style={{ width: NAME_W }} />
      {days.map((day) => (
        <col key={day.date} style={{ width: DAY_W }} />
      ))}
      <col style={{ width: TOTAL_W }} />
      {TOTAL_CODES.map((code) => (
        <col
          key={code}
          style={{
            width: totalsSidebarExpanded ? TOTAL_W : 0,
            minWidth: totalsSidebarExpanded ? TOTAL_W : 0,
          }}
        />
      ))}
    </colgroup>
  );

  const renderHeader = () => (
    <thead className="bg-neutral-800">
      <tr>
        <th
          rowSpan={2}
          className="sticky left-0 z-40 bg-neutral-800 px-3 py-2 text-left font-semibold text-white border-b border-r-2 border-white/20"
        >
          ПІБ
        </th>
        {weeks.map((week) => (
          <th
            key={week.id}
            colSpan={week.colSpan}
            className="bg-neutral-800 px-1 py-1 text-center text-[11px] font-medium text-white/80 border-b border-r border-white/15"
          >
            {week.label}
          </th>
        ))}
        <th
          className="sticky z-40 bg-neutral-800 px-1 py-1 text-center font-semibold text-white border-b border-l-2 border-white/20 transition-[right] duration-300 ease-in-out"
          style={stickyTotalStyle(hoursStickyRight)}
        >
          год
        </th>
        {TOTAL_CODES.map((code, index) => (
          <th
            key={code}
            className="sticky z-40 bg-neutral-800 px-1 py-1 text-center font-semibold text-white border-b border-white/15 whitespace-nowrap"
            style={kindColStyle(totalsRight(index + 1), totalsSidebarExpanded)}
          >
            {code}
          </th>
        ))}
      </tr>
      <tr>
        {days.map((day) => (
          <th
            key={day.date}
            className={`bg-neutral-800 px-0 py-1 text-center font-medium border-b border-r border-white/10 ${
              day.isWeekend ? 'text-white/45' : 'text-white'
            }`}
          >
            <div className="leading-none">{day.day}</div>
            <div className="text-[10px] font-normal uppercase opacity-70">{day.weekdayLabel}</div>
          </th>
        ))}
        <th
          colSpan={1 + TOTAL_CODES.length}
          className="sticky z-40 bg-neutral-800 border-b border-l-2 border-white/20 px-0.5 py-0.5 transition-[width,min-width] duration-300 ease-in-out"
          style={{
            right: 0,
            width: sidebarWidth,
            minWidth: sidebarWidth,
            maxWidth: sidebarWidth,
          }}
        >
          <TotalsSidebarToggle expanded={totalsSidebarExpanded} onToggle={toggleTotalsSidebar} />
        </th>
      </tr>
    </thead>
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-card p-8 text-center text-sm text-text-secondary">
        Немає зайнятостей у цьому місяці
      </div>
    );
  }

  return (
    <div className="relative min-w-0 w-full">
      <div className="sr-only" aria-live="polite">
        {liveMessage}
      </div>

      <div ref={sentinelRef} aria-hidden className="h-0" />

      <div
        ref={gridRef}
        role="grid"
        aria-label="Табель за місяць"
        aria-rowcount={flatRows.length + grouped.length + 2}
        tabIndex={0}
        onKeyDown={onGridKeyDown}
        className={`min-w-0 w-full max-w-full rounded-b-lg border-2 border-neutral-800 bg-surface-card outline-none ${isStuck ? 'rounded-tr-none' : 'rounded-tr-sm'}`}
      >
        <div
          className={`sticky top-0 z-20 overflow-hidden bg-neutral-800 transition-all duration-200 ${
            isStuck ? 'shadow-md' : ''
          }`}
        >
          <div
            ref={headerScrollRef}
            className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onScroll={() => syncHorizontalScroll('header')}
          >
            <div className="grid" style={{ minWidth: tableMinWidth }}>
              <table className={`${tableClass} col-start-1 row-start-1`} style={{ minWidth: tableMinWidth }}>
                {renderColGroup()}
                {renderHeader()}
              </table>
              <NameColumnScrollShadow visible={scrolled} offset={NAME_W} />
            </div>
          </div>
        </div>

        <div
          ref={bodyScrollRef}
          className="overflow-x-auto overscroll-x-contain overflow-hidden rounded-b-lg"
          onScroll={() => syncHorizontalScroll('body')}
        >
          <div className="grid" style={{ minWidth: tableMinWidth }}>
            <table className={`${tableClass} col-start-1 row-start-1`} style={{ minWidth: tableMinWidth }}>
              {renderColGroup()}
              <tbody>
                {grouped.map((block) => (
                  <GroupBlock
                    key={block.group}
                    group={block.group}
                    rows={block.rows}
                    days={days}
                    flatRows={flatRows}
                    focus={focus}
                    hoursEdit={hoursEdit}
                    getValue={getValue}
                    isDirtyCell={isDirtyCell}
                    readOnly={readOnly}
                    canEdit={canEdit}
                    hoursStickyRight={hoursStickyRight}
                    totalsRight={totalsRight}
                    totalsSidebarExpanded={totalsSidebarExpanded}
                    onFocusCell={(row, col) => {
                      if (hoursEdit) commitHours(hoursEdit.row, hoursEdit.col, hoursEdit.text);
                      setFocus({ row, col });
                      setContextMenu(null);
                      requestAnimationFrame(() => gridRef.current?.focus());
                    }}
                    onStartHours={(row, col) => {
                      const current = flatRows[row];
                      const day = days[col];
                      if (!canEdit || !current || !day) return;
                      const value = getValue(current.employmentId, day.date);
                      startHours(row, col, value.kind === 'work' ? formatTimesheetHours(value.hours) : '');
                    }}
                    onContextMenu={openContextMenu}
                    kindHues={kindHues}
                  />
                ))}
              </tbody>
            </table>
            <NameColumnScrollShadow visible={scrolled} offset={NAME_W} />
          </div>
        </div>
      </div>

      <TimesheetCellContextMenu
        state={contextMenu}
        hueFor={(code) => kindHueOrDefault(code, kindHues)}
        onClose={() => setContextMenu(null)}
        onClear={() => {
          if (!contextMenu) return;
          changeCellAt(contextMenu.row, contextMenu.col, emptyCell());
        }}
        onEditHours={() => {
          if (!contextMenu) return;
          const row = flatRows[contextMenu.row];
          const day = days[contextMenu.col];
          if (!row || !day) return;
          const value = getValue(row.employmentId, day.date);
          startHours(
            contextMenu.row,
            contextMenu.col,
            value.kind === 'work' ? formatTimesheetHours(value.hours) : '',
          );
        }}
        onSelectKind={(kind) => {
          if (!contextMenu) return;
          changeCellAt(contextMenu.row, contextMenu.col, codeCell(kind));
        }}
      />
    </div>
  );
}

function GroupBlock({
  group,
  rows,
  days,
  flatRows,
  focus,
  hoursEdit,
  getValue,
  isDirtyCell,
  readOnly,
  canEdit,
  hoursStickyRight,
  totalsRight,
  totalsSidebarExpanded,
  onFocusCell,
  onStartHours,
  onContextMenu,
  kindHues,
}: {
  group: HrPayGroup;
  rows: HrTimesheetRowDto[];
  days: HrTimesheetDayDto[];
  flatRows: HrTimesheetRowDto[];
  focus: TimesheetFocus;
  hoursEdit: { row: number; col: number; text: string } | null;
  getValue: (employmentId: number, date: string) => HrTimesheetCellValue;
  isDirtyCell: (employmentId: number, date: string) => boolean;
  readOnly: boolean;
  canEdit: boolean;
  hoursStickyRight: number;
  totalsRight: (index: number) => number;
  totalsSidebarExpanded: boolean;
  onFocusCell: (row: number, col: number) => void;
  onStartHours: (row: number, col: number) => void;
  onContextMenu: (event: MouseEvent, row: number, col: number) => void;
  kindHues: Partial<Record<HrTimesheetKindCode, string>>;
}) {
  const tokens = hrPayGroupTokens(group);
  const groupRowBg = tokens.bg;

  return (
    <>
      <tr className={`border-b ${tokens.border}`}>
        <td className={`sticky left-0 z-10 ${groupRowBg} px-3 py-1.5 border-r border-slate-200/70`}>
          <span className={`text-[11px] font-semibold uppercase tracking-wide ${tokens.text}`}>
            {HR_PAY_GROUP_LABELS[group]}
          </span>
        </td>
        <td colSpan={days.length} className={`${groupRowBg} border-r border-slate-200/70`} />
        <td
          className={`sticky z-10 ${groupRowBg} border-l-2 border-slate-200/70 transition-[right] duration-300 ease-in-out`}
          style={stickyTotalStyle(hoursStickyRight)}
        />
        {TOTAL_CODES.map((code, index) => (
          <td
            key={code}
            className={`sticky z-10 ${groupRowBg}`}
            style={kindColStyle(totalsRight(index + 1), totalsSidebarExpanded)}
          />
        ))}
      </tr>
      {rows.map((row) => {
        const values = days.map((day) => getValue(row.employmentId, day.date));
        const totals = summarize(values);
        const rowIndex = flatRows.findIndex((item) => item.employmentId === row.employmentId);
        return (
          <tr key={row.employmentId} className="group hover:bg-white">
            <td className="sticky left-0 z-10 bg-slate-100 px-2 py-0 border-b border-r border-slate-200 group-hover:bg-slate-200/90">
              <span className="block truncate font-medium text-slate-800 capitalize" title={row.displayName}>
                {row.displayName}
              </span>
            </td>
            {days.map((day, col) => {
              const active = focus.row === rowIndex && focus.col === col;
              const editing = hoursEdit?.row === rowIndex && hoursEdit.col === col;
              const cellValue = getValue(row.employmentId, day.date);
              const kind = cellValue.kind ?? (day.isWeekend ? 'prefill' : null);
              return (
                <td
                  key={day.date}
                  className={`p-[1px] border-b border-r border-slate-200 ${day.isWeekend ? 'bg-slate-100/80 group-hover:bg-slate-200/80' : 'bg-white group-hover:bg-slate-100/50'}`}
                  onMouseDown={() => onFocusCell(rowIndex, col)}
                  onDoubleClick={() => onStartHours(rowIndex, col)}
                  onContextMenu={(event) => onContextMenu(event, rowIndex, col)}
                >
                  <TimesheetCell
                    value={cellValue}
                    isWeekend={day.isWeekend}
                    isDirty={isDirtyCell(row.employmentId, day.date)}
                    isActive={active}
                    isHoursEditing={Boolean(editing && canEdit)}
                    hoursDraft={editing ? hoursEdit.text : ''}
                    readOnly={readOnly || !canEdit}
                    ariaLabel={ariaCellLabel(row.displayName, day, cellValue)}
                    colorClass={timesheetKindCellClass(kind, kindHues)}
                  />
                </td>
              );
            })}
            <td
              className="sticky z-10 bg-white px-1 text-center font-semibold border-b border-l-2 border-slate-200 group-hover:bg-slate-100 transition-[right] duration-300 ease-in-out"
              style={stickyTotalStyle(hoursStickyRight)}
            >
              {totals.hours ? formatTimesheetHours(String(totals.hours)) : <span className="text-slate-300">—</span>}
            </td>
            {TOTAL_CODES.map((code, index) => (
              <td
                key={code}
                className="sticky z-10 bg-white px-1 text-center text-slate-600 border-b border-slate-200 group-hover:bg-slate-100 whitespace-nowrap"
                style={kindColStyle(totalsRight(index + 1), totalsSidebarExpanded)}
              >
                {totalsSidebarExpanded ? totals.counts[code] || <span className="text-slate-300">—</span> : null}
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}
