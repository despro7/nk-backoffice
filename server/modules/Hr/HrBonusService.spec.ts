import { describe, expect, it } from 'vitest';
import { countCalendarWorkDays } from '../../../shared/utils/hrWorkWeekPeriods.js';

describe('HrBonusService proportional bonus', () => {
  it('пропорційно календарним пн–пт', () => {
    const monthlyBonus = 3000;
    const monthWorkDays = countCalendarWorkDays('2026-03-01', '2026-03-31');
    const periodWorkDays = countCalendarWorkDays('2026-03-01', '2026-03-15');
    const bonusForPeriod = Math.round((monthlyBonus * (periodWorkDays / monthWorkDays) + Number.EPSILON) * 100) / 100;
    expect(monthWorkDays).toBeGreaterThan(periodWorkDays);
    expect(bonusForPeriod).toBeGreaterThan(0);
    expect(bonusForPeriod).toBeLessThan(monthlyBonus);
  });
});
