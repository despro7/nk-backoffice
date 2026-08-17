import { useMemo } from 'react';
import type { CalendarDate } from '@internationalized/date';
import { getLocalTimeZone, today } from '@internationalized/date';
import type { DateRange } from '@react-types/datepicker';
import { createStandardDatePresets } from '@/lib/dateReportingUtils';
import ReportsFilterBuilder from '@/pages/Reports/shared/filters/ReportsFilterBuilder';
import {
  createDateRangeFilterConfig,
  createPeriodFilterConfig,
  createResetFilterConfig,
  createSingleDateFilterConfig,
} from '@/pages/Reports/shared/filters/ReportFilterPresets';
import type { ReportFilterConfig } from '@/pages/Reports/shared/filters/ReportFilterTypes';
import {
  findPresetKeyForRange,
  isMovementMobFilterDefault,
  isSingleDayRange,
} from '../WarehouseMovementMobUtils';

interface MovementMobFilterBarProps {
  dateRange: DateRange | null;
  datePresetKey: string | null;
  onDateRangeChange: (range: DateRange | null) => void;
  onDatePresetKeyChange: (key: string | null) => void;
  onReset: () => void;
  loading?: boolean;
}

export default function MovementMobFilterBar({
  dateRange,
  datePresetKey,
  onDateRangeChange,
  onDatePresetKeyChange,
  onReset,
  loading = false,
}: MovementMobFilterBarProps) {
  const datePresets = useMemo(() => createStandardDatePresets(), []);
  const maxDate = useMemo(() => today(getLocalTimeZone()), []);
  const singleDay = isSingleDayRange(dateRange);
  const showReset = !isMovementMobFilterDefault(dateRange, datePresetKey);

  const filters = useMemo<ReportFilterConfig[]>(() => {
    const configs: ReportFilterConfig[] = [
      createPeriodFilterConfig({
        selectedKey: datePresetKey,
        onChange: (selectedKey) => {
          if (!selectedKey || selectedKey === 'custom') return;
          onDatePresetKeyChange(selectedKey);
          const preset = datePresets.find((item) => item.key === selectedKey);
          if (preset) {
            onDateRangeChange(preset.getRange());
          }
        },
        options: [
          ...datePresets.map((p) => ({ key: p.key, label: p.label })),
          ...(datePresetKey === 'custom' || datePresetKey === null
            ? [{ key: 'custom', label: 'Обраний період' }]
            : []),
        ],
        className: 'flex-1 min-w-0',
        triggerClassName: 'h-10',
        iconName: 'calendar-days',
        placeholder: 'Період',
        ariaLabel: 'Період переміщень',
      }),
    ];

    if (showReset) {
      configs.push(
        createResetFilterConfig({
          onPress: onReset,
          disabled: loading,
          className:
            'h-10 px-3 gap-2 bg-danger-50 border-1.5 border-danger-100 text-danger-600 hover:bg-danger-100',
        }),
      );
    }

    if (singleDay) {
      configs.push(
        createSingleDateFilterConfig({
          value: dateRange?.start ?? null,
          onChange: (value) => {
            if (!value) return;
            const nextDate = value as CalendarDate;
            const nextRange = { start: nextDate, end: nextDate };
            onDateRangeChange(nextRange);
            onDatePresetKeyChange(findPresetKeyForRange(nextRange, datePresets) ?? 'custom');
          },
          maxValue: maxDate,
          className: 'w-full basis-full',
          triggerClassName: 'h-10 rounded-none',
          previousButtonClassName: 'h-10 rounded-r-none border-r-0',
          nextButtonClassName: 'h-10 rounded-l-none border-l-0',
        }),
      );
    } else {
      configs.push(
        createDateRangeFilterConfig({
          value: dateRange,
          onChange: (value) => {
            onDateRangeChange(value);
            if (!value?.start || !value?.end) {
              onDatePresetKeyChange(null);
              return;
            }
            onDatePresetKeyChange(findPresetKeyForRange(value, datePresets) ?? 'custom');
          },
          maxValue: maxDate,
          className: 'w-full basis-full',
          inputWrapperClassName: 'h-10',
        }),
      );
    }

    return configs;
  }, [
    datePresetKey,
    datePresets,
    dateRange,
    loading,
    maxDate,
    onDatePresetKeyChange,
    onDateRangeChange,
    onReset,
    showReset,
    singleDay,
  ]);

  return (
    <ReportsFilterBuilder
      filters={filters}
      className="flex flex-wrap gap-2 items-end"
    />
  );
}
