import { describe, expect, it } from 'vitest';
import { dedupeEmploymentsByEmployeePayGroup } from './hrEmploymentDedupe.js';

describe('dedupeEmploymentsByEmployeePayGroup', () => {
  it('залишає одну зайнятість і віддає пріоритет конкретному роботодавцю', () => {
    const { employments, idRemap } = dedupeEmploymentsByEmployeePayGroup([
      {
        id: 1,
        payGroup: 'official_salary',
        employee: { id: 10 },
        legalEntity: { code: 'fop', name: 'ФОП' },
      },
      {
        id: 2,
        payGroup: 'official_salary',
        employee: { id: 10 },
        legalEntity: { code: 'fop_bubnova', name: 'ФОП Бубнова М.В.' },
      },
    ]);

    expect(employments).toHaveLength(1);
    expect(employments[0].id).toBe(2);
    expect(idRemap.get(1)).toBe(2);
  });
});
