import { describe, expect, it } from 'vitest';
import {
  catalogBarcodeRowKey,
  matchExistingBarcode,
  pickPrimaryBarcode,
  type CatalogBarcodeMatchRow,
} from './barcodeUtils';

const row = (
  partial: Partial<CatalogBarcodeMatchRow> & Pick<CatalogBarcodeMatchRow, 'code'>
): CatalogBarcodeMatchRow => ({
  activity: true,
  ...partial,
});

describe('matchExistingBarcode', () => {
  it('знаходить точний code + goodPart', () => {
    const rows = [
      row({ code: '2200000000013', goodPart: null, dilovodRegisterId: 'a' }),
      row({ code: '2200000000013', goodPart: '1112200000001905', dilovodRegisterId: 'b' }),
    ];
    const used = new Set<string>();
    const matched = matchExistingBarcode(rows, '2200000000013', '1112200000001905', used);
    expect(matched?.dilovodRegisterId).toBe('b');
  });

  it('привʼязує партію до ШК без goodPart, а не створює новий рядок', () => {
    const rows = [
      row({ code: '2200000000013', goodPart: null, dilovodRegisterId: 'reg-1' }),
    ];
    const matched = matchExistingBarcode(
      rows,
      '2200000000013',
      '1112200000001905',
      new Set()
    );
    expect(matched?.dilovodRegisterId).toBe('reg-1');
  });

  it('змінює партію, якщо рядок з цим code єдиний', () => {
    const rows = [
      row({ code: '2200000000013', goodPart: 'part-a', dilovodRegisterId: 'reg-1' }),
    ];
    const matched = matchExistingBarcode(rows, '2200000000013', 'part-b', new Set());
    expect(matched?.dilovodRegisterId).toBe('reg-1');
  });

  it('не бере вже зайнятий рядок', () => {
    const unbound = row({
      code: '2200000000013',
      goodPart: null,
      dilovodRegisterId: 'reg-1',
    });
    const used = new Set([catalogBarcodeRowKey(unbound)]);
    const matched = matchExistingBarcode(
      [unbound],
      '2200000000013',
      '1112200000001905',
      used
    );
    expect(matched).toBeUndefined();
  });

  it('не вгадує, якщо кілька рядків з партіями і немає точного збігу', () => {
    const rows = [
      row({ code: '2200000000013', goodPart: 'part-a', dilovodRegisterId: 'a' }),
      row({ code: '2200000000013', goodPart: 'part-b', dilovodRegisterId: 'b' }),
    ];
    const matched = matchExistingBarcode(rows, '2200000000013', 'part-c', new Set());
    expect(matched).toBeUndefined();
  });
});

describe('pickPrimaryBarcode', () => {
  it('бере ШК навіть якщо він єдиний і з партією', () => {
    expect(
      pickPrimaryBarcode([{ code: '4820249330210', goodPart: '1112200000001995' }])
    ).toBe('4820249330210');
  });

  it('пріоритет рядка без партії, goodPart "0" вважає непривʼязаним', () => {
    expect(
      pickPrimaryBarcode([
        { code: '111', goodPart: 'batch' },
        { code: '2200000000378', goodPart: '0' },
      ])
    ).toBe('2200000000378');
  });

  it('порожній список → null', () => {
    expect(pickPrimaryBarcode([])).toBeNull();
  });
});

