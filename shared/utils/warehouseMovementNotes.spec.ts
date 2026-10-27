import { describe, expect, it } from 'vitest';
import {
  buildBackofficeMovementNotesSuffix,
  buildEffectiveMovementNotes,
  isMobScanMovementHistoryRecord,
  movementNotesIndicateMobScan,
} from './warehouseMovementNotes.js';

describe('warehouseMovementNotes', () => {
  it('mob-scan suffix includes scanning tag', () => {
    const suffix = buildBackofficeMovementNotesSuffix(true, 'mob-scan');
    expect(suffix).toMatch(/^Додано з Backoffice \(сканування\) /);
  });

  it('detects mob scan from notes suffix', () => {
    expect(movementNotesIndicateMobScan('Коментар | Додано з Backoffice (сканування) 1.1.2020')).toBe(true);
    expect(movementNotesIndicateMobScan('Додано з Backoffice 1.1.2020')).toBe(false);
    expect(isMobScanMovementHistoryRecord({ comment: 'Оновлено з Backoffice (сканування) x' })).toBe(true);
  });

  it('replaces previous backoffice suffix including mob-scan', () => {
    const next = buildEffectiveMovementNotes(
      'Коментар | Додано з Backoffice (сканування) 1.1.2020, 00:00:00',
      false,
      'mob-scan',
    );
    expect(next.startsWith('Коментар | ')).toBe(true);
    expect(next).toContain('Оновлено з Backoffice (сканування)');
    expect(next).not.toContain('1.1.2020');
  });
});
