import { describe, expect, it } from 'vitest';
import { textMatchesCatalogQuery } from './catalogNameQueryMatch.js';

describe('textMatchesCatalogQuery', () => {
  const name = 'Суп гороховий зі свининою';
  const sku = '03001';

  it('matches full substring in name', () => {
    expect(textMatchesCatalogQuery('гороховий зі', name, sku)).toBe(true);
  });

  it('matches when query words are in different order than product name', () => {
    expect(textMatchesCatalogQuery('гороховий суп', name, sku)).toBe(true);
  });

  it('matches sku', () => {
    expect(textMatchesCatalogQuery('03001', name, sku)).toBe(true);
  });

  it('rejects when a token is missing', () => {
    expect(textMatchesCatalogQuery('гороховий борщ', name, sku)).toBe(false);
  });

  it('empty query matches anything', () => {
    expect(textMatchesCatalogQuery('  ', name, sku)).toBe(true);
  });
});
