import { useCallback, useEffect, useMemo, useState } from 'react';

export function rangeIds(ids: string[], from: number, to: number): string[] {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  return ids.slice(start, end + 1);
}

export interface UseTableSelectionOptions {
  /**
   * Повний набір id (усі вкладки). Якщо задано — вибір не стирається
   * при зміні visibleIds, prune йде лише проти allIds.
   */
  allIds?: string[];
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

/** Shift-діапазон, select-all і ctrl/cmd-додавання — як у таблиці каталогу. */
export function useTableSelection(visibleIds: string[], options: UseTableSelectionOptions = {}) {
  const { allIds, selectedIds: controlledIds, onSelectionChange } = options;
  const isControlled = controlledIds != null && onSelectionChange != null;

  const [internalIds, setInternalIds] = useState<string[]>([]);
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);

  const selectedIds = isControlled ? controlledIds : internalIds;
  const setSelectedIds = useCallback(
    (next: string[] | ((prev: string[]) => string[])) => {
      if (isControlled) {
        const resolved = typeof next === 'function' ? next(controlledIds) : next;
        onSelectionChange(resolved);
        return;
      }
      setInternalIds(next);
    },
    [isControlled, controlledIds, onSelectionChange],
  );

  const pruneTo = allIds ?? visibleIds;
  const pruneSet = useMemo(() => new Set(pruneTo), [pruneTo]);

  useEffect(() => {
    if (isControlled) return;
    setInternalIds((prev) => {
      const next = prev.filter((id) => pruneSet.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [isControlled, pruneSet]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleSet = useMemo(() => new Set(visibleIds), [visibleIds]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  const visibleSelectedIds = useMemo(
    () => visibleIds.filter((id) => selectedSet.has(id)),
    [visibleIds, selectedSet],
  );
  const isIndeterminate = visibleSelectedIds.length > 0 && !allSelected;

  const clearVisible = useCallback(() => {
    setSelectedIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    setAnchorIndex(null);
  }, [setSelectedIds, visibleSet]);

  const clear = useCallback(() => {
    setSelectedIds([]);
    setAnchorIndex(null);
  }, [setSelectedIds]);

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...visibleIds])]);
    }
    setAnchorIndex(null);
  }, [allSelected, setSelectedIds, visibleSet, visibleIds]);

  const toggleOne = useCallback(
    (id: string, index: number, modifiers?: { shift?: boolean; additive?: boolean }) => {
      if (modifiers?.shift && anchorIndex != null) {
        const ranged = rangeIds(visibleIds, anchorIndex, index);
        setSelectedIds((current) => {
          const kept = current.filter((x) => !visibleSet.has(x));
          return [...kept, ...ranged];
        });
        return;
      }

      setSelectedIds((current) => {
        if (modifiers?.additive) {
          return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
        }
        if (current.includes(id)) return current.filter((x) => x !== id);
        return [...current, id];
      });
      setAnchorIndex(index);
    },
    [anchorIndex, visibleIds, visibleSet, setSelectedIds],
  );

  const selectIds = useCallback((ids: string[]) => {
    setSelectedIds(ids);
    const idx = visibleIds.indexOf(ids[0] ?? '');
    setAnchorIndex(idx >= 0 ? idx : null);
  }, [setSelectedIds, visibleIds]);

  return {
    selectedIds,
    selectedSet,
    visibleSelectedIds,
    allSelected,
    isIndeterminate,
    toggleAll,
    toggleOne,
    selectIds,
    clear,
    clearVisible,
    setSelectedIds,
  };
}
