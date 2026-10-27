import { describe, expect, it } from 'vitest';
import { buildProductHistoryBalanceSnapshotsByDay } from './mergeProductHistoryEntriesByDay.js';
import type { InventoryProductHistorySessionInput } from './mergeProductHistoryEntriesByDay.js';

function session(
  partial: Partial<InventoryProductHistorySessionInput> & Pick<InventoryProductHistorySessionInput, 'id' | 'warehouse'>,
): InventoryProductHistorySessionInput {
  return {
    inventoryDate: '2026-10-26T13:41:00.000Z',
    createdAt: '2026-10-26T13:41:00.000Z',
    status: 'completed',
    items: [],
    ...partial,
  };
}

describe('buildProductHistoryBalanceSnapshotsByDay', () => {
  it('зводить пару МС+ГП одного дня в один рядок', () => {
    const snapshots = buildProductHistoryBalanceSnapshotsByDay('A', [
      session({
        id: '183',
        warehouse: 'small',
        inventoryDate: '2026-10-26T13:59:00.000Z',
        items: [{
          sku: 'A',
          systemBalance: 40,
          actualCount: 39,
          systemBalanceGp: 99,
        }],
      }),
      session({
        id: '184',
        warehouse: 'gp',
        inventoryDate: '2026-10-26T14:15:00.000Z',
        items: [{
          sku: 'A',
          systemBalanceGp: 43,
          actualCountGp: 40,
          unit: 'pcs',
        }],
      }),
    ]);

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      dayKey: '2026-10-26',
      systemBalance: 40,
      actual: 39,
      systemBalanceGp: 43,
      actualGp: 40,
    });
  });

  it('лишає окремі дні окремими рядками', () => {
    const snapshots = buildProductHistoryBalanceSnapshotsByDay('A', [
      session({
        id: '1',
        warehouse: 'small',
        inventoryDate: '2026-10-25T10:00:00.000Z',
        items: [{ sku: 'A', systemBalance: 10, actualCount: 10 }],
      }),
      session({
        id: '2',
        warehouse: 'small',
        inventoryDate: '2026-10-24T10:00:00.000Z',
        items: [{ sku: 'A', systemBalance: 20, actualCount: 18 }],
      }),
    ]);

    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((s) => s.dayKey).sort()).toEqual(['2026-10-24', '2026-10-25']);
  });
});
