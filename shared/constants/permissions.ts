import { ROLE_HIERARCHY, ROLES, hasAccess, type RoleValue } from './roles.js';

export type PermissionKey = string;
export type PermissionLayer = 'page' | 'action';

export type PermissionGroup =
  | 'pages.main'
  | 'pages.warehouse'
  | 'pages.reports'
  | 'pages.accounting'
  | 'pages.hr'
  | 'pages.settings'
  | 'actions.users'
  | 'actions.warehouse'
  | 'actions.products'
  | 'actions.integrations'
  | 'actions.hr';

export const PERMISSION_GROUP_LABELS: Record<PermissionGroup, string> = {
  'pages.main': 'Основні сторінки',
  'pages.warehouse': 'Склад',
  'pages.reports': 'Звіти',
  'pages.accounting': 'Бухгалтерія',
  'pages.hr': 'Персонал',
  'pages.settings': 'Налаштування',
  'actions.users': 'Користувачі та адміністрування',
  'actions.warehouse': 'Складські операції',
  'actions.products': 'Операції з товарами',
  'actions.integrations': 'Dilovod / SalesDrive',
  'actions.hr': 'Персонал',
};

/** Група ключа екшена → група чекбоксів у UI (мапінг з PERMISSION_GROUP_LABELS). */
const ACTION_UI_GROUP: Record<string, PermissionGroup> = {
  users: 'actions.users',
  roles: 'actions.users',
  settings: 'actions.users',
  warehouse: 'actions.warehouse',
  products: 'actions.products',
  catalog: 'actions.products',
  dilovod: 'actions.integrations',
  salesdrive: 'actions.integrations',
  lal: 'actions.integrations',
  hr: 'actions.hr',
};

export const DEFAULT_PAGE_GROUP = 'main';

export type SeedGrant = { minRole: RoleValue } | { roles: RoleValue[] };

export interface PermissionDef {
  key: PermissionKey;
  group: PermissionGroup;
  label: string;
  seed?: SeedGrant;
}

/** Оголошення права на маршруті. Немає поля = сторінка доступна всім ролям. */
export interface RoutePermissionInput {
  name: string;
  group?: string;
  label?: string;
}

export interface RoutePermissionSource {
  parent?: string;
  navLabel?: string;
  inNav?: boolean;
  permission?: RoutePermissionInput | string;
}

const min = (role: RoleValue): SeedGrant => ({ minRole: role });
const only = (...roles: RoleValue[]): SeedGrant => ({ roles });

export function pageKey(group: string, name: string): PermissionKey {
  return `page.${group}.${name}`;
}

export function actionKey(group: string, name: string): PermissionKey {
  return `action.${group}.${name}`;
}

export function actionUiGroup(group: string): PermissionGroup {
  return ACTION_UI_GROUP[group] ?? (`actions.${group}` as PermissionGroup);
}

export function pageUiGroup(group: string): PermissionGroup {
  const id = `pages.${group}`;
  return id in PERMISSION_GROUP_LABELS ? (id as PermissionGroup) : 'pages.main';
}

const KEY_FORMAT = /^(page|action)\.[a-z][a-z0-9]*\.[a-zA-Z0-9]+(?:[.-][a-zA-Z0-9]+)*$/;

/** Старі 2-сегментні page.* → page.main.* */
export const LEGACY_PERMISSION_KEYS: Record<string, string> = {
  'page.orders': pageKey(DEFAULT_PAGE_GROUP, 'orders'),
  'page.salesdriveOrders': pageKey(DEFAULT_PAGE_GROUP, 'salesdriveOrders'),
  'page.products': pageKey(DEFAULT_PAGE_GROUP, 'products'),
  'page.productSets': pageKey(DEFAULT_PAGE_GROUP, 'productSets'),
  'page.testSerialCom': pageKey(DEFAULT_PAGE_GROUP, 'testSerialCom'),
};

const DROPPED_PERMISSION_KEYS = new Set(['page.dashboard', 'page.profile']);

export function normalizePermissionKey(key: string): string | null {
  if (DROPPED_PERMISSION_KEYS.has(key)) return null;
  return LEGACY_PERMISSION_KEYS[key] ?? key;
}

export function isPermissionKey(value: string): value is PermissionKey {
  const normalized = normalizePermissionKey(value);
  return normalized != null && KEY_FORMAT.test(normalized);
}

export function resolvePageGroup(route: RoutePermissionSource): string {
  if (typeof route.permission === 'object' && route.permission.group) {
    return route.permission.group;
  }
  return route.parent || DEFAULT_PAGE_GROUP;
}

