import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from './permissions';
import {
  groupCatalogByDomain,
  groupHrCatalogBySubsection,
  groupProductsCatalogBySubsection,
  permissionDomainForGroup,
  permissionDomainForKey,
  permissionHrSubsection,
  permissionProductsSubsection,
} from './permissionRoleEditor';

describe('permissionRoleEditor', () => {
  it('maps permission groups to domains', () => {
    expect(permissionDomainForGroup('pages.hr')).toBe('hr');
    expect(permissionDomainForGroup('actions.hr')).toBe('hr');
    expect(permissionDomainForGroup('actions.products')).toBe('products');
  });

  it('overrides products pages into products domain', () => {
    expect(permissionDomainForKey(PERMISSIONS.PAGE_PRODUCTS, 'pages.main')).toBe('products');
    expect(permissionDomainForKey(PERMISSIONS.PAGE_PRODUCT_SETS, 'pages.main')).toBe('products');
    expect(permissionDomainForKey(PERMISSIONS.PAGE_ORDERS, 'pages.main')).toBe('main');
  });

  it('groups catalog items by domain with products page override', () => {
    const byDomain = groupCatalogByDomain([
      { key: PERMISSIONS.PAGE_HR_TIMESHEET, group: 'pages.hr', label: 'Табель' },
      { key: PERMISSIONS.ACTION_HR_TIMESHEET_EDIT, group: 'actions.hr', label: 'Edit' },
      { key: PERMISSIONS.PAGE_ORDERS, group: 'pages.main', label: 'Orders' },
      { key: PERMISSIONS.PAGE_PRODUCTS, group: 'pages.main', label: 'Товари' },
      { key: PERMISSIONS.ACTION_STOREFRONT_EDIT, group: 'actions.products', label: 'Woo edit' },
    ]);
    expect(byDomain.get('hr')).toHaveLength(2);
    expect(byDomain.get('main')).toHaveLength(1);
    expect(byDomain.get('products')?.map((item) => item.key)).toEqual(
      expect.arrayContaining([PERMISSIONS.PAGE_PRODUCTS, PERMISSIONS.ACTION_STOREFRONT_EDIT])
    );
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

  it('assigns products subsections', () => {
    expect(permissionProductsSubsection(PERMISSIONS.ACTION_STOREFRONT_PUSH)).toBe('woocommerce');
    expect(permissionProductsSubsection(PERMISSIONS.PAGE_PRODUCTS)).toBe('catalog');
    expect(permissionProductsSubsection(PERMISSIONS.ACTION_CATALOG_FULL_REFRESH)).toBe('dilovodSync');
    const sub = groupProductsCatalogBySubsection([
      { key: PERMISSIONS.ACTION_STOREFRONT_EDIT, group: 'actions.products', label: 'Woo' },
      { key: PERMISSIONS.PAGE_PRODUCTS, group: 'pages.main', label: 'Товари' },
      { key: PERMISSIONS.ACTION_PRODUCTS_SYNC, group: 'actions.products', label: 'Sync' },
    ]);
    expect(sub.get('woocommerce')).toHaveLength(1);
    expect(sub.get('catalog')).toHaveLength(1);
    expect(sub.get('dilovodSync')).toHaveLength(1);
  });
});
