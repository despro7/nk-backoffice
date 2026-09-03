import { describe, expect, it } from 'vitest';
import { buildTimesheetMonthMeta, parseYearMonth } from './hrTimesheetCalendar';

describe('hrTimesheetCalendar', () => {
  it('рахує будні вересня 2026 і тижневі вікна', () => {
    const meta = buildTimesheetMonthMeta(2026, 9);
    expect(meta.days).toHaveLength(30);
    expect(meta.normWorkDays).toBe(22);
    expect(meta.normHours).toBe('176.00');
    expect(meta.days[4]?.isWeekend).toBe(true); // 5.09 субота
    expect(meta.days[5]?.isWeekend).toBe(true); // 6.09 неділя
    expect(meta.weeks[0]?.colSpan).toBe(6); // вт 1 – нд 6
    expect(meta.weeks.reduce((sum, week) => sum + week.colSpan, 0)).toBe(30);
  });

  it('парсить YYYY-MM', () => {
    expect(parseYearMonth('2026-09')).toEqual({ year: 2026, month: 9 });
  });
});
