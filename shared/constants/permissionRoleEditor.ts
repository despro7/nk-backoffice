import {
  isActionPermission,
  isPagePermission,
  PERMISSIONS,
  type PermissionGroup,
} from './permissions.js';

export type PermissionDomainId =
  | 'main'
  | 'warehouse'
  | 'reports'
  | 'accounting'
  | 'hr'
  | 'products'
  | 'settings';

export interface PermissionDomainTab {
  id: PermissionDomainId;
  label: string;
  groups: readonly PermissionGroup[];
}

/** Домени вкладок у редакторі ролі (сторінки + дії в одному місці). */
export const PERMISSION_ROLE_EDITOR_DOMAINS: readonly PermissionDomainTab[] = [
  { id: 'main', label: 'Основні', groups: ['pages.main'] },
  { id: 'warehouse', label: 'Склад', groups: ['pages.warehouse', 'actions.warehouse'] },
  { id: 'reports', label: 'Звіти', groups: ['pages.reports', 'actions.integrations'] },
  { id: 'accounting', label: 'Бухгалтерія', groups: ['pages.accounting'] },
  { id: 'hr', label: 'Персонал', groups: ['pages.hr', 'actions.hr'] },
  { id: 'products', label: 'Товари', groups: ['actions.products'] },
  { id: 'settings', label: 'Налаштування', groups: ['pages.settings', 'actions.users'] },
];

const DOMAIN_BY_GROUP = new Map<PermissionGroup, PermissionDomainId>(
  PERMISSION_ROLE_EDITOR_DOMAINS.flatMap((domain) =>
    domain.groups.map((group) => [group, domain.id] as const)
  )
);

/** Ключі, які в UI редактора показуємо в іншому домені, ніж за group. */
const KEY_DOMAIN_OVERRIDE: Readonly<Record<string, PermissionDomainId>> = {
  [PERMISSIONS.PAGE_PRODUCTS]: 'products',
  [PERMISSIONS.PAGE_PRODUCT_SETS]: 'products',
};

export const PERMISSION_HR_SUBSECTION_ORDER = [
  'timesheet',
  'employees',
  'payroll',
  'bonuses',
  'employment',
  'settings',
  'other',
] as const;

export type PermissionHrSubsectionId = (typeof PERMISSION_HR_SUBSECTION_ORDER)[number];

export const PERMISSION_HR_SUBSECTION_LABELS: Record<PermissionHrSubsectionId, string> = {
  timesheet: 'Табель',
  employees: 'Співробітники та особи',
  payroll: 'Зарплата та виплати',
  bonuses: 'Премії',
  employment: 'Трудові зміни',
  settings: 'Налаштування HR',
  other: 'Інше',
};

const KEY_TO_HR_SUBSECTION: Record<string, PermissionHrSubsectionId> = {
  [PERMISSIONS.PAGE_HR_TIMESHEET]: 'timesheet',
  [PERMISSIONS.ACTION_HR_TIMESHEET_EDIT]: 'timesheet',
  [PERMISSIONS.ACTION_HR_TIMESHEET_EDIT_OWN_TODAY]: 'timesheet',
  [PERMISSIONS.PAGE_HR_EMPLOYEES]: 'employees',
  [PERMISSIONS.PAGE_HR_PERSONS]: 'employees',
  [PERMISSIONS.ACTION_HR_EMPLOYEES_MANAGE]: 'employees',
  [PERMISSIONS.ACTION_HR_PERSONS_MANAGE]: 'employees',
  [PERMISSIONS.ACTION_HR_AUDIT_VIEW]: 'employees',
  [PERMISSIONS.PAGE_HR_PAYROLL]: 'payroll',
  [PERMISSIONS.PAGE_HR_FOP]: 'payroll',
  [PERMISSIONS.ACTION_HR_PAYROLL_VIEW]: 'payroll',
  [PERMISSIONS.ACTION_HR_PAYTERMS_MANAGE]: 'payroll',
  [PERMISSIONS.ACTION_HR_TAXRULES_MANAGE]: 'payroll',
  [PERMISSIONS.ACTION_HR_PAYOUTS_VIEW]: 'payroll',
  [PERMISSIONS.PAGE_HR_BONUSES]: 'bonuses',
  [PERMISSIONS.ACTION_HR_BONUSES_MANAGE]: 'bonuses',
  [PERMISSIONS.ACTION_HR_EMPLOYMENT_TRANSFER]: 'employment',
  [PERMISSIONS.ACTION_HR_EMPLOYMENT_CHANGE_GROUP]: 'employment',
  [PERMISSIONS.ACTION_HR_EMPLOYMENT_CHANGE_EMPLOYER]: 'employment',
  [PERMISSIONS.ACTION_HR_EMPLOYMENT_CHANGE_PAY_RATE]: 'employment',
  [PERMISSIONS.ACTION_HR_SETTINGS_MANAGE]: 'settings',
};

export const PERMISSION_PRODUCTS_SUBSECTION_ORDER = [
  'woocommerce',
  'catalog',
  'dilovodSync',
  'other',
] as const;

export type PermissionProductsSubsectionId = (typeof PERMISSION_PRODUCTS_SUBSECTION_ORDER)[number];

