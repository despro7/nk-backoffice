import { describe, expect, it } from 'vitest';
import { assignRowKeys, isRowKey, newRowKey } from './catalogRowKey.js';

const K1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const K2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const K3 = 'aaaaaaaa-0000-4000-8000-000000000003';

describe('assignRowKeys', () => {
  const existing = [
    { rowKey: K1, dilovodRowId: 'r1', rowNum: 1, componentGoodId: 'potato' },
    { rowKey: K2, dilovodRowId: 'r2', rowNum: 2, componentGoodId: 'water' },
    { rowKey: K3, dilovodRowId: null, rowNum: 3, componentGoodId: 'salt' },
  ];

  it('keeps keys from the payload', () => {
    expect(assignRowKeys([{ rowKey: K2, componentGoodId: 'x' }], existing)).toEqual([K2]);
  });

  it('matches by Dilovod rowID after reordering', () => {
    const keys = assignRowKeys(
      [
        { dilovodRowId: 'r2', rowNum: 1, componentGoodId: 'water' },
        { dilovodRowId: 'r1', rowNum: 2, componentGoodId: 'potato' },
      ],
      existing,
    );
    expect(keys).toEqual([K2, K1]);
  });

  it('falls back to rowNum + good, then to the only row of that good', () => {
    expect(assignRowKeys([{ rowNum: 3, componentGoodId: 'salt' }], existing)).toEqual([K3]);
    expect(assignRowKeys([{ rowNum: 9, componentGoodId: 'salt' }], existing)).toEqual([K3]);
  });

  it('gives new unique keys to new rows and duplicates', () => {
    const keys = assignRowKeys(
      [
        { rowKey: K1, componentGoodId: 'potato' },
        { rowKey: K1, componentGoodId: 'potato' },
        { componentGoodId: 'pepper' },
      ],
      existing,
    );
    expect(keys[0]).toBe(K1);
    expect(new Set(keys).size).toBe(3);
    expect(keys.every(isRowKey)).toBe(true);
  });

  it('does not guess when a good has several free rows', () => {
    const many = [
      { rowKey: K1, rowNum: 1, componentGoodId: 'beet' },
      { rowKey: K2, rowNum: 2, componentGoodId: 'beet' },
    ];
    const [key] = assignRowKeys([{ rowNum: 5, componentGoodId: 'beet' }], many);
    expect([K1, K2]).not.toContain(key);
  });
});

describe('newRowKey', () => {
  it('is a valid key', () => {
    expect(isRowKey(newRowKey())).toBe(true);
  });
});