export function routePermissionKey(route: RoutePermissionSource): string | undefined {
  if (!route.permission) return undefined;
  if (typeof route.permission === 'string') {
    return normalizePermissionKey(route.permission) ?? undefined;
  }
  return pageKey(resolvePageGroup(route), route.permission.name);
}

export function collectPagePermissions(routes: RoutePermissionSource[]): PermissionDef[] {
  const byKey = new Map<string, PermissionDef & { fromNav: boolean }>();
  for (const route of routes) {
    const resolved = resolvePagePermissionDef(route);
    if (!resolved) continue;
    const fromNav = Boolean(route.inNav);
    const existing = byKey.get(resolved.key);
    if (!existing || (fromNav && !existing.fromNav)) {
      byKey.set(resolved.key, { ...resolved, fromNav });
    }
  }
  return [...byKey.values()].map(({ fromNav: _fromNav, ...item }) => item);
}

function resolvePagePermissionDef(route: RoutePermissionSource): PermissionDef | null {
  if (!route.permission) return null;
  if (typeof route.permission === 'string') {
    const key = normalizePermissionKey(route.permission);
    if (!key) return null;
    return {
      key,
      group: pageUiGroup(resolvePageGroup(route)),
      label: route.navLabel || key,
      seed: seedForKey(key),
    };
  }
  const groupName = resolvePageGroup(route);
  const key = pageKey(groupName, route.permission.name);
  return {
    key,
    group: pageUiGroup(groupName),
    label: route.permission.label || route.navLabel || route.permission.name,
    seed: seedForKey(key),
  };
}

const actionRegistry = new Map<string, PermissionDef>();

export function registerAction(group: string, name: string, label: string): PermissionKey {
  const key = actionKey(group, name);
  const def: PermissionDef = {
    key,
    group: actionUiGroup(group),
    label,
    seed: seedForKey(key),
  };
  const existing = actionRegistry.get(key);
  if (existing && existing.label !== label) {
    throw new Error(`Permission ${key} already registered as «${existing.label}», got «${label}»`);
  }
  if (!existing) actionRegistry.set(key, def);
  return key;
}

export function listRegisteredActions(): PermissionDef[] {
  return [...actionRegistry.values()];
}

export function resetActionRegistry(): void {
  actionRegistry.clear();
}

export function permissionGroupLabel(group: string): string {
  if (group in PERMISSION_GROUP_LABELS) {
    return PERMISSION_GROUP_LABELS[group as PermissionGroup];
  }
  return group;
}

