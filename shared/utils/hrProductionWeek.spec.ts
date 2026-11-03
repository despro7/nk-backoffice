import { describe, expect, it } from 'vitest';
import {
  aggregateFopFromTimesheet,
  calendarWeekId,
  isFopWeekday,
  listProductionWeeksOverlappingMonth,
  productionWeekStart,
  resolveProductionWeek,
} from './hrProductionWeek';

describe('hrProductionWeek', () => {
  it('визначає початок виробничого тижня з пт', () => {
    expect(productionWeekStart('2026-08-11', 5)).toBe('2026-08-07');
    expect(productionWeekStart('2026-08-07', 5)).toBe('2026-08-07');
  });

  it('будує календарний weekId (понеділок)', () => {
    expect(calendarWeekId('2026-08-11')).toBe('2026-08-10');
  });

  it('фільтрує дні ФОП', () => {
    expect(isFopWeekday('2026-08-10', [1, 2, 3, 4, 5])).toBe(true);
    expect(isFopWeekday('2026-08-09', [1, 2, 3, 4, 5])).toBe(false);
  });

  it('fallback на календарний тиждень коли календар вимкнено', () => {
    const resolved = resolveProductionWeek('2026-08-11', {
      id: 1,
      isEnabled: false,
      weekStartDay: 1,
      fopWeekdays: [1, 2, 3, 4, 5],
      label: 'Стандарт',
    });
    expect(resolved.periodKind).toBe('calendar');
    expect(resolved.periodId).toBe('2026-08-10');
  });

  it('генерує періоди для місяця', () => {
    const weeks = listProductionWeeksOverlappingMonth(2026, 8, {
      id: 1,
      isEnabled: true,
      weekStartDay: 1,
      fopWeekdays: [1, 2, 3, 4, 5],
      label: 'Стандарт',
    });
    expect(weeks.length).toBeGreaterThan(3);
    expect(weeks[0]?.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('пропорційно агрегує ФОП за днями', () => {
    const result = aggregateFopFromTimesheet(
      [
        { date: '2026-08-10', kind: 'work', hours: 8 },
        { date: '2026-08-11', kind: 'work', hours: 8 },
        { date: '2026-08-16', kind: 'work', hours: 8 },
      ],
      {
        payGroup: 'hourly',
        rateKind: 'hourly',
        rate: 100,
        normHours: 168,
        grossAccrued: 2400,
        employerTotalCost: 2400,
        bonusAmount: 0,
        esvAmount: 0,
      },
      [1, 2, 3, 4, 5],
      '2026-08-10',
      '2026-08-16',
    );
    expect(result.fopHours).toBe(16);
    expect(result.employerCost).toBe(1600);
  });

  it('пропорція за довільний підперіод відносно годин місяця', () => {
    const result = aggregateFopFromTimesheet(
      [
        { date: '2026-08-10', kind: 'work', hours: 8 },
        { date: '2026-08-11', kind: 'work', hours: 8 },
        { date: '2026-08-12', kind: 'work', hours: 8 },
        { date: '2026-08-16', kind: 'work', hours: 8 },
      ],
      {
        payGroup: 'hourly',
        rateKind: 'hourly',
        rate: 100,
        normHours: 168,
        grossAccrued: 3200,
        employerTotalCost: 3200,
        bonusAmount: 0,
        esvAmount: 0,
      },
      [1, 2, 3, 4, 5],
      '2026-08-10',
      '2026-08-11',
    );
    expect(result.fopHours).toBe(16);
    expect(result.employerCost).toBe(1600);
  });

  it('додає премію без годинної пропорції', () => {
    const result = aggregateFopFromTimesheet(
      [
        { date: '2026-08-10', kind: 'work', hours: 8 },
        { date: '2026-08-11', kind: 'work', hours: 8 },
        { date: '2026-08-12', kind: 'work', hours: 8 },
      ],
      {
        payGroup: 'hourly',
        rateKind: 'hourly',
        rate: 100,
        normHours: 168,
        grossAccrued: 2400,
        employerTotalCost: 3400,
        bonusAmount: 1000,
        esvAmount: 0,
      },
      [1, 2, 3, 4, 5],
      '2026-08-10',
      '2026-08-11',
    );
    expect(result.employerCost).toBe(2600);
  });
});
