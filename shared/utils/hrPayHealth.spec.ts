import { describe, expect, it } from 'vitest';
import { collectHrPayWarnings, overlappingPayTerms } from './hrPayHealth.js';

const today = '2026-09-11';

describe('collectHrPayWarnings', () => {
  it('попереджає, якщо немає діючої зайнятості', () => {
    expect(collectHrPayWarnings([], today)).toEqual([
      'Немає діючої зайнятості зі ставкою — розрахунок буде 0',
    ]);
  });

  it('попереджає, якщо в діючій зайнятості немає ставки', () => {
    const warnings = collectHrPayWarnings(
      [
        {
          payGroup: 'official_salary',
          validFrom: '2026-09-01',
          validTo: null,
          legalEntityName: 'ФОП',
          payTerms: [],
        },
      ],
      today,
    );
    expect(warnings).toEqual(['Ставка не задана (ФОП · Офіційна ставка) — розрахунок буде 0']);
  });

  it('попереджає про дві діючі зайнятості в одній групі', () => {
    const warnings = collectHrPayWarnings(
      [
        {
          payGroup: 'official_salary',
          validFrom: '2026-09-01',
          validTo: null,
          legalEntityName: 'ФОП',
          payTerms: [{ effectiveFrom: '2026-09-01', effectiveTo: null }],
        },
        {
          payGroup: 'official_salary',
          validFrom: '2026-09-01',
          validTo: null,
          legalEntityName: '\\СТАВКА\\',
          payTerms: [{ effectiveFrom: '2026-09-01', effectiveTo: null }],
        },
      ],
      today,
    );
    expect(warnings.some((item) => item.includes('Кілька діючих зайнятостей'))).toBe(true);
  });

  it('не попереджає офіційну + нештатні з по одній ставці', () => {
    const warnings = collectHrPayWarnings(
      [
        {
          payGroup: 'official_salary',
          validFrom: '2026-09-01',
          validTo: null,
          legalEntityName: 'ФОП',
          payTerms: [{ effectiveFrom: '2026-09-01', effectiveTo: null }],
        },
        {
          payGroup: 'unofficial_cash',
          validFrom: '2026-09-01',
          validTo: null,
          legalEntityName: 'Нештатні (готівка)',
          payTerms: [{ effectiveFrom: '2026-09-01', effectiveTo: null }],
        },
      ],
      today,
    );
    expect(warnings).toEqual([]);
  });
});

describe('overlappingPayTerms', () => {
  it('знаходить відкриту попередню ставку', () => {
    const overlap = overlappingPayTerms(
      [{ effectiveFrom: '2026-09-01', effectiveTo: null }],
      '2026-10-01',
      null,
    );
    expect(overlap).toHaveLength(1);
  });
});
