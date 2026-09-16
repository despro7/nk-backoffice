import { describe, expect, it } from 'vitest';
import { splitProductTitle } from './splitProductTitle.js';

describe('splitProductTitle', () => {
  it('uses explicit newline in printName', () => {
    const result = splitProductTitle('Fallback', 'Перший рядок\nДругий рядок');
    expect(result.line1).toBe('Перший рядок');
    expect(result.line2).toBe('Другий рядок');
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
