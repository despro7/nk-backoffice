import { describe, expect, it } from 'vitest';
import { parseCollectionDoc } from './jsonCollection.js';

describe('parseCollectionDoc', () => {
  it('returns an empty doc for missing or broken JSON', () => {
    expect(parseCollectionDoc(null)).toEqual({ nextId: 1, items: [] });
    expect(parseCollectionDoc('{oops')).toEqual({ nextId: 1, items: [] });
  });

  it('drops items without a numeric id', () => {
    const doc = parseCollectionDoc(JSON.stringify({ nextId: 5, items: [{ id: 2 }, { id: 'x' }, null] }));
    expect(doc.items).toEqual([{ id: 2 }]);
    expect(doc.nextId).toBe(5);
  });

  it('never lets nextId fall to or below an existing id', () => {
    expect(parseCollectionDoc(JSON.stringify({ nextId: 2, items: [{ id: 7 }] })).nextId).toBe(8);
    expect(parseCollectionDoc(JSON.stringify({ items: [{ id: 3 }] })).nextId).toBe(4);
  });
});
