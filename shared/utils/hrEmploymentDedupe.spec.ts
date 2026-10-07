import { describe, expect, it } from 'vitest';
import { dedupeEmploymentsByEmployeePayGroup, filterSelectableLegalEntities } from './hrEmploymentDedupe.js';

describe('dedupeEmploymentsByEmployeePayGroup', () => {
  it('залишає одну зайнятість і віддає пріоритет конкретному роботодавцю', () => {
    const { employments, idRemap } = dedupeEmploymentsByEmployeePayGroup([
      {
        id: 1,
        payGroupId: 1,
        employee: { id: 10 },
        legalEntity: { code: 'fop', name: 'ФОП' },
      },
      {
        id: 2,
        payGroupId: 1,
        employee: { id: 10 },
        legalEntity: { code: 'fop_bubnova', name: 'ФОП Бубнова М.В.' },
      },
    ]);

    expect(employments).toHaveLength(1);
    expect(employments[0].id).toBe(2);
    expect(idRemap.get(1)).toBe(2);
  });
});

describe('filterSelectableLegalEntities', () => {
  it('прибирає seed-типи ФОП, ТОВ і Нештатні', () => {
    const entities = [
      { id: 1, code: 'fop', name: 'ФОП' },
      { id: 2, code: 'tov', name: 'ТОВ' },
      { id: 3, code: 'unofficial_cash', name: 'Нештатні' },
      { id: 4, code: 'fop_bubnova', name: 'ФОП Бубнова М.В.' },
    ];

    expect(filterSelectableLegalEntities(entities).map((item) => item.id)).toEqual([4]);
  });
});
