import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from './permissions';
import {
  groupCatalogByDomain,
  groupHrCatalogBySubsection,
  permissionDomainForGroup,
  permissionHrSubsection,
} from './permissionRoleEditor';

describe('permissionRoleEditor', () => {
  it('maps permission groups to domains', () => {
    expect(permissionDomainForGroup('pages.hr')).toBe('hr');
    expect(permissionDomainForGroup('actions.hr')).toBe('hr');
    expect(permissionDomainForGroup('actions.products')).toBe('products');
  });

  it('groups catalog items by domain', () => {
    const byDomain = groupCatalogByDomain([
      { key: PERMISSIONS.PAGE_HR_TIMESHEET, group: 'pages.hr', label: 'Табель' },
      { key: PERMISSIONS.ACTION_HR_TIMESHEET_EDIT, group: 'actions.hr', label: 'Edit' },
      { key: PERMISSIONS.PAGE_ORDERS, group: 'pages.main', label: 'Orders' },
    ]);
    expect(byDomain.get('hr')).toHaveLength(2);
    expect(byDomain.get('main')).toHaveLength(1);
  });

  it('assigns HR subsections', () => {
    expect(permissionHrSubsection(PERMISSIONS.ACTION_HR_TIMESHEET_EDIT)).toBe('timesheet');
    expect(permissionHrSubsection(PERMISSIONS.ACTION_HR_EMPLOYEES_MANAGE)).toBe('employees');
    const sub = groupHrCatalogBySubsection([
      { key: PERMISSIONS.PAGE_HR_TIMESHEET, group: 'pages.hr', label: 'A' },
      { key: PERMISSIONS.ACTION_HR_PAYROLL_VIEW, group: 'actions.hr', label: 'B' },
    ]);
    expect(sub.get('timesheet')).toHaveLength(1);
    expect(sub.get('payroll')).toHaveLength(1);
  });
});
