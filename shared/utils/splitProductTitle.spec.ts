import { describe, expect, it } from 'vitest';
import {
  applyManualTitleBreak,
  parseManualTitleBreak,
  splitProductTitle,
  TITLE_MANUAL_BREAK,
} from './splitProductTitle.js';

describe('splitProductTitle', () => {
  it('uses explicit newline in printName', () => {
    const result = splitProductTitle('Fallback', 'Перший рядок\nДругий рядок');
    expect(result.line1).toBe('Перший рядок');
    expect(result.line2).toBe('Другий рядок');
  });

  it('uses manual pipe separator in printName', () => {
    const result = splitProductTitle('Fallback', `Печериці${TITLE_MANUAL_BREAK}в соусі`);
    expect(result.line1).toBe('Печериці');
    expect(result.line2).toBe('в соусі');
  });

  it('splits at preposition for medium titles', () => {
    const result = splitProductTitle('Печериці в соусі', null);
    expect(result.line1).toBe('Печериці');
    expect(result.line2).toBe('в соусі');
  });

  it('splits long single-line title', () => {
    const result = splitProductTitle(
      'Супер довга назва страви з додатковими словами для етикетки',
      null,
    );
    expect(result.line1.length).toBeGreaterThan(0);
    expect(result.line2.length).toBeGreaterThan(0);
  });

  it('splits medium title that exceeds label width', () => {
    const result = splitProductTitle('Суп гречаний зі свининою', null);
    expect(result.line1).toBe('Суп гречаний');
    expect(result.line2).toBe('зі свининою');
  });
});

describe('splitProductTitle long titles', () => {
  it('keeps preposition at start of line2 for long title', () => {
    const result = splitProductTitle('Пшенична локшина зі свининою в соусі теріякі', null);
    expect(result.line1).toBe('Пшенична локшина');
    expect(result.line2).toBe('зі свининою в соусі теріякі');
  });

  it('does not leave preposition at end of line1 in word-boundary fallback', () => {
    const result = splitProductTitle('Дуже смачна запечена картопля з грибами і цибулею', null);
    expect(result.line1.split(' ').pop()).not.toBe('з');
    expect(`${result.line1} ${result.line2}`).toBe('Дуже смачна запечена картопля з грибами і цибулею');
  });

  it('normalizes NBSP before splitting', () => {
    const result = splitProductTitle('Пшенична локшина\u00A0зі\u00A0свининою в соусі теріякі', null);
    expect(result.line1).toBe('Пшенична локшина');
    expect(result.line2).toBe('зі свининою в соусі теріякі');
  });
});

describe('parseManualTitleBreak', () => {
  it('parses pipe separator', () => {
    expect(parseManualTitleBreak(`Печериці${TITLE_MANUAL_BREAK}в соусі`)).toEqual([
      'Печериці',
      'в соусі',
    ]);
  });
});

describe('applyManualTitleBreak', () => {
  it('moves text after pipe into line2', () => {
    expect(applyManualTitleBreak(`Печериці${TITLE_MANUAL_BREAK}в соусі`, '')).toEqual({
      line1: 'Печериці',
      line2: 'в соусі',
    });
  });
});
