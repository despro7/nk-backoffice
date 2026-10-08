import { describe, expect, it } from 'vitest';
import {
  buildEmployeeDisplayName,
  employeeNameFromPersonDisplayName,
  parseUaDisplayName,
} from './hrEmployeePersonName';

describe('parseUaDisplayName', () => {
  it('parses three-part name', () => {
    expect(parseUaDisplayName('Інбулаєва Юлія Сергіївна')).toEqual({
      lastName: 'Інбулаєва',
      firstName: 'Юлія',
      middleName: 'Сергіївна',
    });
  });

  it('builds display name from parts', () => {
    const parts = employeeNameFromPersonDisplayName('Коваленко Іван Петрович');
    expect(buildEmployeeDisplayName(parts.lastName, parts.firstName, parts.middleName)).toBe(
      'Коваленко Іван Петрович',
    );
  });
});
