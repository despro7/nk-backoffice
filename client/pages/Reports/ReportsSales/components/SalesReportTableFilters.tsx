import { useMemo } from "react";
import type { DateRange } from "@react-types/datepicker";
import { ORDER_STATUSES } from "@/lib";
import {
  type ReportFilterConfig,
} from "../../shared/filters";
import {
  createDateRangeFilterConfig,
  createPeriodFilterConfig,
  createStatusFilterConfig,
} from "../../shared/filters/ReportFilterPresets";
import type { ReportDatePreset } from "../../shared/ReportsSharedTypes";
import type { ProductStatsCategorySeriesOption } from "../ReportsSalesTypes";
import { SALES_EXTRA_FILTER_OPTIONS } from "../ReportsSalesUtils";
import { SalesFiltersBar } from "./SalesFiltersBar";

interface SalesReportTableFiltersProps {
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  datePresetKey: string | null;
  datePresets: ReportDatePreset[];
  onDatePresetChange: (value: string | null) => void;
  dateRange: DateRange | null;
  onDateRangeChange: (value: DateRange | null) => void;
  categoryOptions?: ProductStatsCategorySeriesOption[];
  selectedCategories?: Set<string>;
  onSelectedCategoriesChange?: (value: Set<string>) => void;
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
  categoryOptions,
  selectedCategories,
  onSelectedCategoriesChange,
  extraFilters,
  onExtraFiltersChange,
  colored,
  onColoredToggle,
  loading,
  onReset,
  showExtraFilters = true,
}: SalesReportTableFiltersProps) {
  const { filters, moreFilters } = useMemo(() => {
    const secondary: ReportFilterConfig[] = [
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
        className: "w-48",
        popoverClassName: "w-auto min-w-full",
      }),
    ];
    const primary: ReportFilterConfig[] = [
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
        className: "min-w-0 flex-1 max-w-48",
        popoverClassName: "w-auto min-w-full",
      }),
      createDateRangeFilterConfig({
        value: dateRange,
        onChange: onDateRangeChange,
        className: "w-62 shrink-0",
      }),
    ];

    if (categoryOptions && selectedCategories && onSelectedCategoriesChange) {
      primary.push({
        type: "multiSelect",
        key: "categoryFilter",
        ariaLabel: "Фільтр категорій",
        placeholder: "Всі категорії",
        selectedKeys: selectedCategories,
        onChange: onSelectedCategoriesChange,
        options: categoryOptions.map((category) => ({
          key: category.key,
          label: `${category.label} (${category.count})`,
        })),
        iconName: "package",
        className: "min-w-0 flex-1 max-w-48",
        popoverClassName: "w-auto min-w-full",
        compactTrigger: true,
      });
    }

    if (showExtraFilters) {
      secondary.push({
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
        className: "w-56",
        popoverClassName: "w-auto min-w-full",
        compactTrigger: true,
      });
    }

    // Без додаткових фільтрів ховати нічого: статус лишається в основному рядку
    if (!showExtraFilters) {
      const status = secondary.map((filter) => ({ ...filter, className: "min-w-0 flex-1 max-w-48" }));
      return { filters: [...status, ...primary], moreFilters: [] };
    }

    return { filters: primary, moreFilters: secondary };
  }, [
    categoryOptions,
    datePresetKey,
    datePresets,
    dateRange,
    extraFilters,
    onDatePresetChange,
    onDateRangeChange,
    onExtraFiltersChange,
    onSelectedCategoriesChange,
    onStatusFilterChange,
    selectedCategories,
    showExtraFilters,
    statusFilter,
  ]);

  const activeMoreCount =
    (statusFilter !== "all" ? 1 : 0) + (showExtraFilters && extraFilters.size > 0 ? 1 : 0);

  return (
    <SalesFiltersBar
      filters={filters}
      moreFilters={moreFilters}
      activeMoreCount={activeMoreCount}
      hasActiveFilters={activeMoreCount > 0 || Boolean(selectedCategories?.size)}
      colored={colored}
      onColoredToggle={onColoredToggle}
      onReset={onReset}
      resetDisabled={loading}
    />
  );
}
