import { ROLE_HIERARCHY, ROLES, hasAccess, type RoleValue } from './roles.js';

export const PERMISSIONS = {
  PAGE_DASHBOARD: 'page.dashboard',
  PAGE_ORDERS: 'page.orders',
  PAGE_WAREHOUSE_MOVEMENT: 'page.warehouse.movement',
  PAGE_WAREHOUSE_MOVEMENT_MOB: 'page.warehouse.movementMob',
  PAGE_WAREHOUSE_INVENTORY: 'page.warehouse.inventory',
  PAGE_WAREHOUSE_RETURNS: 'page.warehouse.returns',
  PAGE_WAREHOUSE_WRITEOFF: 'page.warehouse.writeoff',
  PAGE_WAREHOUSE_RELEASES: 'page.warehouse.releases',
  PAGE_WAREHOUSE_MATERIALS: 'page.warehouse.materials',
  PAGE_REPORTS_SALES: 'page.reports.sales',
  PAGE_REPORTS_SHIPMENT: 'page.reports.shipment',
  PAGE_REPORTS_GENERAL: 'page.reports.general',
  PAGE_REPORTS_SALES_DYNAMICS: 'page.reports.salesDynamics',
  PAGE_REPORTS_LAL: 'page.reports.lalAudiences',
  PAGE_REPORTS_META_LOGS: 'page.reports.metaLogs',
  PAGE_SALESDRIVE_ORDERS: 'page.salesdriveOrders',
  PAGE_PROFILE: 'page.profile',
  PAGE_SETTINGS_ORDER_ASSEMBLY: 'page.settings.orderAssembly',
  PAGE_SETTINGS_EQUIPMENT: 'page.settings.equipment',
  PAGE_SETTINGS_ORDERS: 'page.settings.orders',
  PAGE_SETTINGS_DILOVOD: 'page.settings.dilovod',
  PAGE_SETTINGS_WAREHOUSE_MOVEMENT: 'page.settings.warehouseMovement',
  PAGE_SETTINGS_DESIGN: 'page.settings.design',
  PAGE_SETTINGS_TEST_AUTH: 'page.settings.testAuth',
  PAGE_SETTINGS_ADMIN: 'page.settings.admin',
  PAGE_SETTINGS_USERS: 'page.settings.users',
  PAGE_PRODUCTS: 'page.products',
  PAGE_PRODUCT_SETS: 'page.productSets',
  PAGE_TEST_SERIAL_COM: 'page.testSerialCom',

  ACTION_USERS_MANAGE: 'action.users.manage',
  ACTION_ROLES_MANAGE: 'action.roles.manage',
  ACTION_SETTINGS_ADMIN: 'action.settings.admin',
  ACTION_WAREHOUSE_OPERATE: 'action.warehouse.operate',
  ACTION_WAREHOUSE_HISTORY_DELETE: 'action.warehouse.history.delete',
  ACTION_PRODUCTS_EDIT: 'action.products.edit',
  ACTION_PRODUCTS_SYNC: 'action.products.sync',
  ACTION_PRODUCTS_SYNC_EXPORT: 'action.products.syncExport',
  ACTION_PRODUCTS_SKU_WHITELIST: 'action.products.skuWhitelist',
  ACTION_PRODUCTS_SET_PARENT_IDS_READ: 'action.products.setParentIds.read',
  ACTION_PRODUCTS_SET_PARENT_IDS_WRITE: 'action.products.setParentIds.write',
  ACTION_PRODUCTS_VIEW_DILOVOD: 'action.products.viewDilovod',
  ACTION_CATALOG_MANAGE: 'action.catalog.manage',
  ACTION_CATALOG_FULL_REFRESH: 'action.catalog.fullRefresh',
  ACTION_MATERIALS_EDIT: 'action.materials.edit',
  ACTION_MATERIALS_SYNC: 'action.materials.sync',
  ACTION_MATERIALS_PARENT_IDS: 'action.materials.parentIds',
  ACTION_DILOVOD_READ: 'action.dilovod.read',
  ACTION_DILOVOD_WRITE_SETTINGS: 'action.dilovod.writeSettings',
  ACTION_DILOVOD_EXPORT: 'action.dilovod.export',
  ACTION_DILOVOD_ADMIN: 'action.dilovod.admin',
  ACTION_SALESDRIVE_MANAGE: 'action.salesdrive.manage',
  ACTION_LAL_MANAGE: 'action.lal.manage',
} as const;

