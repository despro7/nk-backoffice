import { describe, expect, it } from 'vitest';
import type { HrEmployeeListItemDto } from '@shared/types/hr';
import { sortHrEmployees } from './employeeTableSort';

function employee(partial: Partial<HrEmployeeListItemDto> & Pick<HrEmployeeListItemDto, 'id' | 'displayName'>): HrEmployeeListItemDto {
  return {
    status: 'active',
    hasPayWarning: false,
    ...partial,
  } as HrEmployeeListItemDto;
}

describe('sortHrEmployees', () => {
  it('сортує ПІБ за українською колацією (І після И, не в кінці алфавіту)', () => {
    const rows = [
      employee({ id: 1, displayName: 'Яремчук' }),
      employee({ id: 2, displayName: 'Коваленко' }),
      employee({ id: 3, displayName: 'Иванов' }),
      employee({ id: 4, displayName: 'Інбулаєва Юлія Сергіївна' }),
      employee({ id: 5, displayName: 'Їжак' }),
      employee({ id: 6, displayName: 'Євген' }),
    ];

    const sorted = sortHrEmployees(rows, { column: 'displayName', direction: 'ascending' });

    expect(sorted.map((row) => row.displayName)).toEqual([
      'Євген',
      'Иванов',
      'Інбулаєва Юлія Сергіївна',
      'Їжак',
      'Коваленко',
      'Яремчук',
    ]);
  });
});
