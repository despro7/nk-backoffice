import { useCallback, useMemo, useState } from 'react';
import type { DateRange } from '@react-types/datepicker';
import {
  areBatchKindsDefault,
  filterWarehouseBatches,
} from './warehouseBatchesFilters';
import type {
  WarehouseBatchKind,
  WarehouseBatchListItem,
  WarehouseBatchNegativeMode,
} from './WarehouseBatchesTypes';
import { WAREHOUSE_BATCH_DEFAULT_KINDS } from './WarehouseBatchesTypes';

interface UseWarehouseBatchesFiltersOptions {
  onlyWithStock: boolean;
  setOnlyWithStock: (value: boolean) => void;
  negativeMode: WarehouseBatchNegativeMode;
  setNegativeMode: (value: WarehouseBatchNegativeMode) => void;
  batchKinds: WarehouseBatchKind[];
  setBatchKinds: (value: WarehouseBatchKind[]) => void;
}

export function useWarehouseBatchesFilters(
  items: WarehouseBatchListItem[],
  options: UseWarehouseBatchesFiltersOptions,
) {
  const {
    onlyWithStock,
    setOnlyWithStock,
    negativeMode,
    setNegativeMode,
    batchKinds,
    setBatchKinds,
  } = options;
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
    setNegativeMode('all');
    setBatchKinds([...WAREHOUSE_BATCH_DEFAULT_KINDS]);
  }, [setBatchKinds, setNegativeMode, setOnlyWithStock]);

  const hasActiveFilters = Boolean(
    searchQuery.trim()
    || dateRange?.start
    || dateRange?.end
    || !onlyWithStock
    || negativeMode !== 'all'
    || !areBatchKindsDefault(batchKinds),
  );

  return {
    filteredItems,
    onlyWithStock,
    setOnlyWithStock,
    negativeMode,
    setNegativeMode,
    batchKinds,
    setBatchKinds,
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
