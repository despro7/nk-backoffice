import { describe, expect, it } from 'vitest';
import {
  amountInWordsUa,
  buildDashboard,
  defaultInvoicePeriod,
  formatHm,
  formatMoneyUa,
  hourlyRateFor,
  parseHm,
  portionsAmount,
} from './invoiceCalc.js';
import type { TrackingPeriod } from '../types/invoices.js';

describe('amountInWordsUa', () => {
  it.each([
    [36283, 'Тридцять шість тисяч двісті вісімдесят три гривні, 00 коп.'],
    [51850, 'Пʼятдесят одна тисяча вісімсот пʼятдесят гривень, 00 коп.'],
    [39448, 'Тридцять девʼять тисяч чотириста сорок вісім гривень, 00 коп.'],
    [29444, 'Двадцять девʼять тисяч чотириста сорок чотири гривні, 00 коп.'],
    [34724, 'Тридцять чотири тисячі сімсот двадцять чотири гривні, 00 коп.'],
    [33156, 'Тридцять три тисячі сто пʼятдесят шість гривень, 00 коп.'],
    [38575, 'Тридцять вісім тисяч пʼятсот сімдесят пʼять гривень, 00 коп.'],
    [32206, 'Тридцять дві тисячі двісті шість гривень, 00 коп.'],
  ])('%d', (amount, words) => {
    expect(amountInWordsUa(amount)).toBe(words);
  });

  it('edge forms', () => {
    expect(amountInWordsUa(0)).toBe('Нуль гривень, 00 коп.');
    expect(amountInWordsUa(1)).toBe('Одна гривня, 00 коп.');
    expect(amountInWordsUa(21000)).toBe('Двадцять одна тисяча гривень, 00 коп.');
    expect(amountInWordsUa(12000)).toBe('Дванадцять тисяч гривень, 00 коп.');
    expect(amountInWordsUa(1_000_002)).toBe('Один мільйон дві гривні, 00 коп.');
    expect(amountInWordsUa(100.5)).toBe('Сто гривень, 50 коп.');
  });
});

describe('money', () => {
  it('rounds half up to whole hryvnias like the old invoices', () => {
    expect(portionsAmount(14513, 2.5, true)).toBe(36283);
    expect(portionsAmount(15779, 2.5, true)).toBe(39448);
    expect(portionsAmount(20740, 2.5, true)).toBe(51850);
    expect(portionsAmount(11771, 2, true)).toBe(23542);
    expect(portionsAmount(14513, 2.5, false)).toBe(36282.5);
  });

  it('formats like the invoice', () => {
    expect(formatMoneyUa(36283)).toBe('36 283,00');
    expect(formatMoneyUa(500)).toBe('500,00');
  });
});

describe('period', () => {
  it('picks the half-month by the day of creation', () => {
    expect(defaultInvoicePeriod('2026-11-16')).toEqual({ start: '2026-11-01', end: '2026-11-15' });
    expect(defaultInvoicePeriod('2026-11-30')).toEqual({ start: '2026-11-01', end: '2026-11-15' });
    expect(defaultInvoicePeriod('2026-11-02')).toEqual({ start: '2026-10-16', end: '2026-10-31' });
    expect(defaultInvoicePeriod('2026-11-15')).toEqual({ start: '2026-10-16', end: '2026-10-31' });
    expect(defaultInvoicePeriod('2026-01-05')).toEqual({ start: '2025-12-16', end: '2025-12-31' });
    expect(defaultInvoicePeriod('2026-03-03')).toEqual({ start: '2026-02-16', end: '2026-02-28' });
  });
});

describe('time', () => {
  it('parses and formats h:mm', () => {
    expect(parseHm('64:18')).toBe(3858);
    expect(parseHm('0:05')).toBe(5);
    expect(parseHm('')).toBeNull();
    expect(parseHm('1:75')).toBeNull();
    expect(formatHm(3858)).toBe('64:18');
    expect(formatHm(-1691)).toBe('-28:11');
    expect(formatHm(null)).toBe('–');
  });
});

describe('hourlyRateFor', () => {
  it('uses the step effective on the date', () => {
    const steps = [
      { from: '2025-11-01', usd: 20 },
      { from: '2027-01-01', usd: 25 },
    ];
    expect(hourlyRateFor('2026-11-16', steps)).toBe(20);
    expect(hourlyRateFor('2027-01-01', steps)).toBe(25);
    expect(hourlyRateFor('2025-01-01', steps)).toBe(20);
  });
});

function period(over: Partial<TrackingPeriod> & Pick<TrackingPeriod, 'id' | 'start' | 'end'>): TrackingPeriod {
  return {
    factMinutes: null,
    tariff: null,
    usdRate: null,
    rateSource: null,
    adjustmentUah: 0,
    adjustmentNote: '',
    invoiceId: null,
    snapshot: null,
    ...over,
  };
}

