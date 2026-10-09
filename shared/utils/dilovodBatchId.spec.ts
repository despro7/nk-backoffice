import { describe, expect, it } from 'vitest';
import {
  canSetTpGoodsGoodPart,
  isCatalogGoodPartId,
  isUsableDilovodBatchId,
  isVirtualDocumentBatchLabel,
} from './dilovodBatchId.js';

describe('isCatalogGoodPartId', () => {
  it('приймає id з префіксом catalogs.goodParts', () => {
    expect(isCatalogGoodPartId('1112200000002097')).toBe(true);
  });

  it('відхиляє documents.prodOrder (віртуальна партія з балансу)', () => {
    expect(isUsableDilovodBatchId('1113300000001889')).toBe(true);
    expect(isCatalogGoodPartId('1113300000001889')).toBe(false);
  });

  it('відхиляє порожні / нульові значення', () => {
    expect(isCatalogGoodPartId('')).toBe(false);
    expect(isCatalogGoodPartId('0')).toBe(false);
    expect(isCatalogGoodPartId('60917')).toBe(false);
  });
});

describe('isVirtualDocumentBatchLabel', () => {
  it('розпізнає замовлення на виробництво', () => {
    expect(isVirtualDocumentBatchLabel('13.08.2026 Замовлення на виробництво 000211')).toBe(true);
  });

  it('не чіпає звичайні серійні партії', () => {
    expect(isVirtualDocumentBatchLabel('60917')).toBe(false);
    expect(isVirtualDocumentBatchLabel('K61008')).toBe(false);
  });
});

describe('canSetTpGoodsGoodPart', () => {
  it('дозволяє лише catalogs.goodParts', () => {
    expect(canSetTpGoodsGoodPart({
      batchId: '1112200000002097',
      batchNumber: '60917',
    })).toBe(true);
  });

  it('блокує prodOrder id навіть із «нормальною» назвою', () => {
    expect(canSetTpGoodsGoodPart({
      batchId: '1113300000001889',
      batchNumber: '000211',
    })).toBe(false);
  });

  it('блокує за підписом документа', () => {
    expect(canSetTpGoodsGoodPart({
      batchId: '1112200000002097',
      batchNumber: '13.08.2026 Замовлення на виробництво 000211',
    })).toBe(false);
  });
});