/** Seed-матриця для порожньої таблиці roles. Не є UI-каталогом. */
export const PERMISSION_SEEDS: Array<{ key: PermissionKey; seed: SeedGrant }> = [
  { key: pageKey(DEFAULT_PAGE_GROUP, 'orders'), seed: min(ROLES.STOREKEEPER) },
  { key: pageKey(DEFAULT_PAGE_GROUP, 'salesdriveOrders'), seed: min(ROLES.SHOP_MANAGER) },
  { key: pageKey(DEFAULT_PAGE_GROUP, 'products'), seed: min(ROLES.WAREHOUSE_MANAGER) },
  { key: pageKey(DEFAULT_PAGE_GROUP, 'productSets'), seed: min(ROLES.STOREKEEPER) },
  { key: pageKey(DEFAULT_PAGE_GROUP, 'testSerialCom'), seed: min(ROLES.STOREKEEPER) },

  { key: pageKey('warehouse', 'movement'), seed: min(ROLES.STOREKEEPER) },
  { key: pageKey('warehouse', 'movementMob'), seed: min(ROLES.STOREKEEPER) },
  { key: pageKey('warehouse', 'inventory'), seed: min(ROLES.STOREKEEPER) },
  { key: pageKey('warehouse', 'returns'), seed: min(ROLES.STOREKEEPER) },
  { key: pageKey('warehouse', 'writeoff'), seed: min(ROLES.STOREKEEPER) },
  { key: pageKey('warehouse', 'releases'), seed: min(ROLES.STOREKEEPER) },

  { key: pageKey('reports', 'sales'), seed: min(ROLES.ADS_MANAGER) },
  { key: pageKey('reports', 'salesDynamics'), seed: min(ROLES.ADS_MANAGER) },
  { key: pageKey('reports', 'lalAudiences'), seed: min(ROLES.ADS_MANAGER) },
  { key: pageKey('reports', 'shipment'), seed: min(ROLES.SHOP_MANAGER) },
  { key: pageKey('reports', 'general'), seed: min(ROLES.SHOP_MANAGER) },
  { key: pageKey('reports', 'metaLogs'), seed: min(ROLES.STOREKEEPER) },
  { key: pageKey('reports', 'warehouseStatement'), seed: min(ROLES.STOREKEEPER) },

  { key: pageKey('accounting', 'cashIn'), seed: only(ROLES.ADMIN) },
  { key: pageKey('accounting', 'bankStatements'), seed: only(ROLES.ADMIN) },

  { key: pageKey('hr', 'timesheet'), seed: min(ROLES.BOSS) },
  { key: pageKey('hr', 'employees'), seed: min(ROLES.BOSS) },
  { key: pageKey('hr', 'payroll'), seed: only(ROLES.ADMIN, ROLES.BOSS) },
  { key: actionKey('hr', 'timesheet.edit'), seed: min(ROLES.BOSS) },
  { key: actionKey('hr', 'employees.manage'), seed: min(ROLES.BOSS) },
  { key: actionKey('hr', 'payroll.view'), seed: only(ROLES.ADMIN, ROLES.BOSS) },
  { key: actionKey('hr', 'payterms.manage'), seed: only(ROLES.ADMIN, ROLES.BOSS) },
  { key: actionKey('hr', 'payouts.view'), seed: only(ROLES.ADMIN, ROLES.BOSS) },

  { key: pageKey('settings', 'orderAssembly'), seed: min(ROLES.STOREKEEPER) },
  { key: pageKey('settings', 'equipment'), seed: only(ROLES.ADMIN, ROLES.BOSS, ROLES.STOREKEEPER) },
  { key: pageKey('settings', 'orders'), seed: only(ROLES.ADMIN) },
  { key: pageKey('settings', 'dilovod'), seed: min(ROLES.SHOP_MANAGER) },
  { key: pageKey('settings', 'warehouseMovement'), seed: only(ROLES.ADMIN) },
  { key: pageKey('settings', 'design'), seed: only(ROLES.ADMIN) },
  { key: pageKey('settings', 'testAuth'), seed: only(ROLES.ADMIN) },
  { key: pageKey('settings', 'admin'), seed: only(ROLES.ADMIN) },
  { key: pageKey('settings', 'users'), seed: only(ROLES.ADMIN) },

  { key: actionKey('users', 'manage'), seed: only(ROLES.ADMIN) },
  { key: actionKey('roles', 'manage'), seed: only(ROLES.ADMIN) },
  { key: actionKey('settings', 'admin'), seed: only(ROLES.ADMIN) },

  { key: actionKey('warehouse', 'operate'), seed: min(ROLES.STOREKEEPER) },
  { key: actionKey('warehouse', 'history.delete'), seed: only(ROLES.ADMIN) },
  { key: actionKey('warehouse', 'movement.edit'), seed: only(ROLES.ADMIN) },
  { key: actionKey('warehouse', 'movement.delete'), seed: only(ROLES.ADMIN) },

  { key: actionKey('products', 'edit'), seed: min(ROLES.STOREKEEPER) },
  { key: actionKey('products', 'sync'), seed: min(ROLES.STOREKEEPER) },
  { key: actionKey('products', 'syncExport'), seed: only(ROLES.ADMIN) },
  { key: actionKey('products', 'viewDilovod'), seed: min(ROLES.SHOP_MANAGER) },
  { key: actionKey('catalog', 'manage'), seed: min(ROLES.WAREHOUSE_MANAGER) },
  { key: actionKey('catalog', 'fullRefresh'), seed: only(ROLES.ADMIN) },

  { key: actionKey('dilovod', 'read'), seed: min(ROLES.STOREKEEPER) },
  { key: actionKey('dilovod', 'writeSettings'), seed: min(ROLES.WAREHOUSE_MANAGER) },
  { key: actionKey('dilovod', 'export'), seed: min(ROLES.WAREHOUSE_MANAGER) },
  { key: actionKey('dilovod', 'admin'), seed: min(ROLES.SHOP_MANAGER) },
  { key: actionKey('salesdrive', 'manage'), seed: min(ROLES.SHOP_MANAGER) },
  { key: actionKey('lal', 'manage'), seed: min(ROLES.ADS_MANAGER) },
];

const SEED_BY_KEY = new Map(PERMISSION_SEEDS.map((item) => [item.key, item.seed]));

function seedForKey(key: string): SeedGrant | undefined {
  return SEED_BY_KEY.get(key);
}

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_SEEDS.map((item) => item.key);

