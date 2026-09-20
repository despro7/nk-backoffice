import { useMemo } from 'react';
import { Input, Switch } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { DateRange } from '@react-types/datepicker';
import { createStandardDatePresets } from '@/lib/dateReportingUtils';
import {
  createDateRangeFilterConfig,
  createPeriodFilterConfig,
  createResetFilterConfig,
  ReportsFilterBuilder,
  type ReportFilterConfig,
} from '@/pages/Reports/shared/filters';

interface WarehouseBatchesFilterBarProps {
  onlyWithStock: boolean;
  onOnlyWithStockChange: (value: boolean) => void;
  columnReorderEnabled: boolean;
  onColumnReorderEnabledChange: (value: boolean) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  dateRange: DateRange | null;
  onDateRangeChange: (value: DateRange | null) => void;
  datePresetKey: string | null;
  onDatePresetKeyChange: (value: string | null) => void;
  onReset: () => void;
  loading?: boolean;
  hasActiveFilters?: boolean;
}

export function WarehouseBatchesFilterBar({
  onlyWithStock,
  onOnlyWithStockChange,
  columnReorderEnabled,
  onColumnReorderEnabledChange,
  searchQuery,
  onSearchQueryChange,
  dateRange,
  onDateRangeChange,
  datePresetKey,
  onDatePresetKeyChange,
  onReset,
  loading = false,
  hasActiveFilters = false,
}: WarehouseBatchesFilterBarProps) {
  const datePresets = useMemo(() => createStandardDatePresets(), []);

  const filters = useMemo<ReportFilterConfig[]>(() => {
    const configs: ReportFilterConfig[] = [
      {
        type: 'custom',
        key: 'search',
        className: 'min-w-0 w-56 sm:w-64 shrink-0',
        render: () => (
          <Input
            aria-label="Пошук партій"
            placeholder="Номер партії, товар, ШК…"
            isClearable
            value={searchQuery}
            onValueChange={onSearchQueryChange}
            isDisabled={loading}
            startContent={<DynamicIcon name="search" size={16} className="text-default-400 shrink-0" />}
            classNames={{
              inputWrapper: 'h-10 data-[hover=true]:bg-white/80 data-[focus=true]:bg-white',
            }}
          />
        ),
      },
      createPeriodFilterConfig({
        selectedKey: datePresetKey,
        onChange: (key) => {
          if (!key || key === 'custom') return;
          const preset = datePresets.find((item) => item.key === key);
          onDatePresetKeyChange(key);
          if (preset) onDateRangeChange(preset.getRange());
        },
        options: [
          ...datePresets.map((preset) => ({ key: preset.key, label: preset.label })),
          ...(datePresetKey === 'custom' || datePresetKey === null
            ? [{ key: 'custom', label: 'Обраний період' }]
            : []),
        ],
        className: 'min-w-0 w-auto shrink-0',
        triggerClassName: 'h-10 min-w-50 data-[hover=true]:bg-white/80 data-[open=true]:bg-white',
        iconName: 'calendar-days',
        placeholder: 'Період',
        ariaLabel: 'Період виготовлення',
      }),
      createDateRangeFilterConfig({
        value: dateRange,
        onChange: (value) => {
          onDateRangeChange(value);
          if (!value?.start || !value?.end) {
            onDatePresetKeyChange(null);
            return;
          }
          onDatePresetKeyChange('custom');
        },
        className: 'w-auto shrink-0',
        inputWrapperClassName: 'h-10 hover:bg-white/80! data-[focus=true]:bg-white',
      }),
    ];

    if (hasActiveFilters) {
      configs.push(
        createResetFilterConfig({
          onPress: onReset,
          disabled: loading,
          className:
            'h-10 px-3 gap-2 bg-danger-50 border-1.5 border-danger-400/50 text-danger-400 hover:bg-danger-100',
        }),
      );
    }

    return configs;
  }, [
    datePresetKey,
    datePresets,
    dateRange,
    hasActiveFilters,
    loading,
    onDatePresetKeyChange,
    onDateRangeChange,
    onReset,
    onSearchQueryChange,
    searchQuery,
  ]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <Switch
          size="sm"
          classNames={{
            wrapper: 'border border-white/75',
          }}
          isSelected={onlyWithStock}
          onValueChange={onOnlyWithStockChange}
          isDisabled={loading}
        >
          Лише з залишками
        </Switch>
        <Switch
          size="sm"
          color="warning"
          classNames={{
            wrapper: 'border border-white/75',
          }}
          isSelected={columnReorderEnabled}
          onValueChange={onColumnReorderEnabledChange}
          isDisabled={loading}
        >
          Змінити порядок колонок
        </Switch>
      </div>

      <ReportsFilterBuilder
        filters={filters}
        className="flex flex-wrap gap-2 items-end"
      />
    </div>
  );
}
