import { describe, expect, it } from 'vitest';
import {
  DILOVOD_PERSON_GROUP_DISMISSED,
  DILOVOD_PERSON_GROUP_EMPLOYEES,
  DILOVOD_PERSON_TYPE_PHYSICAL,
} from '../constants/dilovod.js';
import { isDilovodPersonGroupRow } from './dilovodPersonGroups.js';

describe('isDilovodPersonGroupRow', () => {
  it('treats system folders as groups', () => {
    expect(isDilovodPersonGroupRow({ id: DILOVOD_PERSON_GROUP_EMPLOYEES })).toBe(true);
    expect(isDilovodPersonGroupRow({ id: DILOVOD_PERSON_GROUP_DISMISSED })).toBe(true);
  });

  it('treats physical persons as persons even without tax code and phone', () => {
    expect(isDilovodPersonGroupRow({
      id: '1100100000002001',
      personType: DILOVOD_PERSON_TYPE_PHYSICAL,
    })).toBe(false);
  });

  it('treats isGroup rows as groups even for physical person type', () => {
    expect(isDilovodPersonGroupRow({
      id: '1100100000002002',
      personType: DILOVOD_PERSON_TYPE_PHYSICAL,
      isGroup: 1,
    })).toBe(true);
  });

  it('treats explicit isGroup=0 as contact even without phone and tax code', () => {
    expect(isDilovodPersonGroupRow({
      id: '1100100000002003',
      isGroup: 0,
    })).toBe(false);
  });

  it('treats non-physical person types as groups', () => {
    expect(isDilovodPersonGroupRow({
      id: '1100100000003001',
      personType: '1004000000000999',
    })).toBe(true);
  });

  it('falls back to missing contact fields only when person type is unknown', () => {
    expect(isDilovodPersonGroupRow({ id: '1100100000004001' })).toBe(true);
    expect(isDilovodPersonGroupRow({
      id: '1100100000004002',
      taxCode: '1234567890',
    })).toBe(false);
  });
});
