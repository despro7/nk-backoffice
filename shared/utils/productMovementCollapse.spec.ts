import { describe, expect, it } from 'vitest';
import {
  collapseProductMovementEffectsByDocument,
  type ProductMovementRegisterEffect,
} from './productMovementCollapse.js';

function effect(
  partial: Partial<ProductMovementRegisterEffect> & Pick<ProductMovementRegisterEffect, 'signedQty'>,
): ProductMovementRegisterEffect {
  return {
    sortPeriod: '2026-10-23 12:00:00',
    date: '23.10.2026',
    dateTime: '23.10.2026, 12:00:00',
    documentId: 'doc-1',
    documentLabel: 'Комплектація K-000630',
    receiptQty: partial.signedQty > 0 ? partial.signedQty : null,
    expenseQty: partial.signedQty < 0 ? Math.abs(partial.signedQty) : null,
    ...partial,
  };
}

describe('collapseProductMovementEffectsByDocument', () => {
  it('згортає кілька надходжень одного документа в ціле число', () => {
    const parts = [14.861, 1.314, 17.884, 1.636, 5.825, 3.496, 4.632, 0.352];
    const effects = parts.map((qty, index) => effect({
      sortPeriod: `2026-10-23 12:00:0${index}`,
      dateTime: `23.10.2026, 12:00:0${index}`,
      signedQty: qty,
      receiptQty: qty,
      expenseQty: null,
    }));

    const collapsed = collapseProductMovementEffectsByDocument(effects);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].receiptQty).toBe(50);
    expect(collapsed[0].signedQty).toBe(50);
  });

  it('не змішує комплектацію з іншими документами при однаковому recorder id', () => {
    const sharedRecorder = 'same-recorder-id';
    const collapsed = collapseProductMovementEffectsByDocument([
      effect({
        documentId: sharedRecorder,
        documentLabel: 'Комплектація K-000630',
        signedQty: 50,
        receiptQty: 50,
        expenseQty: null,
      }),
      effect({
        documentId: sharedRecorder,
        documentLabel: 'Переміщення П-00453',
        signedQty: -2,
        receiptQty: null,
        expenseQty: 2,
        sortPeriod: '2026-10-23 13:00:00',
      }),
    ]);

    expect(collapsed).toHaveLength(2);
    expect(collapsed[0].documentLabel).toContain('Комплектація');
    expect(collapsed[0].receiptQty).toBe(50);
    expect(collapsed[1].documentLabel).toContain('Переміщення');
    expect(collapsed[1].expenseQty).toBe(2);
  });

  it('залишає окремі рядки для різних документів комплектації', () => {
    const collapsed = collapseProductMovementEffectsByDocument([
      effect({ documentId: 'a', documentLabel: 'Комплектація K-000630', signedQty: 2, receiptQty: 2, expenseQty: null }),
      effect({
        documentId: 'a',
        documentLabel: 'Комплектація K-000631',
        signedQty: 3,
        receiptQty: 3,
        expenseQty: null,
        sortPeriod: '2026-10-24 10:00:00',
        date: '24.10.2026',
      }),
    ]);

    expect(collapsed).toHaveLength(2);
    expect(collapsed[0].receiptQty).toBe(2);
    expect(collapsed[1].receiptQty).toBe(3);
  });
});
