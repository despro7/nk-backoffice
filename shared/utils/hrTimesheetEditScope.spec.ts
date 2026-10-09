import { describe, expect, it } from 'vitest';
import { canEditTimesheetCell, isTimesheetEntryCreatedTodayKyiv } from './hrTimesheetEditScope';

describe('hrTimesheetEditScope', () => {
  const now = new Date('2026-03-20T12:00:00.000Z');

  it('allows full mode for any entry', () => {
    expect(
      canEditTimesheetCell({
        mode: 'full',
        currentUserId: 1,
        entry: { createdAt: '2020-01-01T00:00:00.000Z', createdByUserId: 99 },
      }),
    ).toBe(true);
  });

  it('allows empty cells for any employee in author-today mode', () => {
    expect(
      canEditTimesheetCell({
        mode: 'author-today',
        currentUserId: 1,
        entry: null,
      }),
    ).toBe(true);
  });

  it('blocks legacy entries without author', () => {
    expect(
      canEditTimesheetCell({
        mode: 'author-today',
        currentUserId: 1,
        entry: { createdAt: '2026-03-20T08:00:00.000Z', createdByUserId: null },
        now,
      }),
    ).toBe(false);
  });

  it('blocks entries authored by another user', () => {
    expect(
      canEditTimesheetCell({
        mode: 'author-today',
        currentUserId: 1,
        entry: { createdAt: '2026-03-20T08:00:00.000Z', createdByUserId: 2 },
        now,
      }),
    ).toBe(false);
  });

  it('allows own entries created today', () => {
    expect(
      canEditTimesheetCell({
        mode: 'author-today',
        currentUserId: 1,
        entry: { createdAt: '2026-03-20T08:00:00.000Z', createdByUserId: 1 },
        now,
      }),
    ).toBe(true);
  });

  it('blocks own entries created on a previous day', () => {
    expect(
      canEditTimesheetCell({
        mode: 'author-today',
        currentUserId: 1,
        entry: { createdAt: '2026-03-19T12:00:00.000Z', createdByUserId: 1 },
        now,
      }),
    ).toBe(false);
  });

  it('compares createdAt in Kyiv calendar day', () => {
    const createdTodayKyiv = new Date('2026-03-20T08:00:00.000Z');
    const createdYesterdayKyiv = new Date('2026-03-19T12:00:00.000Z');
    expect(isTimesheetEntryCreatedTodayKyiv(createdTodayKyiv, now)).toBe(true);
    expect(isTimesheetEntryCreatedTodayKyiv(createdYesterdayKyiv, now)).toBe(false);
  });
});
