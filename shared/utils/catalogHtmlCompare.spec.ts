import { describe, expect, it } from 'vitest';
import { catalogHtmlEquivalent, catalogPlainTextForCompare } from './catalogHtmlCompare.js';

describe('catalogHtmlCompare', () => {
  it('treats equivalent HTML and plain text as equal', () => {
    expect(catalogHtmlEquivalent('<p>Текст</p>', 'Текст')).toBe(true);
    expect(catalogHtmlEquivalent('<p>Текст</p>', '<p>Текст</p>')).toBe(true);
  });

  it('ignores whitespace differences', () => {
    expect(catalogPlainTextForCompare('<p>  Текст   </p>')).toBe('Текст');
  });

  it('detects real content differences', () => {
    expect(catalogHtmlEquivalent('<p>A</p>', '<p>B</p>')).toBe(false);
  });

  it('equates short description HTML with plain text', () => {
    expect(catalogHtmlEquivalent('<p>Текст <br/> тут</p>', 'Текст тут')).toBe(true);
  });
});
