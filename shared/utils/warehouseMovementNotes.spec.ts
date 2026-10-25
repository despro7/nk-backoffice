import { describe, expect, it } from 'vitest';
import {
  buildBackofficeMovementNotesSuffix,
  buildEffectiveMovementNotes,
} from './warehouseMovementNotes.js';

describe('warehouseMovementNotes', () => {
  it('mob-scan suffix includes scanning tag', () => {
    const suffix = buildBackofficeMovementNotesSuffix(true, 'mob-scan');
    expect(suffix).toMatch(/^Додано з Backoffice \(сканування\) /);
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
