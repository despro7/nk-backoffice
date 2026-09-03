import { describe, expect, it } from 'vitest';
import {
  assignComponentRowIds,
  componentRowKey,
  extractTpGoodsRowIds,
  remoteTpGoodsRows,
} from './catalogTpGoods.js';

describe('catalogTpGoods', () => {
  it('extractTpGoodsRowIds reads rowID from getObject payload', () => {
    const map = extractTpGoodsRowIds({
      tableParts: {
        tpGoods: [
          { rowNum: 1, rowID: 'abc12345', good: '1100300000001503', qty: 1 },
          { rowNum: 2, rowID: 'xyz98765', good: '1100300000001504', qty: 2 },
        ],
      },
    });
    expect(map.get(componentRowKey(1, '1100300000001503'))).toBe('abc12345');
    expect(map.get(componentRowKey(2, '1100300000001504'))).toBe('xyz98765');
  });

  it('assignComponentRowIds prefers local dilovodRowId', () => {
    const assigned = assignComponentRowIds(
      [{ componentGoodId: 'G1', qty: 1, rowNum: 1 }],
      [{ rowNum: 1, componentGoodId: 'G1', dilovodRowId: 'localId1' }],
      [{ rowNum: 1, good: 'G1', rowID: 'remoteId1' }]
    );
    expect(assigned.get(componentRowKey(1, 'G1'))).toBe('localId1');
  });

  it('assignComponentRowIds falls back to remote when local missing', () => {
    const assigned = assignComponentRowIds(
      [{ componentGoodId: 'G1', qty: 1, rowNum: 1 }],
      [{ rowNum: 1, componentGoodId: 'G1', dilovodRowId: null }],
      [{ rowNum: 1, good: 'G1', rowID: 'remoteId1' }]
    );
    expect(assigned.get(componentRowKey(1, 'G1'))).toBe('remoteId1');
  });

  it('assignComponentRowIds generates for new rows', () => {
    const assigned = assignComponentRowIds(
      [{ componentGoodId: 'G-new', qty: 1, rowNum: 1 }],
      [],
      []
    );
    const rowId = assigned.get(componentRowKey(1, 'G-new'));
    expect(rowId).toBeTruthy();
    expect(String(rowId).length).toBeGreaterThanOrEqual(6);
  });

  it('remoteTpGoodsRows sorts by rowNum', () => {
    const rows = remoteTpGoodsRows({
      tableParts: {
        tpGoods: {
          a: { rowNum: 3, rowID: 'c', good: 'G3' },
          b: { rowNum: 1, rowID: 'a', good: 'G1' },
        },
      },
    });
    expect(rows.map((r) => r.rowNum)).toEqual([1, 3]);
  });
});
