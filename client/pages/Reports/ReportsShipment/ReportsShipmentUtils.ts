import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date";
import type { DateRange } from "@react-types/datepicker";
import { createReportCacheKey, formatCalendarDateValue } from "../shared/ReportsSharedUtils";

export const SHIPMENT_DEFAULT_PRESET_KEY = "today";

export function buildShipmentCacheKey(statusFilter: string, dateRange: DateRange | null): string {
  return createReportCacheKey("shipped", statusFilter, dateRange);
}

export function getPresetKeyForShipmentDate(date: CalendarDate): string {
  const todayDate = today(getLocalTimeZone());
  const yesterdayDate = todayDate.subtract({ days: 1 });

  if (date.compare(todayDate) === 0) {
    return "today";
  }

  if (date.compare(yesterdayDate) === 0) {
    return "yesterday";
  }

  return "custom";
}

export function toShipmentApiDateValue(value: { year: number; month: number; day: number }): string {
  return formatCalendarDateValue(value);
}