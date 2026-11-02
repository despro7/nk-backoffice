import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { goodId: string; code: string; goodPart: string | null; barcodeKind: string; activity: boolean };

const rows: Row[] = [];

vi.mock('../../lib/utils.js', () => ({
  prisma: {
    catalogGoodBarcode: {
      findFirst: vi.fn(async ({ where }: any) => {
        const hit = rows.find((row) =>
          where.code !== undefined
            ? row.code === where.code
            : row.goodId === where.goodId &&
              row.goodPart === where.goodPart &&
              row.barcodeKind === where.barcodeKind &&
              row.activity === where.activity
        );
        return hit ? { id: 1, code: hit.code } : null;
      }),
      findMany: vi.fn(async ({ where }: any) =>
        rows
          .filter((row) => !where?.code?.startsWith || row.code.startsWith(where.code.startsWith))
          .map((row) => ({ code: row.code }))
      ),
      create: vi.fn(async ({ data }: any) => {
        rows.push({ goodPart: null, ...data });
        return data;
      }),
    },
  },
}));

import { ensureCatalogBoxBarcode } from './CatalogBoxBarcodeService.js';
import { allocateNextEan13, buildEan13, isInternalEan13 } from './barcodeUtils.js';

const BATCH_A = '1112200000001905';
const BATCH_B = '1112200000001906';

describe('box barcode allocation (EAN-13 series 225…)', () => {
  beforeEach(() => {
    rows.length = 0;
    rows.push(
      { goodId: 'soup', code: buildEan13('220000000040'), goodPart: null, barcodeKind: 'portion', activity: true },
      { goodId: 'borsch', code: buildEan13('220000000041'), goodPart: null, barcodeKind: 'portion', activity: true },
    );
  });

  it('builds valid internal EAN-13', () => {
    const code = buildEan13('220000000100');
    expect(isInternalEan13(code)).toBe(true);
    expect(code).toHaveLength(13);
  });

  it('allocates boxes in 225… while portions continue from max 220…', async () => {
    const first = await ensureCatalogBoxBarcode({ goodId: 'soup', batchId: BATCH_A, batchNumber: 'A' });
    const second = await ensureCatalogBoxBarcode({ goodId: 'borsch', batchId: BATCH_B, batchNumber: 'B' });

    expect(first).toBe(buildEan13('225000000000'));
    expect(second).toBe(buildEan13('225000000001'));

    // Dilovod не бачить коробок, але навіть якщо 225… туди потрапить — порції його ігнорують.
    const dilovodCodes = [...rows.map((row) => row.code), buildEan13('225000000005')];
    const portion = await allocateNextEan13(dilovodCodes, async () => false);
    expect(portion).toBe(buildEan13('220000000042'));
  });

  it('returns existing box code for same good + batch', async () => {
    rows.push({ goodId: 'soup', code: buildEan13('220000000041'), goodPart: BATCH_A, barcodeKind: 'box', activity: true });

    const code = await ensureCatalogBoxBarcode({ goodId: 'soup', batchId: BATCH_A, batchNumber: 'A' });
    expect(code).toBe(buildEan13('220000000041'));
  });

  it('skips 225… candidate already present anywhere in catalog_good_barcodes', async () => {
    rows.push({ goodId: 'other', code: buildEan13('225000000000'), goodPart: 'x', barcodeKind: 'portion', activity: false });

    const code = await ensureCatalogBoxBarcode({ goodId: 'soup', batchId: BATCH_A, batchNumber: 'A' });
    expect(code).toBe(buildEan13('225000000001'));
  });
});
