import { describe, expect, it } from 'vitest';
import { buildPersonSearchWhere } from './hrPersonSearchWhere.js';

describe('buildPersonSearchWhere', () => {
  it('повертає undefined для порожнього рядка', () => {
    expect(buildPersonSearchWhere('')).toBeUndefined();
    expect(buildPersonSearchWhere('   ')).toBeUndefined();
  });

  it('додає збіг за прізвищем та імʼям без обовʼязкового по батькові', () => {
    const where = buildPersonSearchWhere('Іванов Іван Іванович');
    expect(where?.OR).toBeDefined();
    const andBranches = (where?.OR ?? []).filter(
      (branch) => branch && typeof branch === 'object' && 'AND' in branch,
    );
    expect(andBranches.length).toBeGreaterThanOrEqual(2);
    const twoTokenBranch = andBranches.find((branch) => {
      const and = (branch as { AND: unknown[] }).AND;
      return and.length === 2;
    });
    expect(twoTokenBranch).toBeDefined();
  });
});
