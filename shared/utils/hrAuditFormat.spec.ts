import { describe, expect, it } from 'vitest';
import {
  formatHrAuditAction,
  formatHrAuditDetails,
  formatTimesheetCellValue,
  sortHrAuditLogsChronological,
} from './hrAuditFormat.js';

describe('hrAuditFormat', () => {
  it('formats timesheet cell values', () => {
    expect(formatTimesheetCellValue('work', '8.00')).toBe('8 год');
    expect(formatTimesheetCellValue('О', null)).toBe('Відпустка');
  });

  it('formats cell_changed diff', () => {
    const details = formatHrAuditDetails('cell_changed', {
      date: '2026-09-10',
      before: { kind: 'work', hours: '8.00' },
      after: { kind: 'work', hours: '5.00' },
    });
    expect(details).toBe('Зміна значення: «8 год» → «5 год»');
  });

  it('formats first cell value as set', () => {
    const details = formatHrAuditDetails('cell_changed', {
      after: { kind: 'work', hours: '5.00' },
    });
    expect(details).toBe('Встановлено «5 год»');
  });

  it('formats cleared cell', () => {
    const details = formatHrAuditDetails('cell_changed', {
      before: { kind: 'work', hours: '5.00' },
    });
    expect(details).toBe('Комірку очищено');
  });

  it('formats employment merge details', () => {
    const details = formatHrAuditDetails('employment_merged', {
      removed: { label: 'ФОП А · Офіційна ставка · 01.01.2024 – досі' },
      kept: { label: 'ФОП Б · Офіційна ставка · 01.06.2024 – досі' },
      transferred: { timesheetEntries: 3, payTerms: 1 },
      deletedDuplicates: { timesheetEntries: 1, payTerms: 1 },
    });
    expect(details).toContain('Видалено:');
    expect(details).toContain('Перенесено');
    expect(details).toContain('Дублікати');
  });

  it('formats person merge with display name', () => {
    const details = formatHrAuditDetails('merged', {
      sourceId: 12,
      targetId: 5,
      sourceDisplayName: 'Іванов Іван',
    });
    expect(details).toBe('«Іванов Іван» обʼєднано з #5');
  });

  it('maps known actions to Ukrainian labels', () => {
    expect(formatHrAuditAction('cell_changed')).toBe('Зміна комірки табеля');
  });

  it('sorts audit logs chronologically (newest last)', () => {
    const sorted = sortHrAuditLogsChronological([
      { createdAt: '2026-09-13T10:00:00.000Z' },
      { createdAt: '2026-09-13T08:00:00.000Z' },
      { createdAt: '2026-09-13T12:00:00.000Z' },
    ]);
    expect(sorted.map((item) => item.createdAt)).toEqual([
      '2026-09-13T08:00:00.000Z',
      '2026-09-13T10:00:00.000Z',
      '2026-09-13T12:00:00.000Z',
    ]);
  });
});
