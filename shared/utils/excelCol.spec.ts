import { describe, expect, it } from 'vitest';
import { excelColToIndex, excelIndexToCol, normalizeExcelCol } from '../../shared/utils/excelCol';

describe('excelCol', () => {
  it('A → 0, U → 20, W → 22, AA → 26', () => {
    expect(excelColToIndex('A')).toBe(0);
    expect(excelColToIndex('U')).toBe(20);
    expect(excelColToIndex('W')).toBe(22);
    expect(excelColToIndex('AA')).toBe(26);
  });

  it('індекс → літера', () => {
    expect(excelIndexToCol(0)).toBe('A');
    expect(excelIndexToCol(20)).toBe('U');
    expect(excelIndexToCol(26)).toBe('AA');
  });

  it('нормалізує регістр і сміття', () => {
    expect(normalizeExcelCol(' u ')).toBe('U');
    expect(normalizeExcelCol('D3')).toBe('D');
  });
});
