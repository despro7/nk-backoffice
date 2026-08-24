import { describe, expect, it } from 'vitest';
import { generatePassword } from './generatePassword';

describe('generatePassword', () => {
  it('returns the requested length (min 8)', () => {
    expect(generatePassword(14)).toHaveLength(14);
    expect(generatePassword(4)).toHaveLength(8);
  });

  it('includes a letter, a digit and a symbol', () => {
    const password = generatePassword(12);
    expect(password).toMatch(/[A-Za-z]/);
    expect(password).toMatch(/[2-9]/);
    expect(password).toMatch(/[!@#$%&*?]/);
  });

  it('does not use ambiguous glyphs', () => {
    for (let i = 0; i < 20; i++) {
      expect(generatePassword(16)).not.toMatch(/[0O1lI]/);
    }
  });

  it('is not identical across calls', () => {
    const sample = new Set(Array.from({ length: 8 }, () => generatePassword(12)));
    expect(sample.size).toBeGreaterThan(1);
  });
});
