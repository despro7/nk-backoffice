import { describe, expect, it } from 'vitest';
import {
  addDaysYmd,
  calendarWeekSequenceFromYearStart,
  countCalendarWorkDays,
  findHrWorkWeekContainingDate,
  formatHrWorkWeekLabel,
  listHrWorkWeeksForMonth,
  matchHrWorkWeekPresetKey,
} from './hrWorkWeekPeriods';

describe('hrWorkWeekPeriods', () => {
  it('будує робочі тижні для місяця', () => {
    const weeks = listHrWorkWeeksForMonth('2026-09');
    expect(weeks.length).toBeGreaterThan(3);
    expect(weeks[0]?.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(weeks[0]?.endDate).toBe(addDaysYmd(weeks[0]!.startDate, 4));
  });

  it('форматує label тижня', () => {
    expect(formatHrWorkWeekLabel('2026-09-01', '2026-09-05')).toBe('1–5 вер');
  });

  it('знаходить тиждень за датою', () => {
    const weeks = listHrWorkWeeksForMonth('2026-09');
    const week = findHrWorkWeekContainingDate(weeks, '2026-09-03');
    expect(week?.startDate).toBe('2026-08-31');
    expect(week?.endDate).toBe('2026-09-04');
  });

  it('рахує календарні робочі дні пн–пт', () => {
    expect(countCalendarWorkDays('2026-03-01', '2026-03-07')).toBe(5);
    expect(countCalendarWorkDays('2026-03-02', '2026-03-06')).toBe(5);
  });

  it('повертає порядковий номер календарного тижня з початку року', () => {
    expect(calendarWeekSequenceFromYearStart('2026-01-05')).toBe(2);
    expect(calendarWeekSequenceFromYearStart('2026-01-01')).toBe(1);
  });

  it('зіставляє пресет за діапазоном', () => {
    const weeks = listHrWorkWeeksForMonth('2026-09');
    const week = weeks.find((item) => item.startDate === '2026-08-31');
    expect(week).toBeTruthy();
    expect(
      matchHrWorkWeekPresetKey(week!.startDate, week!.endDate, weeks, '2026-12-31'),
    ).toBe(week!.id);
    expect(
      matchHrWorkWeekPresetKey('2026-09-02', week!.endDate, weeks, '2026-12-31'),
    ).toBe('custom');
  });
});
