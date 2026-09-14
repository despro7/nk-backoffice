import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CalendarDate } from '@internationalized/date';
import { getLocalTimeZone, parseDate, today } from '@internationalized/date';
import type { DateRange } from '@react-types/datepicker';
import {
  createDateRangeFilterConfig,
  createPeriodFilterConfig,
  type ReportFilterConfig,
} from '@/pages/Reports/shared/filters';
import { formatCalendarDateValue } from '@/pages/Reports/shared/ReportsSharedUtils';
import {
  findHrWorkWeekContainingDate,
  hrWorkWeekDateRange,
  listHrWorkWeeksForMonth,
  matchHrWorkWeekPresetKey,
  type HrWorkWeekPeriod,
} from '@shared/utils/hrWorkWeekPeriods';

function weekToDateRange(week: HrWorkWeekPeriod, maxDate: CalendarDate): DateRange {
  const maxDateStr = formatCalendarDateValue(maxDate);
  const { startDate, endDate } = hrWorkWeekDateRange(week, maxDateStr);
  const start = parseDate(startDate);
  const endRaw = parseDate(endDate);
  const end = endRaw.compare(maxDate) > 0 ? maxDate : endRaw;
  return { start, end };
}

export interface UseHrWorkWeekPeriodFilterOptions {
  filterClassName?: string;
  periodTriggerClassName?: string;
  dateRangeTriggerClassName?: string;
}

export interface UseHrWorkWeekPeriodFilterResult {
  dateRange: DateRange | null;
  datePresetKey: string | null;
  workWeekPeriods: HrWorkWeekPeriod[];
  activeMonth: string;
  maxDate: CalendarDate;
  maxDateStr: string;
  dateFrom: string | null;
  dateTo: string | null;
  initialized: boolean;
  filters: ReportFilterConfig[];
  setDateRange: (value: DateRange | null) => void;
  setDatePresetKey: (key: string | null) => void;
}

export function useHrWorkWeekPeriodFilter(
  options: UseHrWorkWeekPeriodFilterOptions = {},
): UseHrWorkWeekPeriodFilterResult {
  const {
    filterClassName = 'min-w-[180px]',
    periodTriggerClassName = 'h-10 px-3! rounded-md hover:bg-gray-50! transition-colors!',
    dateRangeTriggerClassName = 'h-10 px-3! rounded-md hover:bg-gray-50! transition-colors!',
  } = options;

  const maxDate = useMemo(() => today(getLocalTimeZone()), []);
  const maxDateStr = useMemo(() => formatCalendarDateValue(maxDate), [maxDate]);

  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [datePresetKey, setDatePresetKey] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const activeMonth = dateRange?.end
    ? formatCalendarDateValue(dateRange.end).slice(0, 7)
    : maxDateStr.slice(0, 7);

  const workWeekPeriods = useMemo(
    () => listHrWorkWeeksForMonth(activeMonth),
    [activeMonth],
  );

  useEffect(() => {
    if (initialized || workWeekPeriods.length === 0) return;
    const currentWeek = findHrWorkWeekContainingDate(workWeekPeriods, maxDateStr);
    if (!currentWeek) return;
    setDateRange(weekToDateRange(currentWeek, maxDate));
    setDatePresetKey(currentWeek.id);
    setInitialized(true);
  }, [initialized, maxDate, maxDateStr, workWeekPeriods]);

  const handlePresetChange = useCallback((key: string | null) => {
    if (!key || key === 'custom') return;
    const week = workWeekPeriods.find((item) => item.id === key);
    if (!week) return;
    setDatePresetKey(key);
    setDateRange(weekToDateRange(week, maxDate));
  }, [maxDate, workWeekPeriods]);

  const handleDateRangeChange = useCallback((value: DateRange | null) => {
    setDateRange(value);
    const dateFrom = value?.start ? formatCalendarDateValue(value.start) : null;
    const dateTo = value?.end ? formatCalendarDateValue(value.end) : null;
    setDatePresetKey(matchHrWorkWeekPresetKey(dateFrom, dateTo, workWeekPeriods, maxDateStr));
  }, [maxDateStr, workWeekPeriods]);

  const dateFrom = dateRange?.start ? formatCalendarDateValue(dateRange.start) : null;
  const dateTo = dateRange?.end ? formatCalendarDateValue(dateRange.end) : null;

  const filters = useMemo(
    () => [
      createPeriodFilterConfig({
        selectedKey: datePresetKey,
        onChange: handlePresetChange,
        options: [
          ...workWeekPeriods.map((week) => ({ key: week.id, label: week.label })),
          ...(datePresetKey === 'custom' ? [{ key: 'custom', label: 'Обраний період' }] : []),
        ],
        ariaLabel: 'Робочий тиждень',
        placeholder: 'Робочий тиждень',
        iconName: 'calendar-days',
        size: 'sm',
        className: filterClassName,
        triggerClassName: periodTriggerClassName,
      }),
      createDateRangeFilterConfig({
        value: dateRange,
        onChange: handleDateRangeChange,
        maxValue: maxDate,
        size: 'sm',
        inputWrapperClassName: dateRangeTriggerClassName,
      }),
    ],
    [
      datePresetKey,
      dateRange,
      dateRangeTriggerClassName,
      filterClassName,
      handleDateRangeChange,
      handlePresetChange,
      maxDate,
      periodTriggerClassName,
      workWeekPeriods,
    ],
  );

  return {
    dateRange,
    datePresetKey,
    workWeekPeriods,
    activeMonth,
    maxDate,
    maxDateStr,
    dateFrom,
    dateTo,
    initialized,
    filters,
    setDateRange,
    setDatePresetKey,
  };
}