/** Зручні ключі для hasPermission на клієнті / в тестах (не каталог). */
export const PERMISSIONS = {
  PAGE_ORDERS: pageKey(DEFAULT_PAGE_GROUP, 'orders'),
  PAGE_SALESDRIVE_ORDERS: pageKey(DEFAULT_PAGE_GROUP, 'salesdriveOrders'),
  PAGE_PRODUCTS: pageKey(DEFAULT_PAGE_GROUP, 'products'),
  PAGE_PRODUCT_SETS: pageKey(DEFAULT_PAGE_GROUP, 'productSets'),
  PAGE_TEST_SERIAL_COM: pageKey(DEFAULT_PAGE_GROUP, 'testSerialCom'),
  PAGE_WAREHOUSE_MOVEMENT: pageKey('warehouse', 'movement'),
  PAGE_WAREHOUSE_MOVEMENT_MOB: pageKey('warehouse', 'movementMob'),
  PAGE_WAREHOUSE_INVENTORY: pageKey('warehouse', 'inventory'),
  PAGE_WAREHOUSE_RETURNS: pageKey('warehouse', 'returns'),
  PAGE_WAREHOUSE_WRITEOFF: pageKey('warehouse', 'writeoff'),
  PAGE_WAREHOUSE_RELEASES: pageKey('warehouse', 'releases'),
  PAGE_REPORTS_SALES: pageKey('reports', 'sales'),
  PAGE_REPORTS_SHIPMENT: pageKey('reports', 'shipment'),
  PAGE_REPORTS_GENERAL: pageKey('reports', 'general'),
  PAGE_REPORTS_SALES_DYNAMICS: pageKey('reports', 'salesDynamics'),
  PAGE_REPORTS_LAL: pageKey('reports', 'lalAudiences'),
  PAGE_REPORTS_META_LOGS: pageKey('reports', 'metaLogs'),
  PAGE_REPORTS_WAREHOUSE_STATEMENT: pageKey('reports', 'warehouseStatement'),
  PAGE_ACCOUNTING_CASH_IN: pageKey('accounting', 'cashIn'),
  PAGE_ACCOUNTING_BANK_STATEMENTS: pageKey('accounting', 'bankStatements'),
  PAGE_HR_TIMESHEET: pageKey('hr', 'timesheet'),
  PAGE_HR_EMPLOYEES: pageKey('hr', 'employees'),
  PAGE_HR_PAYROLL: pageKey('hr', 'payroll'),
  ACTION_HR_TIMESHEET_EDIT: actionKey('hr', 'timesheet.edit'),
  ACTION_HR_EMPLOYEES_MANAGE: actionKey('hr', 'employees.manage'),
  ACTION_HR_PAYROLL_VIEW: actionKey('hr', 'payroll.view'),
  ACTION_HR_PAYTERMS_MANAGE: actionKey('hr', 'payterms.manage'),
  ACTION_HR_PAYOUTS_VIEW: actionKey('hr', 'payouts.view'),
  PAGE_SETTINGS_ORDER_ASSEMBLY: pageKey('settings', 'orderAssembly'),
  PAGE_SETTINGS_EQUIPMENT: pageKey('settings', 'equipment'),
  PAGE_SETTINGS_ORDERS: pageKey('settings', 'orders'),
  PAGE_SETTINGS_DILOVOD: pageKey('settings', 'dilovod'),
  PAGE_SETTINGS_WAREHOUSE_MOVEMENT: pageKey('settings', 'warehouseMovement'),
  PAGE_SETTINGS_DESIGN: pageKey('settings', 'design'),
  PAGE_SETTINGS_TEST_AUTH: pageKey('settings', 'testAuth'),
  PAGE_SETTINGS_ADMIN: pageKey('settings', 'admin'),
  PAGE_SETTINGS_USERS: pageKey('settings', 'users'),
  ACTION_USERS_MANAGE: actionKey('users', 'manage'),
  ACTION_ROLES_MANAGE: actionKey('roles', 'manage'),
  ACTION_SETTINGS_ADMIN: actionKey('settings', 'admin'),
  ACTION_WAREHOUSE_OPERATE: actionKey('warehouse', 'operate'),
  ACTION_WAREHOUSE_HISTORY_DELETE: actionKey('warehouse', 'history.delete'),
  ACTION_WAREHOUSE_MOVEMENT_EDIT: actionKey('warehouse', 'movement.edit'),
  ACTION_WAREHOUSE_MOVEMENT_DELETE: actionKey('warehouse', 'movement.delete'),
  ACTION_PRODUCTS_EDIT: actionKey('products', 'edit'),
  ACTION_PRODUCTS_SYNC: actionKey('products', 'sync'),
  ACTION_PRODUCTS_SYNC_EXPORT: actionKey('products', 'syncExport'),
  ACTION_PRODUCTS_VIEW_DILOVOD: actionKey('products', 'viewDilovod'),
  ACTION_CATALOG_MANAGE: actionKey('catalog', 'manage'),
  ACTION_CATALOG_FULL_REFRESH: actionKey('catalog', 'fullRefresh'),
  ACTION_DILOVOD_READ: actionKey('dilovod', 'read'),
  ACTION_DILOVOD_WRITE_SETTINGS: actionKey('dilovod', 'writeSettings'),
  ACTION_DILOVOD_EXPORT: actionKey('dilovod', 'export'),
  ACTION_DILOVOD_ADMIN: actionKey('dilovod', 'admin'),
  ACTION_SALESDRIVE_MANAGE: actionKey('salesdrive', 'manage'),
  ACTION_LAL_MANAGE: actionKey('lal', 'manage'),
} as const;

