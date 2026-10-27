import { describe, expect, it } from 'vitest';
import { buildInventoryGroupStatusMarks, buildInventoryHistoryDisplayEntries, mergeInventoryGroupItems } from './inventoryHistoryGroups.js';
import type { InventoryHistoryItemLike, InventoryHistorySessionLike } from './inventoryHistoryGroups.js';

function product(partial: Partial<InventoryHistoryItemLike> & Pick<InventoryHistoryItemLike, 'sku'>): InventoryHistoryItemLike {
  return {
    systemBalance: 0,
    actualCount: null,
    boxCount: null,
    unit: 'pcs',
    portionsPerBox: 1,
    systemBalanceGp: 0,
    actualCountGp: null,
    boxCountGp: null,
    ...partial,
  };
}

function session(
  partial: Partial<InventoryHistorySessionLike> & Pick<InventoryHistorySessionLike, 'id' | 'warehouse'>,
): InventoryHistorySessionLike {
  return {
    inventoryDate: '2026-10-18T07:30:00.000Z',
    createdAt: '2026-10-18T07:30:00.000Z',
    status: 'completed',
    items: [],
    ...partial,
  };
}

describe('buildInventoryHistoryDisplayEntries', () => {
  it('не зводить МС і ГП різних календарних днів (Kyiv)', () => {
    const entries = buildInventoryHistoryDisplayEntries([
      session({ id: '1', warehouse: 'small', inventoryDate: '2026-10-26T12:00:00.000Z' }),
      session({ id: '2', warehouse: 'gp', inventoryDate: '2026-10-27T12:00:00.000Z' }),
    ]);
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.kind === 'single')).toBe(true);
  });

  it('лишає пару разом, якщо один склад редагується', () => {
    const entries = buildInventoryHistoryDisplayEntries([
      session({ id: '1', warehouse: 'small', status: 'revising', inventoryDate: '2026-10-18T07:30:00.000Z' }),
      session({ id: '2', warehouse: 'gp', status: 'completed', inventoryDate: '2026-10-18T08:00:00.000Z' }),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('group');
  });
});

describe('mergeInventoryGroupItems', () => {
  it('збирає МС і ГП однієї позиції в один рядок', () => {
    const ms = session({
      id: '1',
      warehouse: 'small',
      items: [
        product({ sku: 'A', name: 'Товар A', systemBalance: 10, actualCount: 8 }),
      ],
    });
    const gp = session({
      id: '2',
      warehouse: 'gp',
      items: [
        product({ sku: 'A', name: 'Товар A', systemBalanceGp: 20, actualCountGp: 18 }),
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
  });
});
