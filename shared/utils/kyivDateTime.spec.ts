import { describe, expect, it } from 'vitest';
import { formatKyivDateTime, parseKyivDateTime, zonedWallTimeToUtc } from './kyivDateTime.js';

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
});
