import { DILOVOD_PERSON_GROUP_EMPLOYEES } from '../constants/dilovod.js';
import type { HrPersonDto } from '../types/hr.js';

export function isPersonGroupAlignedWithEmployer(
  dilovodParentId: string | null | undefined,
  currentEmployment: { legalEntity: { dilovodPersonGroupId: string | null } } | null,
): boolean {
  const parentId = dilovodParentId ?? null;
  if (!currentEmployment) {
    return parentId === DILOVOD_PERSON_GROUP_EMPLOYEES;
  }

  const employerGroupId = currentEmployment.legalEntity.dilovodPersonGroupId;
  if (!employerGroupId) {
    return false;
  }

  return parentId === employerGroupId;
}

export function currentEmployerEmploymentFromPerson(
  person: Pick<HrPersonDto, 'linkedEmployee'>,
): { legalEntity: { dilovodPersonGroupId: string | null } } | null {
  const linked = person.linkedEmployee;
  if (!linked?.currentLegalEntityId) return null;
  return {
    legalEntity: {
      dilovodPersonGroupId: linked.currentLegalEntityDilovodPersonGroupId ?? null,
    },
  };
}

export function personGroupAlignedWithEmployerFromDto(
  person: Pick<HrPersonDto, 'dilovodParentId' | 'linkedEmployee'>,
): boolean {
  return isPersonGroupAlignedWithEmployer(
    person.dilovodParentId,
    currentEmployerEmploymentFromPerson(person),
  );
}
