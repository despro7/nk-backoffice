import { useMemo } from "react";
import type { DateRange } from "@react-types/datepicker";
import { ORDER_STATUSES } from "@/lib";
import {
  ReportsFilterBuilder,
  type ReportFilterConfig,
} from "../../shared/filters";
import {
  createActionButtonFilterConfig,
  createDateRangeFilterConfig,
  createPeriodFilterConfig,
  createResetFilterConfig,
  createStatusFilterConfig,
} from "../../shared/filters/ReportFilterPresets";
import type { ReportDatePreset } from "../../shared/ReportsSharedTypes";
import { SALES_EXTRA_FILTER_OPTIONS } from "../ReportsSalesUtils";

interface SalesReportTableFiltersProps {
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  datePresetKey: string | null;
  datePresets: ReportDatePreset[];
  onDatePresetChange: (value: string | null) => void;
  dateRange: DateRange | null;
  onDateRangeChange: (value: DateRange | null) => void;
  extraFilters: Set<string>;
  onExtraFiltersChange: (value: Set<string>) => void;
  colored: boolean;
  onColoredToggle: () => void;
  loading: boolean;
  onReset: () => void;
  showExtraFilters?: boolean;
}

export function SalesReportTableFilters({
  statusFilter,
  onStatusFilterChange,
  datePresetKey,
  datePresets,
  onDatePresetChange,
  dateRange,
  onDateRangeChange,
  extraFilters,
  onExtraFiltersChange,
  colored,
  onColoredToggle,
  loading,
  onReset,
  showExtraFilters = true,
}: SalesReportTableFiltersProps) {
  const filters = useMemo<ReportFilterConfig[]>(() => {
    const result: ReportFilterConfig[] = [
      createStatusFilterConfig({
        selectedKey: statusFilter === "all" ? null : statusFilter,
        onChange: (selectedKey) => {
          if (!selectedKey) {
            onStatusFilterChange("all");
            return;
          }

          const found = ORDER_STATUSES.find(
            (option) => option.key === selectedKey || option.label === selectedKey,
          );
          onStatusFilterChange(found ? found.key : selectedKey);
        },
        options: ORDER_STATUSES,
      }),
      createPeriodFilterConfig({
        selectedKey: datePresetKey,
        onChange: (selectedKey) => {
          if (!selectedKey) {
            return;
          }

          const preset = datePresets.find(
            (item) => item.key === selectedKey || item.label === selectedKey,
          );
          if (preset) {
            onDatePresetChange(preset.key);
          }
        },
        options: datePresets,
      }),
      createDateRangeFilterConfig({
        value: dateRange,
        onChange: onDateRangeChange,
      }),
    ];

    if (showExtraFilters) {
      result.push({
        type: "multiSelect",
        key: "extraFilters",
        ariaLabel: "Додаткові фільтри",
        placeholder: "Додаткові фільтри",
        selectedKeys: extraFilters,
        onChange: (keys) => {
          const normalized = Array.from(keys)
            .map((key) => {
              const found = SALES_EXTRA_FILTER_OPTIONS.find(
                (option) => option.key === key || option.label === key,
              );
              return found ? found.key : null;
            })
            .filter((key): key is string => Boolean(key));

          onExtraFiltersChange(new Set(normalized));
        },
        options: SALES_EXTRA_FILTER_OPTIONS,
        iconName: "filter",
        className: "flex-1 min-w-[220px]",
      });
    }

    result.push(
      createActionButtonFilterConfig({
        key: "colored",
        onPress: onColoredToggle,
        iconName: "palette",
        isIconOnly: true,
        className: `h-10 px-3 gap-2 border-1.5 transition-colors ${
          colored
            ? "bg-lime-100 border-lime-500/50 text-lime-600/70 hover:bg-lime-100"
            : "bg-transparent border-neutral-200 text-neutral-400 hover:bg-neutral-100"
        }`,
      }),
      createResetFilterConfig({
        onPress: onReset,
        disabled: loading,
        className: "h-10 px-3 gap-2 bg-transparent border-1.5 border-neutral-200 hover:bg-red-100 hover:border-red-200 hover:text-red-500",
      }),
    );

    return result;
  }, [
    colored,
    datePresetKey,
    datePresets,
    dateRange,
    extraFilters,
    loading,
    onColoredToggle,
    onDatePresetChange,
    onDateRangeChange,
    onExtraFiltersChange,
    onReset,
    onStatusFilterChange,
    showExtraFilters,
    statusFilter,
  ]);

  return (
    <ReportsFilterBuilder filters={filters} />
  );
}