import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ReportTableEmptyState } from '../ReportTableEmptyState';
import { ReportLoadingOverlay } from '../ReportLoadingOverlay';
import { formatConstructorNumber } from './formatConstructorNumber';
import type { HierarchicalTableColumn, HierarchicalTableRowView } from './constructorTypes';

const NAME_COL_MIN = 160;
const NAME_COL_MAX = 720;
const NAME_COL_DEFAULT = 320;
const NAME_COL_STORAGE_KEY = 'reports.constructor.nameColumnWidth';

interface HierarchicalReportTableProps {
  columns: HierarchicalTableColumn[];
  rows: HierarchicalTableRowView[];
  loading?: boolean;
  emptyMessage?: string;
  loadingMessage?: string;
  pinTotals?: boolean;
  onPinTotalsChange?: (value: boolean) => void;
  alwaysShowExclude?: boolean;
  onExclude?: (row: HierarchicalTableRowView) => void;
  /** Сортування рядків (у межах кожного рівня) кліком по заголовку колонки. */
  sortable?: boolean;
  /** Кнопка «Історія» біля назви рядка (якщо `canShowHistory` дозволяє). */
  onShowHistory?: (row: HierarchicalTableRowView) => void;
  canShowHistory?: (row: HierarchicalTableRowView) => boolean;
}

type SortDirection = 'desc' | 'asc';

interface SortState {
  columnId: string;
  direction: SortDirection;
}

/** Цикл кліку: немає → за спаданням → за зростанням → немає. */
function nextSortState(current: SortState | null, columnId: string): SortState | null {
  if (!current || current.columnId !== columnId) {
    return { columnId, direction: 'desc' };
  }
  if (current.direction === 'desc') {
    return { columnId, direction: 'asc' };
  }
  return null;
}

/**
 * Сортує сусідні рядки на кожному рівні дерева. Рядки «Разом» лишаються першими,
 * порожні значення завжди в кінці. Порядок рівних значень зберігається.
 */
