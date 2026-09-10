import type { SortDescriptor } from '@heroui/react';
import { HR_PAY_GROUP_LABELS, type HrEmployeeListItemDto } from '@shared/types/hr';

export type HrEmployeeSortColumn =
  | 'displayName'
  | 'currentLegalEntityName'
  | 'currentPayGroup'
  | 'cardMasked'
  | 'status';

export const DEFAULT_EMPLOYEE_SORT: SortDescriptor = {
  column: 'displayName',
  direction: 'ascending',
};

function sortValue(row: HrEmployeeListItemDto, column: HrEmployeeSortColumn): string {
  switch (column) {
    case 'displayName':
      return row.displayName;
    case 'currentLegalEntityName':
      return row.currentLegalEntityName ?? '';
    case 'currentPayGroup':
      return row.currentPayGroup ? HR_PAY_GROUP_LABELS[row.currentPayGroup] : '';
    case 'cardMasked':
      return row.cardMasked ?? '';
    case 'status':
      return row.status;
    default:
      return '';
  }
}

export function sortHrEmployees(
  rows: HrEmployeeListItemDto[],
  sortDescriptor: SortDescriptor | undefined,
): HrEmployeeListItemDto[] {
  const column = sortDescriptor?.column;
  if (!column) return rows;

  const key = String(column) as HrEmployeeSortColumn;
  const dir = sortDescriptor?.direction === 'descending' ? -1 : 1;

  return [...rows].sort((left, right) => {
    const leftValue = sortValue(left, key).toLocaleLowerCase('uk');
    const rightValue = sortValue(right, key).toLocaleLowerCase('uk');
    if (leftValue < rightValue) return -1 * dir;
    if (leftValue > rightValue) return 1 * dir;
    return left.id - right.id;
  });
}
