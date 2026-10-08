export interface UaPersonNameParts {
  lastName: string;
  firstName: string;
  middleName: string | null;
}

/** ПІБ у форматі «Прізвище Імʼя По батькові» → частини імені. */
export function parseUaDisplayName(displayName: string): UaPersonNameParts {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { lastName: '', firstName: '', middleName: null };
  }
  if (parts.length === 1) {
    return { lastName: parts[0], firstName: '', middleName: null };
  }
  if (parts.length === 2) {
    return { lastName: parts[0], firstName: parts[1], middleName: null };
  }
  return {
    lastName: parts[0],
    firstName: parts[1],
    middleName: parts.slice(2).join(' ') || null,
  };
}

export function buildEmployeeDisplayName(
  lastName: string,
  firstName: string,
  middleName?: string | null,
): string {
  return [lastName, firstName, middleName].map((part) => part?.trim()).filter(Boolean).join(' ');
}

export function employeeNameFromPersonDisplayName(displayName: string): UaPersonNameParts {
  return parseUaDisplayName(displayName);
}