function sortTreeRows(rows: HierarchicalTableRowView[], sort: SortState): HierarchicalTableRowView[] {
  const factor = sort.direction === 'desc' ? -1 : 1;
  const valueOf = (row: HierarchicalTableRowView) => {
    const raw = row.values[sort.columnId];
    return raw == null || !Number.isFinite(raw) ? null : raw;
  };
  const withChildren = rows.map((row) =>
    row.children && row.children.length > 0 ? { ...row, children: sortTreeRows(row.children, sort) } : row,
  );
  const totals = withChildren.filter((row) => row.kind === 'total');
  const rest = withChildren
    .filter((row) => row.kind !== 'total')
    .map((row, index) => ({ row, index, value: valueOf(row) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      if (a.value === b.value) return a.index - b.index;
      return (a.value - b.value) * factor;
    })
    .map((item) => item.row);
  return [...totals, ...rest];
}

interface FlatRow {
  row: HierarchicalTableRowView;
  hasChildren: boolean;
}

function flattenRows(
  rows: HierarchicalTableRowView[],
  expanded: Set<string>,
): FlatRow[] {
  const result: FlatRow[] = [];

  const visit = (items: HierarchicalTableRowView[]) => {
    for (const row of items) {
      const children = row.children ?? [];
      const hasChildren = children.length > 0;
      result.push({ row, hasChildren });
      if (hasChildren && expanded.has(row.id)) {
        visit(children);
      }
    }
  };

  visit(rows);
  return result;
}

function collectExpandableIds(rows: HierarchicalTableRowView[]): string[] {
  const ids: string[] = [];
  const visit = (items: HierarchicalTableRowView[]) => {
    for (const row of items) {
      if (row.children && row.children.length > 0) {
        ids.push(row.id);
        visit(row.children);
      }
    }
  };
  visit(rows);
  return ids;
}

function readStoredNameWidth(): number {
  try {
    const raw = localStorage.getItem(NAME_COL_STORAGE_KEY);
    const parsed = raw ? Number(raw) : Number.NaN;
    if (Number.isFinite(parsed)) {
      return Math.min(NAME_COL_MAX, Math.max(NAME_COL_MIN, parsed));
    }
  } catch {
    /* ignore */
  }
  return NAME_COL_DEFAULT;
}

function isGroupEnd(columns: HierarchicalTableColumn[], index: number): boolean {
  const current = columns[index]?.groupLabel ?? '';
  const next = columns[index + 1]?.groupLabel;
  if (next === undefined) return false;
  return current !== next;
}

function headerBorderClass(groupEnd: boolean, last: boolean, dark = false): string {
  if (dark) {
    if (last) return '';
    if (groupEnd) return 'border-r-2 border-r-white/35';
    return 'border-r border-r-white/20';
  }
  if (last) return 'border-b border-default-200';
  if (groupEnd) return 'border-b border-r-2 border-r-default-300';
  return 'border-b border-r border-r-default-200';
}

/** Горизонтальні відступи комірки (`px-3`) + рамка + запас. */
const CELL_CHROME_PX = 30;
const PERCENT_COL_WIDTH = 72;

let measureContext: CanvasRenderingContext2D | null | undefined;

/** Ширина тексту в px (canvas); без canvas – оцінка по кількості символів. */
function measureTextWidth(text: string, font: string): number {
  if (measureContext === undefined) {
    measureContext = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  }
  if (!measureContext) {
    return text.length * 8.2;
  }
  measureContext.font = font;
  return measureContext.measureText(text).width;
}

/**
 * Ширина колонки за найдовшим значенням (усі рядки дерева, жирний шрифт «Разом»)
 * і заголовком. `table-fixed` роздає вільне місце пропорційно цим ширинам, тож
 * колонки з довшими числами отримують більше місця, а не навпаки.
 */
function computeColumnWidths(
  columns: HierarchicalTableColumn[],
  rows: HierarchicalTableRowView[],
): Map<string, number> {
  const family =
    typeof document !== 'undefined' ? getComputedStyle(document.body).fontFamily || 'sans-serif' : 'sans-serif';
  const valueFont = `600 14px ${family}`;
  const headerFont = `500 13px ${family}`;
  const longest = new Map<string, number>();

  const visit = (items: HierarchicalTableRowView[]) => {
    for (const row of items) {
      for (const column of columns) {
        if (column.format === 'percent' || column.format === 'text') continue;
        const text = formatConstructorNumber(row.values[column.id], column.format === 'money' ? 'money' : 'qty');
        const width = measureTextWidth(text, valueFont);
        if (width > (longest.get(column.id) ?? 0)) longest.set(column.id, width);
      }
      if (row.children?.length) visit(row.children);
    }
  };
  visit(rows);

  const widths = new Map<string, number>();
  for (const column of columns) {
    if (column.format === 'percent') {
      widths.set(column.id, PERCENT_COL_WIDTH);
      continue;
    }
    const header = Math.max(
      measureTextWidth(column.label ?? '', headerFont),
      column.badge ? measureTextWidth(column.badge, `500 10px ${family}`) + 12 : 0,
    ) + 16; // іконка сортування
    const content = Math.max(longest.get(column.id) ?? 0, measureTextWidth('0,00', valueFont));
    widths.set(column.id, Math.ceil(Math.max(header, content) + CELL_CHROME_PX));
  }
  return widths;
}

function NameColumnScrollShadow({
  visible,
  offset,
}: {
  visible: boolean;
  offset: number;
}) {
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

const PERCENT_TONE_CLASS = {
  good: 'bg-success/15 text-success',
  mid: 'bg-warning/20 text-warning',
  bad: 'bg-danger/15 text-danger',
} as const;

function percentTone(value: number): keyof typeof PERCENT_TONE_CLASS {
  if (value >= 0.6) return 'good';
  if (value >= 0.15) return 'mid';
  return 'bad';
}

function formatCell(column: HierarchicalTableColumn, raw: number | undefined) {
  if (column.format === 'text') {
    return raw == null ? '—' : String(raw);
  }
  if (column.format === 'percent') {
    if (raw == null || !Number.isFinite(raw)) {
      return '—';
    }
    const text = formatConstructorNumber(raw, 'percent');
    return (
      <span
        className={`inline-flex min-w-[3.25rem] justify-center rounded-md px-1 py-0.5 text-xs font-semibold tabular-nums ${PERCENT_TONE_CLASS[percentTone(raw)]}`}
      >
        {text}
      </span>
    );
  }
  const numberFormat = column.format === 'money' ? column.format : 'qty';
  const text = formatConstructorNumber(raw, numberFormat);
  const isNegative = raw != null && Number.isFinite(raw) && raw < 0;
  if (!isNegative) {
    return text;
  }
  return <span className="text-danger">{text}</span>;
}

function HeaderHint({ text }: { text: string }) {
  return (
    <Tooltip
      content={text}
      placement="top"
      color="secondary"
      delay={500}
      showArrow={true}
      classNames={{
        base: 'before:bg-gray-700 before:rounded-[2px]',
        content: 'bg-gray-700 border-0 text-white text-xs max-w-xs',
      }}
    >
      <span className="inline-flex shrink-0 text-white/60 hover:text-white cursor-help">
        <DynamicIcon name="circle-question-mark" size={14} />
      </span>
    </Tooltip>
  );
}

function NameColResizeHandle({
  active,
  onPointerDown,
  onHoverChange,
}: {
  active: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Змінити ширину колонки «Найменування»"
      className={`absolute right-0 top-0 bottom-0 z-20 w-1 cursor-col-resize transition-colors ${
        active ? 'bg-primary/25' : 'bg-transparent'
      }`}
      onPointerDown={onPointerDown}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
    />
  );
}

function NameCell({
  row,
  hasChildren,
  expanded,
  onToggle,
  onExclude,
  alwaysShowExclude,
  pinTotals,
  onPinTotalsChange,
  onShowHistory,
  canShowHistory,
}: {
  row: HierarchicalTableRowView;
  hasChildren: boolean;
  expanded: boolean;
  onToggle: (id: string) => void;
  onExclude?: (row: HierarchicalTableRowView) => void;
  alwaysShowExclude?: boolean;
  pinTotals?: boolean;
  onPinTotalsChange?: (value: boolean) => void;
  onShowHistory?: (row: HierarchicalTableRowView) => void;
  canShowHistory?: (row: HierarchicalTableRowView) => boolean;
}) {
  const isGroupLike = row.kind === 'group' || row.kind === 'total';
  const title = row.sku ? `${row.label} ・ ${row.sku}` : row.label;
  const canExclude = Boolean(onExclude && row.kind !== 'total' && row.dimensionId && row.valueId);
  const canPin = row.kind === 'total' && Boolean(onPinTotalsChange);
  const showHistory = Boolean(onShowHistory && row.kind !== 'total' && (canShowHistory?.(row) ?? true));

  const label = (
    <div
      className={`min-w-0 truncate ${isGroupLike ? 'font-semibold' : ''} ${
        row.inactive ? 'text-danger' : ''
      }`}
      title={title}
    >
      <span>{row.label}</span>
      {row.sku ? (
        <span className={`text-xs ${row.inactive ? 'text-danger' : 'text-default-400/75'}`}>・{row.sku}</span>
      ) : null}
    </div>
  );

  return (
    <div className="flex items-center gap-0.5 min-w-0 w-full pr-1" style={{ paddingLeft: `${row.depth * 16}px` }}>
      <div className="flex items-center gap-0.5 min-w-0 flex-1">
        {showHistory ? (
          // Клік по назві товару відкриває історію; шеврон (якщо є діти) згортає окремо.
          <>
            <button
              type="button"
              className="min-w-0 max-w-full text-left cursor-pointer rounded-sm decoration-dotted underline-offset-2 hover:underline hover:text-blue-600"
              aria-label={`Історія «${row.label}»`}
              onClick={(event) => {
                event.stopPropagation();
                onShowHistory?.(row);
              }}
            >
              {label}
            </button>
            {hasChildren ? (
              <button
                type="button"
                className="inline-flex shrink-0 text-default-500 rounded-sm hover:opacity-80"
                aria-expanded={expanded}
                aria-label={expanded ? `Згорнути «${row.label}»` : `Розгорнути «${row.label}»`}
                onClick={() => onToggle(row.id)}
              >
                <DynamicIcon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
              </button>
            ) : null}
          </>
        ) : hasChildren ? (
          <button
            type="button"
            className="flex items-center gap-0.5 min-w-0 max-w-full text-left cursor-pointer rounded-sm hover:opacity-80"
            aria-expanded={expanded}
            aria-label={expanded ? `Згорнути «${row.label}»` : `Розгорнути «${row.label}»`}
            onClick={() => onToggle(row.id)}
          >
            {label}
            <span className="inline-flex shrink-0 text-default-500" aria-hidden="true">
              <DynamicIcon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
            </span>
          </button>
        ) : (
          label
        )}
        {canExclude ? (
          <Tooltip
            content="Додати до списку виключення"
            placement="top"
            color="secondary"
            delay={300}
            showArrow={true}
            classNames={{
              base: 'before:bg-danger-500 before:rounded-[2px]',
              content: 'bg-danger-500 border-0 text-white text-xs max-w-xs',
            }}
          >
            <button
              type="button"
              className={`inline-flex shrink-0 items-center justify-center w-6 h-6 rounded-md text-default-400 hover:text-danger hover:bg-danger/10 ${
                alwaysShowExclude ? '' : 'opacity-0 group-hover/name:opacity-100 focus-visible:opacity-100'
              }`}
              aria-label={`Виключити «${row.label}»`}
              onClick={(event) => {
                event.stopPropagation();
                onExclude?.(row);
              }}
            >
              <DynamicIcon name="circle-minus" size={15} />
            </button>
          </Tooltip>
        ) : null}
      </div>
      {canPin ? (
        <Tooltip
          content={pinTotals ? 'Відкріпити рядок «Разом»' : 'Закріпити рядок «Разом»'}
          placement="top"
          delay={300}
          showArrow={true}
          classNames={{
            base: 'before:bg-primary before:rounded-[2px]',
            content: 'bg-primary border-0 text-white text-xs max-w-xs',
          }}
        >
          <button
            type="button"
            className={`inline-flex shrink-0 items-center justify-center w-6 h-6 rounded-md bg-transparent transition-colors duration-200 ${
              pinTotals
                ? 'text-default-500 hover:text-primary hover:bg-primary/10'
                : 'text-default-400 hover:text-primary hover:bg-primary/10'
            }`}
            aria-pressed={pinTotals}
            aria-label={pinTotals ? 'Відкріпити рядок «Разом»' : 'Закріпити рядок «Разом»'}
            onClick={(event) => {
              event.stopPropagation();
              onPinTotalsChange?.(!pinTotals);
            }}
          >
            <DynamicIcon name="pin" size={16} className={`${pinTotals ? 'rotate-0' : 'rotate-45'}`} />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}

export default function HierarchicalReportTable({
  columns,
  rows,
  loading = false,
  emptyMessage = 'Сформуйте звіт, щоб побачити дані',
  loadingMessage = 'Формування відомості...',
  pinTotals = true,
  onPinTotalsChange,
  alwaysShowExclude = false,
  onExclude,
  sortable = false,
  onShowHistory,
  canShowHistory,
}: HierarchicalReportTableProps) {
  const expandableIds = useMemo(() => collectExpandableIds(rows), [rows]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<SortState | null>(null);
  const [rowsSignature, setRowsSignature] = useState('');
  const [nameWidth, setNameWidth] = useState(readStoredNameWidth);
  const [nameWidthCap, setNameWidthCap] = useState(NAME_COL_MAX);
  const [scrolled, setScrolled] = useState(false);
  const [isStuck, setIsStuck] = useState(false);
  const [nameEdgeHover, setNameEdgeHover] = useState(false);
  const [nameEdgeDragging, setNameEdgeDragging] = useState(false);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);
  const nameEdgeHoverLock = useRef(0);

  const nextSignature = useMemo(() => rows.map((row) => row.id).join('|'), [rows]);

  useEffect(() => {
    if (nextSignature === rowsSignature) {
      return;
    }
    setRowsSignature(nextSignature);
    setExpanded(new Set(expandableIds));
  }, [expandableIds, nextSignature, rowsSignature]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsStuck(!entry.isIntersecting);
      },
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [rows.length]);

  useEffect(() => {
    const applyCap = () => {
      const width = window.innerWidth;
      if (width < 640) {
        setNameWidthCap(Math.max(NAME_COL_MIN, Math.round(width * 0.42)));
        return;
      }
      if (width < 1024) {
        setNameWidthCap(Math.max(200, Math.round(width * 0.32)));
        return;
      }
      setNameWidthCap(NAME_COL_MAX);
    };
    applyCap();
    window.addEventListener('resize', applyCap);
    return () => window.removeEventListener('resize', applyCap);
  }, []);

  const syncHorizontalScroll = useCallback((source: 'header' | 'body') => {
    const header = headerScrollRef.current;
    const body = bodyScrollRef.current;
    if (!header || !body || syncingScroll.current) {
      return;
    }
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

  const activeSort = sortable && sort && columns.some((column) => column.id === sort.columnId) ? sort : null;

  const { bodyRows, pinnedTotals } = useMemo(() => {
    const ordered = activeSort ? sortTreeRows(rows, activeSort) : rows;
    if (!pinTotals) {
      return { bodyRows: ordered, pinnedTotals: [] as HierarchicalTableRowView[] };
    }
    return {
      bodyRows: ordered.filter((row) => row.kind !== 'total'),
      pinnedTotals: ordered.filter((row) => row.kind === 'total'),
    };
  }, [activeSort, pinTotals, rows]);

  const columnWidths = useMemo(() => computeColumnWidths(columns, rows), [columns, rows]);

  const anyExpanded = expandableIds.some((id) => expanded.has(id));
  const toggleAll = useCallback(() => {
    setExpanded(anyExpanded ? new Set() : new Set(expandableIds));
  }, [anyExpanded, expandableIds]);

  const flatRows = useMemo(() => flattenRows(bodyRows, expanded), [bodyRows, expanded]);

  const groupLabels = useMemo(() => {
    const labels = columns.map((column) => column.groupLabel ?? '');
    return labels.some((label) => label.length > 0) ? labels : null;
  }, [columns]);

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const persistNameWidth = useCallback((width: number) => {
    try {
      localStorage.setItem(NAME_COL_STORAGE_KEY, String(width));
    } catch {
      /* ignore */
    }
  }, []);

  const nameWidthRef = useRef(nameWidth);
  nameWidthRef.current = nameWidth;
  const nameWidthCapRef = useRef(nameWidthCap);
  nameWidthCapRef.current = nameWidthCap;

  const onNameEdgeHoverChange = useCallback((hovered: boolean) => {
    if (hovered) {
      nameEdgeHoverLock.current += 1;
      setNameEdgeHover(true);
      return;
    }
    nameEdgeHoverLock.current = Math.max(0, nameEdgeHoverLock.current - 1);
    if (nameEdgeHoverLock.current === 0) {
      setNameEdgeHover(false);
    }
  }, []);

  const onNameResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startWidth = Math.min(nameWidthRef.current, nameWidthCapRef.current);
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      setNameEdgeDragging(true);

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const next = Math.min(NAME_COL_MAX, Math.max(NAME_COL_MIN, startWidth + moveEvent.clientX - startX));
        setNameWidth(next);
      };
      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        const next = Math.min(NAME_COL_MAX, Math.max(NAME_COL_MIN, startWidth + upEvent.clientX - startX));
        setNameWidth(next);
        persistNameWidth(next);
        setNameEdgeDragging(false);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [persistNameWidth],
  );

  const displayNameWidth = Math.min(nameWidth, nameWidthCap);
  const nameColStyle = { width: displayNameWidth, minWidth: displayNameWidth, maxWidth: displayNameWidth };
  const nameEdgeActive = nameEdgeHover || nameEdgeDragging;
  const nameBg = (isTotal: boolean) => (isTotal ? 'bg-default-50' : 'bg-white');
  const hasData = rows.length > 0;
  const tableMinWidth =
    displayNameWidth + columns.reduce((sum, column) => sum + (columnWidths.get(column.id) ?? 88), 0);

  useEffect(() => {
    const header = headerScrollRef.current;
    const body = bodyScrollRef.current;
    if (!header || !body) {
      return;
    }
    const alignGutter = () => {
      const gutter = body.offsetWidth - body.clientWidth;
      header.style.paddingRight = gutter > 0 ? `${gutter}px` : '';
    };
    alignGutter();
    window.addEventListener('resize', alignGutter);
    return () => window.removeEventListener('resize', alignGutter);
  }, [rows.length, columns.length, tableMinWidth]);

  const tableClass = 'w-full text-xs md:text-sm border-separate border-spacing-0 table-fixed';
  const renderColGroup = () => (
    <colgroup>
      <col style={nameColStyle} />
      {columns.map((column) => {
        const width = columnWidths.get(column.id) ?? 88;
        return <col key={column.id} style={{ width, minWidth: width }} />;
      })}
    </colgroup>
  );

  const renderNameHeader = () => (
    // `pr-1` як у NameCell: кнопка «згорнути всі» стоїть рівно над pin у рядку «Разом».
    <div className="flex items-center justify-between gap-1 min-w-0 pr-1">
      <span className="truncate">Найменування</span>
      {expandableIds.length > 0 ? (
        <Tooltip
          content={anyExpanded ? 'Згорнути всі групи' : 'Розгорнути всі групи'}
          placement="top"
          delay={300}
          showArrow={true}
          classNames={{
            base: 'before:bg-gray-700 before:rounded-[2px]',
            content: 'bg-gray-700 border-0 text-white text-xs max-w-xs',
          }}
        >
          <button
            type="button"
            className="inline-flex shrink-0 items-center justify-center w-6 h-6 rounded-md text-white/70 hover:text-white hover:bg-white/15 transition-colors duration-200"
            aria-label={anyExpanded ? 'Згорнути всі групи' : 'Розгорнути всі групи'}
            onClick={(event) => {
              event.stopPropagation();
              toggleAll();
            }}
          >
            <DynamicIcon name={anyExpanded ? 'chevrons-down-up' : 'chevrons-up-down'} size={16} />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );

  const renderResizeHandle = () => (
    <NameColResizeHandle
      active={nameEdgeActive}
      onPointerDown={onNameResizePointerDown}
      onHoverChange={onNameEdgeHoverChange}
    />
  );

  return (
    <div className="relative h-full min-h-64 min-w-0 w-full">
      <ReportLoadingOverlay loading={loading} message={loadingMessage} className="z-40 rounded-xl" />

      {!hasData && !loading ? (
        <ReportTableEmptyState
          loading={false}
          emptyMessage={emptyMessage}
          emptyIconName="table"
        />
      ) : null}

      {hasData ? (
        <div className="min-w-0 w-full max-w-full rounded-xl">
          <div ref={sentinelRef} aria-hidden className="h-0" />
          <div className={`sticky top-0 z-20 bg-neutral-800 overflow-hidden transition-all duration-200 ${isStuck ? 'rounded-t-none shadow-md' : 'rounded-t-xl'}`}>
            <div
              ref={headerScrollRef}
              className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onScroll={() => syncHorizontalScroll('header')}
            >
              <div className="grid" style={{ minWidth: tableMinWidth }}>
              <table className={`${tableClass} col-start-1 row-start-1`} style={{ minWidth: tableMinWidth }}>
              {renderColGroup()}
              <thead className="bg-neutral-800">
                {groupLabels ? (
                  <tr>
                    <th
                      rowSpan={2}
                      className={`sticky left-0 z-40 bg-neutral-500 px-2 md:px-3 py-2 text-left font-bold text-white align-middle border-r-2 ${
                        nameEdgeActive ? 'border-r-default-600' : 'border-white/20'
                      }`}
                      style={nameColStyle}
                    >
                      {renderNameHeader()}
                      {renderResizeHandle()}
                    </th>
                    {groupLabels.map((label, index) => {
                      const prev = groupLabels[index - 1];
                      if (index > 0 && label === prev) {
                        return null;
                      }
                      let span = 1;
                      for (let i = index + 1; i < groupLabels.length; i += 1) {
                        if (groupLabels[i] === label) {
                          span += 1;
                        } else {
                          break;
                        }
                      }
                      return (
                        <th
                          key={`${label}-${index}`}
                          colSpan={span}
                          className="bg-neutral-500 px-2 md:px-3 py-1.5 text-center text-xs md:text-sm font-bold text-white border-b not-last:border-r-2 border-white/20 border-r-white/40 whitespace-nowrap"
                        >
                          {label}
                        </th>
                      );
                    })}
                  </tr>
                ) : null}
                <tr>
                  {groupLabels ? null : (
                    <th
                      className={`sticky left-0 z-40 bg-neutral-500 px-2 md:px-3 py-2 text-left font-medium text-white not-last:border-r-2 ${
                        nameEdgeActive ? 'border-r-primary' : 'border-white/20'
                      }`}
                      style={nameColStyle}
                    >
                      {renderNameHeader()}
                      {renderResizeHandle()}
                    </th>
                  )}
                  {columns.map((column, index) => {
                    const last = index === columns.length - 1;
                    const canSort = sortable && column.format !== 'text';
                    const sortedBy = activeSort?.columnId === column.id ? activeSort.direction : null;
                    const headerText = (
                      <div
                        className={`flex flex-col gap-0.5 ${
                          column.align === 'left' ? 'items-start' : 'items-end'
                        }`}
                      >
                        {column.label ? <span>{column.label}</span> : null}
                        {column.badge ? (
                          <span className="inline-flex items-center rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-white/80">
                            {column.badge}
                          </span>
                        ) : null}
                      </div>
                    );
                    return (
                      <th
                        key={column.id}
                        aria-sort={
                          sortedBy === 'desc' ? 'descending' : sortedBy === 'asc' ? 'ascending' : undefined
                        }
                        className={`bg-neutral-500 px-2 md:px-3 py-2 text-[13px] text-white whitespace-nowrap leading-tight ${
                          column.align === 'left' ? 'text-left' : 'text-right'
                        } ${headerBorderClass(isGroupEnd(columns, index), last, true)}`}
                      >
                        <div
                          className={`flex items-center gap-1 ${
                            column.align === 'left' ? 'justify-start' : 'justify-end'
                          }`}
                        >
                          {canSort ? (
                            <button
                              type="button"
                              className="group/sort inline-flex items-center gap-1 rounded-sm cursor-pointer hover:text-white/85"
                              aria-label={`Сортувати за «${[column.groupLabel, column.label, column.badge].filter(Boolean).join(' ')}»`}
                              onClick={() => setSort((current) => nextSortState(current, column.id))}
                            >
                              <DynamicIcon
                                name={sortedBy === 'asc' ? 'arrow-up' : sortedBy === 'desc' ? 'arrow-down' : 'arrow-up-down'}
                                size={12}
                                className={`shrink-0 ${
                                  sortedBy ? 'text-white' : 'text-white/0 group-hover/sort:text-white/60'
                                }`}
                              />
                              {headerText}
                            </button>
                          ) : (
                            headerText
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
                {pinnedTotals.map((row) => (
                  <tr key={row.id} className="bg-default-50 font-semibold">
                    <th
                      className={`sticky left-0 z-40 bg-default-50 px-2 md:px-3 py-1.5 text-left font-semibold border-b border-r-2 ${
                        nameEdgeActive ? 'border-r-default-400' : 'border-default-200'}`}
                      style={nameColStyle}
                    >
                      <NameCell
                        row={row}
                        hasChildren={false}
                        expanded={false}
                        onToggle={toggle}
                        pinTotals={pinTotals}
                        onPinTotalsChange={onPinTotalsChange}
                      />
                      {renderResizeHandle()}
                    </th>
                    {columns.map((column, index) => {
                      const last = index === columns.length - 1;
                      return (
                        <th
                          key={column.id}
                          className={`bg-default-50 px-2 md:px-3 py-1.5 whitespace-nowrap tabular-nums font-semibold overflow-hidden ${
                            column.align === 'left' ? 'text-left' : 'text-right'
                          } ${headerBorderClass(isGroupEnd(columns, index), last)}`}
                        >
                          {formatCell(column, row.values[column.id])}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
            </table>
            <NameColumnScrollShadow visible={scrolled} offset={displayNameWidth} />
            </div>
            </div>
          </div>
          <div
            ref={bodyScrollRef}
            className="overflow-x-auto overscroll-x-contain rounded-b-xl"
            onScroll={() => syncHorizontalScroll('body')}
          >
            <div className="grid" style={{ minWidth: tableMinWidth }}>
            <table className={`${tableClass} col-start-1 row-start-1`} style={{ minWidth: tableMinWidth }}>
              {renderColGroup()}
              <tbody>
                {flatRows.map(({ row, hasChildren }) => {
                  const isTotal = row.kind === 'total';
                  return (
                    <tr
                      key={row.id}
                      className={`group hover:bg-default-100 [&:not(:last-child)_td]:border-b ${
                        isTotal ? 'font-semibold bg-default-50/70' : 'bg-white'
                      }`}
                    >
                      <td
                        className={`group/name sticky left-0 z-[1] px-2 md:px-3 py-1.5 border-r-2 overflow-hidden group-hover:bg-default-100 ${nameBg(isTotal)} ${
                          nameEdgeActive ? 'border-r-default-400' : 'border-default-200'
                        }`}
                        style={nameColStyle}
                      >
                        <NameCell
                          row={row}
                          hasChildren={hasChildren}
                          expanded={expanded.has(row.id)}
                          onToggle={toggle}
                          onExclude={onExclude}
                          alwaysShowExclude={alwaysShowExclude}
                          pinTotals={pinTotals}
                          onPinTotalsChange={onPinTotalsChange}
                          onShowHistory={onShowHistory}
                          canShowHistory={canShowHistory}
                        />
                        {renderResizeHandle()}
                      </td>
                      {columns.map((column, index) => (
                        <td
                          key={column.id}
                          className={`px-2 md:px-3 py-1.5 whitespace-nowrap tabular-nums overflow-hidden border-b border-default-200 ${
                            isGroupEnd(columns, index)
                              ? 'border-r-2 border-r-default-300'
                              : 'border-r border-r-default-200'
                          } last:border-r-0 ${column.align === 'left' ? 'text-left' : 'text-right'}`}
                        >
                          {formatCell(column, row.values[column.id])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <NameColumnScrollShadow visible={scrolled} offset={displayNameWidth} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