export const SYSTEM_ROLES_SEED: Array<{
  slug: RoleValue;
  name: string;
  rank: number;
  isSystem: true;
}> = [
  { slug: ROLES.ADS_MANAGER, name: 'Менеджер реклами', rank: ROLE_HIERARCHY[ROLES.ADS_MANAGER], isSystem: true },
  { slug: ROLES.STOREKEEPER, name: 'Комірник', rank: ROLE_HIERARCHY[ROLES.STOREKEEPER], isSystem: true },
  { slug: ROLES.WAREHOUSE_MANAGER, name: 'Керівник складу', rank: ROLE_HIERARCHY[ROLES.WAREHOUSE_MANAGER], isSystem: true },
  { slug: ROLES.SHOP_MANAGER, name: 'Менеджер магазину', rank: ROLE_HIERARCHY[ROLES.SHOP_MANAGER], isSystem: true },
  { slug: ROLES.BOSS, name: 'Директор', rank: ROLE_HIERARCHY[ROLES.BOSS], isSystem: true },
  { slug: ROLES.ADMIN, name: 'Адміністратор', rank: ROLE_HIERARCHY[ROLES.ADMIN], isSystem: true },
];

function matchesSeed(slug: RoleValue, seed: SeedGrant): boolean {
  if ('minRole' in seed) {
    return ROLE_HIERARCHY[slug] >= ROLE_HIERARCHY[seed.minRole];
  }
  return seed.roles.includes(slug);
}

/** Ключі seed-матриці для системної ролі. Admin отримує весь seed-набір. */
export function seedPermissionKeysForRole(slug: string): PermissionKey[] {
  if (slug === ROLES.ADMIN) return [...ALL_PERMISSION_KEYS];
  if (!(slug in ROLE_HIERARCHY)) return [];
  const role = slug as RoleValue;
  return PERMISSION_SEEDS.filter((item) => matchesSeed(role, item.seed)).map((item) => item.key);
}

export function hasPermission(
  permissions: Iterable<string> | undefined | null,
  key: string | undefined | null
): boolean {
  if (!key) return true;
  if (!permissions) return false;
  const wanted = normalizePermissionKey(key);
  if (!wanted) return false;
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  if (set.has('*') || set.has(wanted) || set.has(key)) return true;
  for (const item of set) {
    if (normalizePermissionKey(item) === wanted) return true;
  }
  return false;
}

export function canAccessRoute(
  permissions: Iterable<string> | undefined | null,
  route: RoutePermissionSource & { roles?: string[]; minRole?: string },
  userRole?: string
): boolean {
  const key = routePermissionKey(route);
  if (key) {
    return hasPermission(permissions, key);
  }
  if (!route.roles && !route.minRole) return true;
  if (!userRole) return false;
  return hasAccess(userRole, route.roles, route.minRole);
}

export function parseUsersSettingsTab(search: string): 'users' | 'roles' {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  return params.get('tab') === 'roles' ? 'roles' : 'users';
}

export function slugifyRoleName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function permissionLayer(key: string): PermissionLayer | null {
  const normalized = normalizePermissionKey(key) ?? key;
  if (normalized.startsWith('page.')) return 'page';
  if (normalized.startsWith('action.')) return 'action';
  return null;
}

export function isPagePermission(key: string): boolean {
  return permissionLayer(key) === 'page';
}

export function isActionPermission(key: string): boolean {
  return permissionLayer(key) === 'action';
}

/** Стабільний зліпок ролі+прав – для порівняння «чи треба оновити UI». */
export function permissionsFingerprint(
  role: string | undefined | null,
  permissions: Iterable<string> | undefined | null
): string {
  const keys = permissions ? [...permissions].sort() : [];
  return `${role ?? ''}:${keys.join(',')}`;
}
