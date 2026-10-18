import { describe, expect, it } from 'vitest';
import { buildInventoryGroupStatusMarks, buildInventoryHistoryDisplayEntries, mergeInventoryGroupItems } from './inventoryHistoryGroups';
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

describe('buildInventoryHistoryDisplayEntries', () => {
  it('лишає пару разом, якщо один склад редагується', () => {
    const entries = buildInventoryHistoryDisplayEntries([
      session({ id: '1', warehouse: 'small', status: 'revising', inventoryDate: '2026-10-18T07:30:00.000Z' }),
      session({ id: '2', warehouse: 'gp', status: 'completed', inventoryDate: '2026-10-18T08:00:00.000Z' }),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('group');
  });
});

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

describe('mergeInventoryGroupItems', () => {
  it('збирає МС і ГП однієї позиції в один рядок', () => {
    const ms = session({
      id: '1',
      warehouse: 'small',
      items: [
        product({ sku: 'A', name: 'Товар A', systemBalance: 10, actualCount: 8, systemBalanceGp: 99, actualCountGp: 1 }),
        product({ sku: 'C', name: 'Лише МС', systemBalance: 3, actualCount: 3, systemBalanceGp: 40 }),
      ],
    });
    const gp = session({
      id: '2',
      warehouse: 'gp',
      items: [
        product({ sku: 'A', name: 'Товар A', systemBalance: 50, actualCount: 4, systemBalanceGp: 20, actualCountGp: 18 }),
        product({ sku: 'B', name: 'Лише ГП', systemBalance: 7, actualCount: 7, systemBalanceGp: 5, actualCountGp: 5 }),
      ],
    });

    const merged = mergeInventoryGroupItems(ms, gp);
    const bySku = Object.fromEntries(merged.map((item) => [item.sku, item]));

    expect(bySku.A).toMatchObject({
      systemBalance: 10,
      actualCount: 8,
      systemBalanceGp: 20,
      actualCountGp: 18,
    });
    expect(bySku.C).toMatchObject({
      systemBalance: 3,
      actualCount: 3,
      systemBalanceGp: 0,
      actualCountGp: null,
    });
    expect(bySku.B).toMatchObject({
      systemBalance: 0,
      actualCount: null,
      systemBalanceGp: 5,
      actualCountGp: 5,
    });
  });
});
