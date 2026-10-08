import {
  HR_PERSON_MERGE_PICKABLE_FIELDS,
  type HrPersonDto,
  type HrPersonMergeFieldSelections,
  type HrPersonMergePickableField,
} from '../types/hr.js';
import { getPersonEmploymentDisplayLabel } from './hrPersonEmploymentStatus.js';

export { HR_PERSON_MERGE_PICKABLE_FIELDS };

export const HR_PERSON_MERGE_FIELD_LABELS: Record<HrPersonMergePickableField, string> = {
  phone: 'Телефон',
  email: 'Email',
  address: 'Адреса',
  notes: 'Примітки',
  personGroup: 'Група',
  employer: 'Роботодавець',
  employeeStatus: 'Статус працівника',
};

export function createDefaultMergeFieldSelections(mainPersonId: number): HrPersonMergeFieldSelections {
  return Object.fromEntries(
    HR_PERSON_MERGE_PICKABLE_FIELDS.map((field) => [field, mainPersonId]),
  ) as HrPersonMergeFieldSelections;
}

export function getPersonMergeFieldDisplayValue(
  person: HrPersonDto,
  field: HrPersonMergePickableField,
): string | null {
  switch (field) {
    case 'phone':
      return person.phone?.trim() || null;
    case 'email':
      return person.email?.trim() || null;
    case 'address':
      return person.address?.trim() || null;
    case 'notes':
      return person.notes?.trim() || null;
    case 'personGroup':
      return person.personGroupLabel?.trim() || null;
    case 'employer':
      return person.employerName?.trim() || null;
    case 'employeeStatus':
      return getPersonEmploymentDisplayLabel(person);
    default:
      return null;
  }
}
