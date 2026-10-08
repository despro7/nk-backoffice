import { DILOVOD_PERSON_GROUP_DISMISSED } from '../constants/dilovod.js';
import type { HrPersonDto } from '../types/hr.js';

export type HrPersonEmploymentDisplayStatus =
  | 'unlinked'
  | 'active'
  | 'dismissed'
  | 'inactive'
  | 'no_active_employment';

export const HR_PERSON_EMPLOYMENT_DISPLAY_LABELS: Record<
  Exclude<HrPersonEmploymentDisplayStatus, 'unlinked'>,
  string
> = {
  active: 'Активний',
  dismissed: 'Звільнений',
  inactive: 'Неактивний',
  no_active_employment: 'Без зайнятості',
};

export function personIsInDismissedGroup(person: Pick<HrPersonDto, 'dilovodParentId' | 'personGroupLabel'>): boolean {
  if (person.dilovodParentId === DILOVOD_PERSON_GROUP_DISMISSED) return true;
  const label = person.personGroupLabel?.trim().toLowerCase() ?? '';
  return label.includes('звільнен');
}

/** Папка звільнених у Діловоді, але в HR ще є привʼязаний співробітник. */
export function personHasDismissedLinkedEmployeeConflict(
  person: Pick<HrPersonDto, 'linkedEmployee' | 'dilovodParentId' | 'personGroupLabel'>,
): boolean {
  return Boolean(person.linkedEmployee) && personIsInDismissedGroup(person);
}

export function personHasActiveEmployment(
  person: Pick<HrPersonDto, 'linkedEmployee' | 'employerName'>,
): boolean {
  if (!person.linkedEmployee) return false;
  return Boolean(
    person.employerName?.trim()
    || person.linkedEmployee.currentLegalEntityId
    || person.linkedEmployee.currentLegalEntityName?.trim(),
  );
}

/**
 * Статус працівника для UI: не збігається з сирим hrEmployee.status.
 * Папка «Звільнені» в Діловоді — завжди «Звільнений» (окремого UI для inactive немає).
 * «Активний» — є запис співробітника, status active і відкрита зайнятість (роботодавець).
 */
export function resolvePersonEmploymentDisplayStatus(
  person: Pick<HrPersonDto, 'linkedEmployee' | 'dilovodParentId' | 'personGroupLabel' | 'employerName'>,
): HrPersonEmploymentDisplayStatus {
  if (personIsInDismissedGroup(person)) {
    return 'dismissed';
  }

  if (!person.linkedEmployee) return 'unlinked';

  if (person.linkedEmployee.status === 'inactive') {
    return 'inactive';
  }

  if (!personHasActiveEmployment(person)) {
    return 'no_active_employment';
  }

  return 'active';
}

export function getPersonEmploymentDisplayLabel(
  person: Pick<HrPersonDto, 'linkedEmployee' | 'dilovodParentId' | 'personGroupLabel' | 'employerName'>,
): string | null {
  const status = resolvePersonEmploymentDisplayStatus(person);
  if (status === 'unlinked') return null;
  return HR_PERSON_EMPLOYMENT_DISPLAY_LABELS[status];
}
