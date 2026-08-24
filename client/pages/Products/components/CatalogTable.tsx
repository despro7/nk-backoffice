import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Checkbox,
  Chip,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
  type SortDescriptor,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { NumberInput } from '@/components/NumberInput';
import { formatNumberInput, parseNumberInput } from '@/lib/numberInput';
import {
  buildSpecColorMap,
  getSpecColor,
  specColorToClassNames,
  SPEC_COLOR_FALLBACK,
} from '@shared/utils/specColorPalette';
import { StockBadge } from '@/components/StockBadge';
import { ToastService } from '@/services/ToastService';
import type { CatalogGoodDto, CatalogTreeItemData } from '../ProductsTypes';
import { CATALOG_ROOT_ID } from '../ProductsTypes';
import {
  goodTypeLabel,
  isArchiveFolderName,
  getBlockedMoveTargetIds,
  weightsAlmostEqual,
  createCatalogLiveDragPreview,
  moveCatalogDragPreview,
  removeCatalogDragPreview,
  snapBackCatalogDragPreview,
  dismissCatalogDragPreview,
  catalogDragPreviewOffset,
  setCatalogDndCursor,
  collectCatalogHitRects,
  hitCatalogRect,
  applyCatalogDropAttrs,
  clearCatalogDropAttrs,
  markCatalogDndSources,
} from '../ProductsUtils';

export type CatalogOrdersTabKey = 'all' | 'new' | 'confirmed' | 'hold';

type PortionsStat = { newQty: number; confirmedQty: number; holdQty: number };

interface CatalogTableProps {
  rows: CatalogGoodDto[];
  loading?: boolean;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onOpenFolder: (id: string) => void;
  onEdit: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, ids: string[]) => void;
  isSearchMode?: boolean;
  accPolicies?: Array<{ id: string; name: string; code?: string | null }>;
  pinnedHues?: Record<string, string>;
  /** Гілка «Готова продукція» — додаткові колонки */
  isFinishedProductsBranch?: boolean;
  isAdmin?: boolean;
  portionsBySku?: Map<string, PortionsStat>;
  portionsLoading?: boolean;
  /** Lookup назв папок для колонки категорії в пошуку */
  folderLookup?: Record<string, { name: string }>;
  onOpenOrders?: (row: CatalogGoodDto, tab: CatalogOrdersTabKey) => void;
  /** Reorder siblings у межах папки (папка↔папка / товар↔товар) */
  onReorderGood?: (params: {
    id: string;
    beforeId?: string | null;
    afterId?: string | null;
  }) => void;
  /** Перемістити елементи в папку (drop на рядок-групу) */
  onMove?: (ids: string[], targetParentId: string) => void;
  /** Дерево для блокування drop у себе / нащадків */
  treeItems?: Record<string, CatalogTreeItemData>;
  /** Controlled sort (для кнопки скидання на ручний порядок) */
  sortDescriptor?: SortDescriptor;
  onSortChange?: (desc: SortDescriptor) => void;
  /** Швидке оновлення ваги з таблиці (Dilovod save). */
  onUpdateWeight?: (id: string, weight: number) => void | Promise<unknown>;
}

type PaintMode = 'replace' | 'add' | 'remove';

type ColumnKey =
  | 'name'
  | 'category'
  | 'sku'
  | 'type'
  | 'weight'
  | 'packageRatio'
  | 'unitRatio'
  | 'stockGp'
  | 'stockMs'
  | 'inOrders'
  | 'actions';

function rangeIds(ids: string[], from: number, to: number): string[] {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  return ids.slice(start, end + 1);
}

function resolveCategory(
  row: CatalogGoodDto,
  folderLookup?: Record<string, { name: string }>
): { id: string; name: string } {
  const parentId = row.parentId;
  if (!parentId || parentId === '0') {
    return { id: CATALOG_ROOT_ID, name: row.parentName || 'Каталог' };
  }
  return {
    id: parentId,
    name: row.parentName || folderLookup?.[parentId]?.name || '—',
  };
}

function formatWeightKg(weight: number | null | undefined): string {
  if (weight == null || Number.isNaN(Number(weight))) return '—';
  return Number(weight).toFixed(3).replace(/\.?0+$/, '').replace('.', ',');
}

function weightDraftFromRow(weight: number | null | undefined): string {
  if (weight == null || Number.isNaN(Number(weight))) return '';
  return formatNumberInput(Number(weight), {
    decimalPlaces: 3,
    trimTrailingZeros: true,
    min: 0,
    max: 20,
  });
}

