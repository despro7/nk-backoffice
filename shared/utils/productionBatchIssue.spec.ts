import { describe, expect, it } from 'vitest';
import {
  isIssueShortage,
  isStockShort,
  issuePlan,
  issueSignErrors,
  stockShortGoodIds,
  normalizeIssueInput,
  snapshotAvailable,
  type IssueLineLike,
} from './productionBatchIssue';

const raw = (patch: Partial<IssueLineLike> = {}): IssueLineLike => ({
  kind: 'raw',
  unitName: 'г',
  plannedQty: 27500,
  plannedGrossKg: 45.955882,
  stockRawSnap: null,
  stockProdSnap: null,
  ...patch,
});

describe('issuePlan', () => {
  it('raw with mass issues gross kg', () => {
    expect(issuePlan(raw())).toEqual({ qty: 45.956, unit: 'кг' });
  });
  it('raw without mass and packaging use row units', () => {
    expect(issuePlan(raw({ plannedGrossKg: null, unitName: 'шт', plannedQty: 12 }))).toEqual({ qty: 12, unit: 'шт' });
    expect(issuePlan({ ...raw(), kind: 'packaging', unitName: 'шт', plannedQty: 500, plannedGrossKg: null })).toEqual({
      qty: 500,
      unit: 'шт',
    });
  });
});

describe('stock and shortage', () => {
  it('sums raw and production stock', () => {
    expect(snapshotAvailable({ stockRawSnap: 85, stockProdSnap: 425.626 })).toBe(510.626);
    expect(snapshotAvailable({ stockRawSnap: null, stockProdSnap: null })).toBeNull();
  });
  it('flags stock below plan', () => {
    expect(isStockShort(raw({ stockRawSnap: 40, stockProdSnap: 5 }))).toBe(true);
    expect(isStockShort(raw({ stockRawSnap: 40, stockProdSnap: 6 }))).toBe(false);
    expect(isStockShort(raw())).toBe(false);
  });
  it('tolerates rounding but flags real shortage', () => {
    expect(isIssueShortage(raw(), 45.95)).toBe(false);
    expect(isIssueShortage(raw(), 45)).toBe(true);
    expect(isIssueShortage(raw(), 50)).toBe(false);
    expect(isIssueShortage(raw(), null)).toBe(false);
  });
});

describe('stockShortGoodIds', () => {
  it('sums plan of one good across lines', () => {
    const beet = (gross: number) => ({ ...raw({ plannedGrossKg: gross, stockRawSnap: 30, stockProdSnap: 10 }), goodId: 'beet' });
    expect(stockShortGoodIds([beet(28), beet(20)])).toEqual(new Set(['beet']));
    expect(stockShortGoodIds([beet(28), beet(10)])).toEqual(new Set());
  });
});

describe('issueSignErrors', () => {
  it('requires issued qty and shortage comment', () => {
    const base = { ...raw(), name: 'Картопля' };
    expect(issueSignErrors([{ ...base, issuedQty: null, shortageComment: null }])).toHaveLength(1);
    expect(issueSignErrors([{ ...base, issuedQty: 40, shortageComment: null }])[0]).toContain('нестачу');
    expect(issueSignErrors([{ ...base, issuedQty: 40, shortageComment: 'немає на складі' }])).toEqual([]);
    expect(issueSignErrors([{ ...base, issuedQty: 45.956, shortageComment: null }])).toEqual([]);
  });
});

describe('normalizeIssueInput', () => {
  it('keeps undefined, clears empties, rejects negatives', () => {
    expect(normalizeIssueInput({ id: 3, issuedQty: '1.23456', issueNote: '  ок ', stockActual: -1 })).toEqual({
      id: 3,
      stockActual: null,
      issuedQty: 1.235,
      issueNote: 'ок',
      shortageComment: undefined,
    });
    expect(normalizeIssueInput({ id: 0 })).toBeNull();
  });
});
