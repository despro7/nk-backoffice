import { describe, expect, it } from 'vitest';
import {
  computeOrderedSetQuantityBreakdown,
  computeShippedQuantityBreakdown,
  extractOrderedSetItems,
  type ReportProductDescriptor,
} from './orderShipmentMetricsService.js';

function descriptor(
  sku: string,
  overrides: Partial<ReportProductDescriptor> = {},
): ReportProductDescriptor {
  return {
    sku,
    name: sku,
    categoryId: null,
    categoryName: null,
    categoryKey: null,
    categoryLabel: null,
    isSet: false,
    setPortions: 0,
    setComponents: [],
    stockBalances: {},
    ...overrides,
  };
}

describe('extractOrderedSetItems', () => {
  it('бере лише комплекти з рядків замовлення', () => {
    const descriptors = new Map([
      ['KIT', descriptor('KIT', { isSet: true, setComponents: [{ sku: 'LEAF', quantity: 4 }] })],
      ['LEAF', descriptor('LEAF')],
    ]);

    const items = extractOrderedSetItems(
      {
        items: [
          { sku: 'KIT', quantity: 2 },
          { sku: 'LEAF', quantity: 3 },
        ],
      },
      descriptors,
    );

    expect(items).toEqual([
      { sku: 'KIT', name: 'KIT', orderedQuantity: 2, quantity: 2 },
    ]);
  });
});

describe('computeOrderedSetQuantityBreakdown', () => {
  const descriptors = new Map([
    [
      'KIT',
      descriptor('KIT', {
        isSet: true,
        setPortions: 4,
        setComponents: [{ sku: 'LEAF', quantity: 4 }],
      }),
    ],
    ['LEAF', descriptor('LEAF')],
  ]);

  it('для комплекту рахує набори, а не розгорнуті порції', () => {
    const breakdown = computeOrderedSetQuantityBreakdown(
      { items: [{ sku: 'KIT', quantity: 2 }] },
      [{ sku: 'LEAF', orderedQuantity: 8 }],
      'KIT',
      descriptors,
    );

    expect(breakdown).toMatchObject({
      isMonolithicSet: true,
      monolithicSetQuantity: 2,
      cacheQuantity: 0,
    });
  });

  it('для компонента віднімає порції, що пішли в комплект', () => {
    const breakdown = computeOrderedSetQuantityBreakdown(
      {
        items: [
          { sku: 'KIT', quantity: 1 },
          { sku: 'LEAF', quantity: 3 },
        ],
      },
      [{ sku: 'LEAF', orderedQuantity: 7 }],
      'LEAF',
      descriptors,
    );

    expect(breakdown.isMonolithicSet).toBe(false);
    expect(breakdown.cacheQuantity).toBe(7);
    expect(breakdown.monolithicComponentQuantity).toBe(4);
  });
});

describe('computeShippedQuantityBreakdown', () => {
  it('без payload не вважає комплект монолітним (історична поведінка відвантажень)', () => {
    const descriptors = new Map([
      ['KIT', descriptor('KIT', { isSet: true, setComponents: [{ sku: 'LEAF', quantity: 4 }] })],
    ]);

    const breakdown = computeShippedQuantityBreakdown(
      { items: [{ sku: 'KIT', quantity: 2 }] },
      [],
      'KIT',
      descriptors,
    );

    expect(breakdown.isMonolithicSet).toBe(false);
    expect(breakdown.monolithicSetQuantity).toBe(0);
  });
});
