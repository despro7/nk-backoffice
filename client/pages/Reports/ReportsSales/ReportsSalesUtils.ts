import { ORDER_STATUSES, createStandardDatePresets } from "@/lib";
import { getLocalTimeZone, today, type CalendarDate } from "@internationalized/date";
import type { DateRange } from "@react-types/datepicker";
import { createReportCacheKey, getPresetRangeByKey } from "../shared/ReportsSharedUtils";
import type { ReportDatePreset } from "../shared/ReportsSharedTypes";

/** Пресет за замовчуванням для таблиці продажів (з 7-го дня місяця). */
export const SALES_TABLE_DEFAULT_PRESET_KEY = "thisMonth";
/** Пресет на початку місяця, коли «цього місяця» ще замало днів. */
export const SALES_TABLE_EARLY_MONTH_PRESET_KEY = "last7Days";
/** Дні 1–6: показуємо останні 7 днів замість поточного місяця. */
const SALES_TABLE_EARLY_MONTH_DAY_THRESHOLD = 7;

export function getSalesTableDefaultDatePresetKey(
  referenceDate: CalendarDate = today(getLocalTimeZone()),
): string {
  return referenceDate.day < SALES_TABLE_EARLY_MONTH_DAY_THRESHOLD
    ? SALES_TABLE_EARLY_MONTH_PRESET_KEY
    : SALES_TABLE_DEFAULT_PRESET_KEY;
}

export function getSalesTableDefaultDatePreset(
  presets: ReportDatePreset[] = createStandardDatePresets(),
  referenceDate: CalendarDate = today(getLocalTimeZone()),
): { presetKey: string; range: DateRange | null } {
  const presetKey = getSalesTableDefaultDatePresetKey(referenceDate);
  return {
    presetKey,
    range: getPresetRangeByKey(presets, presetKey),
  };
}

export const SALES_EXTRA_FILTER_OPTIONS = [
  { key: "noDiscount", label: "Виключити 'Зі знижкою'" },
  { key: "noMarketplaces", label: "Виключити маркетплейси" },
  { key: "noOther", label: "Виключити 'Інше'" },
];

export const PRODUCT_CHART_STATUS_OPTIONS = [
  { key: "all", label: "Всі статуси" },
  ...ORDER_STATUSES.filter((option) => option.key !== "all"),
];

export const PRODUCT_GROUP_OPTIONS = [
  { key: "first_courses", label: "Перші страви" },
  { key: "main_courses", label: "Другі страви" },
];

export const PRODUCT_CHART_GROUP_BY_OPTIONS = [
  { key: "hour", label: "По годинах" },
  { key: "day", label: "По днях" },
  { key: "week", label: "По тижнях" },
  { key: "month", label: "По місяцях" },
];

export function buildSalesReportCacheKey(
  statusFilter: string,
  dateRange: DateRange | null,
  selectedProducts: Set<string>,
): string {
  return createReportCacheKey(
    "sales",
    statusFilter,
    dateRange,
    [Array.from(selectedProducts).sort().join(",")],
  );
}

export function buildSalesSetsReportCacheKey(
  statusFilter: string,
  dateRange: DateRange | null,
): string {
  return createReportCacheKey("sales-sets-v2", statusFilter, dateRange);
}

export function buildProductStatsChartCacheKey(
  statusFilter: string,
  dateRange: DateRange | null,
  groupBy: string,
  selectedProducts: Set<string>,
): string {
  return createReportCacheKey(
    "chart",
    statusFilter,
    dateRange,
    [groupBy, Array.from(selectedProducts).sort().join(",")],
  );
}

export function buildProductStatsCacheKey(
  statusFilter: string,
  dateRange: DateRange | null,
): string {
  return createReportCacheKey("products", statusFilter, dateRange);
}