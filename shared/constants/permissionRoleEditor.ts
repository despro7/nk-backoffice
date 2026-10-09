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

export const PERMISSION_DOMAIN_DEFAULT_SUBSECTION = '__all__';

export interface RoleEditorCatalogItem {
  key: string;
  group: PermissionGroup;
  label: string;
}

export function permissionDomainForGroup(group: PermissionGroup): PermissionDomainId | null {
  return DOMAIN_BY_GROUP.get(group) ?? null;
}

export function permissionHrSubsection(key: string): PermissionHrSubsectionId {
  return KEY_TO_HR_SUBSECTION[key] ?? 'other';
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
    const domainId = permissionDomainForGroup(item.group);
    if (!domainId) continue;
    byDomain.get(domainId)!.push(item);
  }
  for (const [id, items] of byDomain) {
    byDomain.set(id, sortRoleEditorCatalogItems(items));
  }
  return byDomain;
}

export function groupHrCatalogBySubsection(
  items: RoleEditorCatalogItem[]
): Map<PermissionHrSubsectionId, RoleEditorCatalogItem[]> {
  const map = new Map<PermissionHrSubsectionId, RoleEditorCatalogItem[]>();
  for (const id of PERMISSION_HR_SUBSECTION_ORDER) {
    map.set(id, []);
  }
  for (const item of items) {
    const subsection = permissionHrSubsection(item.key);
    map.get(subsection)!.push(item);
  }
  for (const [id, list] of map) {
    map.set(id, sortRoleEditorCatalogItems(list));
  }
  return map;
}

export function countSelectedInItems(items: RoleEditorCatalogItem[], selected: ReadonlySet<string>): number {
  return items.filter((item) => selected.has(item.key)).length;
}