export type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export type PermissionGroup =
  | 'pages.main'
  | 'pages.warehouse'
  | 'pages.reports'
  | 'pages.settings'
  | 'actions.users'
  | 'actions.warehouse'
  | 'actions.products'
  | 'actions.integrations';

export const PERMISSION_GROUP_LABELS: Record<PermissionGroup, string> = {
  'pages.main': 'Сторінки — основні',
  'pages.warehouse': 'Сторінки — склад',
  'pages.reports': 'Сторінки — звіти',
  'pages.settings': 'Сторінки — налаштування',
  'actions.users': 'Дії — користувачі та адмін',
  'actions.warehouse': 'Дії — склад',
  'actions.products': 'Дії — товари',
  'actions.integrations': 'Дії — Dilovod / SalesDrive',
};

export type SeedGrant = { minRole: RoleValue } | { roles: RoleValue[] };

export interface PermissionDef {
  key: PermissionKey;
  group: PermissionGroup;
  label: string;
  seed: SeedGrant;
}

const min = (role: RoleValue): SeedGrant => ({ minRole: role });
const only = (...roles: RoleValue[]): SeedGrant => ({ roles });

export const PERMISSION_CATALOG: PermissionDef[] = [
  { key: PERMISSIONS.PAGE_DASHBOARD, group: 'pages.main', label: 'Головна панель', seed: min(ROLES.ADS_MANAGER) },
  { key: PERMISSIONS.PAGE_ORDERS, group: 'pages.main', label: 'Обробка замовлень', seed: min(ROLES.STOREKEEPER) },
  { key: PERMISSIONS.PAGE_SALESDRIVE_ORDERS, group: 'pages.main', label: 'Стан замовлень', seed: min(ROLES.SHOP_MANAGER) },
  { key: PERMISSIONS.PAGE_PRODUCTS, group: 'pages.main', label: 'Товари 2.0', seed: min(ROLES.WAREHOUSE_MANAGER) },
  { key: PERMISSIONS.PAGE_PRODUCT_SETS, group: 'pages.main', label: 'Товари і комплекти', seed: min(ROLES.STOREKEEPER) },
  { key: PERMISSIONS.PAGE_TEST_SERIAL_COM, group: 'pages.main', label: 'Тест COM порту', seed: min(ROLES.STOREKEEPER) },
  { key: PERMISSIONS.PAGE_PROFILE, group: 'pages.settings', label: 'Мій профіль', seed: min(ROLES.ADS_MANAGER) },

  { key: PERMISSIONS.PAGE_WAREHOUSE_MOVEMENT, group: 'pages.warehouse', label: 'Переміщення між складами', seed: min(ROLES.STOREKEEPER) },
  { key: PERMISSIONS.PAGE_WAREHOUSE_MOVEMENT_MOB, group: 'pages.warehouse', label: 'Переміщення (мобільне)', seed: min(ROLES.STOREKEEPER) },
  { key: PERMISSIONS.PAGE_WAREHOUSE_INVENTORY, group: 'pages.warehouse', label: 'Інвентаризація', seed: min(ROLES.STOREKEEPER) },
  { key: PERMISSIONS.PAGE_WAREHOUSE_RETURNS, group: 'pages.warehouse', label: 'Повернення', seed: min(ROLES.STOREKEEPER) },
  { key: PERMISSIONS.PAGE_WAREHOUSE_WRITEOFF, group: 'pages.warehouse', label: 'Списання', seed: min(ROLES.STOREKEEPER) },
  { key: PERMISSIONS.PAGE_WAREHOUSE_RELEASES, group: 'pages.warehouse', label: 'Комплектація наборів', seed: min(ROLES.STOREKEEPER) },
  { key: PERMISSIONS.PAGE_WAREHOUSE_MATERIALS, group: 'pages.warehouse', label: 'Матеріали', seed: min(ROLES.STOREKEEPER) },

  { key: PERMISSIONS.PAGE_REPORTS_SALES, group: 'pages.reports', label: 'Статистика продажів', seed: min(ROLES.ADS_MANAGER) },
  { key: PERMISSIONS.PAGE_REPORTS_SALES_DYNAMICS, group: 'pages.reports', label: 'Динаміка продажів', seed: min(ROLES.ADS_MANAGER) },
  { key: PERMISSIONS.PAGE_REPORTS_LAL, group: 'pages.reports', label: 'LAL аудиторії', seed: min(ROLES.ADS_MANAGER) },
  { key: PERMISSIONS.PAGE_REPORTS_SHIPMENT, group: 'pages.reports', label: 'Відвантаження', seed: min(ROLES.SHOP_MANAGER) },
  { key: PERMISSIONS.PAGE_REPORTS_GENERAL, group: 'pages.reports', label: 'Загальна статистика', seed: min(ROLES.SHOP_MANAGER) },
  { key: PERMISSIONS.PAGE_REPORTS_META_LOGS, group: 'pages.reports', label: 'Звіт по помилкам', seed: min(ROLES.STOREKEEPER) },

  { key: PERMISSIONS.PAGE_SETTINGS_ORDER_ASSEMBLY, group: 'pages.settings', label: 'Комплектування замовлень', seed: min(ROLES.STOREKEEPER) },
  { key: PERMISSIONS.PAGE_SETTINGS_EQUIPMENT, group: 'pages.settings', label: 'Обладнання', seed: only(ROLES.ADMIN, ROLES.BOSS, ROLES.STOREKEEPER) },
  { key: PERMISSIONS.PAGE_SETTINGS_ORDERS, group: 'pages.settings', label: 'Синхронізація замовлень', seed: only(ROLES.ADMIN) },
  { key: PERMISSIONS.PAGE_SETTINGS_DILOVOD, group: 'pages.settings', label: 'Синхронізація SalesDrive → Dilovod', seed: min(ROLES.SHOP_MANAGER) },
  { key: PERMISSIONS.PAGE_SETTINGS_WAREHOUSE_MOVEMENT, group: 'pages.settings', label: 'Налаштування переміщень', seed: only(ROLES.ADMIN) },
  { key: PERMISSIONS.PAGE_SETTINGS_DESIGN, group: 'pages.settings', label: 'Дизайн-система', seed: only(ROLES.ADMIN) },
  { key: PERMISSIONS.PAGE_SETTINGS_TEST_AUTH, group: 'pages.settings', label: 'Тест авторизації', seed: only(ROLES.ADMIN) },
  { key: PERMISSIONS.PAGE_SETTINGS_ADMIN, group: 'pages.settings', label: 'Адмінські налаштування', seed: only(ROLES.ADMIN) },
  { key: PERMISSIONS.PAGE_SETTINGS_USERS, group: 'pages.settings', label: 'Користувачі та ролі', seed: only(ROLES.ADMIN) },

  { key: PERMISSIONS.ACTION_USERS_MANAGE, group: 'actions.users', label: 'Керувати користувачами', seed: only(ROLES.ADMIN) },
  { key: PERMISSIONS.ACTION_ROLES_MANAGE, group: 'actions.users', label: 'Керувати ролями', seed: only(ROLES.ADMIN) },
  { key: PERMISSIONS.ACTION_SETTINGS_ADMIN, group: 'actions.users', label: 'Змінювати адмінські налаштування', seed: only(ROLES.ADMIN) },

  { key: PERMISSIONS.ACTION_WAREHOUSE_OPERATE, group: 'actions.warehouse', label: 'Складські операції (відправка, чернетки)', seed: min(ROLES.STOREKEEPER) },
  { key: PERMISSIONS.ACTION_WAREHOUSE_HISTORY_DELETE, group: 'actions.warehouse', label: 'Видаляти історію складських документів', seed: only(ROLES.ADMIN) },

  { key: PERMISSIONS.ACTION_PRODUCTS_EDIT, group: 'actions.products', label: 'Редагувати товари (вага, штрихкод, порядок)', seed: min(ROLES.STOREKEEPER) },
  { key: PERMISSIONS.ACTION_PRODUCTS_SYNC, group: 'actions.products', label: 'Синхронізувати товари', seed: min(ROLES.STOREKEEPER) },
  { key: PERMISSIONS.ACTION_PRODUCTS_SYNC_EXPORT, group: 'actions.products', label: 'Синхронізація + експорт товарів', seed: only(ROLES.ADMIN) },
  { key: PERMISSIONS.ACTION_PRODUCTS_SKU_WHITELIST, group: 'actions.products', label: 'SKU whitelist', seed: min(ROLES.BOSS) },
  { key: PERMISSIONS.ACTION_PRODUCTS_SET_PARENT_IDS_READ, group: 'actions.products', label: 'Перегляд parent IDs комплектів', seed: min(ROLES.BOSS) },
  { key: PERMISSIONS.ACTION_PRODUCTS_SET_PARENT_IDS_WRITE, group: 'actions.products', label: 'Зміна parent IDs комплектів', seed: only(ROLES.ADMIN) },
  { key: PERMISSIONS.ACTION_PRODUCTS_VIEW_DILOVOD, group: 'actions.products', label: 'Перегляд товару в Dilovod', seed: min(ROLES.SHOP_MANAGER) },
  { key: PERMISSIONS.ACTION_CATALOG_MANAGE, group: 'actions.products', label: 'Каталог Товари 2.0', seed: min(ROLES.WAREHOUSE_MANAGER) },
  { key: PERMISSIONS.ACTION_CATALOG_FULL_REFRESH, group: 'actions.products', label: 'Повний refresh каталогу з Dilovod', seed: only(ROLES.ADMIN) },
  { key: PERMISSIONS.ACTION_MATERIALS_EDIT, group: 'actions.products', label: 'Редагувати матеріали', seed: min(ROLES.STOREKEEPER) },
  { key: PERMISSIONS.ACTION_MATERIALS_SYNC, group: 'actions.products', label: 'Синхронізувати матеріали', seed: min(ROLES.WAREHOUSE_MANAGER) },
  { key: PERMISSIONS.ACTION_MATERIALS_PARENT_IDS, group: 'actions.products', label: 'Parent IDs матеріалів', seed: only(ROLES.ADMIN) },

  { key: PERMISSIONS.ACTION_DILOVOD_READ, group: 'actions.integrations', label: 'Читання Dilovod (довідники, перевірка замовлень)', seed: min(ROLES.STOREKEEPER) },
  { key: PERMISSIONS.ACTION_DILOVOD_WRITE_SETTINGS, group: 'actions.integrations', label: 'Змінювати налаштування Dilovod', seed: min(ROLES.WAREHOUSE_MANAGER) },
  { key: PERMISSIONS.ACTION_DILOVOD_EXPORT, group: 'actions.integrations', label: 'Експорт / відвантаження в Dilovod', seed: min(ROLES.WAREHOUSE_MANAGER) },
  { key: PERMISSIONS.ACTION_DILOVOD_ADMIN, group: 'actions.integrations', label: 'Адмін-дії Dilovod (кеш, тест, cash-in)', seed: min(ROLES.SHOP_MANAGER) },
  { key: PERMISSIONS.ACTION_SALESDRIVE_MANAGE, group: 'actions.integrations', label: 'Керувати кешем SalesDrive', seed: min(ROLES.SHOP_MANAGER) },
  { key: PERMISSIONS.ACTION_LAL_MANAGE, group: 'actions.integrations', label: 'LAL аудиторії (експорт)', seed: min(ROLES.ADS_MANAGER) },
];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_CATALOG.map((item) => item.key);

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

