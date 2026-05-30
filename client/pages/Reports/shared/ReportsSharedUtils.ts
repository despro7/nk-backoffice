import type { DateRange } from "@react-types/datepicker";
import type {
  CalendarDateValueLike,
  ReportDatePreset,
  ReportSortDescriptorLike,
} from "./ReportsSharedTypes";

type ReportViewMode = "products" | "dates";

type ProductStatBase = {
  orderedQuantity: number;
};

type DateStatBase = ProductStatBase & {
  date: string;
};

export function getDateRangeCacheSegment(dateRange: DateRange | null): string {
  if (!dateRange?.start || !dateRange?.end) {
    return "no_date";
  }

  return `${dateRange.start.toString()}_${dateRange.end.toString()}`;
}

export function createReportCacheKey(
  prefix: string,
  statusFilter: string,
  dateRange: DateRange | null,
  extraSegments: Array<string | number | undefined> = [],
): string {
  return [prefix, statusFilter, getDateRangeCacheSegment(dateRange), ...extraSegments]
    .filter((segment) => segment !== undefined && segment !== "")
    .join("_");
}

export function getPresetRangeByKey(
  presets: ReportDatePreset[],
  presetKey: string,
): DateRange | null {
  return presets.find((preset) => preset.key === presetKey)?.getRange() ?? null;
}

export function formatCalendarDateValue(value: CalendarDateValueLike): string {
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

export function appendStatusParams(
  params: URLSearchParams,
  statusFilter: string,
  allStatuses?: string[],
): void {
  if (statusFilter === "all" && allStatuses?.length) {
    allStatuses.forEach((status) => params.append("status", status));
    return;
  }

  if (statusFilter !== "all") {
    params.append("status", statusFilter);
  }
}

export function sortReportItems<TDateItem extends DateStatBase, TProductItem extends ProductStatBase>({
  dateItems,
  productItems,
  sortDescriptor,
  viewMode,
  compareDateItems,
  compareProductItems,
}: {
  dateItems: TDateItem[];
  productItems: TProductItem[];
  sortDescriptor: ReportSortDescriptorLike;
  viewMode: ReportViewMode;
  compareDateItems?: (first: TDateItem, second: TDateItem, column: string) => number | null;
  compareProductItems?: (first: TProductItem, second: TProductItem, column: string) => number | null;
}): Array<TDateItem | TProductItem> {
  const items = [...(viewMode === "dates" ? dateItems : productItems)];
  const column = sortDescriptor.column;

  items.sort((firstItem, secondItem) => {
    let comparison: number | null = null;

    if (viewMode === "dates") {
      const firstDateItem = firstItem as TDateItem;
      const secondDateItem = secondItem as TDateItem;

      comparison = compareDateItems?.(firstDateItem, secondDateItem, column) ?? null;

      if (comparison === null) {
        if (column === "date") {
          comparison = firstDateItem.date.localeCompare(secondDateItem.date);
        } else {
          const firstValue = firstDateItem[column as keyof TDateItem];
          const secondValue = secondDateItem[column as keyof TDateItem];

          if (typeof firstValue === "number" && typeof secondValue === "number") {
            comparison = firstValue - secondValue;
          } else {
            comparison = 0;
          }
        }
      }
    } else {
      const firstProductItem = firstItem as TProductItem;
      const secondProductItem = secondItem as TProductItem;

      comparison = compareProductItems?.(firstProductItem, secondProductItem, column) ?? null;

      if (comparison === null) {
        const firstValue = firstProductItem[column as keyof TProductItem];
        const secondValue = secondProductItem[column as keyof TProductItem];

        if (typeof firstValue === "string" && typeof secondValue === "string") {
          comparison = firstValue.localeCompare(secondValue);
        } else if (typeof firstValue === "number" && typeof secondValue === "number") {
          comparison = firstValue - secondValue;
        } else {
          comparison = 0;
        }
      }
    }

    return sortDescriptor.direction === "descending" ? -comparison : comparison;
  });

  return items;
}

export function getOrderedQuantityValues<TDateItem extends ProductStatBase, TProductItem extends ProductStatBase>(
  viewMode: ReportViewMode,
  dateItems: TDateItem[],
  productItems: TProductItem[],
): number[] {
  return viewMode === "dates"
    ? dateItems.map((item) => item.orderedQuantity)
    : productItems.map((item) => item.orderedQuantity);
}

export function getOrderedQuantityTotal<TDateItem extends ProductStatBase, TProductItem extends ProductStatBase>(
  viewMode: ReportViewMode,
  dateItems: TDateItem[],
  productItems: TProductItem[],
): number {
  const items = viewMode === "dates" ? dateItems : productItems;
  return items.reduce((sum, item) => sum + item.orderedQuantity, 0);
}