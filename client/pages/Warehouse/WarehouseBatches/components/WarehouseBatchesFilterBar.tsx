import { useMemo } from 'react';
import { Button, Input, Switch, Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { DateRange } from '@react-types/datepicker';
import { createStandardDatePresets } from '@/lib/dateReportingUtils';
import {
  createDateRangeFilterConfig,
  createPeriodFilterConfig,
  createResetFilterConfig,
  createStatusFilterConfig,
  ReportsFilterBuilder,
  type ReportFilterConfig,
} from '@/pages/Reports/shared/filters';
import type {
  WarehouseBatchKind,
  WarehouseBatchNegativeMode,
} from '../WarehouseBatchesTypes';
import {
  WAREHOUSE_BATCH_DEFAULT_KINDS,
  WAREHOUSE_BATCH_KIND_OPTIONS,
  WAREHOUSE_BATCH_NEGATIVE_MODE_OPTIONS,
} from '../WarehouseBatchesTypes';

interface WarehouseBatchesFilterBarProps {
  onlyWithStock: boolean;
  onOnlyWithStockChange: (value: boolean) => void;
  negativeMode: WarehouseBatchNegativeMode;
  onNegativeModeChange: (value: WarehouseBatchNegativeMode) => void;
  batchKinds: WarehouseBatchKind[];
  onBatchKindsChange: (value: WarehouseBatchKind[]) => void;
  columnReorderEnabled: boolean;
  onColumnReorderEnabledChange: (value: boolean) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  dateRange: DateRange | null;
  onDateRangeChange: (value: DateRange | null) => void;
  datePresetKey: string | null;
  onDatePresetKeyChange: (value: string | null) => void;
  onReset: () => void;
  onClearCache: () => void;
  cacheRefreshing?: boolean;
  loading?: boolean;
  hasActiveFilters?: boolean;
}

export function WarehouseBatchesFilterBar({
  onlyWithStock,
  onOnlyWithStockChange,
  negativeMode,
  onNegativeModeChange,
  batchKinds,
  onBatchKindsChange,
  columnReorderEnabled,
  onColumnReorderEnabledChange,
  searchQuery,
  onSearchQueryChange,
  dateRange,
  onDateRangeChange,
  datePresetKey,
  onDatePresetKeyChange,
  onReset,
  onClearCache,
  cacheRefreshing = false,
  loading = false,
  hasActiveFilters = false,
}: WarehouseBatchesFilterBarProps) {
  const datePresets = useMemo(() => createStandardDatePresets(), []);
  const batchKindKeys = useMemo(() => new Set(batchKinds), [batchKinds]);

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
      {
        type: 'multiSelect',
        key: 'batchKinds',
        ariaLabel: 'Типи партій',
        placeholder: 'Типи партій',
        selectedKeys: batchKindKeys,
        onChange: (keys) => {
          const next = Array.from(keys).filter((key): key is WarehouseBatchKind => (
            WAREHOUSE_BATCH_KIND_OPTIONS.some((option) => option.key === key)
          ));
          // Порожній вибір = дефолт (Товари + Комплекти), щоб не ловити «порожній список»
          onBatchKindsChange(
            next.length > 0 ? next : [...WAREHOUSE_BATCH_DEFAULT_KINDS],
          );
        },
        options: WAREHOUSE_BATCH_KIND_OPTIONS.map((option) => ({
          key: option.key,
          label: option.label,
        })),
        iconName: 'layers',
        className: 'min-w-0 w-52 sm:w-56 shrink-0',
        triggerClassName: 'h-10 data-[hover=true]:bg-white/80 data-[open=true]:bg-white',
        compactTrigger: true,
      },
      createStatusFilterConfig({
        key: 'negativeMode',
        selectedKey: negativeMode,
        onChange: (key) => {
          if (key === 'without' || key === 'only' || key === 'all') {
            onNegativeModeChange(key);
          }
        },
        options: WAREHOUSE_BATCH_NEGATIVE_MODE_OPTIONS.map((option) => ({
          key: option.key,
          label: option.label,
        })),
        className: 'min-w-0 w-44 shrink-0',
        triggerClassName: 'h-10 min-w-40 data-[hover=true]:bg-white/80 data-[open=true]:bg-white',
        iconName: 'filter',
        placeholder: 'Мінуси',
        ariaLabel: 'Фільтр мінусових залишків',
      }),
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
    batchKindKeys,
    datePresetKey,
    datePresets,
    dateRange,
    hasActiveFilters,
    loading,
    negativeMode,
    onBatchKindsChange,
    onDatePresetKeyChange,
    onDateRangeChange,
    onNegativeModeChange,
    onReset,
    onSearchQueryChange,
    searchQuery,
  ]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-6">
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
        <Tooltip
          content="Скинути кеш списку (~5 хв) і оновити дані з Dilovod та штрих-коди з БД"
          placement="top"
          delay={300}
          classNames={{
            content: 'text-xs',
          }}
        >
          <Button
            aria-label="Скинути кеш"
            onPress={onClearCache}
            isDisabled={loading || cacheRefreshing}
            size="sm"
            variant="flat"
            className="h-6 min-w-6 px-2 gap-1 bg-white border border-default/75 text-default-700 hover:bg-default-100"
            startContent={<DynamicIcon name={cacheRefreshing ? 'loader-2' : 'refresh-cw'} size={13} className={cacheRefreshing ? 'animate-spin' : undefined} />}
          >
            Скинути кеш
          </Button>
        </Tooltip>
      </div>

      <ReportsFilterBuilder
        filters={filters}
        className="flex flex-wrap gap-2 items-end"
      />
    </div>
  );
}
