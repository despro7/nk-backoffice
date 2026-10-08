import { describe, expect, it } from 'vitest';
import { DILOVOD_PERSON_GROUP_EMPLOYEES } from '../constants/dilovod.js';
import { isPersonGroupAlignedWithEmployer } from './personEmployerGroupAlign.js';

describe('isPersonGroupAlignedWithEmployer', () => {
  it('requires employees root when there is no current employer', () => {
    expect(isPersonGroupAlignedWithEmployer(DILOVOD_PERSON_GROUP_EMPLOYEES, null)).toBe(true);
    expect(isPersonGroupAlignedWithEmployer('other-group', null)).toBe(false);
  });

  it('requires employer folder when employment and group id exist', () => {
    const employment = { legalEntity: { dilovodPersonGroupId: 'employer-folder' } };
    expect(isPersonGroupAlignedWithEmployer('employer-folder', employment)).toBe(true);
    expect(isPersonGroupAlignedWithEmployer(DILOVOD_PERSON_GROUP_EMPLOYEES, employment)).toBe(false);
  });

  it('is not aligned when employer group is not linked yet', () => {
    const employment = { legalEntity: { dilovodPersonGroupId: null } };
    expect(isPersonGroupAlignedWithEmployer(DILOVOD_PERSON_GROUP_EMPLOYEES, employment)).toBe(false);
  });
});
