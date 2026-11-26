import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = {
  catalogGoodBarcode: {
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    createMany: vi.fn(),
  },
};

vi.mock('../../lib/utils.js', () => ({
  logServer: vi.fn(),
  prisma: { $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) },
}));

vi.mock('./CatalogGoodAuditService.js', () => ({
  catalogGoodAuditService: { track: (_options: unknown, fn: () => Promise<unknown>) => fn() },
}));

import { productsLocalSync } from './ProductsLocalSync.js';

describe('replaceGoodBarcodes with internal box barcodes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.catalogGoodBarcode.findMany.mockResolvedValue([{ code: '2250000000113', goodPart: 'part-1' }]);
  });

  it('does not re-insert a box barcode as a portion one', async () => {
    await productsLocalSync.replaceGoodBarcodes('good-1', [
      { code: '2250000000113', goodPart: 'part-1', activity: true },
      { code: '2200000000590', goodPart: 'part-1', activity: true },
    ]);

    const { data } = tx.catalogGoodBarcode.createMany.mock.calls[0]![0] as { data: Array<{ code: string }> };
    expect(data.map((row) => row.code)).toEqual(['2200000000590']);
  });

  it('skips insert when only box barcodes are passed', async () => {
    await productsLocalSync.replaceGoodBarcodes('good-1', [
      { code: '2250000000113', goodPart: 'part-1', activity: true },
    ]);

    expect(tx.catalogGoodBarcode.createMany).not.toHaveBeenCalled();
  });
});
