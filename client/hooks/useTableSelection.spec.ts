import { describe, expect, it } from 'vitest';
import { rangeIds } from './useTableSelection';

describe('rangeIds', () => {
  it('slice inclusive between from and to', () => {
    expect(rangeIds(['a', 'b', 'c', 'd'], 1, 3)).toEqual(['b', 'c', 'd']);
  });

  it('works backwards', () => {
    expect(rangeIds(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['b', 'c', 'd']);
  });
});
