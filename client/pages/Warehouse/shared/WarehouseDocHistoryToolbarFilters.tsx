import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select, SelectItem } from '@heroui/react';
import type { DateRange } from '@react-types/datepicker';
import type { CalendarDate } from '@internationalized/date';
import { parseDate } from '@internationalized/date';
import { DynamicIcon } from 'lucide-react/dynamic';
import ReportDateRangeFilter from '@/pages/Reports/shared/filters/ReportDateRangeFilter';
import { calendarDateToIso } from '@/pages/Warehouse/WarehouseMovementMob/WarehouseMovementMobUtils';
import {
  DEFAULT_WAREHOUSE_DOC_HISTORY_FILTERS,
  hasActiveWarehouseDocHistoryFilters,
  type WarehouseDocHistoryFilters,
  type WarehouseDocHistorySortBy,
} from '@shared/utils/warehouseDocHistoryListQuery';

function filtersToDateRange(filters: WarehouseDocHistoryFilters): DateRange | null {
  if (!filters.dateFrom && !filters.dateTo) return null;
  const parseYmd = (ymd: string | null): CalendarDate | undefined => {
    if (!ymd) return undefined;
    try {
      return parseDate(ymd);
    } catch {
      return undefined;
    }
  };
  const start = parseYmd(filters.dateFrom);
  const end = parseYmd(filters.dateTo ?? filters.dateFrom);
  if (!start || !end) return null;
  return { start, end };
}

function dateRangeToFilterDates(range: DateRange | null): { dateFrom: string | null; dateTo: string | null } {
  if (!range?.start || !range?.end) {
    return { dateFrom: null, dateTo: null };
  }
  return {
    dateFrom: calendarDateToIso(range.start as CalendarDate),
    dateTo: calendarDateToIso(range.end as CalendarDate),
  };
}

export const WAREHOUSE_DOC_HISTORY_SORT_OPTIONS: Array<{
  key: WarehouseDocHistorySortBy;
  label: string;
  icon: 'calendar' | 'clock' | 'hash';
}> = [
  { key: 'operDate', label: 'Дата операції', icon: 'calendar' },
  { key: 'createdAt', label: 'Дата створення', icon: 'clock' },
  { key: 'docNumber', label: 'Номер документа', icon: 'hash' },
];

interface ToolbarProps {
  filters: WarehouseDocHistoryFilters;
  onFiltersChange: (filters: WarehouseDocHistoryFilters) => void;
  className?: string;
}

export function WarehouseDocHistoryToolbarFilters({ filters, onFiltersChange, className }: ToolbarProps) {
  const [searchDraft, setSearchDraft] = useState(filters.search);

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchDraft === filters.search) return;
      onFiltersChange({ ...filters, search: searchDraft });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchDraft, filters, onFiltersChange]);

  const dateRangeValue = useMemo(() => filtersToDateRange(filters), [filters]);

  const patchFilters = (patch: Partial<WarehouseDocHistoryFilters>) => {
    onFiltersChange({ ...filters, ...patch });
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
      <Input
        aria-label="Пошук"
        placeholder="№, SKU, партія…"
        value={searchDraft}
        onValueChange={setSearchDraft}
        startContent={<DynamicIcon name="search" className="w-4 h-4 text-default-400" />}
        classNames={{
          base: 'w-full max-w-64',
          input: 'w-full',
          inputWrapper: 'w-full data-[hover=true]:bg-white',
        }}
      />
      <Select
        aria-label="Фільтр дат за"
        classNames={{
          base: 'w-46',
          trigger: 'data-[hover=true]:bg-white',
        }}
        selectedKeys={new Set([filters.dateField])}
        startContent={<DynamicIcon name="calendar-clock" className="w-4 h-4 text-default-400 shrink-0" />}
        onSelectionChange={(keys) => {
          const value = Array.from(keys)[0];
          if (value === 'createdAt' || value === 'operDate') {
            patchFilters({ dateField: value });
          }
        }}
      >
        <SelectItem key="operDate" textValue="Дата операції">Дата операції</SelectItem>
        <SelectItem key="createdAt" textValue="Дата створення">Дата створення</SelectItem>
      </Select>
      <ReportDateRangeFilter
        value={dateRangeValue}
        inputWrapperClassName="hover:bg-white"
        onChange={(range) => {
          const { dateFrom, dateTo } = dateRangeToFilterDates(range);
          patchFilters({ dateFrom, dateTo });
        }}
      />
    </div>
  );
}

export function WarehouseDocHistorySortSelect({
  filters,
  onFiltersChange,
}: {
  filters: WarehouseDocHistoryFilters;
  onFiltersChange: (filters: WarehouseDocHistoryFilters) => void;
}) {
  return (
    <Select
      aria-label="Сортування"
      size="sm"
      classNames={{
        base: 'max-w-46',
        trigger: 'data-[hover=true]:bg-white',
      }}
      selectedKeys={new Set([filters.sortBy])}
      startContent={<DynamicIcon name="arrow-down-up" className="w-4 h-4 text-default-400 shrink-0" />}
      onSelectionChange={(keys) => {
        const value = Array.from(keys)[0];
        if (value === 'operDate' || value === 'createdAt' || value === 'docNumber') {
          onFiltersChange({ ...filters, sortBy: value });
        }
      }}
    >
      {WAREHOUSE_DOC_HISTORY_SORT_OPTIONS.map((option) => (
        <SelectItem
          key={option.key}
          textValue={option.label}
          startContent={<DynamicIcon name={option.icon} className="w-3.5 h-3.5 text-default-500" />}
        >
          {option.label}
        </SelectItem>
      ))}
    </Select>
  );
}

export function WarehouseDocHistoryResetFiltersButton({
  filters,
  onReset,
}: {
  filters: WarehouseDocHistoryFilters;
  onReset: () => void;
}) {
  if (!hasActiveWarehouseDocHistoryFilters(filters)) return null;
  return (
    <Button
      variant="flat"
      size="sm"
      color="danger"
      startContent={<DynamicIcon name="filter-x" className="w-3.5 h-3.5" />}
      onPress={onReset}
    >
      Скинути фільтри
    </Button>
  );
}

export {
  DEFAULT_WAREHOUSE_DOC_HISTORY_FILTERS,
  hasActiveWarehouseDocHistoryFilters,
  type WarehouseDocHistoryFilters,
};
