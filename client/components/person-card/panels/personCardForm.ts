import type { HrPersonDto, HrPersonWritePayload } from '@shared/types/hr';
import type { PersonCardInitialValues } from '../PersonCard.types';

export const EMPTY_PERSON_FORM: HrPersonWritePayload = {
  displayName: '',
  taxCode: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
};

export function personToForm(person: HrPersonDto): HrPersonWritePayload {
  return {
    displayName: person.displayName,
    taxCode: person.taxCode ?? '',
    phone: person.phone ?? '',
    email: person.email ?? '',
    address: person.address ?? '',
    notes: person.notes ?? '',
  };
}

export function initialValuesToForm(values?: PersonCardInitialValues): HrPersonWritePayload {
  return {
    displayName: values?.displayName ?? '',
    taxCode: values?.taxCode ?? '',
    phone: values?.phone ?? '',
    email: values?.email ?? '',
    address: values?.address ?? '',
    notes: values?.notes ?? '',
  };
}

/** Нормалізований snapshot для порівняння isDirty. */
export function snapshotPersonForm(form: HrPersonWritePayload): string {
  return JSON.stringify({
    displayName: form.displayName?.trim() ?? '',
    taxCode: form.taxCode?.replace(/\D/g, '').slice(0, 10) ?? '',
    phone: form.phone?.replace(/\D/g, '') ?? '',
    email: form.email?.trim() ?? '',
    address: form.address?.trim() ?? '',
    notes: form.notes?.trim() ?? '',
  });
}