export function isPermissionKey(value: string): value is PermissionKey {
  return ALL_PERMISSION_KEYS.includes(value as PermissionKey);
}

function matchesSeed(slug: RoleValue, seed: SeedGrant): boolean {
  if ('minRole' in seed) {
    return ROLE_HIERARCHY[slug] >= ROLE_HIERARCHY[seed.minRole];
  }
  return seed.roles.includes(slug);
}

/** Ключі seed-матриці для системної ролі. Admin отримує весь каталог. */
export function seedPermissionKeysForRole(slug: string): PermissionKey[] {
  if (slug === ROLES.ADMIN) return [...ALL_PERMISSION_KEYS];
  if (!(slug in ROLE_HIERARCHY)) return [];
  const role = slug as RoleValue;
  return PERMISSION_CATALOG.filter((item) => matchesSeed(role, item.seed)).map((item) => item.key);
}

export function hasPermission(
  permissions: Iterable<string> | undefined | null,
  key: string | undefined | null
): boolean {
  if (!key) return true;
  if (!permissions) return false;
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return set.has('*') || set.has(key);
}

export function canAccessRoute(
  permissions: Iterable<string> | undefined | null,
  route: { permission?: string; roles?: string[]; minRole?: string },
  userRole?: string
): boolean {
  if (route.permission) {
    return hasPermission(permissions, route.permission);
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
