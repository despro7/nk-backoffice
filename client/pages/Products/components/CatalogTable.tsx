import { useEffect, useRef, useState } from 'react';
import { Checkbox, Chip, Spinner, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { CatalogGoodDto } from '../ProductsTypes';
import { goodTypeLabel, isArchiveFolderName, createCatalogDragPreview } from '../ProductsUtils';

interface CatalogTableProps {
  rows: CatalogGoodDto[];
  loading?: boolean;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onOpenFolder: (id: string) => void;
  onEdit: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent, ids: string[]) => void;
  isSearchMode?: boolean;
}

type PaintMode = 'replace' | 'add' | 'remove';

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('button, a, input, label, [role="checkbox"], [data-selection-ignore]')
  );
}

function rangeIds(ids: string[], from: number, to: number): string[] {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  return ids.slice(start, end + 1);
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
}: CatalogTableProps) {
  const selectedSet = new Set(selectedIds);
  const allIds = rows.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedSet.has(id));

  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const dragSelectRef = useRef<{
    startIndex: number;
    mode: PaintMode;
    baseIds: string[];
    moved: boolean;
  } | null>(null);
  const suppressDragRef = useRef(false);
  const allIdsRef = useRef(allIds);
  allIdsRef.current = allIds;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    setAnchorIndex(null);
    dragSelectRef.current = null;
    setIsDragSelecting(false);
  }, [rows]);

  const toggleAll = () => {
    onSelectionChange(allSelected ? [] : allIds);
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
      // Без переходу на інший рядок — не змінюємо selection (звичайний клік = noop)
      if (!state.moved) return;

      applyPaint(state.startIndex, index, state.mode, state.baseIds);
      setAnchorIndex(state.startIndex);
    };

    const onPointerUp = () => {
      if (!dragSelectRef.current) return;
      // Звичайний клік без drag нічого не змінює; Ctrl/Cmd уже на pointerdown
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

    const id = allIds[index];
    if (!id) return;
    const additive = e.ctrlKey || e.metaKey;

    // Shift+клік — діапазон; режим від стану клікнутого рядка
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
    // На виділеному (потенційний remove-drag) лишаємо шанс HTML5 DnD
    suppressDragRef.current = mode !== 'remove';
    dragSelectRef.current = {
      startIndex: index,
      mode,
      baseIds: selectedIds,
      moved: false,
    };

    // Лише Ctrl/Cmd-toggle на клік; звичайний клік — noop (зміна лише через drag)
    if (additive) {
      if (mode === 'remove') {
        onSelectionChange(selectedIds.filter((x) => x !== id));
      } else {
        onSelectionChange([...new Set([...selectedIds, id])]);
      }
      setAnchorIndex(index);
    }
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner label="Завантаження…" />
      </div>
    );
  }

  return (
    <Table
      aria-label="Каталог товарів"
      removeWrapper
      className={`min-h-[200px] ${isDragSelecting ? 'select-none' : ''}`}
    >
      <TableHeader>
        <TableColumn width={40}>
          <Checkbox
            aria-label="Вибрати всі"
            isSelected={allSelected}
            onValueChange={toggleAll}
            size="sm"
          />
        </TableColumn>
        <TableColumn>Назва</TableColumn>
        <TableColumn>SKU</TableColumn>
        <TableColumn>Тип</TableColumn>
        <TableColumn width={80}> </TableColumn>
      </TableHeader>
      <TableBody emptyContent={isSearchMode ? 'Нічого не знайдено' : 'Папка порожня'}>
        {rows.map((row, index) => {
          const isSelected = selectedSet.has(row.id);
          return (
            <TableRow
              key={row.id}
              data-catalog-row-id={row.id}
              className={[
                
                isSelected ? 'bg-primary-50 hover:bg-primary-100/60' : 'hover:bg-default-100/50 cursor-default',
                'outline-none transition-colors',
              ]
                .filter(Boolean)
                .join(' ')}
              draggable
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
                  (dragId) => rows.find((r) => r.id === dragId)?.name || dragId
                );
                const preview = createCatalogDragPreview(labels);
                e.dataTransfer.setDragImage(preview, 12, 12);
              }}
            >
              <TableCell>
                <Checkbox
                  aria-label={`Вибрати ${row.name}`}
                  isSelected={isSelected}
                  onValueChange={() => toggleOne(row.id, index)}
                  size="sm"
                />
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  className="flex items-center gap-2 text-left hover:text-primary"
                  onClick={() => (row.isGroup ? onOpenFolder(row.id) : onEdit(row.id))}
                >
                  <DynamicIcon
                    name={row.isGroup ? (isArchiveFolderName(row.name) ? 'archive' : 'folder') : row.isKit ? 'package' : 'shopping-bag'}
                    size={16}
                    className="text-default-500"
                  />
                  <span>{row.name}</span>
                  {row.delMark && (
                    <Chip size="sm" variant="flat" color="danger" classNames={{ base: 'bg-danger-500 text-white px-1 py-0.5 h-5', content: 'font-semibold text-[10px]' }}>OFF</Chip>
                  )}
                </button>
              </TableCell>
              <TableCell className="font-mono text-xs">{row.sku || '—'}</TableCell>
              <TableCell>
                <Chip size="sm" variant="flat" color={row.isGroup ? 'default' : row.isKit ? 'secondary' : 'primary'}>
                  {goodTypeLabel(row)}
                </Chip>
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  className="rounded p-1 hover:bg-default-100"
                  aria-label="Редагувати"
                  onClick={() => onEdit(row.id)}
                >
                  <DynamicIcon name="pencil" size={16} />
                </button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
