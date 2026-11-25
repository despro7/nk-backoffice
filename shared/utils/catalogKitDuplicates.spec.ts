import { describe, expect, it } from 'vitest';
import {
  findKitDuplicateComponents,
  kitDuplicatesAttentionLabel,
  kitDuplicatesWarning,
  kitReleaseDuplicateMessage,
} from './catalogKitDuplicates';

describe('findKitDuplicateComponents', () => {
  it('returns empty for unique rows', () => {
    expect(findKitDuplicateComponents([{ id: 'a', sku: '1', name: 'A' }, { id: 'b', sku: '2', name: 'B' }])).toEqual([]);
  });

  it('detects duplicate by id with count', () => {
    const r = findKitDuplicateComponents([
      { id: 'a', sku: '03007', name: 'Каша' },
      { id: 'b', sku: '2', name: 'B' },
      { id: 'a', sku: '03007', name: 'Каша' },
    ]);
    expect(r).toEqual([{ id: 'a', sku: '03007', name: 'Каша', count: 2 }]);
  });

  it('falls back to sku when id missing', () => {
    const r = findKitDuplicateComponents([{ sku: 'X', name: 'X1' }, { sku: 'X', name: 'X1' }]);
    expect(r).toHaveLength(1);
  });

  it('ignores rows without id and sku', () => {
    expect(findKitDuplicateComponents([{ name: 'a' }, { name: 'a' }])).toEqual([]);
  });
});

describe('messages', () => {
  const dup = { id: 'a', sku: '03007', name: 'Каша гречана з печерицями', count: 2 };
  it('formats warning', () => {
    expect(kitDuplicatesWarning([dup])).toBe('У складі є дублі: Каша гречана з печерицями (03007). Обʼєднайте рядки');
  });
  it('formats attention label', () => {
    expect(kitDuplicatesAttentionLabel(['03007'])).toBe('Склад комплекту: дублі (03007)');
  });
  it('formats release message', () => {
    expect(kitReleaseDuplicateMessage('Тиждень під ключ', dup)).toBe(
      'Комплектування неможливе: у складі набору «Тиждень під ключ» товар «Каша гречана з печерицями» (03007) вказано двічі. Обʼєднайте рядки в картці товару.'
    );
  });
});
