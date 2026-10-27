import { describe, expect, it } from 'vitest';
import {
  enrichMovementMobLines,
  isMobLineBatchLinked,
  linesMissingBatchLink,
} from './WarehouseMovementMobUtils';
import type { MovementMobProductLineViewModel } from './WarehouseMovementMobTypes';

const v2Line: MovementMobProductLineViewModel = {
  key: '02008-1112200000002099',
  sku: '02008',
  productName: 'Морква варена',
  batchId: '1112200000002099',
  batchNumber: '60917',
  boxQuantity: 1,
  portionQuantity: 4,
  totalPortions: 28,
  weight: 400,
  portionsPerBox: 24,
  receivedBoxQuantity: 1,
  receivedPortionQuantity: 4,
  receivedTotalPortions: 28,
};

describe('isMobLineBatchLinked', () => {
  it('v2 рядок без ШК — партія з документа', () => {
    expect(isMobLineBatchLinked(v2Line, false)).toBe(true);
  });

  it('рядок з ШК без каталогу — не привʼязано', () => {
    expect(
      isMobLineBatchLinked({ ...v2Line, barcode: '2200000001177' }, false),
    ).toBe(false);
  });

  it('рядок з ШК і каталогом — привʼязано', () => {
    expect(
      isMobLineBatchLinked({ ...v2Line, barcode: '2200000001177' }, true),
    ).toBe(true);
  });
});

describe('enrichMovementMobLines', () => {
  it('зберігає назву партії з items, якщо каталог не знаходить ШК', () => {
    const metaKey = ['02008', '', '1112200000002099', '60917'].join('::');
    const [enriched] = enrichMovementMobLines(
      [v2Line],
      { '02008': [{ batchId: '1112200000002099', batchNumber: '60917', storage: '1', quantity: 10 }] },
      { '02008': { totalGp: 813, totalMs: 51 } },
      { [metaKey]: { batchLinked: false, catalogGoodId: '1100300000001544', catalogBatchId: null } },
    );
    expect(enriched.batchLinked).toBe(true);
    expect(enriched.catalogBatchLinked).toBe(false);
    expect(enriched.batchNumber).toBe('60917');
    expect(enriched.stock?.totalGp).toBe(813);
  });
});

describe('linesMissingBatchLink', () => {
  it('не блокує v2 без штрих-коду', () => {
    expect(linesMissingBatchLink([{ ...v2Line, catalogBatchLinked: false }])).toHaveLength(0);
  });

  it('блокує скан з ШК без каталогу', () => {
    expect(
      linesMissingBatchLink([
        { ...v2Line, barcode: '2200000001177', catalogBatchLinked: false },
      ]),
    ).toHaveLength(1);
  });
});