function WeightQuickEdit({
  rowId,
  weight,
  onUpdateWeight,
}: {
  rowId: string;
  weight: number | null | undefined;
  onUpdateWeight: (id: string, next: number) => void | Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => weightDraftFromRow(weight));
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);
  const discardOnCloseRef = useRef(false);

  const commit = async (closeAfter: boolean) => {
    const parsed = parseNumberInput(draft);
    if (parsed == null || parsed <= 0) {
      const unchangedEmpty =
        closeAfter &&
        draft.trim() === '' &&
        (weight == null || Number.isNaN(Number(weight)));
      if (unchangedEmpty) {
        setOpen(false);
        return true;
      }
      setInvalid(true);
      return false;
    }
    setInvalid(false);
    if (weight != null && Number.isFinite(Number(weight)) && weightsAlmostEqual(Number(weight), parsed)) {
      if (closeAfter) setOpen(false);
      return true;
    }
    setSaving(true);
    try {
      await onUpdateWeight(rowId, parsed);
      if (closeAfter) setOpen(false);
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover
      placement="top-start"
      offset={6}
      showArrow
      classNames={{
        base: 'before:z-20 before:rounded-xs',
      }}
      isOpen={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(weightDraftFromRow(weight));
          setInvalid(false);
          discardOnCloseRef.current = false;
          setOpen(true);
          return;
        }
        if (saving) return;
        if (discardOnCloseRef.current) {
          discardOnCloseRef.current = false;
          setOpen(false);
          return;
        }
        void commit(true);
      }}
    >
      <PopoverTrigger>
        <button
          type="button"
          data-selection-ignore
          aria-label="Редагувати вагу"
          title="Редагувати вагу"
          className="group inline-flex items-center gap-1 rounded-md px-2 py-0.5 -mx-2 tabular-nums text-left transition-colors duration-200 hover:bg-default-200/80"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <span className={weight == null || Number.isNaN(Number(weight)) ? 'text-default-300' : ''}>
            {formatWeightKg(weight)}
          </span>
          <DynamicIcon
            name="pencil"
            size={12}
            className="pointer-events-none shrink-0 text-default-400 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent className="relative px-2 py-2 shadow-lg">
        <button
          type="button"
          aria-label="Скасувати"
          title="Скасувати"
          className="absolute -top-1 -right-1 z-10 
            flex h-4 w-4 items-center justify-center rounded-full shadow-[1px_-1px_5px_-3px_#00000040]
            text-default-400 bg-white transition-colors duration-150 hover:bg-danger-100 hover:text-danger-700"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            discardOnCloseRef.current = true;
            setOpen(false);
          }}
        >
          <DynamicIcon name="x" size={10} />
        </button>
        <NumberInput
          aria-label="Вага, кг"
          size="sm"
          autoFocus
          decimalPlaces={3}
          trimTrailingZeros
          min={0}
          max={20}
          step={0.01}
          value={draft}
          isDisabled={saving}
          isInvalid={invalid}
          errorMessage={invalid ? 'Має бути більше 0' : undefined}
          endContent={<span className="text-xs text-default-400 pr-0.5">кг</span>}
          className="w-32"
          classNames={{
            inputWrapper: [
              'h-8 min-h-8 border-1 border-default-200/50 bg-default-100/75!',
              'shadow-none ring-0! ring-offset-0!',
              'group-data-[focus-visible=true]:ring-0! group-data-[focus-visible=true]:ring-offset-0!',
              'group-data-[focus-visible=true]:ring-offset-transparent!',
              'data-[focus-visible=true]:ring-0! data-[focus-visible=true]:ring-offset-0!',
            ].join(' '),
            helperWrapper: 'pb-0',
          }}
          onValueChange={(v) => {
            setDraft(v);
            if (invalid) setInvalid(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit(true);
            }
            if (e.key === 'Escape') {
              discardOnCloseRef.current = true;
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

const CATALOG_IDS_MIME = 'application/x-catalog-ids';
const CATALOG_REORDER_MIME = 'application/x-catalog-reorder-id';
const FOLDER_REORDER_EDGE = 0.28;

type DropHint =
  | { kind: 'reorder'; id: string; position: 'before' | 'after' }
  | { kind: 'into'; id: string };

type DragPayload = {
  ids: string[];
  hasGroup: boolean;
  hasGood: boolean;
};

/** «after A» між A і B = той самий слот, що «before B» — лишаємо одну лінію. */
function canonicalReorderHint(
  sameTypeIds: string[],
  targetId: string,
  position: 'before' | 'after'
): { id: string; position: 'before' | 'after' } | null {
  const idx = sameTypeIds.indexOf(targetId);
  if (idx < 0) return null;
  if (position === 'after' && idx < sameTypeIds.length - 1) {
    return { id: sameTypeIds[idx + 1], position: 'before' };
  }
  return { id: targetId, position };
}

function parseCatalogDragIds(dataTransfer: DataTransfer): string[] {
  const reorderId = dataTransfer.getData(CATALOG_REORDER_MIME);
  if (reorderId) return [reorderId];
  try {
    const ids = JSON.parse(dataTransfer.getData(CATALOG_IDS_MIME) || '[]') as string[];
    return Array.isArray(ids) ? ids.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function copySkuToClipboard(sku: string): void {
  void navigator.clipboard.writeText(sku).then(() => {
    ToastService.show({
      title: 'Скопійовано артикул' + (sku ? ` ${sku}` : ''),
      color: 'success',
      timeout: 2000,
    });
  }).catch(() => {
    ToastService.show({
      title: 'Не вдалося скопіювати',
      color: 'danger',
      timeout: 3000,
    });
  });
}

function SkuCopyCell({ sku }: { sku: string | null }) {
  if (!sku) {
    return <span className="text-default-300">—</span>;
  }

  return (
    <button
      type="button"
      data-selection-ignore
      aria-label={`Копіювати SKU ${sku}`}
      title="Копіювати SKU"
      className="group inline-flex items-center gap-1 rounded-md px-2 py-0.5 -mx-2 font-mono text-left transition-colors duration-200 hover:bg-default-200/80"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        copySkuToClipboard(sku);
      }}
    >
      {sku}
      <DynamicIcon
        name="copy"
        size={12}
        className="pointer-events-none shrink-0 text-default-400 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      />
    </button>
  );
}

export function CatalogTable({
  rows,
  loading,
  selectedIds,
  onSelectionChange,
  onOpenFolder,
  onEdit,
  onContextMenu,
  isSearchMode,
  accPolicies,
  pinnedHues,
  isFinishedProductsBranch = false,
  isAdmin = false,
  portionsBySku,
  portionsLoading,
  folderLookup,
  onOpenOrders,
  onReorderGood,
  onMove,
  treeItems,
  sortDescriptor: sortDescriptorProp,
  onSortChange,
  onUpdateWeight,
}: CatalogTableProps) {
  const visibleRows = rows.filter(
    (r) => !(r.isGroup && isArchiveFolderName(r.name))
  );
  const selectedSet = new Set(selectedIds);
  const allIds = visibleRows.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedSet.has(id));

  const [internalSort, setInternalSort] = useState<SortDescriptor>({
    column: 'sortOrder',
    direction: 'ascending',
  });
  const sortDescriptor = sortDescriptorProp ?? internalSort;
  const setSortDescriptor = onSortChange ?? setInternalSort;
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const dropHintRef = useRef<DropHint | null>(null);
  dropHintRef.current = dropHint;
  const [draggingIds, setDraggingIds] = useState<string[]>([]);
  const dragPayloadRef = useRef<DragPayload | null>(null);
  const pointerDndRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
    sourceRowId: string;
    pointerType: string;
    captureEl: HTMLElement | null;
  } | null>(null);

  const isManualSort =
    !sortDescriptor.column ||
    sortDescriptor.column === 'sortOrder' ||
    String(sortDescriptor.column) === 'sortOrder';

  const sortedRows = useMemo(() => {
    const list = [...visibleRows];
    const col = String(sortDescriptor.column || 'sortOrder');
    if (col === 'sortOrder') {
      return list.sort((a, b) => {
        if (a.isGroup !== b.isGroup) return a.isGroup ? -1 : 1;
        const sa = a.sortOrder ?? 0;
        const sb = b.sortOrder ?? 0;
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name, 'uk');
      });
    }

    const dir = sortDescriptor.direction === 'descending' ? -1 : 1;
    const getVal = (row: CatalogGoodDto): string | number => {
      switch (col) {
        case 'name':
          return row.name || '';
        case 'category':
          return resolveCategory(row, folderLookup).name;
        case 'sku':
          return row.sku || '';
        case 'packageRatio':
          return row.packageRatio ?? -1;
        case 'unitRatio':
          return row.unitRatio ?? -1;
        case 'stockGp':
          return row.mainStock ?? 0;
        case 'stockMs':
          return row.smallStock ?? 0;
        case 'inOrders': {
          const p = portionsBySku?.get(String(row.sku ?? '').trim().toLowerCase());
          return (p?.newQty ?? 0) + (p?.confirmedQty ?? 0) + (p?.holdQty ?? 0);
        }
        case 'weight':
          return row.weight ?? -1;
        default:
          return row.name || '';
      }
    };

    return list.sort((a, b) => {
      if (a.isGroup !== b.isGroup) return a.isGroup ? -1 : 1;
      const va = getVal(a);
      const vb = getVal(b);
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * dir;
      }
      return String(va).localeCompare(String(vb), 'uk') * dir;
    });
  }, [visibleRows, sortDescriptor, portionsBySku, folderLookup]);

  const displayIds = sortedRows.map((r) => r.id);

  const hasGoods = visibleRows.some((r) => !r.isGroup);

  const columns = useMemo(() => {
    const cols: Array<{ key: ColumnKey; label: React.ReactNode; sortable?: boolean; width?: number }> = [
      { key: 'name', label: 'Назва', sortable: true },
    ];
    if (isSearchMode) {
      cols.push({ key: 'category', label: 'Категорія', sortable: true });
    }
    cols.push(
      { key: 'sku', label: 'SKU', sortable: true },
      { key: 'type', label: 'Тип' },
    );
    if (hasGoods) {
      cols.push({ key: 'weight', label: 'Вага, кг', sortable: true });
    }
    if (hasGoods && isFinishedProductsBranch) {
      cols.push(
        { key: 'packageRatio', label: 'Порцій/кор.', sortable: true },
        ...(isAdmin ? [{ key: 'unitRatio' as const, label: 'Коефіцієнт', sortable: true }] : []),
        { 
          key: 'stockGp',
          label: (
            <span className="inline-flex items-center gap-1">
              Залишки
              <StockBadge variant="gp" size="9px" />
            </span>
          ),
          sortable: true,
        },
   
        { key: 'stockMs', label: (
          <span className="inline-flex items-center gap-1">
            Залишки
            <StockBadge variant="ms" size="9px" />
          </span>
        ), sortable: true },
        { key: 'inOrders', label: 'В замовленнях', sortable: true }
      );
    } else if (hasGoods && isSearchMode) {
      cols.push({ key: 'inOrders', label: 'В замовленнях', sortable: true });
    }
    return cols;
  }, [hasGoods, isFinishedProductsBranch, isAdmin, isSearchMode]);

  const specColors = buildSpecColorMap(accPolicies ?? [], {
    theme: 'light',
    intensity: 'soft',
    border: true,
    pinnedHues,
  });

  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const dragSelectRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startIndex: number;
    startId: string;
    fromIndex: number;
    mode: PaintMode;
    baseIds: string[];
    moved: boolean;
    lastIndex: number;
    captureEl: HTMLElement | null;
    shift: boolean;
    pointerType: string;
    rowRects?: ReturnType<typeof collectCatalogHitRects>;
  } | null>(null);
  const suppressCheckboxToggleRef = useRef(false);
  const allIdsRef = useRef(displayIds);
  allIdsRef.current = displayIds;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onContextMenuRef = useRef(onContextMenu);
  onContextMenuRef.current = onContextMenu;
  const longPressRef = useRef<{
    pointerId: number;
    timer: number;
    startX: number;
    startY: number;
    rowId: string;
  } | null>(null);

  const clearCatalogLongPress = () => {
    const state = longPressRef.current;
    if (!state) return;
    window.clearTimeout(state.timer);
    longPressRef.current = null;
  };

  const openRowContextMenu = (clientX: number, clientY: number, rowId: string) => {
    const handler = onContextMenuRef.current;
    if (!handler) return;
    const selected = selectedIdsRef.current;
    const selectedHas = selected.includes(rowId);
    const ids = selectedHas && selected.length > 0 ? selected : [rowId];
    if (!(selectedHas && selected.length > 1)) {
      onSelectionChangeRef.current([rowId]);
    }
    handler(
      {
        preventDefault() {},
        stopPropagation() {},
        clientX,
        clientY,
      } as React.MouseEvent,
      ids.length > 0 ? ids : [rowId]
    );
  };

  useEffect(() => {
    setAnchorIndex(null);
    dragSelectRef.current = null;
    setIsDragSelecting(false);
    clearCatalogLongPress();
  }, [rows]);

  const toggleAll = () => {
    onSelectionChange(allSelected ? [] : displayIds);
    setAnchorIndex(null);
  };

  const toggleOne = (id: string, index: number) => {
    const current = selectedIdsRef.current;
    if (current.includes(id)) {
      onSelectionChangeRef.current(current.filter((x) => x !== id));
    } else {
      onSelectionChangeRef.current([...current, id]);
    }
    setAnchorIndex(index);
  };

  const applyPaint = (from: number, to: number, mode: PaintMode, baseIds: string[]) => {
    const ranged = rangeIds(allIdsRef.current, from, to);
    if (mode === 'replace') {
      onSelectionChangeRef.current(ranged);
      return;
    }
    const next = new Set(baseIds);
    if (mode === 'add') {
      for (const id of ranged) next.add(id);
    } else {
      for (const id of ranged) next.delete(id);
    }
    onSelectionChangeRef.current([...next]);
  };

  useEffect(() => {
    const SWIPE_THRESHOLD = 8;

    const releaseCapture = (state: { pointerId: number; captureEl: HTMLElement | null }) => {
      if (!state.captureEl) return;
      try {
        if (state.captureEl.hasPointerCapture(state.pointerId)) {
          state.captureEl.releasePointerCapture(state.pointerId);
        }
      } catch {
        // ignore
      }
    };

    const hitRowIndex = (clientX: number, clientY: number, rowRects: ReturnType<typeof collectCatalogHitRects>) => {
      const hit = hitCatalogRect(rowRects, clientX, clientY, 'y');
      if (!hit) return -1;
      return allIdsRef.current.indexOf(hit.id);
    };

    const onPointerMove = (e: PointerEvent) => {
      const state = dragSelectRef.current;
      if (!state || e.pointerId !== state.pointerId) return;

      if (!state.moved) {
        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;
        const dist = Math.hypot(dx, dy);
        if (dist < SWIPE_THRESHOLD) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.15) {
          releaseCapture(state);
          dragSelectRef.current = null;
          window.setTimeout(() => {
            suppressCheckboxToggleRef.current = false;
          }, 0);
          return;
        }
        state.moved = true;
        state.rowRects = collectCatalogHitRects('[data-catalog-row-id]');
        setIsDragSelecting(true);
      }

      const index = hitRowIndex(e.clientX, e.clientY, state.rowRects ?? []);
      if (index < 0 || index === state.lastIndex) return;

      state.lastIndex = index;
      e.preventDefault();
      applyPaint(state.fromIndex, index, state.mode, state.baseIds);
      if (!state.shift) setAnchorIndex(state.startIndex);
    };

    const onPointerUp = (e: PointerEvent) => {
      const state = dragSelectRef.current;
      if (!state || e.pointerId !== state.pointerId) return;
      dragSelectRef.current = null;
      releaseCapture(state);
      setIsDragSelecting(false);

      if (!state.moved && !state.shift) {
        toggleOne(state.startId, state.startIndex);
      }

      // iOS шле click пізніше за pointerup — тримаємо suppress, щоб не було подвійного тоглу.
      const delay =
        state.pointerType === 'touch' || state.pointerType === 'pen' ? 400 : 0;
      window.setTimeout(() => {
        suppressCheckboxToggleRef.current = false;
      }, delay);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!dragSelectRef.current) return;
      e.preventDefault();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  useEffect(() => {
    const MOVE_PX = 10;
    const onMove = (e: PointerEvent) => {
      const state = longPressRef.current;
      if (!state || e.pointerId !== state.pointerId) return;
      if (Math.hypot(e.clientX - state.startX, e.clientY - state.startY) > MOVE_PX) {
        clearCatalogLongPress();
      }
    };
    const onEnd = (e: PointerEvent) => {
      const state = longPressRef.current;
      if (!state || e.pointerId !== state.pointerId) return;
      clearCatalogLongPress();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    return () => {
      clearCatalogLongPress();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };
  }, []);

  const handleCheckboxPointerDown = (
    e: React.PointerEvent<HTMLElement>,
    index: number
  ) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const id = displayIds[index];
    if (!id) return;

    e.preventDefault();
    e.stopPropagation();
    suppressCheckboxToggleRef.current = true;

    const additive = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const mode: PaintMode = selectedSet.has(id)
      ? 'remove'
      : additive
        ? 'add'
        : 'replace';
    const fromIndex = shift ? (anchorIndex ?? index) : index;
    const captureEl = e.currentTarget;

    try {
      captureEl.setPointerCapture(e.pointerId);
    } catch {
      // Safari / already captured
    }

    dragSelectRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startIndex: index,
      startId: id,
      fromIndex,
      mode,
      baseIds: selectedIds,
      moved: false,
      lastIndex: -1,
      captureEl,
      shift,
      pointerType: e.pointerType,
    };

    if (shift) {
      applyPaint(fromIndex, index, mode, selectedIds);
    }
  };

  const handleRowPointerDown = (e: React.PointerEvent, rowId: string) => {
    if (!onContextMenu) return;
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-catalog-checkbox], [data-drag-handle], [data-selection-ignore]')) {
      return;
    }

    clearCatalogLongPress();
    const startX = e.clientX;
    const startY = e.clientY;
    const pointerId = e.pointerId;
    const timer = window.setTimeout(() => {
      longPressRef.current = null;
      const eatClick = (ev: MouseEvent) => {
        if ((ev.target as HTMLElement | null)?.closest?.('[role="menu"]')) return;
        ev.preventDefault();
        ev.stopPropagation();
      };
      window.addEventListener('click', eatClick, true);
      window.setTimeout(() => {
        window.removeEventListener('click', eatClick, true);
      }, 600);
      openRowContextMenu(startX, startY, rowId);
    }, 520);
    longPressRef.current = { pointerId, timer, startX, startY, rowId };
  };

  const goodsOnly = useMemo(
    () => sortedRows.filter((r) => !r.isGroup),
    [sortedRows]
  );
  const foldersOnly = useMemo(
    () => sortedRows.filter((r) => r.isGroup),
    [sortedRows]
  );
  const canReorder = Boolean(onReorderGood && !isSearchMode && isManualSort);
  const canMove = Boolean(onMove && !isSearchMode);
  const showDragHandle = canReorder || canMove;

  const rememberDragPayload = (ids: string[]) => {
    const unique = [...new Set(ids.filter(Boolean))];
    dragPayloadRef.current = {
      ids: unique,
      hasGroup: unique.some((id) => sortedRows.find((r) => r.id === id)?.isGroup),
      hasGood: unique.some((id) => {
        const row = sortedRows.find((r) => r.id === id);
        return Boolean(row && !row.isGroup);
      }),
    };
  };

  const clearDropUi = () => {
    removeCatalogDragPreview();
    dragPayloadRef.current = null;
    dropHintRef.current = null;
    setDropHint(null);
    setDraggingIds([]);
    clearCatalogDropAttrs();
    markCatalogDndSources([]);
    setCatalogDndCursor(false);
  };

  const handleReorderDrop = (
    draggedId: string,
    targetId: string,
    position: 'before' | 'after'
  ): boolean => {
    if (!onReorderGood || isSearchMode || !isManualSort) return false;
    const target = sortedRows.find((r) => r.id === targetId);
    const dragged = sortedRows.find((r) => r.id === draggedId);
    if (!target || !dragged || target.isGroup !== dragged.isGroup) return false;
    if (draggedId === targetId) return false;

    const siblings = (dragged.isGroup ? foldersOnly : goodsOnly).map((g) => g.id);
    const without = siblings.filter((id) => id !== draggedId);
    const targetIdx = without.indexOf(targetId);
    if (targetIdx < 0) return false;
    const insertAt = position === 'before' ? targetIdx : targetIdx + 1;
    const afterId = insertAt > 0 ? without[insertAt - 1] : null;
    const beforeId = insertAt < without.length ? without[insertAt] : null;
    onReorderGood({ id: draggedId, afterId, beforeId });
    setSortDescriptor({ column: 'sortOrder', direction: 'ascending' });
    return true;
  };

  const resolveDropHint = (
    row: CatalogGoodDto,
    clientY: number,
    rowEl: HTMLElement
  ): DropHint | null => {
    const payload = dragPayloadRef.current;
    if (!payload || payload.ids.length === 0 || isSearchMode) return null;

    const folderOnly = payload.hasGroup && !payload.hasGood;
    const goodOnly = payload.hasGood && !payload.hasGroup;
    const mixed = payload.hasGroup && payload.hasGood;
    const blocked = treeItems
      ? getBlockedMoveTargetIds(payload.ids, treeItems)
      : new Set(payload.ids);
    const canDropInto =
      row.isGroup &&
      canMove &&
      !blocked.has(row.id) &&
      !payload.ids.includes(row.id);

    if (canDropInto && (goodOnly || mixed)) {
      return { kind: 'into', id: row.id };
    }

    if (canDropInto && folderOnly) {
      if (!canReorder) return { kind: 'into', id: row.id };
      const rect = rowEl.getBoundingClientRect();
      const ratio = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
      if (ratio > FOLDER_REORDER_EDGE && ratio < 1 - FOLDER_REORDER_EDGE) {
        return { kind: 'into', id: row.id };
      }
    }

    if (!canReorder || mixed) return null;
    if (folderOnly !== row.isGroup) return null;
    if (goodOnly === row.isGroup) return null;
    if (payload.ids.includes(row.id)) return null;

    const sameTypeIds = (row.isGroup ? foldersOnly : goodsOnly).map((r) => r.id);
    const rect = rowEl.getBoundingClientRect();
    const position: 'before' | 'after' =
      clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    const canonical = canonicalReorderHint(sameTypeIds, row.id, position);
    return canonical ? { kind: 'reorder', ...canonical } : null;
  };

  const dndApiRef = useRef({
    resolveDropHint,
    handleReorderDrop,
    onMove,
    sortedRows,
    clearDropUi,
  });
  dndApiRef.current = {
    resolveDropHint,
    handleReorderDrop,
    onMove,
    sortedRows,
    clearDropUi,
  };

  useEffect(() => {
    const POINTER_DND_THRESHOLD_MOUSE = 6;
    const POINTER_DND_THRESHOLD_TOUCH = 10;

    const previewPos = (e: PointerEvent, pointerType: string) => {
      const offset = catalogDragPreviewOffset(pointerType);
      return { x: e.clientX + offset.x, y: e.clientY + offset.y };
    };

    let rowRects = collectCatalogHitRects('[data-catalog-row-id]');
    let folderRects = collectCatalogHitRects('[data-catalog-folder-id]');
    let raf = 0;
    let lastPtr: PointerEvent | null = null;

    const refreshHits = () => {
      rowRects = collectCatalogHitRects('[data-catalog-row-id]');
      folderRects = collectCatalogHitRects('[data-catalog-folder-id]');
    };

    const applyHintFromPoint = (clientX: number, clientY: number) => {
      const api = dndApiRef.current;
      const payload = dragPayloadRef.current;
      const rowHit = hitCatalogRect(rowRects, clientX, clientY, 'xy');
      const folderHit = hitCatalogRect(folderRects, clientX, clientY, 'xy');
      let hint = null as ReturnType<typeof api.resolveDropHint>;
      let target: HTMLElement | null = null;

      if (rowHit) {
        const row = api.sortedRows.find((item) => item.id === rowHit.id);
        if (row) {
          hint = api.resolveDropHint(row, clientY, rowHit.el);
          target = rowHit.el;
        }
      } else if (folderHit && payload && api.onMove && !payload.ids.includes(folderHit.id)) {
        hint = { kind: 'into', id: folderHit.id };
        target = folderHit.el;
      }

      dropHintRef.current = hint;
      applyCatalogDropAttrs(hint, target);
    };

    const processMove = (e: PointerEvent) => {
      const session = pointerDndRef.current;
      if (!session || e.pointerId !== session.pointerId) return;

      const dist = Math.hypot(e.clientX - session.startX, e.clientY - session.startY);
      const threshold =
        session.pointerType === 'touch' || session.pointerType === 'pen'
          ? POINTER_DND_THRESHOLD_TOUCH
          : POINTER_DND_THRESHOLD_MOUSE;
      if (!session.active) {
        if (dist < threshold) return;
        session.active = true;
        setCatalogDndCursor(true);
        const payload = dragPayloadRef.current;
        if (payload) {
          markCatalogDndSources(payload.ids);
          setDraggingIds(payload.ids);
        }
        const api = dndApiRef.current;
        const idSet = new Set(payload?.ids ?? []);
        const labels = api.sortedRows
          .filter((item) => idSet.has(item.id))
          .map((item) => item.name);
        createCatalogLiveDragPreview(labels);
        refreshHits();
      }

      e.preventDefault();
      const pos = previewPos(e, session.pointerType);
      moveCatalogDragPreview(pos.x, pos.y);
      applyHintFromPoint(e.clientX, e.clientY);
    };

    const onPointerMove = (e: PointerEvent) => {
      const session = pointerDndRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      lastPtr = e;
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const ev = lastPtr;
        if (ev) processMove(ev);
      });
    };

    const flushMove = () => {
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
      if (lastPtr) processMove(lastPtr);
    };

    const releaseCapture = (session: { pointerId: number; captureEl: HTMLElement | null }) => {
      if (!session.captureEl) return;
      try {
        if (session.captureEl.hasPointerCapture(session.pointerId)) {
          session.captureEl.releasePointerCapture(session.pointerId);
        }
      } catch {
        // ignore
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const session = pointerDndRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      flushMove();
      pointerDndRef.current = null;
      lastPtr = null;
      releaseCapture(session);

      const api = dndApiRef.current;
      if (!session.active) {
        api.clearDropUi();
        return;
      }

      const payload = dragPayloadRef.current;
      applyHintFromPoint(e.clientX, e.clientY);
      const hint = dropHintRef.current;

      let didAction = false;
      if (hint && payload) {
        if (hint.kind === 'into' && api.onMove) {
          const moveIds = payload.ids.filter((id) => id !== hint.id);
          if (moveIds.length > 0) {
            api.onMove(moveIds, hint.id);
            didAction = true;
          }
        } else if (hint.kind === 'reorder' && payload.ids.length === 1) {
          didAction = api.handleReorderDrop(payload.ids[0], hint.id, hint.position);
        }
      }

      dropHintRef.current = null;
      clearCatalogDropAttrs();

      const sourceId = session.sourceRowId;
      void (async () => {
        if (!didAction) {
          const sourceEl = document.querySelector(
            `[data-catalog-row-id="${CSS.escape(sourceId)}"]`
          );
          await snapBackCatalogDragPreview(
            sourceEl instanceof HTMLElement ? sourceEl : null
          );
        } else {
          await dismissCatalogDragPreview();
        }
        api.clearDropUi();
      })();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pointerDndRef.current) return;
      e.preventDefault();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner label="Завантаження…" />
      </div>
    );
  }

  const renderCell = (row: CatalogGoodDto, key: ColumnKey) => {
    switch (key) {
      case 'name':
        return (
          <div className="flex items-center gap-2 min-w-0 relative pl-5">
            {showDragHandle && (
              <span
                data-drag-handle
                data-selection-ignore
                className={`touch-none text-default-300 absolute -left-1.5 top-1/2 -translate-y-1/2 inline-flex h-10 w-6 items-center justify-center hover:text-default-500 shrink-0 transition-opacity duration-200 ease-in-out
                  ${draggingIds.length > 0 ? 'cursor-grabbing' : 'cursor-grab'}
                  ${!isManualSort
                    ? 'opacity-0 pointer-events-none'
                    : 'opacity-100'
                  }`}
                title="Перетягнути для сортування або переміщення"
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse' && e.button !== 0) return;
                  e.stopPropagation();
                  e.preventDefault();
                  const handleEl = e.currentTarget as HTMLElement;
                  try {
                    handleEl.setPointerCapture(e.pointerId);
                  } catch {
                    // Safari / already captured
                  }
                  const ids =
                    selectedSet.has(row.id) && selectedIds.length > 0
                      ? selectedIds
                      : [row.id];
                  rememberDragPayload(ids);
                  pointerDndRef.current = {
                    pointerId: e.pointerId,
                    startX: e.clientX,
                    startY: e.clientY,
                    active: false,
                    sourceRowId: row.id,
                    pointerType: e.pointerType,
                    captureEl: handleEl,
                  };
                }}
              >
                <DynamicIcon name="grip-vertical" size={14} />
              </span>
            )}
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 text-left hover:text-primary select-none"
              onClick={() => (row.isGroup ? onOpenFolder(row.id) : onEdit(row.id))}
            >
              <span className="w-4 h-4">
                <DynamicIcon
                  name={row.isGroup ? 'folder' : row.isKit ? 'package' : 'shopping-bag'}
                  size={16}
                  className="text-default-500 shrink-0"
                />
              </span>
              <span className="truncate select-none">{row.name}</span>
              {row.delMark && (
                <Chip
                  size="sm"
                  variant="flat"
                  color="danger"
                  classNames={{
                    base: 'bg-danger-500 text-white px-1 py-0.5 h-5',
                    content: 'font-semibold text-[10px]',
                  }}
                >
                  OFF
                </Chip>
              )}
            </button>
          </div>
        );
      case 'category': {
        const category = resolveCategory(row, folderLookup);
        if (category.name === '—') {
          return <span className="text-default-300">—</span>;
        }
        return (
          <Tooltip content="Перейти до категорії" placement="top" color="secondary">
            <button
              type="button"
              data-selection-ignore
              className="max-w-[180px] truncate text-left text-slate-500 font-semibold hover:underline flex items-center gap-1"
              onClick={(e) => {
                e.stopPropagation();
                onOpenFolder(category.id);
              }}
            >
              {category.name} <DynamicIcon name="folder-symlink" size={14} />
            </button>
          </Tooltip>
     
        );
      }
      case 'sku':
        return <SkuCopyCell sku={row.sku} />;
      case 'type': {
        const typeTokens = row.isGroup
          ? SPEC_COLOR_FALLBACK
          : getSpecColor(specColors, row.accPolicyId);
        return (
          <Chip
            size="sm"
            variant="flat"
            classNames={{
              base: specColorToClassNames(typeTokens, {
                border: true,
                theme: 'light',
                intensity: 'soft',
              }),
              content: 'font-medium truncate max-w-[120px]',
            }}
          >
            {goodTypeLabel(row, accPolicies)}
          </Chip>
        );
      }
      case 'weight':
        if (row.isGroup) {
          return <span className="text-default-300">—</span>;
        }
        if (!onUpdateWeight) {
          return <span className="tabular-nums">{formatWeightKg(row.weight)}</span>;
        }
        return (
          <WeightQuickEdit
            rowId={row.id}
            weight={row.weight}
            onUpdateWeight={onUpdateWeight}
          />
        );
      case 'packageRatio':
        return row.isGroup ? (
          <span className="text-default-300">—</span>
        ) : (
          <span className="tabular-nums">
            {row.packageRatio != null ? row.packageRatio : '—'}
          </span>
        );
      case 'unitRatio':
        return row.isGroup ? (
          <span className="text-default-300">—</span>
        ) : (
          <span className="tabular-nums">{row.unitRatio ?? 1}</span>
        );
      case 'stockGp':
        return row.isGroup ? (
          <span className="text-default-300">—</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
            {row.mainStock ?? 0}
          </span>
        );
      case 'stockMs':
        return row.isGroup ? (
          <span className="text-default-300">—</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
            {row.smallStock ?? 0}
          </span>
        );
      case 'inOrders': {
        if (row.isGroup) return <span className="text-default-300">—</span>;
        if (portionsLoading) return <span className="text-default-300 text-xs">…</span>;
        const p = portionsBySku?.get(String(row.sku ?? '').trim().toLowerCase());
        const total = (p?.newQty ?? 0) + (p?.confirmedQty ?? 0) + (p?.holdQty ?? 0);
        if (total === 0) return <span className="text-default-300">—</span>;
        const openOrders = (tab: CatalogOrdersTabKey) => {
          if (!row.sku || !onOpenOrders) return;
          onOpenOrders(row, tab);
        };
        return (
          <div
            data-selection-ignore
            className={`flex items-center gap-1 text-sm leading-tight ${onOpenOrders ? 'cursor-pointer' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              openOrders('all');
            }}
          >
            <span className="font-bold text-neutral-800 tabular-nums">{total}</span>
            <div className="flex gap-1.5 text-xs px-1 py-0.5 rounded items-center bg-gray-100">
              {(p?.newQty ?? 0) > 0 && (
                <Tooltip color="secondary" content="Нові замовлення">
                  <span
                    className="text-blue-600 font-medium"
                    onClick={(e) => {
                      e.stopPropagation();
                      openOrders('new');
                    }}
                  >
                    {p!.newQty}
                  </span>
                </Tooltip>
              )}
              {(p?.confirmedQty ?? 0) > 0 && (
                <Tooltip color="secondary" content="Підтверджені">
                  <span
                    className="text-green-600 font-medium"
                    onClick={(e) => {
                      e.stopPropagation();
                      openOrders('confirmed');
                    }}
                  >
                    {p!.confirmedQty}
                  </span>
                </Tooltip>
              )}
              {(p?.holdQty ?? 0) > 0 && (
                <Tooltip color="secondary" content="На утриманні">
                  <span
                    className="text-amber-600 font-medium"
                    onClick={(e) => {
                      e.stopPropagation();
                      openOrders('hold');
                    }}
                  >
                    {p!.holdQty}
                  </span>
                </Tooltip>
              )}
            </div>
          </div>
        );
      }
      case 'actions':
        return (
          <button
            type="button"
            className="rounded p-1 hover:bg-default-100"
            aria-label="Редагувати"
            onClick={() => onEdit(row.id)}
          >
            <DynamicIcon name="pencil" size={16} />
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <Table
      aria-label="Каталог товарів"
      removeWrapper
      className={`min-h-[200px] ${isDragSelecting ? 'select-none' : ''}`}
      classNames={{
        th: 'first:rounded-l-md last:rounded-e-md',
      }}
      sortDescriptor={
        isManualSort
          ? undefined
          : {
              column: sortDescriptor.column,
              direction: sortDescriptor.direction,
            }
      }
      onSortChange={(desc) => {
        setSortDescriptor(desc);
      }}
    >
      <TableHeader>
        {[
          <TableColumn key="sel" width={32} className="pr-0 min-w-8" allowsSorting={false}>
            <Checkbox
              aria-label="Вибрати всі"
              isSelected={allSelected}
              onValueChange={toggleAll}
              size="sm"
              classNames={{
                base: 'pr-0',
                wrapper: 'm-0',
              }}
            />
          </TableColumn>,
          ...columns.map((col) => (
            <TableColumn
              key={col.key}
              allowsSorting={Boolean(col.sortable)}
              width={col.width}
              className={col.key === 'name' ? 'pl-8' : ''}
            >
              {col.label}
            </TableColumn>
          )),
        ]}
      </TableHeader>
      <TableBody emptyContent={isSearchMode ? 'Нічого не знайдено' : 'Папка порожня'}>
        {sortedRows.map((row, index) => {
          const isSelected = selectedSet.has(row.id);
          const showDropInto = dropHint?.kind === 'into' && dropHint.id === row.id;
          const isDndActive = draggingIds.length > 0;
          const isDragging = draggingIds.includes(row.id);
          return (
            <TableRow
              key={row.id}
              data-catalog-row-id={row.id}
              data-catalog-dnd-source={isDragging ? '' : undefined}
              data-catalog-drop-into={showDropInto ? '' : undefined}
              className={[
                isSelected ? 'bg-gray-100' : 'cursor-default',
                isDndActive
                  ? ''
                  : isSelected
                    ? 'hover:bg-gray-200/60'
                    : 'hover:bg-gray-100/60',
                'outline-none relative transition-[background-color,opacity,box-shadow] duration-300 ease-in-out',
              ]
                .filter(Boolean)
                .join(' ')}
              draggable={false}
              onPointerDown={(e) => handleRowPointerDown(e, row.id)}
              onContextMenu={(e) => {
                if (!onContextMenu) return;
                e.preventDefault();
                e.stopPropagation();
                openRowContextMenu(e.clientX, e.clientY, row.id);
              }}
              onDragOver={(e) => {
                const types = Array.from(e.dataTransfer.types);
                if (
                  !dragPayloadRef.current &&
                  !types.includes(CATALOG_REORDER_MIME) &&
                  !types.includes(CATALOG_IDS_MIME)
                ) {
                  return;
                }
                const hint = resolveDropHint(
                  row,
                  e.clientY,
                  e.currentTarget as HTMLElement
                );
                if (!hint) {
                  setDropHint(null);
                  return;
                }
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDropHint((prev) => {
                  if (
                    prev &&
                    prev.kind === hint.kind &&
                    prev.id === hint.id &&
                    (prev.kind !== 'reorder' ||
                      hint.kind !== 'reorder' ||
                      prev.position === hint.position)
                  ) {
                    return prev;
                  }
                  return hint;
                });
              }}
              onDragLeave={(e) => {
                const related = e.relatedTarget;
                if (related instanceof Element && related.closest('[data-catalog-row-id]')) {
                  return;
                }
                setDropHint(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const hint =
                  resolveDropHint(row, e.clientY, e.currentTarget as HTMLElement) ||
                  dropHintRef.current;
                const ids = parseCatalogDragIds(e.dataTransfer);
                setDropHint(null);
                dragPayloadRef.current = null;
                if (!hint || ids.length === 0) return;

                if (hint.kind === 'into') {
                  const moveIds = ids.filter((id) => id !== hint.id);
                  if (moveIds.length === 0 || !onMove) return;
                  onMove(moveIds, hint.id);
                  return;
                }

                const draggedId = ids.length === 1 ? ids[0] : '';
                if (!draggedId) return;
                handleReorderDrop(draggedId, hint.id, hint.position);
              }}
            >
              {[
                <TableCell key="sel" width={32} className="pr-0 min-w-9 w-9">
                  <div
                    data-catalog-checkbox
                    className="touch-none flex h-full min-h-6 w-full -m-2 items-center justify-center"
                    onPointerDownCapture={(e) => handleCheckboxPointerDown(e, index)}
                  >
                    <Checkbox
                      aria-label={`Вибрати ${row.name}`}
                      isSelected={isSelected}
                      onValueChange={() => {
                        if (suppressCheckboxToggleRef.current) return;
                        toggleOne(row.id, index);
                      }}
                      size="sm"
                      classNames={{
                        base: 'pr-0 m-0',
                        wrapper: 'm-0',
                      }}
                    />
                  </div>
                </TableCell>,
                ...columns.map((col) => (
                  <TableCell key={col.key}>{renderCell(row, col.key)}</TableCell>
                )),
              ]}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
