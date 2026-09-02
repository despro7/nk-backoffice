import { useMemo } from 'react';
import { Button, Switch } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { DateRange } from '@react-types/datepicker';
import type { CalendarDate } from '@internationalized/date';
import { getLocalTimeZone, today } from '@internationalized/date';
import { createStandardDatePresets } from '@/lib/dateReportingUtils';
import {
  ReportsFilterBuilder,
  createDateRangeFilterConfig,
  createPeriodFilterConfig,
  createSingleDateFilterConfig,
} from '../../shared/filters';
import type { WarehouseStatementPeriodMode } from '@shared/types/warehouseStatement';

interface ToolbarProps {
  periodMode: WarehouseStatementPeriodMode;
  onPeriodModeChange: (mode: WarehouseStatementPeriodMode) => void;
  dateRange: DateRange | null;
  datePresetKey: string | null;
  asOfDate: CalendarDate | null;
  onDateRangeChange: (range: DateRange | null) => void;
  onDatePresetChange: (key: string | null) => void;
  onAsOfDateChange: (value: CalendarDate | null) => void;
  onGenerate: () => void;
  onExport: () => void;
  generating: boolean;
  canExport: boolean;
}

export default function Toolbar({
  periodMode,
  onPeriodModeChange,
  dateRange,
  datePresetKey,
  asOfDate,
  onDateRangeChange,
  onDatePresetChange,
  onAsOfDateChange,
  onGenerate,
  onExport,
  generating,
  canExport,
}: ToolbarProps) {
  const datePresets = useMemo(() => createStandardDatePresets(), []);
  const maxDate = today(getLocalTimeZone());
  const isAsOf = periodMode === 'asOfDate';

  const filters = useMemo(() => {
    const periodSelect = createPeriodFilterConfig({
      selectedKey: datePresetKey,
      onChange: onDatePresetChange,
      options: [
        ...datePresets.map((preset) => ({ key: preset.key, label: preset.label })),
        ...(datePresetKey === 'custom' ? [{ key: 'custom', label: 'Обраний період' }] : []),
      ],
      size: 'sm',
      className: 'w-44',
    });

    if (isAsOf) {
      return [
        periodSelect,
        createSingleDateFilterConfig({
          key: 'asOfDate',
          ariaLabel: 'Станом на дату',
          value: asOfDate,
          onChange: (value) => onAsOfDateChange(value as CalendarDate | null),
          maxValue: maxDate,
          size: 'sm',
        }),
      ];
    }

    return [
      periodSelect,
      createDateRangeFilterConfig({
        value: dateRange,
        onChange: onDateRangeChange,
        maxValue: maxDate,
        size: 'sm',
      }),
    ];
  }, [
    asOfDate,
    datePresetKey,
    datePresets,
    dateRange,
    isAsOf,
    maxDate,
    onAsOfDateChange,
    onDatePresetChange,
    onDateRangeChange,
  ]);

  return (
    <div className="bg-white rounded-xl p-4 flex flex-wrap items-center gap-3 justify-between">
      <div className="flex flex-wrap items-center gap-3 w-full">
        <Switch
          size="sm"
          isSelected={isAsOf}
          onValueChange={(selected) => onPeriodModeChange(selected ? 'asOfDate' : 'dateRange')}
        >
          Станом на дату
        </Switch>
        <ReportsFilterBuilder filters={filters} className="flex flex-wrap gap-2 items-end" />
        <div className="flex gap-2 items-end ml-auto">
          <Button
            size="md"
            className="bg-blue-500 text-white"
            onPress={onGenerate}
            startContent={<DynamicIcon name={generating ? 'loader-circle' : 'table-properties'} size={16} className={generating ? 'animate-spin' : ''} />}
          >
            Сформувати
          </Button>
          <Button
            size="md"
            variant="flat"
            className="bg-green-600 text-white"
            isDisabled={!canExport || generating}
            onPress={onExport}
            startContent={<DynamicIcon name="file-spreadsheet" size={16} />}
          >
            Excel
          </Button>
        </div>
      </div>
    </div>
  );
}
