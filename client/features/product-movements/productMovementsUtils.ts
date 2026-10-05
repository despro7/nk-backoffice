import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date';
import type { DateRange } from '@react-types/datepicker';
import { CATALOG_FINISHED_PRODUCTS_FOLDER_NAME } from '@shared/types/catalog';
import { createStandardDatePresets } from '@/lib/dateReportingUtils';
import type {
  ProductMovementsFilterState,
  ProductMovementsGroup,
  ProductMovementsMetaResponse,
  ProductMovementsOpenParams,
} from './types';

export interface ProductMovementsGrandTotals {
  openingBalance: number;
  receiptQty: number;
  expenseQty: number;
  balanceQty: number;
}

export function buildProductMovementsGrandTotals(
  groups: ProductMovementsGroup[],
): ProductMovementsGrandTotals {
  return groups.reduce(
    (acc, group) => ({
      openingBalance: acc.openingBalance + group.openingBalance,
      receiptQty: acc.receiptQty + group.totals.receiptQty,
      expenseQty: acc.expenseQty + group.totals.expenseQty,
      balanceQty: acc.balanceQty + group.totals.balanceQty,
    }),
    { openingBalance: 0, receiptQty: 0, expenseQty: 0, balanceQty: 0 },
  );
}

export function formatYmdToDmy(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export function formatProductDisplayLabel(
  productName: string | null | undefined,
  sku: string | null | undefined,
): string {
  const name = productName?.trim();
  const code = sku?.trim();
  if (name && code && name !== code) {
    return `${name} (${code})`;
  }
  return name || code || '';
}

export interface ProductMovementsReportMetric {
  icon: string;
  label: string;
}

export function buildProductMovementsReportSubtitle(
  filters: ProductMovementsFilterState,
  meta?: ProductMovementsMetaResponse | null,
): string {
  const parts = [
    `${formatYmdToDmy(filters.startDate)} – ${formatYmdToDmy(filters.endDate)}`,
  ];

  if (filters.batchLabel || filters.goodPartId) {
    parts.push(filters.batchLabel || filters.goodPartId || '');
  }

  if (filters.storageId) {
    const storage = meta?.storages.find((item) => item.id === filters.storageId);
    if (storage) parts.push(storage.name);
  }

  if (filters.firmId) {
    const firm = meta?.firms.find((item) => item.id === filters.firmId);
    if (firm) parts.push(firm.name);
  }

  return parts.filter(Boolean).join(' · ');
}

export function buildProductMovementsReportMetrics(
  filters: ProductMovementsFilterState,
  meta?: ProductMovementsMetaResponse | null,
  sku?: string | null,
): ProductMovementsReportMetric[] {
  const metrics: ProductMovementsReportMetric[] = [];

  const code = sku?.trim() || filters.sku?.trim();
  if (code) {
    metrics.push({ icon: 'barcode', label: code });
  }

  metrics.push({
    icon: 'calendar-range',
    label: `${formatYmdToDmy(filters.startDate)} – ${formatYmdToDmy(filters.endDate)}`,
  });

  if (filters.batchLabel || filters.goodPartId) {
    metrics.push({
      icon: 'layers',
      label: filters.batchLabel || filters.goodPartId || '',
    });
  }

  if (filters.storageId) {
    const storage = meta?.storages.find((item) => item.id === filters.storageId);
    if (storage) {
      metrics.push({ icon: 'warehouse', label: storage.name });
    }
  }

  if (filters.firmId) {
    const firm = meta?.firms.find((item) => item.id === filters.firmId);
    if (firm) {
      metrics.push({ icon: 'building-2', label: firm.name });
    }
  }

  return metrics.filter((metric) => metric.label);
}

export function calendarValueToYmd(value: { year: number; month: number; day: number }): string {
  const y = value.year;
  const m = String(value.month).padStart(2, '0');
  const d = String(value.day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseYmdToCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new CalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function defaultPeriod(): { startDate: string; endDate: string } {
  const presets = createStandardDatePresets();
  const last30Days = presets.find((preset) => preset.key === 'last30Days');
  if (last30Days) {
    const range = last30Days.getRange();
    return {
      startDate: calendarValueToYmd(range.start),
      endDate: calendarValueToYmd(range.end),
    };
  }

  const now = today(getLocalTimeZone());
  const start = now.subtract({ days: 29 });
  return {
    startDate: calendarValueToYmd(start),
    endDate: calendarValueToYmd(now),
  };
}

export function dateRangeToPeriod(range: DateRange | null): { startDate: string; endDate: string } | null {
  if (!range?.start || !range?.end) return null;
  return {
    startDate: calendarValueToYmd(range.start),
    endDate: calendarValueToYmd(range.end),
  };
}

export function periodToDateRange(startDate: string, endDate: string): DateRange | null {
  const start = parseYmdToCalendarDate(startDate);
  const end = parseYmdToCalendarDate(endDate);
  if (!start || !end) return null;
  return { start, end };
}

export function createDefaultFilters(): ProductMovementsFilterState {
  const period = defaultPeriod();
  return {
    sku: null,
    productName: null,
    dilovodGoodId: null,
    startDate: period.startDate,
    endDate: period.endDate,
    goodPartId: null,
    batchLabel: null,
    storageId: null,
    firmId: null,
  };
}

export function filtersFromOpenParams(params: ProductMovementsOpenParams): ProductMovementsFilterState {
  const base = createDefaultFilters();
  const period = params.period ?? { startDate: base.startDate, endDate: base.endDate };
  return {
    ...base,
    sku: params.sku ?? null,
    productName: params.productName ?? null,
    dilovodGoodId: params.dilovodGoodId ?? null,
    startDate: period.startDate,
    endDate: period.endDate,
    goodPartId: params.goodPartId ?? null,
    batchLabel: params.batchLabel ?? null,
    storageId: params.storageId ?? null,
    firmId: params.firmId ?? null,
  };
}

export function filtersToQueryRequest(filters: ProductMovementsFilterState) {
  return {
    ...(filters.dilovodGoodId ? { goodId: filters.dilovodGoodId } : {}),
    ...(filters.sku ? { sku: filters.sku } : {}),
    startDate: filters.startDate,
    endDate: filters.endDate,
    ...(filters.goodPartId ? { goodPartId: filters.goodPartId } : {}),
    ...(filters.storageId ? { storageId: filters.storageId } : {}),
    ...(filters.firmId ? { firmId: filters.firmId } : {}),
  };
}

export async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();
    return data?.error || data?.message || fallback;
  } catch {
    return fallback;
  }
}

export function createDatePresets() {
  return createStandardDatePresets();
}

export function formatQty(value: number | null | undefined): string {
  if (value == null || Math.abs(value) < 1e-9) return '';
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, '');
}

export function formatGroupDisplayLabel(label: string): string {
  return label
    .split(' · ')
    .filter((part) => part.trim() !== CATALOG_FINISHED_PRODUCTS_FOLDER_NAME)
    .join(' · ');
}