export const PERMISSION_PRODUCTS_SUBSECTION_LABELS: Record<PermissionProductsSubsectionId, string> = {
  woocommerce: 'WooCommerce',
  catalog: 'Каталог товарів',
  dilovodSync: 'Dilovod Sync',
  other: 'Інше',
};

const KEY_TO_PRODUCTS_SUBSECTION: Record<string, PermissionProductsSubsectionId> = {
  [PERMISSIONS.ACTION_STOREFRONT_READ]: 'woocommerce',
  [PERMISSIONS.ACTION_STOREFRONT_EDIT]: 'woocommerce',
  [PERMISSIONS.ACTION_STOREFRONT_MANAGE]: 'woocommerce',
  [PERMISSIONS.ACTION_STOREFRONT_PULL]: 'woocommerce',
  [PERMISSIONS.ACTION_STOREFRONT_PUSH]: 'woocommerce',
  [PERMISSIONS.PAGE_PRODUCTS]: 'catalog',
  [PERMISSIONS.PAGE_PRODUCT_SETS]: 'catalog',
  [PERMISSIONS.ACTION_PRODUCTS_EDIT]: 'catalog',
  [PERMISSIONS.ACTION_PRODUCTS_EDIT_SPEC]: 'catalog',
  [PERMISSIONS.ACTION_CATALOG_MANAGE]: 'catalog',
  [PERMISSIONS.ACTION_PRODUCTS_SYNC]: 'dilovodSync',
  [PERMISSIONS.ACTION_PRODUCTS_SYNC_EXPORT]: 'dilovodSync',
  [PERMISSIONS.ACTION_PRODUCTS_VIEW_DILOVOD]: 'dilovodSync',
  [PERMISSIONS.ACTION_CATALOG_FULL_REFRESH]: 'dilovodSync',
};

export const PERMISSION_DOMAIN_DEFAULT_SUBSECTION = '__all__';

export interface RoleEditorCatalogItem {
  key: string;
  group: PermissionGroup;
  label: string;
}

export function permissionDomainForGroup(group: PermissionGroup): PermissionDomainId | null {
  return DOMAIN_BY_GROUP.get(group) ?? null;
}

/** Домен у редакторі ролі (з урахуванням KEY_DOMAIN_OVERRIDE). */
export function permissionDomainForKey(
  key: string,
  group: PermissionGroup
): PermissionDomainId | null {
  return KEY_DOMAIN_OVERRIDE[key] ?? permissionDomainForGroup(group);
}

export function permissionHrSubsection(key: string): PermissionHrSubsectionId {
  return KEY_TO_HR_SUBSECTION[key] ?? 'other';
}

export function permissionProductsSubsection(key: string): PermissionProductsSubsectionId {
  return KEY_TO_PRODUCTS_SUBSECTION[key] ?? 'other';
}

export function sortRoleEditorCatalogItems(items: RoleEditorCatalogItem[]): RoleEditorCatalogItem[] {
  return [...items].sort((a, b) => {
    const layerA = isPagePermission(a.key) ? 0 : 1;
    const layerB = isPagePermission(b.key) ? 0 : 1;
    if (layerA !== layerB) return layerA - layerB;
    return a.label.localeCompare(b.label, 'uk');
  });
}

export function groupCatalogByDomain(
  catalog: RoleEditorCatalogItem[]
): Map<PermissionDomainId, RoleEditorCatalogItem[]> {
  const byDomain = new Map<PermissionDomainId, RoleEditorCatalogItem[]>();
  for (const tab of PERMISSION_ROLE_EDITOR_DOMAINS) {
    byDomain.set(tab.id, []);
  }
  for (const item of catalog) {
    if (!isPagePermission(item.key) && !isActionPermission(item.key)) continue;
    const domainId = permissionDomainForKey(item.key, item.group);
    if (!domainId) continue;
    byDomain.get(domainId)!.push(item);
  }
  for (const [id, items] of byDomain) {
    byDomain.set(id, sortRoleEditorCatalogItems(items));
  }
  return byDomain;
}

function groupBySubsectionOrder<T extends string>(
  items: RoleEditorCatalogItem[],
  order: readonly T[],
  resolve: (key: string) => T
): Map<T, RoleEditorCatalogItem[]> {
  const map = new Map<T, RoleEditorCatalogItem[]>();
  for (const id of order) {
    map.set(id, []);
  }
  for (const item of items) {
    const subsection = resolve(item.key);
    map.get(subsection)!.push(item);
  }
  for (const [id, list] of map) {
    map.set(id, sortRoleEditorCatalogItems(list));
  }
  return map;
}

export function groupHrCatalogBySubsection(
  items: RoleEditorCatalogItem[]
): Map<PermissionHrSubsectionId, RoleEditorCatalogItem[]> {
  return groupBySubsectionOrder(items, PERMISSION_HR_SUBSECTION_ORDER, permissionHrSubsection);
}

export function groupProductsCatalogBySubsection(
  items: RoleEditorCatalogItem[]
): Map<PermissionProductsSubsectionId, RoleEditorCatalogItem[]> {
  return groupBySubsectionOrder(
    items,
    PERMISSION_PRODUCTS_SUBSECTION_ORDER,
    permissionProductsSubsection
  );
}

export function countSelectedInItems(items: RoleEditorCatalogItem[], selected: ReadonlySet<string>): number {
  return items.filter((item) => selected.has(item.key)).length;
}
