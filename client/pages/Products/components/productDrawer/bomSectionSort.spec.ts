import { describe, expect, it } from 'vitest';
import {
  BOM_MANUAL_SORT,
  nextBomSortDescriptor,
  reorderBomRows,
  sortBomEntries,
} from './bomSectionSort';
import type { BomRow } from './productDrawerTypes';

const units = [
  { id: 'g', name: 'г', code: 'g' },
  { id: 'kg', name: 'кг', code: 'kg' },
];

function row(partial: Partial<BomRow> & Pick<BomRow, 'componentName'>): BomRow {
  return {
    componentGoodId: partial.componentGoodId ?? partial.componentName,
    componentName: partial.componentName,
    componentSku: partial.componentSku ?? null,
    qty: partial.qty ?? 1,
    unitId: partial.unitId ?? 'g',
    note: partial.note ?? '',
    componentWeight: partial.componentWeight ?? null,
    componentAccPolicyId: partial.componentAccPolicyId ?? null,
    cookingLossPercent: partial.cookingLossPercent ?? 0,
  };
}

describe('sortBomEntries', () => {
  it('зберігає ручний порядок за sortOrder', () => {
    const rows = [row({ componentName: 'Б' }), row({ componentName: 'А' })];
    const sorted = sortBomEntries(rows, BOM_MANUAL_SORT, units);
    expect(sorted.map((e) => e.row.componentName)).toEqual(['Б', 'А']);
  });

  it('сортує за назвою', () => {
    const rows = [row({ componentName: 'Цибуля' }), row({ componentName: 'Морква' })];
    const sorted = sortBomEntries(rows, { column: 'name', direction: 'ascending' }, units);
    expect(sorted.map((e) => e.row.componentName)).toEqual(['Морква', 'Цибуля']);
  });

  it('сортує за кількістю спадно', () => {
    const rows = [row({ componentName: 'А', qty: 1 }), row({ componentName: 'Б', qty: 5 })];
    const sorted = sortBomEntries(rows, { column: 'qty', direction: 'descending' }, units);
    expect(sorted.map((e) => e.row.qty)).toEqual([5, 1]);
  });
});

describe('nextBomSortDescriptor', () => {
  it('перемикає напрямок для тієї ж колонки', () => {
    expect(nextBomSortDescriptor({ column: 'name', direction: 'ascending' }, 'name')).toEqual({
      column: 'name',
      direction: 'descending',
    });
  });
});

describe('reorderBomRows', () => {
  it('переставляє рядки', () => {
    const rows = [row({ componentName: 'А' }), row({ componentName: 'Б' }), row({ componentName: 'В' })];
    expect(reorderBomRows(rows, 0, 2).map((r) => r.componentName)).toEqual(['Б', 'В', 'А']);
  });
});
