/**
 * Sold portions per reporting day for a date range: the same rules as `/api/orders/sales/report`
 * (reporting day start hour, orders cache `processedItems`, default status filter), without the
 * product filter. Admin invoices use it for the main invoice line and the live dashboard.
 */

import { getReportingDate, getReportingDateRange, getReportingDayStartHour } from '../../lib/utils.js';
import { orderDatabaseService } from '../../services/orderDatabaseService.js';
import { ordersCacheService } from '../../services/ordersCacheService.js';
import type { IsoDate } from '../../../shared/types/invoices.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: Map<string, number> }>();

export interface PortionsResult {
  total: number;
  byDay: Array<{ date: IsoDate; portions: number }>;
}

export async function getPortionsForRange(
  start: IsoDate,
  end: IsoDate,
  countedStatuses: string[],
  /** `dayStartHour` is for diagnostics only (virtual test); by default the app setting is used. */
  options: { force?: boolean; dayStartHour?: number } = {},
): Promise<PortionsResult> {
  const key = `${start}|${end}|${[...countedStatuses].sort().join(',')}|${options.dayStartHour ?? 'app'}`;
  const hit = cache.get(key);
  let perDay: Map<string, number>;
  if (!options.force && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    perDay = hit.value;
  } else {
    perDay = await computePerDay(start, end, countedStatuses, options.dayStartHour);
    cache.set(key, { at: Date.now(), value: perDay });
  }
  const byDay = [...perDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, portions]) => ({ date, portions }));
  return { total: byDay.reduce((s, d) => s + d.portions, 0), byDay };
}

async function computePerDay(
  start: IsoDate,
  end: IsoDate,
  countedStatuses: string[],
  dayStartHourOverride?: number,
): Promise<Map<string, number>> {
  const dayStartHour = dayStartHourOverride ?? (await getReportingDayStartHour());
  const rangeStart = getReportingDateRange(start, dayStartHour).start;
  const rangeEnd = getReportingDateRange(end, dayStartHour).end;

  const orders = await orderDatabaseService.getOrders({
    status: countedStatuses,
    limit: 20000,
    sortBy: 'orderDate',
    sortOrder: 'asc',
    dateRange: { start: rangeStart, end: rangeEnd },
  });
  const caches = await ordersCacheService.getMultipleOrderCaches(orders.map((o: { externalId: string }) => o.externalId));

  const perDay = new Map<string, number>();
  for (const order of orders as Array<{ externalId: string; orderDate: Date }>) {
    const cacheData = caches.get(order.externalId);
    if (!cacheData?.processedItems) continue;
    let items: unknown;
    try {
      items = JSON.parse(cacheData.processedItems);
    } catch {
      continue;
    }
    if (!Array.isArray(items)) continue;
    let portions = 0;
    for (const item of items as Array<{ sku?: string; orderedQuantity?: number }>) {
      if (item && item.sku && Number(item.orderedQuantity) > 0) portions += Number(item.orderedQuantity);
    }
    if (portions <= 0) continue;
    const day = getReportingDate(order.orderDate, dayStartHour);
    perDay.set(day, (perDay.get(day) ?? 0) + portions);
  }
  return perDay;
}

export function clearPortionsCache(): void {
  cache.clear();
}
