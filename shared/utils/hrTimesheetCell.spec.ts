import { describe, expect, it } from 'vitest';
import { applyTimesheetKey, parseTimesheetHours } from './hrTimesheetCell';

describe('hrTimesheetCell', () => {
  it('цифра → години, кома як десятковий', () => {
    expect(applyTimesheetKey('8', '')).toEqual({ type: 'hours', hours: '8' });
    expect(parseTimesheetHours('7,5')).toBe('7.5');
    expect(parseTimesheetHours('8')).toBe('8');
  });

  it('літери → коди дня', () => {
    expect(applyTimesheetKey('в', '')).toEqual({ type: 'kind', kind: 'В' });
    expect(applyTimesheetKey('о', '')).toEqual({ type: 'kind', kind: 'О' });
    expect(applyTimesheetKey('н', '')).toEqual({ type: 'kind', kind: 'Н' });
    expect(applyTimesheetKey('т', '')).toEqual({ type: 'buffer', buffer: 'т' });
    expect(applyTimesheetKey('н', 'т')).toEqual({ type: 'kind', kind: 'ТН' });
    expect(applyTimesheetKey('р', 'п')).toEqual({ type: 'kind', kind: 'Пр' });
    expect(applyTimesheetKey('в', 'с')).toEqual({ type: 'kind', kind: 'Св' });
  });
});
