import type { DateRange } from "@react-types/datepicker";
import { useMemo } from "react";
import {
  createActionButtonFilterConfig,
  createDateRangeFilterConfig,
  createPeriodFilterConfig,
  createResetFilterConfig,
  createStatusFilterConfig,
  ReportsFilterBuilder,
  type ReportFilterConfig,
} from "../../shared/filters";
import type {
  ProductChartGroupBy,
  ProductStatsSortDescriptor,
} from "../ReportsSalesTypes";
import {
  PRODUCT_CHART_GROUP_BY_OPTIONS,
  PRODUCT_CHART_STATUS_OPTIONS,
} from "../ReportsSalesUtils";

interface DatePresetOption {
  key: string;
  label: string;
  getRange: () => DateRange | null;
}

interface ProductFilterOption {
  key: string;
  label: string;
  kind: "header" | "category";
}

interface SortOption {
  key: string;
  label: string;
}

interface ProductStatsChartFiltersProps {
  loading: boolean;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  datePresetKey: string | null;
  datePresets: DatePresetOption[];
  onDatePresetChange: (value: string | null) => void;
  dateRange: DateRange | null;
  onDateRangeChange: (value: DateRange | null) => void;
  groupBy: ProductChartGroupBy;
  onGroupByChange: (value: ProductChartGroupBy) => void;
  selectedProducts: Set<string>;
  onSelectedProductsChange: (value: Set<string>) => void;
  allFilterOptions: ProductFilterOption[];
  sortDescriptor: ProductStatsSortDescriptor;
  onSortDescriptorChange: (value: ProductStatsSortDescriptor) => void;
  sortOptions: SortOption[];
  onReset: () => void;
}

export function ProductStatsChartFilters({
  loading,
  statusFilter,
  onStatusFilterChange,
  datePresetKey,
  datePresets,
  onDatePresetChange,
  dateRange,
  onDateRangeChange,
  groupBy,
  onGroupByChange,
  selectedProducts,
  onSelectedProductsChange,
  allFilterOptions,
  sortDescriptor,
  onSortDescriptorChange,
  sortOptions,
  onReset,
}: ProductStatsChartFiltersProps) {
  const categoryOptions = useMemo(
    () => allFilterOptions.filter((option) => option.kind === "category"),
    [allFilterOptions],
  );

  const filters = useMemo<ReportFilterConfig[]>(() => {
    const nextFilters: ReportFilterConfig[] = [
      createStatusFilterConfig({
        selectedKey: statusFilter === "all" ? null : statusFilter,
        onChange: (selectedKey) => {
          onStatusFilterChange(selectedKey ?? "all");
        },
        options: PRODUCT_CHART_STATUS_OPTIONS,
        className: "w-40 shrink-0",
        popoverClassName: "w-auto min-w-full",
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
        className: "w-48 shrink-0",
        popoverClassName: "w-auto min-w-full",
      }),
      createDateRangeFilterConfig({
        value: dateRange,
        onChange: onDateRangeChange,
        className: "w-62 shrink-0",
      }),
      createStatusFilterConfig({
        key: "groupBy",
        ariaLabel: "Групування даних",
        placeholder: "Групувати по",
        selectedKey: groupBy,
        onChange: (selectedKey) => {
          if (selectedKey) {
            onGroupByChange(selectedKey as ProductChartGroupBy);
          }
        },
        options: PRODUCT_CHART_GROUP_BY_OPTIONS,
        iconName: "bar-chart-3",
        className: "w-44 shrink-0",
        popoverClassName: "w-auto min-w-full",
      }),
      {
        type: "multiSelect",
        key: "productFilter",
        ariaLabel: "Фільтр категорій",
        placeholder: "Всі категорії",
        selectedKeys: selectedProducts,
        onChange: onSelectedProductsChange,
        options: categoryOptions,
        iconName: "package",
        className: "w-56 shrink-0",
        popoverClassName: "w-auto min-w-full",
        compactTrigger: true,
      },
    ];

    if (!(dateRange?.start && dateRange?.end)) {
      nextFilters.push(
        createStatusFilterConfig({
          key: "sortColumn",
          ariaLabel: "Сортування",
          placeholder: "Сортувати за",
          selectedKey: sortDescriptor.column,
          onChange: (selectedKey) => {
            if (selectedKey) {
              onSortDescriptorChange({
                column: selectedKey,
                direction: sortDescriptor.direction,
              });
            }
          },
          options: sortOptions,
          iconName: "arrow-up-down",
          className: "w-48 shrink-0",
          popoverClassName: "w-auto min-w-full",
        }),
        createActionButtonFilterConfig({
          key: "sortDirection",
          onPress: () =>
            onSortDescriptorChange({
              ...sortDescriptor,
              direction:
                sortDescriptor.direction === "descending"
                  ? "ascending"
                  : "descending",
            }),
          iconName: sortDescriptor.direction === "descending" ? "arrow-down" : "arrow-up",
          isIconOnly: true,
          className: "h-10 px-3 gap-2 shrink-0 border-1.5 border-neutral-200",
        }),
      );
    }

    nextFilters.push(
      createResetFilterConfig({
        onPress: onReset,
        disabled: loading,
        className: "h-10 px-3 gap-2 ml-auto shrink-0 bg-transparent border-1.5 border-neutral-200 hover:bg-red-100 hover:border-red-200 hover:text-red-500",
      }),
    );

    return nextFilters;
  }, [
    categoryOptions,
    datePresetKey,
    datePresets,
    dateRange,
    groupBy,
    loading,
    onDatePresetChange,
    onDateRangeChange,
    onGroupByChange,
    onReset,
    onSelectedProductsChange,
    onSortDescriptorChange,
    onStatusFilterChange,
    selectedProducts,
    sortDescriptor,
    sortOptions,
    statusFilter,
  ]);

  return <ReportsFilterBuilder filters={filters} />;
}
