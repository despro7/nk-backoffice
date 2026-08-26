import { describe, expect, it } from 'vitest';
import { buildHashString, parseUrlHash } from './useUrlHashSync';

describe('buildHashString', () => {
  it('omits empty and default values', () => {
    expect(
      buildHashString({
        folder: 'abc',
        q: '',
        good: undefined,
        flag: false,
        n: null,
      })
    ).toBe('folder=abc');
  });

  it('keeps search and good together', () => {
    expect(buildHashString({ folder: 'f1', q: 'курка', good: 'g1' })).toBe(
      'folder=f1&q=%D0%BA%D1%83%D1%80%D0%BA%D0%B0&good=g1'
    );
  });
});

describe('parseUrlHash', () => {
  it('reads keys from a leading hash', () => {
    const params = parseUrlHash('#folder=f1&q=abc&good=g1');
    expect(params.get('folder')).toBe('f1');
    expect(params.get('q')).toBe('abc');
    expect(params.get('good')).toBe('g1');
  });

  it('returns empty params for blank hash', () => {
    expect([...parseUrlHash('').keys()]).toEqual([]);
    expect([...parseUrlHash('#').keys()]).toEqual([]);
  });
});
