import { Select, SelectItem } from "@heroui/react";
import type { DateRange } from "@react-types/datepicker";
import { DynamicIcon } from "lucide-react/dynamic";
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
  totalProductsCount: number;
  selectedProductsCount: number;
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
  totalProductsCount,
  selectedProductsCount,
  allFilterOptions,
  sortDescriptor,
  onSortDescriptorChange,
  sortOptions,
  onReset,
}: ProductStatsChartFiltersProps) {
  const filters = useMemo<ReportFilterConfig[]>(() => {
    const nextFilters: ReportFilterConfig[] = [
      createStatusFilterConfig({
        selectedKey: statusFilter === "all" ? null : statusFilter,
        onChange: (selectedKey) => {
          onStatusFilterChange(selectedKey ?? "all");
        },
        options: PRODUCT_CHART_STATUS_OPTIONS,
      }),
      createPeriodFilterConfig({
        selectedKey: datePresetKey,
        onChange: onDatePresetChange,
        options: datePresets,
      }),
      createDateRangeFilterConfig({
        value: dateRange,
        onChange: onDateRangeChange,
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
      }),
      {
        type: "custom",
        key: "productFilter",
        className: "flex-1",
        render: () => (
          <Select
            aria-label="Фільтр товарів"
            placeholder={
              selectedProducts.size === 0
                ? "Всі категорії"
                : `Вибрано ${selectedProductsCount} категор${selectedProductsCount === 1 ? "ію" : selectedProductsCount < 5 ? "ії" : "ій"}`
            }
            selectionMode="multiple"
            selectedKeys={selectedProducts}
            onSelectionChange={(keys) => {
              if (keys === "all") {
                onSelectedProductsChange(new Set(allFilterOptions.map((option) => option.key)));
                return;
              }

              onSelectedProductsChange(new Set(Array.from(keys) as string[]));
            }}
            size="md"
            startContent={<DynamicIcon name="package" className="text-gray-400" size={19} />}
            classNames={{
              trigger: "h-10 max-w-54",
              innerWrapper: "gap-2",
            }}
          >
            {allFilterOptions.map((option) => {
              if (option.kind === "header") {
                return (
                  <SelectItem
                    key={option.key}
                    isDisabled
                    className="[&>span]:text-xs [&>span]:text-gray-500 uppercase border-b border-gray-200 pb-1 rounded-none"
                  >
                    {option.label}
                  </SelectItem>
                );
              }

              return (
                <SelectItem key={option.key}>
                  {option.label}
                </SelectItem>
              );
            })}
          </Select>
        ),
      },
    ];

    if (!(dateRange?.start && dateRange?.end)) {
      nextFilters.push(
        {
          type: "custom",
          key: "sortColumn",
          className: "flex-1",
          render: () => (
            <Select
              aria-label="Сортування"
              placeholder="Сортувати за"
              selectedKeys={[sortDescriptor.column]}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string;
                onSortDescriptorChange({
                  column: selected,
                  direction: sortDescriptor.direction,
                });
              }}
              size="md"
              startContent={
                <DynamicIcon
                  name={sortDescriptor.direction === "descending" ? "arrow-down" : "arrow-up"}
                  className="text-gray-400"
                  size={19}
                />
              }
              classNames={{
                trigger: "h-10",
                innerWrapper: "gap-2",
              }}
            >
              {sortOptions.map((option) => (
                <SelectItem key={option.key}>{option.label}</SelectItem>
              ))}
            </Select>
          ),
        },
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
          className: "h-10 px-3 gap-2",
        }),
      );
    }

    nextFilters.push(createResetFilterConfig({
      onPress: onReset,
      disabled: loading,
      className: "h-10 px-3 gap-2 bg-transparent border-1.5 border-neutral-200 hover:bg-red-100 hover:border-red-200 hover:text-red-500",
    }));

    return nextFilters;
  }, [
    allFilterOptions,
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
    selectedProductsCount,
    sortDescriptor,
    sortOptions,
    statusFilter,
  ]);

  return (
    <ReportsFilterBuilder filters={filters} />
  );
}