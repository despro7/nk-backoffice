import { useCallback, useMemo, useState } from 'react';
import type { DateRange } from '@react-types/datepicker';
import { filterWarehouseBatches } from './warehouseBatchesFilters';
import type { WarehouseBatchListItem } from './WarehouseBatchesTypes';

interface UseWarehouseBatchesFiltersOptions {
  onlyWithStock: boolean;
  setOnlyWithStock: (value: boolean) => void;
}

export function useWarehouseBatchesFilters(
  items: WarehouseBatchListItem[],
  options: UseWarehouseBatchesFiltersOptions,
) {
  const { onlyWithStock, setOnlyWithStock } = options;
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [datePresetKey, setDatePresetKey] = useState<string | null>(null);
  const [columnReorderEnabled, setColumnReorderEnabled] = useState(false);

  const filteredItems = useMemo(
    () => filterWarehouseBatches(items, { searchQuery, dateRange }),
    [items, searchQuery, dateRange],
  );

  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setDateRange(null);
    setDatePresetKey(null);
    setOnlyWithStock(true);
  }, [setOnlyWithStock]);

  const hasActiveFilters = Boolean(
    searchQuery.trim()
    || dateRange?.start
    || dateRange?.end
    || !onlyWithStock,
  );

  return {
    filteredItems,
    onlyWithStock,
    setOnlyWithStock,
    searchQuery,
    setSearchQuery,
    dateRange,
    setDateRange,
    datePresetKey,
    setDatePresetKey,
    columnReorderEnabled,
    setColumnReorderEnabled,
    resetFilters,
    hasActiveFilters,
  };
}
