import { describe, expect, it } from 'vitest';
import {
  dedupeEmploymentsByEmployeePayGroup,
  employmentIdsInSameGroup,
  filterSelectableLegalEntities,
  pickCurrentEmploymentForEmployerContext,
  pickCurrentSelectableEmployerEmployment,
  resolveCanonicalEmploymentId,
} from './hrEmploymentDedupe.js';

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

  it('повертає всі id групи та канонічний id', () => {
    const rows = [
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
    ];

    expect(employmentIdsInSameGroup(rows, 1).sort()).toEqual([1, 2]);
    expect(employmentIdsInSameGroup(rows, 2).sort()).toEqual([1, 2]);
    expect(resolveCanonicalEmploymentId(rows, 1)).toBe(2);
    expect(resolveCanonicalEmploymentId(rows, 2)).toBe(2);
  });
});

describe('pickCurrentEmploymentForEmployerContext', () => {
  const day = new Date(Date.UTC(2026, 9, 8));

  it('обирає нештатну зайнятість замість шаблону ФОП', () => {
    const picked = pickCurrentEmploymentForEmployerContext(
      [
        {
          validFrom: new Date(Date.UTC(2026, 0, 1)),
          validTo: null,
          legalEntity: { code: 'fop', name: 'ФОП' },
        },
        {
          validFrom: new Date(Date.UTC(2026, 1, 1)),
          validTo: null,
          legalEntity: { code: 'unofficial_cash', name: 'Нештатні' },
        },
      ],
      day,
    );

    expect(picked?.legalEntity.code).toBe('unofficial_cash');
  });

  it('ігнорує лише шаблони fop/tov без конкретного роботодавця', () => {
    const picked = pickCurrentEmploymentForEmployerContext(
      [
        {
          validFrom: new Date(Date.UTC(2026, 0, 1)),
          validTo: null,
          legalEntity: { code: 'fop', name: 'ФОП' },
        },
      ],
      day,
    );

    expect(picked).toBeNull();
  });
});

describe('pickCurrentSelectableEmployerEmployment', () => {
  const day = new Date(Date.UTC(2026, 9, 8));

  it('обирає конкретного роботодавця, ігноруючи seed Нештатні', () => {
    const picked = pickCurrentSelectableEmployerEmployment(
      [
        {
          validFrom: new Date(Date.UTC(2026, 2, 1)),
          validTo: null,
          legalEntity: { code: 'unofficial_cash', name: 'Нештатні' },
        },
        {
          validFrom: new Date(Date.UTC(2026, 1, 1)),
          validTo: null,
          legalEntity: { code: 'fop_bubnova', name: 'ФОП Бубнова М.В.' },
        },
      ],
      day,
    );

    expect(picked?.legalEntity.code).toBe('fop_bubnova');
  });

  it('повертає null, якщо є лише seed-записи', () => {
    const picked = pickCurrentSelectableEmployerEmployment(
      [
        {
          validFrom: new Date(Date.UTC(2026, 0, 1)),
          validTo: null,
          legalEntity: { code: 'unofficial_cash', name: 'Нештатні' },
        },
      ],
      day,
    );

    expect(picked).toBeNull();
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
