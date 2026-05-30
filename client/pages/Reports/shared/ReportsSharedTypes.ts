import type { DateRange } from "@react-types/datepicker";

export interface ReportCacheProgress {
  processed: number;
  total: number;
  errors: number;
}

export interface ReportCacheEntry<TData> {
  data: TData;
  timestamp: number;
}

export type ReportCacheMap<TData> = Record<string, ReportCacheEntry<TData>>;

export interface ReportingDayStartHourResponse {
  dayStartHour?: number;
}

export interface ReportDatePreset {
  key: string;
  label: string;
  getRange: () => DateRange | null;
}

export interface CalendarDateValueLike {
  year: number;
  month: number;
  day: number;
}

export interface ReportSortDescriptorLike {
  column: string;
  direction: "ascending" | "descending";
}