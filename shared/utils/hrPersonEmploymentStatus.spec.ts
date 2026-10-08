import { describe, expect, it } from 'vitest';
import { DILOVOD_PERSON_GROUP_DISMISSED } from '../constants/dilovod.js';
import {
  getPersonEmploymentDisplayLabel,
  personHasDismissedLinkedEmployeeConflict,
  resolvePersonEmploymentDisplayStatus,
} from './hrPersonEmploymentStatus.js';

const basePerson = {
  dilovodParentId: null,
  personGroupLabel: null,
  employerName: null,
  linkedEmployee: null,
};

describe('resolvePersonEmploymentDisplayStatus', () => {
  it('returns unlinked without employee', () => {
    expect(resolvePersonEmploymentDisplayStatus(basePerson)).toBe('unlinked');
  });

  it('returns active for active employee with employer', () => {
    expect(resolvePersonEmploymentDisplayStatus({
      ...basePerson,
      employerName: 'ТОВ Тест',
      linkedEmployee: {
        employeeId: 1,
        status: 'active',
        currentLegalEntityId: 2,
        currentLegalEntityName: 'ТОВ Тест',
      },
    })).toBe('active');
  });

  it('returns no_active_employment when active but no open employment', () => {
    expect(resolvePersonEmploymentDisplayStatus({
      ...basePerson,
      linkedEmployee: {
        employeeId: 1,
        status: 'active',
        currentLegalEntityId: null,
        currentLegalEntityName: null,
      },
    })).toBe('no_active_employment');
  });

  it('returns dismissed for anyone in dismissed Dilovod folder', () => {
    const dismissedFolder = {
      dilovodParentId: DILOVOD_PERSON_GROUP_DISMISSED,
      personGroupLabel: 'Звільнені працівники',
    };

    expect(resolvePersonEmploymentDisplayStatus({
      ...basePerson,
      ...dismissedFolder,
      linkedEmployee: null,
    })).toBe('dismissed');
    expect(getPersonEmploymentDisplayLabel({
      ...basePerson,
      ...dismissedFolder,
      linkedEmployee: null,
    })).toBe('Звільнений');

    expect(resolvePersonEmploymentDisplayStatus({
      ...basePerson,
      ...dismissedFolder,
      employerName: 'ТОВ Тест',
      linkedEmployee: {
        employeeId: 1,
        status: 'active',
        currentLegalEntityId: 2,
        currentLegalEntityName: 'ТОВ Тест',
      },
    })).toBe('dismissed');

    expect(resolvePersonEmploymentDisplayStatus({
      ...basePerson,
      ...dismissedFolder,
      linkedEmployee: {
        employeeId: 1,
        status: 'inactive',
        currentLegalEntityId: null,
        currentLegalEntityName: null,
      },
    })).toBe('dismissed');
  });

  it('detects dismissed folder conflict when linked employee exists', () => {
    expect(personHasDismissedLinkedEmployeeConflict({
      ...basePerson,
      dilovodParentId: DILOVOD_PERSON_GROUP_DISMISSED,
      linkedEmployee: null,
    })).toBe(false);
    expect(personHasDismissedLinkedEmployeeConflict({
      ...basePerson,
      dilovodParentId: DILOVOD_PERSON_GROUP_DISMISSED,
      linkedEmployee: {
        employeeId: 1,
        status: 'inactive',
        currentLegalEntityId: null,
        currentLegalEntityName: null,
      },
    })).toBe(true);
  });

  it('returns inactive for inactive not in dismissed folder', () => {
    expect(resolvePersonEmploymentDisplayStatus({
      ...basePerson,
      linkedEmployee: {
        employeeId: 1,
        status: 'inactive',
        currentLegalEntityId: 2,
        currentLegalEntityName: 'ТОВ',
      },
    })).toBe('inactive');
  });
});
