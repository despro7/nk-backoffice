import { describe, expect, it } from 'vitest';
import { mergeNegativeBatchesForUnkit } from './unkitNegativeBatchPrefill.js';

const GOOD_PART_A = '1112200000001001';
const GOOD_PART_B = '1112200000001002';
const GOOD_PART_C = '1112200000001003';
const VIRTUAL_DOC = '1113300000000211';

describe('mergeNegativeBatchesForUnkit', () => {
  it('додає мінусові партії й перекриває їх у першу чергу', () => {
    const result = mergeNegativeBatchesForUnkit({
      requiredQuantity: 100,
      existingBatches: [
        { batchId: GOOD_PART_A, batchNumber: 'A', quantity: 100, batchStock: 0 },
      ],
      warehouseBatches: [
        { batchId: GOOD_PART_A, batchNumber: 'A', quantity: 0 },
        { batchId: GOOD_PART_B, batchNumber: 'B-minus', quantity: -30 },
        { batchId: GOOD_PART_C, batchNumber: 'C-minus', quantity: -20 },
      ],
    });

    expect(result).toEqual([
      { batchId: GOOD_PART_B, batchNumber: 'B-minus', quantity: 30, batchStock: -30 },
      { batchId: GOOD_PART_C, batchNumber: 'C-minus', quantity: 20, batchStock: -20 },
      { batchId: GOOD_PART_A, batchNumber: 'A', quantity: 50, batchStock: 0 },
    ]);
  });

  it('ігнорує віртуальні document-id партії', () => {
    const result = mergeNegativeBatchesForUnkit({
      requiredQuantity: 10,
      existingBatches: [
        { batchId: GOOD_PART_A, batchNumber: 'A', quantity: 10 },
      ],
      warehouseBatches: [
        {
          batchId: VIRTUAL_DOC,
          batchNumber: '13.08.2026 Замовлення на виробництво 000211',
          quantity: -50,
        },
      ],
    });

    expect(result).toEqual([
      { batchId: GOOD_PART_A, batchNumber: 'A', quantity: 10 },
    ]);
  });

  it('якщо мінусів більше за required — бере лише потрібну кількість', () => {
    const result = mergeNegativeBatchesForUnkit({
      requiredQuantity: 25,
      existingBatches: [],
      warehouseBatches: [
        { batchId: GOOD_PART_B, batchNumber: 'B', quantity: -40 },
        { batchId: GOOD_PART_C, batchNumber: 'C', quantity: -10 },
      ],
    });

    expect(result).toEqual([
      { batchId: GOOD_PART_B, batchNumber: 'B', quantity: 25, batchStock: -40 },
    ]);
  });

  it('без мінусів лишає пропорції існуючих партій', () => {
    const result = mergeNegativeBatchesForUnkit({
      requiredQuantity: 90,
      existingBatches: [
        { batchId: GOOD_PART_A, batchNumber: 'A', quantity: 60 },
        { batchId: GOOD_PART_B, batchNumber: 'B', quantity: 30 },
      ],
      warehouseBatches: [
        { batchId: GOOD_PART_A, batchNumber: 'A', quantity: 5 },
        { batchId: GOOD_PART_B, batchNumber: 'B', quantity: 2 },
      ],
    });

    expect(result.map((batch) => ({ id: batch.batchId, qty: batch.quantity }))).toEqual([
      { id: GOOD_PART_A, qty: 60 },
      { id: GOOD_PART_B, qty: 30 },
    ]);
  });
});
