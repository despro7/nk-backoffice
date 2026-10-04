import { describe, expect, it } from 'vitest';
import { buildGoodPartCreateHeader } from './DilovodGoodPartsService.js';

describe('buildGoodPartCreateHeader', () => {
  it('заповнює code як batchName без поля name', () => {
    const header = buildGoodPartCreateHeader({
      owner: '1119000000001234',
      batchName: '61002',
      productionDate: '2026-10-03 12:00:00',
    });

    expect(header).toMatchObject({
      id: 'catalogs.goodParts',
      owner: '1119000000001234',
      code: '61002',
      date: '2026-10-03 12:00:00',
    });
    expect(header).not.toHaveProperty('name');
    expect(header).not.toHaveProperty('expiration');
  });

  it('форматує expiration як datetime для Dilovod', () => {
    const header = buildGoodPartCreateHeader({
      owner: '1119000000001234',
      batchName: '61002',
      productionDate: '2026-10-03 12:00:00',
      expiration: '2027-10-03',
    });

    expect(header.expiration).toBe('2027-10-03 00:00:00');
  });

  it('зберігає префікс K у code для kit-партій', () => {
    const header = buildGoodPartCreateHeader({
      owner: '1119000000001234',
      batchName: 'K61003',
      productionDate: '2026-10-03 12:00:00',
      expiration: '2027-10-03',
    });

    expect(header.code).toBe('K61003');
    expect(header).not.toHaveProperty('name');
    expect(header.expiration).toBe('2027-10-03 00:00:00');
  });

  it('додає name і number, якщо поля є в live-метаданих Dilovod', () => {
    const header = buildGoodPartCreateHeader({
      owner: '1119000000001234',
      batchName: 'K61003',
      productionDate: '2026-10-03 12:00:00',
      expiration: '2027-10-03',
      writableFields: new Set(['code', 'owner', 'date', 'expiration', 'name', 'number']),
    });

    expect(header).toMatchObject({
      code: 'K61003',
      name: { uk: 'K61003', ru: '' },
      number: '61003',
    });
  });
});
