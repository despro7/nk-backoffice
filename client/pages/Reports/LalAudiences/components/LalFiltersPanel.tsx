import { Checkbox, Slider, Tab, Tabs, Tooltip } from '@heroui/react';
import type { DateRange } from '@react-types/datepicker';
import type { Key } from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';
import {
  LAL_LTV_UNBOUNDED,
  LAL_ORDER_COUNT_UNBOUNDED,
  type LalLogicMode,
  type LalPeriodKey,
} from '@shared/types/lalAudiences';
import ReportDateRangeFilter from '../../shared/filters/ReportDateRangeFilter';
import ReportResetFiltersButton from '../../shared/filters/ReportResetFiltersButton';
import ReportSingleSelectFilter from '../../shared/filters/ReportSingleSelectFilter';
import {
  formatLtvThumb,
  formatOrderCountThumb,
  formatSliderRange,
  LAL_PERIOD_OPTIONS,
  LAL_STATUS_OPTIONS,
} from '../LalAudiencesUtils';

interface LalFiltersPanelProps {
  allStatusesSelected: boolean;
  customRange: DateRange | null;
  logic: LalLogicMode;
  ltvRange: [number, number];
  orderCountRange: [number, number];
  period: LalPeriodKey;
  statuses: string[];
  onLogicChange: (value: LalLogicMode) => void;
  onLtvChange: (value: number | number[]) => void;
  onOrderCountChange: (value: number | number[]) => void;
  onPeriodChange: (value: LalPeriodKey) => void;
  onRangeChange: (value: DateRange | null) => void;
  onReset: () => void;
  onToggleAllStatuses: (selected: boolean) => void;
  onToggleStatus: (statusKey: string, selected: boolean) => void;
}

export default function LalFiltersPanel({
  allStatusesSelected,
  customRange,
  logic,
  ltvRange,
  orderCountRange,
  period,
  statuses,
  onLogicChange,
  onLtvChange,
  onOrderCountChange,
  onPeriodChange,
  onRangeChange,
  onReset,
  onToggleAllStatuses,
  onToggleStatus,
}: LalFiltersPanelProps) {
  return (
    <div className="bg-white rounded-xl p-4 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-default-800">Фільтри</h2>

      <ReportSingleSelectFilter
        ariaLabel="Період"
        placeholder="Період"
        selectedKey={period}
        onChange={(key) => {
          if (key === '1m' || key === '3m' || key === '6m' || key === 'all' || key === 'custom') {
            onPeriodChange(key);
          }
        }}
        options={LAL_PERIOD_OPTIONS}
        iconName="calendar"
        className="flex-none w-full"
      />

      {period === 'custom' && (
        <ReportDateRangeFilter
          value={customRange}
          onChange={onRangeChange}
          className="w-full"
        />
      )}

      <Slider
        label="Кількість замовлень"
        aria-label="Кількість замовлень"
        size="sm"
        minValue={1}
        maxValue={LAL_ORDER_COUNT_UNBOUNDED}
        step={1}
        value={orderCountRange}
        onChange={onOrderCountChange}
        getValue={(value) => formatSliderRange(value, formatOrderCountThumb)}
        classNames={{
          base: 'max-w-full',
          label: 'text-sm text-default-600',
          value: 'text-sm text-default-500',
        }}
      />

      <Slider
        label="LTV"
        aria-label="LTV"
        size="sm"
        minValue={0}
        maxValue={LAL_LTV_UNBOUNDED}
        step={500}
        value={ltvRange}
        onChange={onLtvChange}
        getValue={(value) => formatSliderRange(value, formatLtvThumb)}
        classNames={{
          base: 'max-w-full',
          label: 'text-sm text-default-600',
          value: 'text-sm text-default-500',
        }}
      />

      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-default-800">
          Логіка вибірки
          <Tooltip
            color="secondary"
            className="max-w-72 bg-slate-600"
            content={
              <div className="flex flex-col gap-2 text-xs leading-snug py-0.5">
                <p>
                  <span className="font-semibold">За весь час</span> – клієнт у вибірці, якщо
                  останнє з усіх існуючих замовлень клієнта потрапило в обраний період.
                </p>
                <p>
                  <span className="font-semibold">Суворий режим</span> – лише якщо <u>всі</u> його
                  замовлення (у вибраних статусах) потрапили в обраний період.
                </p>
              </div>
            }
          >
            <button
              type="button"
              aria-label="Пояснення логіки вибірки"
              className="inline-flex text-default-400 hover:text-default-600"
            >
              <DynamicIcon name="circle-question-mark" size={15} />
            </button>
          </Tooltip>
        </span>
        <Tabs
          aria-label="Логіка вибірки"
          fullWidth
          size="lg"
          selectedKey={logic}
          onSelectionChange={(key: Key) => {
            if (key === 'lifetime' || key === 'strict') {
              onLogicChange(key);
            }
          }}
          classNames={{
            tabList: 'w-full gap-0 bg-default-100 p-1 rounded-md',
            cursor: 'bg-white shadow-sm rounded-sm',
            tab: 'h-auto min-h-14 px-1.5 py-1.5',
            tabContent: 'w-full group-data-[selected=true]:text-primary',
          }}
        >
          <Tab
            key="lifetime"
            title={
              <span className="flex flex-col items-center leading-tight">
                <span className="text-sm font-medium">За весь час</span>
                <span className="text-[11px] font-normal text-default-400 group-data-[selected=true]:text-primary/60">
                  Останнє замовлення у періоді
                </span>
              </span>
            }
          />
          <Tab
            key="strict"
            title={
              <span className="flex flex-col items-center leading-tight">
                <span className="text-sm font-medium">Суворий режим</span>
                <span className="text-[11px] font-normal text-default-400 group-data-[selected=true]:text-primary/60">
                  Усі замовлення у періоді
                </span>
              </span>
            }
          />
        </Tabs>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-default-600">Статуси</span>
        <Checkbox
          size="sm"
          isSelected={allStatusesSelected}
          onValueChange={onToggleAllStatuses}
        >
          Всі
        </Checkbox>
        <div className="flex flex-col gap-1.5 pl-1">
          {LAL_STATUS_OPTIONS.map((option) => (
            <Checkbox
              key={option.key}
              size="sm"
              isSelected={statuses.includes(option.key)}
              onValueChange={(selected) => onToggleStatus(option.key, selected)}
            >
              {option.label}
            </Checkbox>
          ))}
        </div>
      </div>

      <ReportResetFiltersButton onPress={onReset} className="h-10 w-full justify-center px-3 gap-2 bg-transparent border-1.5 border-neutral-200 hover:bg-red-100 hover:border-red-200 hover:text-red-500" />
    </div>
  );
}
