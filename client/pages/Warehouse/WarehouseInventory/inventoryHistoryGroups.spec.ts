import { describe, expect, it } from 'vitest';
import { buildInventoryGroupStatusMarks } from './inventoryHistoryGroups';
import type { InventoryProduct, InventorySession } from './WarehouseInventoryTypes';

function product(partial: Partial<InventoryProduct> & Pick<InventoryProduct, 'sku'>): InventoryProduct {
  return {
    id: partial.sku,
    name: partial.sku,
    systemBalance: 0,
    actualCount: null,
    boxCount: null,
    unit: 'pcs',
    portionsPerBox: 1,
    checked: false,
    systemBalanceGp: 0,
    actualCountGp: null,
    boxCountGp: null,
    ...partial,
  };
}

function session(partial: Partial<InventorySession> & Pick<InventorySession, 'id' | 'warehouse'>): InventorySession {
  return {
    inventoryDate: '2026-10-18T07:30:00.000Z',
    createdAt: '2026-10-18T07:30:00.000Z',
    createdBy: '1',
    status: 'completed',
    completedAt: '2026-10-18T07:30:00.000Z',
    comment: '',
    items: [],
    ...partial,
  };
}

describe('buildInventoryGroupStatusMarks', () => {
  it('позначає лише той склад, який редагується', () => {
    const marks = buildInventoryGroupStatusMarks(
      session({ id: '1', warehouse: 'small', status: 'revising' }),
      session({ id: '2', warehouse: 'gp', status: 'completed' }),
    );
    expect(marks.map((mark) => mark.label)).toEqual(['Редагується - МС']);
  });

  it('об’єднує однаковий статус обох складів', () => {
    const marks = buildInventoryGroupStatusMarks(
      session({ id: '1', warehouse: 'small', status: 'revising' }),
      session({ id: '2', warehouse: 'gp', status: 'revising' }),
    );
    expect(marks.map((mark) => mark.label)).toEqual(['Редагується - МС і ГП']);
  });
});
