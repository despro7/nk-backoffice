import { describe, expect, it } from 'vitest';
import { buildPeriodOrderStats, type PeriodOrderInput } from './lalPeriodOrderStats.js';

const PHONE = '380501234567';

function order(id: number, date: Date | null, phone: string | null = PHONE): PeriodOrderInput {
  return { id, customerPhone: phone, orderDate: date };
}

/** dayStartHour = 0 зсуває будь-яку годину на наступну звітну дату — як getReportingDate. */
const october = {
  reportingFrom: '2026-10-01',
  reportingTo: '2026-10-31',
  dayStartHour: 0,
  fillEmptyDays: true,
};

describe('buildPeriodOrderStats', () => {
  it('перше замовлення в періоді не повторне, друге — повторне', () => {
    const stats = buildPeriodOrderStats(
      [
        order(1, new Date(2026, 9, 2, 12, 0, 0)),
        order(2, new Date(2026, 9, 3, 12, 0, 0)),
      ],
      october,
    );

    expect(stats.ordersInPeriod).toBe(2);
    expect(stats.repeatOrdersInPeriod).toBe(1);
    expect(stats.repeatOrdersPercent).toBe(50);
    expect(stats.periodTrend.find((point) => point.date === '2026-10-03')).toEqual({
      date: '2026-10-03',
      orders: 1,
      repeatOrders: 0,
    });
    expect(stats.periodTrend.find((point) => point.date === '2026-10-04')).toEqual({
      date: '2026-10-04',
      orders: 1,
      repeatOrders: 1,
    });
  });

  it('замовлення до періоду не входить у лічильник, але робить наступне повторним', () => {
    const stats = buildPeriodOrderStats(
      [
        order(1, new Date(2026, 8, 1, 12, 0, 0)),
        order(2, new Date(2026, 9, 5, 12, 0, 0)),
      ],
      october,
    );

    expect(stats.ordersInPeriod).toBe(1);
    expect(stats.repeatOrdersInPeriod).toBe(1);
    expect(stats.periodTrend.filter((point) => point.orders > 0)).toEqual([
      { date: '2026-10-06', orders: 1, repeatOrders: 1 },
    ]);
  });

  it('замовлення без валідного телефону входить у знаменник і не є повторним', () => {
    const stats = buildPeriodOrderStats(
      [
        order(1, new Date(2026, 9, 4, 12, 0, 0), '123'),
        order(2, new Date(2026, 9, 4, 15, 0, 0), null),
      ],
      october,
    );

    expect(stats.ordersInPeriod).toBe(2);
    expect(stats.repeatOrdersInPeriod).toBe(0);
  });

  it('за однакової дати першим є замовлення з меншим id', () => {
    const atNoon = new Date(2026, 9, 5, 12, 0, 0);
    const stats = buildPeriodOrderStats(
      [order(5, atNoon), order(2, new Date(atNoon.getTime()))],
      october,
    );

    expect(stats.ordersInPeriod).toBe(2);
    expect(stats.repeatOrdersInPeriod).toBe(1);
    expect(stats.periodTrend.find((point) => point.date === '2026-10-06')).toEqual({
      date: '2026-10-06',
      orders: 2,
      repeatOrders: 1,
    });
  });

  it('звітна година зсуває замовлення на наступний день', () => {
    const stats = buildPeriodOrderStats(
      [
        order(1, new Date(2026, 9, 1, 10, 0, 0)),
        order(2, new Date(2026, 9, 1, 18, 0, 0)),
      ],
      {
        reportingFrom: '2026-10-01',
        reportingTo: '2026-10-01',
        dayStartHour: 16,
        fillEmptyDays: true,
      },
    );

    expect(stats.ordersInPeriod).toBe(1);
    expect(stats.periodTrend).toEqual([{ date: '2026-10-01', orders: 1, repeatOrders: 0 }]);
  });

  it('заповнює порожні дні діапазону нулями', () => {
    const stats = buildPeriodOrderStats(
      [order(1, new Date(2026, 9, 1, 12, 0, 0))],
      {
        reportingFrom: '2026-10-01',
        reportingTo: '2026-10-03',
        dayStartHour: 0,
        fillEmptyDays: true,
      },
    );

    expect(stats.periodTrend).toEqual([
      { date: '2026-10-01', orders: 0, repeatOrders: 0 },
      { date: '2026-10-02', orders: 1, repeatOrders: 0 },
      { date: '2026-10-03', orders: 0, repeatOrders: 0 },
    ]);
  });

  it('для всього часу лишає лише дні з замовленнями', () => {
    const stats = buildPeriodOrderStats(
      [
        order(1, new Date(2026, 8, 1, 12, 0, 0)),
        order(2, new Date(2026, 9, 5, 12, 0, 0)),
      ],
      {
        reportingFrom: null,
        reportingTo: null,
        dayStartHour: 0,
        fillEmptyDays: false,
      },
    );

    expect(stats.ordersInPeriod).toBe(2);
    expect(stats.repeatOrdersInPeriod).toBe(1);
    expect(stats.periodTrend).toEqual([
      { date: '2026-09-02', orders: 1, repeatOrders: 0 },
      { date: '2026-10-06', orders: 1, repeatOrders: 1 },
    ]);
  });
});
