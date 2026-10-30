/**
 * Замовлення періоду і повторні продажі для LAL.
 * Рахує рядки замовлень за звітною датою, без фільтрів аудиторії (LTV, пресет, логіка).
 */

import { getReportingDate } from '../lib/utils.js';
import { normalizePhoneNumber } from '../../shared/utils/phoneNormalizer.js';
import type { LalPeriodTrendPoint } from '../../shared/types/lalAudiences.js';

export type PeriodOrderInput = {
  id: number;
  customerPhone: string | null;
  orderDate: Date | null;
};

export type PeriodOrderStats = {
  ordersInPeriod: number;
  repeatOrdersInPeriod: number;
  repeatOrdersPercent: number;
  periodTrend: LalPeriodTrendPoint[];
};

export type PeriodOrderStatsOptions = {
  /** Нижня межа звітної дати `YYYY-MM-DD`, включно. null — без межі. */
  reportingFrom: string | null;
  /** Верхня межа звітної дати `YYYY-MM-DD`, включно. null — без межі. */
  reportingTo: string | null;
  dayStartHour: number;
  /** Заповнити порожні дні між межами нулями. Для «весь час» — false. */
  fillEmptyDays: boolean;
};

function isExportablePhone(normalized: string): boolean {
  if (/^380\d{9}$/.test(normalized)) return true;
  return /^\d{10,15}$/.test(normalized) && !normalized.startsWith('0');
}

function phoneKey(phone: string | null): string | null {
  const normalized = normalizePhoneNumber(phone || '');
  if (!isExportablePhone(normalized)) return null;
  return normalized;
}

function inReportingRange(date: string, from: string | null, to: string | null): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function formatLocalIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function eachReportingDay(from: string, to: string): string[] {
  if (from > to) return [];
  const [year, month, day] = from.split('-').map(Number);
  const cursor = new Date(year, month - 1, day);
  const [endYear, endMonth, endDay] = to.split('-').map(Number);
  const end = new Date(endYear, endMonth - 1, endDay);
  const days: string[] = [];
  while (cursor <= end) {
    days.push(formatLocalIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

type TaggedOrder = {
  id: number;
  time: number;
  phone: string | null;
  reportingDate: string;
};

export function buildPeriodOrderStats(
  orders: PeriodOrderInput[],
  options: PeriodOrderStatsOptions,
): PeriodOrderStats {
  const tagged: TaggedOrder[] = [];

  for (const order of orders) {
    if (!order.orderDate) continue;
    const date = order.orderDate instanceof Date ? order.orderDate : new Date(order.orderDate);
    if (Number.isNaN(date.getTime())) continue;
    tagged.push({
      id: order.id,
      time: date.getTime(),
      phone: phoneKey(order.customerPhone),
      reportingDate: getReportingDate(date, options.dayStartHour),
    });
  }

  const byPhone = new Map<string, number[]>();
  tagged.forEach((row, index) => {
    if (!row.phone) return;
    const list = byPhone.get(row.phone);
    if (list) list.push(index);
    else byPhone.set(row.phone, [index]);
  });

  const isRepeat = new Array<boolean>(tagged.length).fill(false);
  for (const indexes of byPhone.values()) {
    indexes.sort((left, right) => tagged[left].time - tagged[right].time || tagged[left].id - tagged[right].id);
    for (let index = 1; index < indexes.length; index += 1) {
      isRepeat[indexes[index]] = true;
    }
  }

  const byDay = new Map<string, { orders: number; repeatOrders: number }>();
  let ordersInPeriod = 0;
  let repeatOrdersInPeriod = 0;

  tagged.forEach((row, index) => {
    if (!inReportingRange(row.reportingDate, options.reportingFrom, options.reportingTo)) return;
    ordersInPeriod += 1;
    const repeat = isRepeat[index];
    if (repeat) repeatOrdersInPeriod += 1;
    const bucket = byDay.get(row.reportingDate) ?? { orders: 0, repeatOrders: 0 };
    bucket.orders += 1;
    if (repeat) bucket.repeatOrders += 1;
    byDay.set(row.reportingDate, bucket);
  });

  let periodTrend: LalPeriodTrendPoint[];
  if (options.fillEmptyDays && options.reportingFrom && options.reportingTo) {
    periodTrend = eachReportingDay(options.reportingFrom, options.reportingTo).map((date) => {
      const bucket = byDay.get(date);
      return {
        date,
        orders: bucket?.orders ?? 0,
        repeatOrders: bucket?.repeatOrders ?? 0,
      };
    });
  } else {
    periodTrend = [...byDay.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, bucket]) => ({
        date,
        orders: bucket.orders,
        repeatOrders: bucket.repeatOrders,
      }));
  }

  const repeatOrdersPercent =
    ordersInPeriod === 0 ? 0 : Math.round((repeatOrdersInPeriod / ordersInPeriod) * 1000) / 10;

  return {
    ordersInPeriod,
    repeatOrdersInPeriod,
    repeatOrdersPercent,
    periodTrend,
  };
}
