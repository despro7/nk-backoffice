import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/utils.js', () => ({ prisma: {}, logServer: vi.fn() }));
vi.mock('../Products/catalogFinishedProductsFolder.js', () => ({ getFinishedProductsFolderIds: vi.fn() }));
vi.mock('../Products/ProductsDilovodGateway.js', () => ({ productsDilovodGateway: {} }));

import { matchSnapshotKeys } from './stockSnapshotCatalog.js';

const good = (id: string, sku: string | null) => ({ id, sku, mainUnitId: null, parentId: null });

describe('matchSnapshotKeys', () => {
  it('matches by SKU first, then by Dilovod id, skips unknown keys', () => {
    const goods = [good('1100300000001551', null), good('1100300000000100', '01002'), good('01002', null)];
    const result = matchSnapshotKeys(['01002', '1100300000001551', 'missing'], goods);
    expect(result.get('01002')).toEqual({ good: goods[1], byId: false });
    expect(result.get('1100300000001551')).toEqual({ good: goods[0], byId: true });
    expect(result.has('missing')).toBe(false);
  });
});
