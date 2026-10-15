import { describe, expect, it } from 'vitest';
import { CATALOG_ACC_POLICY_GOOD, CATALOG_ACC_POLICY_KIT } from '../types/catalog.js';
import {
  computeCatalogKitPortionCount,
  computeCatalogKitPortionCounts,
} from './catalogKitPortions.js';

describe('computeCatalogKitPortionCount', () => {
  it('не-набір = 1 порція', () => {
    const policies = new Map([['g1', CATALOG_ACC_POLICY_GOOD]]);
    expect(computeCatalogKitPortionCount('g1', policies, new Map())).toBe(1);
  });

  it('плоский набір: сума qty компонентів', () => {
    const policies = new Map([
      ['kit', CATALOG_ACC_POLICY_KIT],
      ['a', CATALOG_ACC_POLICY_GOOD],
      ['b', CATALOG_ACC_POLICY_GOOD],
    ]);
    const children = new Map([
      [
        'kit',
        [
          { id: 'a', qty: 2 },
          { id: 'b', qty: 3 },
        ],
      ],
    ]);
    expect(computeCatalogKitPortionCount('kit', policies, children)).toBe(5);
  });

  it('вкладений набір: qty × порції вкладеного', () => {
    const policies = new Map([
      ['outer', CATALOG_ACC_POLICY_KIT],
      ['inner', CATALOG_ACC_POLICY_KIT],
      ['soup', CATALOG_ACC_POLICY_GOOD],
      ['salad', CATALOG_ACC_POLICY_GOOD],
    ]);
    const children = new Map([
      [
        'outer',
        [
          { id: 'soup', qty: 2 },
          { id: 'inner', qty: 1 },
        ],
      ],
      [
        'inner',
        [
          { id: 'salad', qty: 3 },
          { id: 'soup', qty: 2 },
        ],
      ],
    ]);
    // страви outer = 2+1=3; порції = 2 + 1*(3+2) = 7
    expect(computeCatalogKitPortionCount('outer', policies, children)).toBe(7);
  });

  it('цикл у графі не зациклює підрахунок', () => {
    const policies = new Map([
      ['a', CATALOG_ACC_POLICY_KIT],
      ['b', CATALOG_ACC_POLICY_KIT],
    ]);
    const children = new Map([
      ['a', [{ id: 'b', qty: 1 }]],
      ['b', [{ id: 'a', qty: 1 }]],
    ]);
    expect(computeCatalogKitPortionCount('a', policies, children)).toBe(0);
  });
});

describe('computeCatalogKitPortionCounts', () => {
  it('рахує кілька root на спільному кеші', () => {
    const policies = new Map([
      ['k1', CATALOG_ACC_POLICY_KIT],
      ['k2', CATALOG_ACC_POLICY_KIT],
      ['g', CATALOG_ACC_POLICY_GOOD],
    ]);
    const children = new Map([
      ['k1', [{ id: 'g', qty: 2 }]],
      ['k2', [{ id: 'g', qty: 4 }]],
    ]);
    const result = computeCatalogKitPortionCounts(['k1', 'k2', 'g'], policies, children);
    expect(result.get('k1')).toBe(2);
    expect(result.get('k2')).toBe(4);
    expect(result.get('g')).toBe(1);
  });
});
