import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Checkbox,
  Chip,
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
import {
  buildSpecColorMap,
  getSpecColor,
  specColorToClassNames,
  SPEC_COLOR_FALLBACK,
} from '@shared/utils/specColorPalette';
import { StockBadge } from '@/components/StockBadge';
import type { CatalogGoodDto } from '../ProductsTypes';
import { CATALOG_ROOT_ID } from '../ProductsTypes';
import { goodTypeLabel, isArchiveFolderName, createCatalogDragPreview } from '../ProductsUtils';

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
  /** Reorder товарів у межах папки (не в search mode) */
  onReorderGood?: (params: {
    id: string;
    beforeId?: string | null;
    afterId?: string | null;
  }) => void;
  /** Controlled sort (для кнопки скидання на ручний порядок) */
  sortDescriptor?: SortDescriptor;
  onSortChange?: (desc: SortDescriptor) => void;
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

function isInteractiveTarget(target: EventTarget | null): boolean {
  // SVG від Lucide — SVGElement, не HTMLElement
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'button, a, input, label, [role="checkbox"], [data-selection-ignore], [data-drag-handle]'
    )
  );
}

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
  sortDescriptor: sortDescriptorProp,
  onSortChange,
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
  const [dropIndicator, setDropIndicator] = useState<{
    id: string;
    position: 'before' | 'after';
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
      { key: 'weight', label: 'Вага, кг', sortable: true },
    );
    if (isFinishedProductsBranch) {
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
    } else if (isSearchMode) {
      cols.push({ key: 'inOrders', label: 'В замовленнях', sortable: true });
    }
    return cols;
  }, [isFinishedProductsBranch, isAdmin, isSearchMode]);

  const specColors = buildSpecColorMap(accPolicies ?? [], {
    theme: 'light',
    intensity: 'soft',
    border: true,
    pinnedHues,
  });

  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const dragSelectRef = useRef<{
    startIndex: number;
    mode: PaintMode;
    baseIds: string[];
    moved: boolean;
  } | null>(null);
  const suppressDragRef = useRef(false);
  const allIdsRef = useRef(displayIds);
  allIdsRef.current = displayIds;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    setAnchorIndex(null);
    dragSelectRef.current = null;
    setIsDragSelecting(false);
  }, [rows]);

  const toggleAll = () => {
    onSelectionChange(allSelected ? [] : displayIds);
    setAnchorIndex(null);
  };

  const toggleOne = (id: string, index: number) => {
    if (selectedSet.has(id)) {
      onSelectionChange(selectedIds.filter((x) => x !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
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
    const onPointerMove = (e: PointerEvent) => {
      const state = dragSelectRef.current;
      if (!state) return;

      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const rowEl = hit instanceof Element ? hit.closest('[data-catalog-row-id]') : null;
      if (!rowEl) return;
      const id = rowEl.getAttribute('data-catalog-row-id');
      if (!id) return;
      const index = allIdsRef.current.indexOf(id);
      if (index < 0) return;

      if (index !== state.startIndex) {
        state.moved = true;
        suppressDragRef.current = true;
        setIsDragSelecting(true);
      }
      if (!state.moved) return;

      applyPaint(state.startIndex, index, state.mode, state.baseIds);
      setAnchorIndex(state.startIndex);
    };

    const onPointerUp = () => {
      if (!dragSelectRef.current) return;
      dragSelectRef.current = null;
      setIsDragSelecting(false);
      window.setTimeout(() => {
        suppressDragRef.current = false;
      }, 0);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  const resolvePaintMode = (id: string, additive: boolean): PaintMode => {
    if (selectedSet.has(id)) return 'remove';
    if (additive) return 'add';
    return 'replace';
  };

  const handleRowPointerDown = (e: React.PointerEvent, index: number) => {
    if (e.button !== 0) return;
    if (isInteractiveTarget(e.target)) return;

    const id = displayIds[index];
    if (!id) return;
    const additive = e.ctrlKey || e.metaKey;

    if (e.shiftKey) {
      e.preventDefault();
      const from = anchorIndex ?? index;
      const mode = resolvePaintMode(id, additive);
      const base = mode === 'replace' ? [] : selectedIds;
      applyPaint(from, index, mode, base);
      return;
    }

    const mode = resolvePaintMode(id, additive);

    e.preventDefault();
    suppressDragRef.current = mode !== 'remove';
    dragSelectRef.current = {
      startIndex: index,
      mode,
      baseIds: selectedIds,
      moved: false,
    };

    if (additive) {
      if (mode === 'remove') {
        onSelectionChange(selectedIds.filter((x) => x !== id));
      } else {
        onSelectionChange([...new Set([...selectedIds, id])]);
      }
      setAnchorIndex(index);
    }
  };

  const goodsOnly = useMemo(
    () => sortedRows.filter((r) => !r.isGroup),
    [sortedRows]
  );

  const handleGoodReorderDrop = (
    draggedId: string,
    targetId: string,
    position: 'before' | 'after'
  ) => {
    if (!onReorderGood || isSearchMode || !isManualSort) return;
    const target = sortedRows.find((r) => r.id === targetId);
    const dragged = sortedRows.find((r) => r.id === draggedId);
    if (!target || !dragged || target.isGroup || dragged.isGroup) return;
    if (draggedId === targetId) return;

    const goods = goodsOnly.map((g) => g.id);
    const without = goods.filter((id) => id !== draggedId);
    const targetIdx = without.indexOf(targetId);
    if (targetIdx < 0) return;
    const insertAt = position === 'before' ? targetIdx : targetIdx + 1;
    const afterId = insertAt > 0 ? without[insertAt - 1] : null;
    const beforeId = insertAt < without.length ? without[insertAt] : null;
    onReorderGood({ id: draggedId, afterId, beforeId });
    setSortDescriptor({ column: 'sortOrder', direction: 'ascending' });
  };

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
          <div className="flex items-center gap-2 min-w-0">
            {!row.isGroup && onReorderGood && !isSearchMode && isManualSort && (
              <span
                data-drag-handle
                data-selection-ignore
                className="cursor-grab text-default-300 hover:text-default-500 shrink-0 touch-none"
                title="Перетягнути для сортування"
                draggable
                onPointerDown={(e) => {
                  // Не запускати paint-selection з рядка
                  e.stopPropagation();
                }}
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.setData(
                    'application/x-catalog-reorder-id',
                    row.id
                  );
                  e.dataTransfer.setData(
                    'application/x-catalog-ids',
                    JSON.stringify([row.id])
                  );
                  e.dataTransfer.effectAllowed = 'move';
                  const preview = createCatalogDragPreview(row.name);
                  e.dataTransfer.setDragImage(preview, 12, 12);
                }}
              >
                <DynamicIcon name="grip-vertical" size={14} />
              </span>
            )}
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 text-left hover:text-primary"
              onClick={() => (row.isGroup ? onOpenFolder(row.id) : onEdit(row.id))}
            >
              <DynamicIcon
                name={row.isGroup ? 'folder' : row.isKit ? 'package' : 'shopping-bag'}
                size={16}
                className="text-default-500 shrink-0"
              />
              <span className="truncate">{row.name}</span>
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
        return <span className="font-mono">{row.sku || '—'}</span>;
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
        return row.isGroup ? (
          <span className="text-default-300">—</span>
        ) : (
          <span className="tabular-nums">{formatWeightKg(row.weight)}</span>
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
          <TableColumn key="sel" width={40} allowsSorting={false}>
            <Checkbox
              aria-label="Вибрати всі"
              isSelected={allSelected}
              onValueChange={toggleAll}
              size="sm"
            />
          </TableColumn>,
          ...columns.map((col) => (
            <TableColumn
              key={col.key}
              allowsSorting={Boolean(col.sortable)}
              width={col.width}
            >
              {col.label}
            </TableColumn>
          )),
        ]}
      </TableHeader>
      <TableBody emptyContent={isSearchMode ? 'Нічого не знайдено' : 'Папка порожня'}>
        {sortedRows.map((row, index) => {
          const isSelected = selectedSet.has(row.id);
          const showDropBefore =
            dropIndicator?.id === row.id && dropIndicator.position === 'before';
          const showDropAfter =
            dropIndicator?.id === row.id && dropIndicator.position === 'after';
          return (
            <TableRow
              key={row.id}
              data-catalog-row-id={row.id}
              className={[
                isSelected
                  ? 'bg-gray-100 hover:bg-gray-200/60'
                  : 'hover:bg-gray-100/60 cursor-default',
                'outline-none transition-colors relative',
                showDropBefore ? 'shadow-[inset_0_2px_0_0_#f59e0b]' : '',
                showDropAfter ? 'shadow-[inset_0_-2px_0_0_#f59e0b]' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              draggable={!row.isGroup || true}
              onPointerDown={(e) => handleRowPointerDown(e, index)}
              onContextMenu={(e) => {
                if (!onContextMenu) return;
                e.preventDefault();
                e.stopPropagation();
                const ids =
                  selectedSet.has(row.id) && selectedIds.length > 0
                    ? selectedIds
                    : [row.id];
                if (!(selectedSet.has(row.id) && selectedIds.length > 1)) {
                  onSelectionChange([row.id]);
                }
                onContextMenu(e, ids.length > 0 ? ids : [row.id]);
              }}
              onDragStart={(e) => {
                if (suppressDragRef.current || dragSelectRef.current?.moved) {
                  e.preventDefault();
                  return;
                }
                const ids =
                  selectedSet.has(row.id) && selectedIds.length > 0
                    ? selectedIds
                    : [row.id];
                e.dataTransfer.setData('application/x-catalog-ids', JSON.stringify(ids));
                e.dataTransfer.effectAllowed = 'move';
                const labels = ids.map(
                  (dragId) => sortedRows.find((r) => r.id === dragId)?.name || dragId
                );
                const preview = createCatalogDragPreview(labels);
                e.dataTransfer.setDragImage(preview, 12, 12);
              }}
              onDragOver={(e) => {
                if (row.isGroup || isSearchMode || !isManualSort || !onReorderGood) return;
                const types = Array.from(e.dataTransfer.types);
                if (
                  !types.includes('application/x-catalog-reorder-id') &&
                  !types.includes('application/x-catalog-ids')
                ) {
                  return;
                }
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const position =
                  e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                setDropIndicator({ id: row.id, position });
              }}
              onDragLeave={() => {
                setDropIndicator((prev) => (prev?.id === row.id ? null : prev));
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDropIndicator(null);
                if (row.isGroup) {
                  // Drop на папку — move через дерево (foreign); тут ігноруємо reorder
                  return;
                }
                const reorderId =
                  e.dataTransfer.getData('application/x-catalog-reorder-id') ||
                  (() => {
                    try {
                      const ids = JSON.parse(
                        e.dataTransfer.getData('application/x-catalog-ids') || '[]'
                      ) as string[];
                      return ids.length === 1 ? ids[0] : '';
                    } catch {
                      return '';
                    }
                  })();
                if (!reorderId) return;
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const position =
                  e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
                handleGoodReorderDrop(reorderId, row.id, position);
              }}
            >
              {[
                <TableCell key="sel">
                  <Checkbox
                    aria-label={`Вибрати ${row.name}`}
                    isSelected={isSelected}
                    onValueChange={() => toggleOne(row.id, index)}
                    size="sm"
                  />
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
