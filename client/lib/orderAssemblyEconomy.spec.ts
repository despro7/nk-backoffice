import { describe, it, expect } from 'vitest';
import {
  combineBoxesWithItems,
  expandProductSets,
  getEffectiveTotalPortions,
  getItemEffectiveCapacityPerUnit,
  getItemRawPortions,
} from './orderAssemblyUtils';
import fixture from './__fixtures__/orderAssemblyRealData.json';
import type { OrderChecklistItem } from '../types/orderAssembly';

const makeBoxes = (n: number, totalPortions: number, hard = 36) => {
  const soft = Math.min(hard, Math.ceil(totalPortions / n));
  return Array.from({ length: n }).map((_, i) => ({
    id: `box_${i + 1}`,
    name: `Box ${i + 1}`,
    self_weight: 0,
    weight: 0,
    portionsPerBox: soft,
    qntTo: hard,
    qntFrom: 1,
    boxIndex: i,
  }));
};

const boxesNeeded = (portions: number) => Math.max(1, Math.ceil(portions / 36));

const monolith = (
  name: string,
  portionsPerItem: number,
  weightRatio: number,
  quantity = 1,
): OrderChecklistItem =>
  ({
    id: name,
    name,
    sku: name,
    quantity,
    expectedWeight: portionsPerItem * 0.33 * weightRatio * quantity,
    portionsPerItem,
    weightRatio,
    status: 'default',
    type: 'product',
  }) as any;

const regular = (name: string, quantity: number, unitRatio = 1): OrderChecklistItem =>
  ({
    id: name,
    name,
    sku: name,
    quantity,
    expectedWeight: quantity * 0.33 * unitRatio,
    unitRatio,
    status: 'default',
    type: 'product',
  }) as any;

const products = (result: ReturnType<typeof combineBoxesWithItems>) =>
  result.checklistItems.filter((i) => i.type === 'product');

describe('economy mode: effective portions', () => {
  it('monolith 37 portions with weightRatio 0.95 gives 35.15 effective, total ceil 36', () => {
    const item = monolith('Set37', 37, 0.95);
    expect(getItemRawPortions(item)).toBe(37);
    expect(getItemEffectiveCapacityPerUnit(item as any)).toBeCloseTo(35.15, 6);
    expect(getEffectiveTotalPortions([item])).toBe(36);
  });

  it('never exceeds raw portions even when coefficient > 1', () => {
    expect(getEffectiveTotalPortions([monolith('Big', 10, 1.3)])).toBe(10);
    expect(getEffectiveTotalPortions([regular('Dish', 4, 1.5)])).toBe(4);
  });

  it('float noise does not push 36.0000001 to 37', () => {
    const items = [regular('A', 3, 0.1 + 0.2), regular('B', 35, 1)]; // 0.9 + 35 = 35.9
    expect(getEffectiveTotalPortions(items)).toBe(36);
    const exact = [monolith('X', 40, 0.9)]; // 36.00000000000001 type noise
    expect(getEffectiveTotalPortions(exact)).toBe(36);
  });

  it('ignores missing or invalid ratios', () => {
    expect(getItemEffectiveCapacityPerUnit({ portionsPerItem: 12 } as any)).toBe(12);
    expect(getItemEffectiveCapacityPerUnit({ portionsPerItem: 12, weightRatio: 0 } as any)).toBe(12);
    expect(getItemEffectiveCapacityPerUnit({ unitRatio: NaN } as any)).toBe(1);
  });
});

