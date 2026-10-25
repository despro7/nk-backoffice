import { useEffect, useMemo, useState } from 'react';
import { Input, Select, SelectItem } from '@heroui/react';
import type { DateRange } from '@react-types/datepicker';
import type { Key, Selection } from '@react-types/shared';
import type { CalendarDate } from '@internationalized/date';
import { parseDate } from '@internationalized/date';
import { DynamicIcon } from 'lucide-react/dynamic';
import ReportDateRangeFilter from '@/pages/Reports/shared/filters/ReportDateRangeFilter';
import { calendarDateToIso } from '@/pages/Warehouse/WarehouseMovementMob/WarehouseMovementMobUtils';
import type { ReleaseHistoryFilters } from '../useReleaseSets';
import type { ReleaseHistoryOperationType } from '@shared/utils/releaseHistoryListQuery';
import {
  normalizeReleaseHistoryOperationTypesFilter,
  RELEASE_HISTORY_OPERATION_TYPES,
} from '@shared/utils/releaseHistoryListQuery';

const OPERATION_TYPE_OPTIONS: Array<{
  key: ReleaseHistoryOperationType;
  label: string;
  icon: 'package' | 'package-open' | 'refresh-cw';
}> = [
  { key: 'kit', label: 'Комплектування', icon: 'package' },
  { key: 'unkit', label: 'Розукомплектування', icon: 'package-open' },
  { key: 'correction', label: 'Коригування', icon: 'refresh-cw' },
];

function filtersToDateRange(filters: ReleaseHistoryFilters): DateRange | null {
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

export function hasActiveHistoryFilters(filters: ReleaseHistoryFilters): boolean {
  return Boolean(
    filters.search.trim()
    || filters.dateFrom
    || filters.dateTo
    || (filters.operationTypes.length > 0
      && filters.operationTypes.length < RELEASE_HISTORY_OPERATION_TYPES.length),
  );
}

interface Props {
  filters: ReleaseHistoryFilters;
  onFiltersChange: (filters: ReleaseHistoryFilters) => void;
  className?: string;
}

export function ReleaseHistoryToolbarFilters({ filters, onFiltersChange, className }: Props) {
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

  const patchFilters = (patch: Partial<ReleaseHistoryFilters>) => {
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

export const RELEASE_HISTORY_SORT_OPTIONS: Array<{
  key: ReleaseHistoryFilters['sortBy'];
  label: string;
  icon: 'calendar' | 'clock' | 'hash';
}> = [
  { key: 'operDate', label: 'Дата операції', icon: 'calendar' },
  { key: 'createdAt', label: 'Дата створення', icon: 'clock' },
  { key: 'docNumber', label: 'Номер документа', icon: 'hash' },
];

export function ReleaseHistorySortSelect({
  filters,
  onFiltersChange,
}: {
  filters: ReleaseHistoryFilters;
  onFiltersChange: (filters: ReleaseHistoryFilters) => void;
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
      {RELEASE_HISTORY_SORT_OPTIONS.map((option) => (
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

function parseOperationTypeSelection(keys: Selection): ReleaseHistoryOperationType[] {
  if (keys === 'all') {
    return [...RELEASE_HISTORY_OPERATION_TYPES];
  }
  return Array.from(keys).filter((
    key,
  ): key is ReleaseHistoryOperationType => (
    key === 'kit' || key === 'unkit' || key === 'correction'
  ));
}

export function ReleaseHistoryOperationTypesSelect({
  filters,
  onFiltersChange,
}: {
  filters: ReleaseHistoryFilters;
  onFiltersChange: (filters: ReleaseHistoryFilters) => void;
}) {
  const selectedKeys = useMemo(
    () => new Set<Key>(filters.operationTypes),
    [filters.operationTypes],
  );
  const showAllTypes = filters.operationTypes.length === 0;

  return (
    <Select
      aria-label="Типи операцій"
      size="sm"
      selectionMode="multiple"
      classNames={{
        base: 'max-w-52',
        trigger: 'data-[hover=true]:bg-white',
      }}
      placeholder="Усі типи"
      selectedKeys={selectedKeys}
      startContent={<DynamicIcon name="layers" className="w-4 h-4 text-default-400 shrink-0" />}
      renderValue={(items) => {
        if (showAllTypes || items.length === 0 || items.length >= OPERATION_TYPE_OPTIONS.length) {
          return <span className="text-sm">Усі типи</span>;
        }
        return (
          <span className="text-sm truncate">
            {items.map((item) => item.textValue).join(', ')}
          </span>
        );
      }}
      onSelectionChange={(keys) => {
        const operationTypes = normalizeReleaseHistoryOperationTypesFilter(
          parseOperationTypeSelection(keys),
        );
        onFiltersChange({ ...filters, operationTypes });
      }}
    >
      {OPERATION_TYPE_OPTIONS.map((option) => (
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