describe('buildDashboard (matches the old spreadsheet)', () => {
  const base = {
    invoiceNumbers: new Map<number, number>(),
    defaultTariff: 2.5,
    roundToHryvnia: true,
    hourlyRates: [{ from: '2025-11-01', usd: 20 }],
    generatedAt: '2026-11-16T00:00:00.000Z',
  };
  const snap = (portions: number, tariff: number) => ({
    portions,
    tariff,
    grossUah: Math.round(portions * tariff),
    adjustmentUah: 0,
    totalUah: Math.round(portions * tariff),
    takenAt: '2026-01-01T00:00:00.000Z',
  });

  const periods = [
    period({ id: 1, start: '2025-11-01', end: '2025-11-22', factMinutes: parseHm('64:18'), tariff: 2, usdRate: 42, snapshot: snap(11771, 2) }),
    period({ id: 2, start: '2025-11-23', end: '2025-11-30', factMinutes: parseHm('05:08'), tariff: 2, usdRate: 42, snapshot: snap(4548, 2) }),
  ];

  it('reproduces overdraft and accumulated hours of the first two rows (within a minute of the sheet)', () => {
    const data = buildDashboard({ ...base, periods, mode: 'history', livePortions: new Map() });
    const [r1, r2] = data.rows;
    const near = (actual: number, hm: string) => expect(Math.abs(actual - (parseHm(hm) as number))).toBeLessThanOrEqual(1);
    expect(r1.amountUah).toBe(23542);
    expect(formatHm(r1.accumulatedMinutes)).toBe('64:18');
    near(r1.paidMinutes, '28:01');
    near(r1.overdraftMinutes, '36:17');
    expect(Math.round(r1.costUsd)).toBe(1286);
    // the next period carries the previous overdraft: accumulated = overdraft + fact
    expect(r2.accumulatedMinutes).toBeCloseTo(r1.overdraftMinutes + (parseHm('05:08') as number), 5);
    near(r2.accumulatedMinutes, '41:25');
    near(r2.paidMinutes, '10:50');
    near(r2.overdraftMinutes, '30:35');
    expect(Math.round(r2.deltaUsd)).toBe(114);
  });

  it('keeps history fixed while live follows current orders', () => {
    const live = new Map([[1, 11000]]);
    const history = buildDashboard({ ...base, periods, mode: 'history', livePortions: live });
    const liveMode = buildDashboard({ ...base, periods, mode: 'live', livePortions: live });
    expect(history.rows[0].portions).toBe(11771);
    expect(history.rows[0].portionsSource).toBe('snapshot');
    expect(liveMode.rows[0].portions).toBe(11000);
    expect(liveMode.rows[0].portionsSource).toBe('live');
    expect(liveMode.rows[1].portionsSource).toBe('snapshot');
    expect(liveMode.rows[0].portionsDrift).toBe(-771);
    expect(liveMode.rows[1].portions).toBe(4548);
  });

  it('compares the average invoice of the last 12 complete periods with the 12 before', () => {
    const many: TrackingPeriod[] = [];
    for (let i = 0; i < 24; i += 1) {
      const month = String(1 + Math.floor(i / 2)).padStart(2, '0');
      const half = i % 2 === 0;
      many.push(
        period({
          id: i + 1,
          start: `2025-${month}-${half ? '01' : '16'}`,
          end: `2025-${month}-${half ? '15' : '28'}`,
          tariff: 1,
          usdRate: 40,
          // first 12 periods: 1000 portions, last 12: 1100 portions (+10%)
          snapshot: snap(i < 12 ? 1000 : 1100, 1),
        }),
      );
    }
    const data = buildDashboard({ ...base, periods: many, mode: 'history', livePortions: new Map(), generatedAt: '2026-01-01T00:00:00.000Z' });
    expect(data.kpi.avgAmountChange).toBeCloseTo(0.1, 5);
    const none = buildDashboard({ ...base, periods: many.slice(12), mode: 'history', livePortions: new Map(), generatedAt: '2026-01-01T00:00:00.000Z' });
    expect(none.kpi.avgAmountChange).toBeNull();
  });

  it('adds portions and amount per day to the month summary', () => {
    const two = [
      period({ id: 1, start: '2026-10-01', end: '2026-10-15', tariff: 2, usdRate: 40, snapshot: snap(1000, 2) }),
      period({ id: 2, start: '2026-10-16', end: '2026-10-31', tariff: 2, usdRate: 40, snapshot: snap(500, 2) }),
    ];
    const data = buildDashboard({ ...base, periods: two, mode: 'history', livePortions: new Map(), generatedAt: '2026-11-16T00:00:00.000Z' });
    const [month] = data.months;
    expect(month.portions).toBe(1500);
    expect(month.days).toBe(31);
    expect(month.amountUah).toBe(3000);
    expect(month.amountPerDay).toBeCloseTo(3000 / 31, 5);
    // 3000 UAH at rate 40 = 75 USD
    expect(month.amountUsd).toBeCloseTo(75, 5);
    expect(month.amountUsdPerDay).toBeCloseTo(75 / 31, 5);
  });

  it('counts only the elapsed days of a period in progress', () => {
    const cur = [period({ id: 1, start: '2026-11-01', end: '2026-11-15', tariff: 2, usdRate: 40, snapshot: snap(300, 2) })];
    const data = buildDashboard({ ...base, periods: cur, mode: 'history', livePortions: new Map(), generatedAt: '2026-11-10T00:00:00.000Z' });
    expect(data.months[0].days).toBe(10);
    expect(data.months[0].amountPerDay).toBeCloseTo(60, 5);
  });

  it('applies the internal adjustment to the amount', () => {
    const adj = [period({ id: 1, start: '2026-10-01', end: '2026-10-15', tariff: 2.5, usdRate: 43.5, adjustmentUah: -2960, snapshot: snap(16614, 2.5) })];
    const data = buildDashboard({ ...base, periods: adj, mode: 'history', livePortions: new Map() });
    expect(data.rows[0].grossUah).toBe(41535);
    expect(data.rows[0].amountUah).toBe(38575);
  });
});