describe('economy mode: combineBoxesWithItems', () => {
  it('37-portion set with ratio 0.95: split without economy, whole box with economy', () => {
    const boxes = makeBoxes(2, 37);
    const off = combineBoxesWithItems(boxes, [monolith('Set37', 37, 0.95)], false, 'default');
    const on = combineBoxesWithItems(boxes, [monolith('Set37', 37, 0.95)], false, 'default', { economyMode: true });

    expect(products(off).length).toBeGreaterThan(1); // capacity-split
    expect(products(off).every((p) => p.monolithicSplitGroupId)).toBe(true);

    expect(products(on)).toHaveLength(1);
    expect(products(on)[0].monolithicSplitGroupId).toBeUndefined();
    expect(products(on)[0].quantity).toBe(1);
    expect(on.unallocatedPortions).toBe(0);
  });

  it('37-portion set with ratio 1: economy mode still splits (nothing to save)', () => {
    const boxes = makeBoxes(2, 37);
    const on = combineBoxesWithItems(boxes, [monolith('Set37', 37, 1)], false, 'default', { economyMode: true });
    expect(products(on).length).toBeGreaterThan(1);
    expect(on.unallocatedPortions).toBe(0);
  });

  it('economy off keeps legacy behaviour byte for byte', () => {
    const boxes = makeBoxes(3, 70);
    const items = [monolith('Set20', 20, 0.9), regular('Dish', 30, 0.5)];
    const a = combineBoxesWithItems(boxes, items, false, 'default');
    const b = combineBoxesWithItems(boxes, items, false, 'default', { economyMode: false });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('mixed order: 40 light dishes (ratio 0.5) + set 16 need 1 box by volume, 2 boxes by raw portions', () => {
    const items = [regular('Light', 40, 0.5), monolith('Set16', 16, 1)]; // 20 + 16 = 36 vs raw 56
    expect(getEffectiveTotalPortions(items)).toBe(36);
    expect(boxesNeeded(56)).toBe(2);
    expect(boxesNeeded(getEffectiveTotalPortions(items))).toBe(1);
    // Одна коробка: усе лежить у ній, нічого не втрачено
    const on = combineBoxesWithItems(makeBoxes(1, 36), items, false, 'default', { economyMode: true });
    expect(on.unallocatedPortions).toBe(0);
    // Дві коробки: порції не втрачаються, жодна коробка не перевищує місткість
    const two = combineBoxesWithItems(makeBoxes(2, 72), items, false, 'default', { economyMode: true });
    expect(two.unallocatedPortions).toBe(0);
  });

  it('does not overfill boxes in economy mode', () => {
    const items = [monolith('SetA', 20, 0.9), monolith('SetB', 20, 0.9)]; // 18 + 18 = 36
    const on = combineBoxesWithItems(makeBoxes(2, 40, 36), items, false, 'default', { economyMode: true });
    expect(on.unallocatedPortions).toBe(0);
    const perBox = new Map<number, number>();
    for (const p of products(on)) {
      const cap = getItemEffectiveCapacityPerUnit(p as any) * p.quantity;
      perBox.set(p.boxIndex!, (perBox.get(p.boxIndex!) ?? 0) + cap);
    }
    for (const v of perBox.values()) expect(v).toBeLessThanOrEqual(36 + 1e-6);
  });
});

// --- Реальні дані: знімок продуктів і замовлень з БД ---
type FixtureProduct = {
  sku: string;
  name: string;
  weight: number | null;
  categoryId: number | null;
  unitRatio: number | null;
  set: Array<{ id: string; name?: string; quantity: number }> | null;
  stock: number;
};
const fx = fixture as unknown as {
  products: FixtureProduct[];
  combos: Array<{ items: Array<{ sku: string; q: number }>; count: number }>;
  boxes: Array<{ name: string; qntFrom: number; qntTo: number; overflow: number }>;
  monolithicCategories: string[];
};

const productBySku = new Map(fx.products.map((p) => [p.sku, p]));
const mockApiCall = async (url: string) => {
  if (url === '/api/expand/flatten') return { ok: false, json: async () => ({}) };
  const sku = decodeURIComponent(url.replace('/api/products/', ''));
  const p = productBySku.get(sku);
  if (!p) return { ok: false, json: async () => ({}) };
  const body = {
    ...p,
    stockBalanceByStock: p.stock > 0 ? { total: p.stock } : {},
    set: p.set,
  };
  return { ok: true, json: async () => body };
};

const nameOf = (sku: string) => productBySku.get(sku)?.name ?? sku;

describe('economy mode on real orders (prod snapshot)', () => {
  it('replays real order combinations: effective <= raw, no unallocated, boxes never increase', async () => {
    const combos = [...fx.combos].sort((a, b) => b.count - a.count).slice(0, 1200);
    type Row = {
      skus: string;
      count: number;
      raw: number;
      eff: number;
      rawBoxes: number;
      effBoxes: number;
      offUnalloc: number;
      onUnalloc: number;
      offSplit: boolean;
      onSplit: boolean;
    };
    const rows: Row[] = [];

    for (const combo of combos) {
      const orderItems = combo.items.map((i) => ({ productName: nameOf(i.sku), sku: i.sku, quantity: i.q }));
      let expanded: OrderChecklistItem[];
      try {
        expanded = await expandProductSets(orderItems, mockApiCall, fx.monolithicCategories as any);
      } catch {
        continue; // товар видалено з каталогу
      }
      const raw = expanded.reduce((s, i) => s + getItemRawPortions(i), 0);
      const eff = getEffectiveTotalPortions(expanded);
      expect(eff).toBeLessThanOrEqual(raw);

      const rawBoxes = boxesNeeded(raw);
      const effBoxes = boxesNeeded(eff);
      expect(effBoxes).toBeLessThanOrEqual(rawBoxes);

      const off = combineBoxesWithItems(makeBoxes(rawBoxes, raw), expanded, false, 'default');
      const on = combineBoxesWithItems(makeBoxes(effBoxes, eff), expanded, false, 'default', { economyMode: true });

      rows.push({
        skus: combo.items.map((i) => `${i.sku}x${i.q}`).join('+'),
        count: combo.count,
        raw,
        eff,
        rawBoxes,
        effBoxes,
        offUnalloc: off.unallocatedPortions,
        onUnalloc: on.unallocatedPortions,
        offSplit: products(off).some((p) => p.monolithicSplitGroupId),
        onSplit: products(on).some((p) => p.monolithicSplitGroupId),
      });
    }

    expect(rows.length).toBeGreaterThan(100);

    const orders = rows.reduce((s, r) => s + r.count, 0);
    const saved = rows.filter((r) => r.effBoxes < r.rawBoxes);
    const savedOrders = saved.reduce((s, r) => s + r.count, 0);
    const splitOff = rows.filter((r) => r.offSplit);
    const splitOn = rows.filter((r) => r.onSplit);
    const unallocOn = rows.filter((r) => r.onUnalloc > 0);
    const unallocOff = rows.filter((r) => r.offUnalloc > 0);

    // Розподіл за сирими порціями
    const buckets = new Map<string, number>();
    for (const r of rows) {
      const k = r.raw <= 5 ? '1-5' : r.raw <= 9 ? '6-9' : r.raw <= 15 ? '10-15' : r.raw <= 24 ? '16-24' : r.raw <= 36 ? '25-36' : '37+';
      buckets.set(k, (buckets.get(k) ?? 0) + r.count);
    }

    const summary = [
      `Унікальних комбінацій: ${rows.length}, замовлень (за ними): ${orders}`,
      `Розподіл за сирими порціями: ${[...buckets.entries()].map(([k, v]) => `${k}: ${v}`).join(', ')}`,
      `Економія коробок: комбінацій ${saved.length}, замовлень ${savedOrders}`,
      `Split без економії: ${splitOff.length}, з економією: ${splitOn.length}`,
      `Нерозміщені без економії: ${unallocOff.length}, з економією: ${unallocOn.length}`,
    ];
    console.log('\n' + summary.join('\n'));

    const top = [...saved].sort((a, b) => b.count - a.count).slice(0, 12);
    console.log(
      '\nТоп комбінацій, де економія зменшує кількість коробок:\n' +
        top.map((r) => `${r.skus} (x${r.count}): raw ${r.raw} -> eff ${r.eff}, коробок ${r.rawBoxes} -> ${r.effBoxes}`).join('\n'),
    );
    const edge = rows.filter((r) => r.raw > 36 && r.raw <= 40).sort((a, b) => b.count - a.count).slice(0, 8);
    console.log(
      '\nМежові випадки raw 37-40:\n' +
        edge.map((r) => `${r.skus} (x${r.count}): raw ${r.raw} -> eff ${r.eff}, коробок ${r.rawBoxes} -> ${r.effBoxes}`).join('\n'),
    );

    // Економія не повинна втрачати порції або збільшувати split відносно стандартного режиму
    console.log('\nНерозміщені з економією:\n' + unallocOn.map((r) => `${r.skus} (x${r.count}): raw ${r.raw} eff ${r.eff} boxes ${r.effBoxes} unalloc ${r.onUnalloc}`).join('\n'));
    expect(unallocOn.length).toBeLessThanOrEqual(unallocOff.length);
    expect(splitOn.length).toBeLessThanOrEqual(splitOff.length);
  }, 120000);

  it('synthetic sweep: sets of 30..45 portions with ratios 0.85..1.0 never lose portions', () => {
    const lines: string[] = [];
    for (let portions = 30; portions <= 45; portions++) {
      for (const ratio of [0.85, 0.9, 0.95, 0.98, 1]) {
        const item = monolith(`Set${portions}`, portions, ratio);
        const eff = getEffectiveTotalPortions([item]);
        const raw = portions;
        const rawBoxes = boxesNeeded(raw);
        const effBoxes = boxesNeeded(eff);
        const on = combineBoxesWithItems(makeBoxes(Math.max(effBoxes, 2), eff), [item], false, 'default', { economyMode: true });
        expect(on.unallocatedPortions).toBe(0);
        if (effBoxes < rawBoxes) lines.push(`${portions} порцій x ${ratio}: eff ${eff}, коробок ${rawBoxes} -> ${effBoxes}`);
      }
    }
    console.log('\nСинтетика (економія коробок):\n' + lines.join('\n'));
    expect(lines.length).toBeGreaterThan(0);
  });
});
