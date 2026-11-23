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

  it('decodes HTML entities from WooCommerce', () => {
    expect(catalogPlainTextForCompare('<p>Обід &#8211; готовий &amp; смачний&nbsp;тут</p>'))
      .toBe('Обід – готовий & смачний тут');
  });

  it('treats WordPress texturized short description as equal to BO plain text', () => {
    const bo = 'Ситний обід для дому, роботи або подорожі - достатньо розігріти. "Хіт" ...';
    const wc = '<p>Ситний обід для дому, роботи або подорожі &#8211; достатньо розігріти. &#8220;Хіт&#8221; &#8230;</p>\n';
    expect(catalogHtmlEquivalent(bo, wc)).toBe(true);
  });

  it('keeps hyphens inside words significant', () => {
    expect(catalogHtmlEquivalent('<p>Будь-який</p>', '<p>Будь–який</p>')).toBe(false);
  });
});
