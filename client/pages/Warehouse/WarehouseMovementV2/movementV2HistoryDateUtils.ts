import type { CalendarDate } from '@internationalized/date';
import { getLocalTimeZone, today } from '@internationalized/date';
import type { DateRange } from '@react-types/datepicker';
import { createStandardDatePresets } from '@/lib/dateReportingUtils';
import { calendarDateToIso } from '../WarehouseMovementMob/WarehouseMovementMobUtils';

export const MOVEMENT_V2_HISTORY_DEFAULT_PRESET = 'last30Days';

export function getDefaultMovementV2HistoryDateRange(): DateRange {
  const presets = createStandardDatePresets();
  const preset = presets.find((p) => p.key === MOVEMENT_V2_HISTORY_DEFAULT_PRESET);
  return preset?.getRange() ?? {
    start: today(getLocalTimeZone()).subtract({ days: 29 }),
    end: today(getLocalTimeZone()),
  };
}

export function movementV2HistoryRangeToIso(range: DateRange | null): { from?: string; to?: string } {
  if (!range?.start || !range?.end) return {};
  return {
    from: calendarDateToIso(range.start as CalendarDate),
    to: calendarDateToIso(range.end as CalendarDate),
  };
}

export function movementV2HistoryCacheKey(
  page: number,
  limit: number,
  range: { from?: string; to?: string },
): string {
  return `${page}|${limit}|${range.from ?? ''}|${range.to ?? ''}`;
}
