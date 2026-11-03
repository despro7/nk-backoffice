import { describe, it, expect } from 'vitest';
import { combineBoxesWithItems } from './orderAssemblyUtils';

const makeBoxes = (n: number, portions = { soft: 35, hard: 36 }) =>
  Array.from({ length: n }).map((_, i) => ({
    id: `box_${i + 1}`,
    name: `Box ${i + 1}`,
    self_weight: 0,
    weight: 0,
    portionsPerBox: portions.soft,
    qntTo: portions.hard,
    boxIndex: i,
    qntFrom: 1,
  }));

const makeItem = (name: string, quantity: number, expectedWeightKg: number, portionsPerItem?: number) => ({
  id: name,
  name,
  quantity,
  expectedWeight: expectedWeightKg,
  portionsPerItem,
  status: 'default' as const,
  type: 'product' as const,
  sku: name,
  barcode: name,
});

const productItems = (result: ReturnType<typeof combineBoxesWithItems>) =>
  result.checklistItems.filter((item) => item.type === 'product');

describe('combineBoxesWithItems', () => {
  it('places a monolithic set that fits into a regular box', () => {
    const result = combineBoxesWithItems(makeBoxes(1, { soft: 24, hard: 24 }), [makeItem('Small set', 1, 4.2, 12)]);

    expect(result.checklistItems.find((item) => item.type === 'box')).toBeDefined();
    expect(productItems(result)).toHaveLength(1);
    expect(productItems(result)[0].boxIndex).toBe(0);
    expect(result.unallocatedPortions).toBe(0);
  });

  it('splits an oversized monolithic set across boxes without losing portions', () => {
    const result = combineBoxesWithItems(makeBoxes(2, { soft: 24, hard: 24 }), [makeItem('Big set', 1, 9.6, 40)], false, 'default');
    const parts = productItems(result);

    expect(result.unallocatedPortions).toBe(0);
    expect(new Set(parts.map((part) => part.boxIndex)).size).toBe(2);
    expect(parts.reduce((sum, part) => sum + Number(part.portionsPerItem ?? 0), 0)).toBe(40);
  });

  it('order 17810: fits 5×50 regular dishes and a heavy monolithic set (20×5 portions, 31.6 kg) into 10 boxes', () => {
    const regulars = Array.from({ length: 5 }).map((_, i) => makeItem(`Dish${i + 1}`, 50, 50 * 0.33));
    const monolith = makeItem('Vinegret', 20, 31.62, 5);

    const result = combineBoxesWithItems(makeBoxes(10), [...regulars, monolith], false, 'default');

    expect(result.unallocatedPortions).toBe(0);
    expect(result.unallocatedItems).toEqual([]);
  });
});
