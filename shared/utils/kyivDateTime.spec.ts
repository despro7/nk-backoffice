import { describe, expect, it } from 'vitest';
import {
  addDaysToYmd,
  formatKyivDateTime,
  getKyivReportingDate,
  getKyivReportingDateRange,
  kyivHour,
  kyivYmd,
  parseKyivDateTime,
  todayKyivYmd,
  zonedWallTimeToUtc,
} from './kyivDateTime.js';

describe('kyivDateTime', () => {
  it('parses wall-clock as Europe/Kyiv (summer UTC+3)', () => {
    const date = parseKyivDateTime('2026-10-15 07:30:00');
    expect(date).not.toBeNull();
    expect(date!.toISOString()).toBe('2026-10-15T04:30:00.000Z');
    expect(formatKyivDateTime(date!)).toBe('2026-10-15 07:30:00');
  });

  it('parses wall-clock as Europe/Kyiv (winter UTC+2)', () => {
    const date = parseKyivDateTime('2026-01-15 07:30:00');
    expect(date).not.toBeNull();
    expect(date!.toISOString()).toBe('2026-01-15T05:30:00.000Z');
    expect(formatKyivDateTime(date!)).toBe('2026-01-15 07:30:00');
  });

  it('keeps ISO instants intact', () => {
    const date = parseKyivDateTime('2026-10-15T04:30:00.000Z');
    expect(date!.toISOString()).toBe('2026-10-15T04:30:00.000Z');
    expect(formatKyivDateTime(date!)).toBe('2026-10-15 07:30:00');
  });

  it('zonedWallTimeToUtc is stable around DST', () => {
    const summer = zonedWallTimeToUtc(2026, 10, 15, 7, 30, 0);
    expect(summer.toISOString()).toBe('2026-10-15T04:30:00.000Z');
  });

  it('kyivYmd / kyivHour use Kyiv wall clock, not UTC', () => {
    const date = new Date('2026-10-15T22:30:00.000Z'); // 01:30 16.10 Kyiv (UTC+3)
    expect(kyivYmd(date)).toBe('2026-10-16');
    expect(kyivHour(date)).toBe(1);
    expect(todayKyivYmd(date)).toBe('2026-10-16');
  });

  it('addDaysToYmd crosses month and year', () => {
    expect(addDaysToYmd('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToYmd('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('getKyivReportingDate respects dayStartHour (16:00)', () => {
    const before = parseKyivDateTime('2026-10-16 15:59:00')!;
    const after = parseKyivDateTime('2026-10-16 16:00:00')!;
    expect(getKyivReportingDate(before, 16)).toBe('2026-10-16');
    expect(getKyivReportingDate(after, 16)).toBe('2026-10-17');
  });

  it('getKyivReportingDate: 0 = next day always, 24 = calendar day', () => {
    const date = parseKyivDateTime('2026-10-16 03:00:00')!;
    expect(getKyivReportingDate(date, 0)).toBe('2026-10-17');
    expect(getKyivReportingDate(date, 24)).toBe('2026-10-16');
  });

  it('getKyivReportingDate is stable around DST end (25.10.2026)', () => {
    const date = parseKyivDateTime('2026-10-25 15:59:00')!;
    expect(getKyivReportingDate(date, 16)).toBe('2026-10-25');
    expect(getKyivReportingDate(parseKyivDateTime('2026-10-25 16:00:00')!, 16)).toBe('2026-10-26');
  });

  it('getKyivReportingDateRange (16:00) spans previous day 16:00 .. 15:59:59', () => {
    const { start, end } = getKyivReportingDateRange('2026-10-17', 16);
    expect(formatKyivDateTime(start)).toBe('2026-10-16 16:00:00');
    expect(formatKyivDateTime(end)).toBe('2026-10-17 15:59:59');
  });

  it('getKyivReportingDateRange (24) = calendar day', () => {
    const { start, end } = getKyivReportingDateRange('2026-10-17', 24);
    expect(formatKyivDateTime(start)).toBe('2026-10-17 00:00:00');
    expect(formatKyivDateTime(end)).toBe('2026-10-17 23:59:59');
  });

  it('range around DST end uses real offsets', () => {
    const { start, end } = getKyivReportingDateRange('2026-10-26', 0);
    expect(formatKyivDateTime(start)).toBe('2026-10-25 00:00:00');
    expect(formatKyivDateTime(end)).toBe('2026-10-25 23:59:59');
    expect(end.getTime() - start.getTime()).toBe(25 * 3600 * 1000 - 1000);
  });
});
