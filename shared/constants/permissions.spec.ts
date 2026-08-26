import { describe, expect, it, beforeEach } from 'vitest';
import {
  ALL_PERMISSION_KEYS,
  PERMISSIONS,
  actionKey,
  canAccessRoute,
  collectPagePermissions,
  hasPermission,
  isActionPermission,
  isPagePermission,
  isPermissionKey,
  listRegisteredActions,
  normalizePermissionKey,
  pageKey,
  parseUsersSettingsTab,
  permissionLayer,
  permissionsFingerprint,
  registerAction,
  resetActionRegistry,
  routePermissionKey,
  seedPermissionKeysForRole,
  slugifyRoleName,
} from './permissions';
import { ROLES } from './roles';

describe('hasPermission', () => {
  it('passes when the key is in the set', () => {
    expect(hasPermission([PERMISSIONS.PAGE_ORDERS], PERMISSIONS.PAGE_ORDERS)).toBe(true);
  });

  it('fails when the key is missing', () => {
    expect(hasPermission([PERMISSIONS.PAGE_ORDERS], PERMISSIONS.PAGE_SETTINGS_USERS)).toBe(false);
  });

  it('wildcard grants every key', () => {
    expect(hasPermission(['*'], 'action.anything')).toBe(true);
  });

  it('empty/missing permissions deny a required key', () => {
    expect(hasPermission(undefined, PERMISSIONS.PAGE_ORDERS)).toBe(false);
    expect(hasPermission([], PERMISSIONS.PAGE_ORDERS)).toBe(false);
  });

  it('missing key is treated as allowed', () => {
    expect(hasPermission([], undefined)).toBe(true);
    expect(hasPermission(undefined, '')).toBe(true);
  });

  it('treats legacy page.orders as page.main.orders', () => {
    expect(hasPermission(['page.main.orders'], 'page.orders')).toBe(true);
    expect(hasPermission(['page.orders'], PERMISSIONS.PAGE_ORDERS)).toBe(true);
  });
});

describe('seedPermissionKeysForRole', () => {
  it('admin receives every catalog key', () => {
    expect(seedPermissionKeysForRole(ROLES.ADMIN).sort()).toEqual([...ALL_PERMISSION_KEYS].sort());
  });

  it('unknown slug gets no keys', () => {
    expect(seedPermissionKeysForRole('intern')).toEqual([]);
  });

  it('ads-manager sees reports but not orders or users', () => {
    const keys = seedPermissionKeysForRole(ROLES.ADS_MANAGER);
    expect(keys).toContain(PERMISSIONS.PAGE_REPORTS_SALES);
    expect(keys).toContain(PERMISSIONS.ACTION_LAL_MANAGE);
    expect(keys).not.toContain(PERMISSIONS.PAGE_ORDERS);
    expect(keys).not.toContain(PERMISSIONS.ACTION_USERS_MANAGE);
    expect(keys).not.toContain(PERMISSIONS.PAGE_SETTINGS_USERS);
  });

  it('storekeeper can pack orders and operate warehouse', () => {
    const keys = seedPermissionKeysForRole(ROLES.STOREKEEPER);
    expect(keys).toContain(PERMISSIONS.PAGE_ORDERS);
    expect(keys).toContain(PERMISSIONS.ACTION_WAREHOUSE_OPERATE);
    expect(keys).not.toContain(PERMISSIONS.PAGE_PRODUCTS);
    expect(keys).not.toContain(PERMISSIONS.ACTION_WAREHOUSE_HISTORY_DELETE);
  });

  it('equipment page is storekeeper/boss/admin, not shop-manager', () => {
    expect(seedPermissionKeysForRole(ROLES.STOREKEEPER)).toContain(PERMISSIONS.PAGE_SETTINGS_EQUIPMENT);
    expect(seedPermissionKeysForRole(ROLES.BOSS)).toContain(PERMISSIONS.PAGE_SETTINGS_EQUIPMENT);
    expect(seedPermissionKeysForRole(ROLES.SHOP_MANAGER)).not.toContain(PERMISSIONS.PAGE_SETTINGS_EQUIPMENT);
    expect(seedPermissionKeysForRole(ROLES.WAREHOUSE_MANAGER)).not.toContain(PERMISSIONS.PAGE_SETTINGS_EQUIPMENT);
  });

  it('only admin manages users, roles and admin settings', () => {
    for (const slug of [ROLES.ADS_MANAGER, ROLES.STOREKEEPER, ROLES.WAREHOUSE_MANAGER, ROLES.SHOP_MANAGER, ROLES.BOSS]) {
      const keys = seedPermissionKeysForRole(slug);
      expect(keys).not.toContain(PERMISSIONS.ACTION_USERS_MANAGE);
      expect(keys).not.toContain(PERMISSIONS.ACTION_ROLES_MANAGE);
      expect(keys).not.toContain(PERMISSIONS.PAGE_SETTINGS_USERS);
    }
    const admin = seedPermissionKeysForRole(ROLES.ADMIN);
    expect(admin).toContain(PERMISSIONS.ACTION_USERS_MANAGE);
    expect(admin).toContain(PERMISSIONS.ACTION_ROLES_MANAGE);
    expect(admin).toContain(PERMISSIONS.PAGE_SETTINGS_USERS);
  });

  it('warehouse-manager can open products 2.0; storekeeper cannot', () => {
    expect(seedPermissionKeysForRole(ROLES.WAREHOUSE_MANAGER)).toContain(PERMISSIONS.PAGE_PRODUCTS);
    expect(seedPermissionKeysForRole(ROLES.WAREHOUSE_MANAGER)).toContain(PERMISSIONS.ACTION_CATALOG_MANAGE);
    expect(seedPermissionKeysForRole(ROLES.STOREKEEPER)).not.toContain(PERMISSIONS.PAGE_PRODUCTS);
  });

  it('accounting cash-in page is admin-only in seed', () => {
    expect(seedPermissionKeysForRole(ROLES.ADMIN)).toContain(PERMISSIONS.PAGE_ACCOUNTING_CASH_IN);
    for (const slug of [ROLES.ADS_MANAGER, ROLES.STOREKEEPER, ROLES.WAREHOUSE_MANAGER, ROLES.SHOP_MANAGER, ROLES.BOSS]) {
      expect(seedPermissionKeysForRole(slug)).not.toContain(PERMISSIONS.PAGE_ACCOUNTING_CASH_IN);
    }
  });

  it('accounting bank-statements page is admin-only in seed', () => {
    expect(seedPermissionKeysForRole(ROLES.ADMIN)).toContain(PERMISSIONS.PAGE_ACCOUNTING_BANK_STATEMENTS);
    for (const slug of [ROLES.ADS_MANAGER, ROLES.STOREKEEPER, ROLES.WAREHOUSE_MANAGER, ROLES.SHOP_MANAGER, ROLES.BOSS]) {
      expect(seedPermissionKeysForRole(slug)).not.toContain(PERMISSIONS.PAGE_ACCOUNTING_BANK_STATEMENTS);
    }
  });
});

describe('canAccessRoute', () => {
  it('uses assembled key from permission object', () => {
    const route = { parent: 'settings', permission: { name: 'users' }, minRole: ROLES.ADMIN };
    expect(canAccessRoute([PERMISSIONS.PAGE_SETTINGS_USERS], route, ROLES.ADS_MANAGER)).toBe(true);
    expect(canAccessRoute([], route, ROLES.ADMIN)).toBe(false);
  });

  it('uses permission key string when present', () => {
    const route = { permission: PERMISSIONS.PAGE_ORDERS, minRole: ROLES.ADMIN };
    expect(canAccessRoute([PERMISSIONS.PAGE_ORDERS], route, ROLES.ADS_MANAGER)).toBe(true);
    expect(canAccessRoute([], route, ROLES.ADMIN)).toBe(false);
  });

  it('falls back to minRole when permission is absent', () => {
    const route = { minRole: ROLES.STOREKEEPER };
    expect(canAccessRoute([], route, ROLES.STOREKEEPER)).toBe(true);
    expect(canAccessRoute([], route, ROLES.ADS_MANAGER)).toBe(false);
  });

  it('open route without guards is allowed', () => {
    expect(canAccessRoute(undefined, {}, undefined)).toBe(true);
  });
});

describe('collectPagePermissions', () => {
  it('builds page.group.name from parent + name and defaults label to navLabel', () => {
    const catalog = collectPagePermissions([
      { parent: 'warehouse', navLabel: 'Інвентаризація', inNav: true, permission: { name: 'inventory' } },
    ]);
    expect(catalog).toEqual([
      expect.objectContaining({
        key: pageKey('warehouse', 'inventory'),
        group: 'pages.warehouse',
        label: 'Інвентаризація',
      }),
    ]);
  });

  it('maps accounting parent to pages.accounting group', () => {
    const catalog = collectPagePermissions([
      { parent: 'accounting', navLabel: 'Реєстр переказів НП', inNav: true, permission: { name: 'cashIn' } },
    ]);
    expect(catalog[0]).toEqual(
      expect.objectContaining({
        key: pageKey('accounting', 'cashIn'),
        group: 'pages.accounting',
        label: 'Реєстр переказів НП',
      })
    );
  });

  it('defaults group to main when parent is missing', () => {
    const catalog = collectPagePermissions([
      { navLabel: 'Обробка замовлень', inNav: true, permission: { name: 'orders' } },
    ]);
    expect(catalog[0].key).toBe(pageKey('main', 'orders'));
    expect(catalog[0].group).toBe('pages.main');
  });

  it('dedupes detail routes onto the inNav label', () => {
    const catalog = collectPagePermissions([
      { navLabel: 'Обробка замовлень', inNav: true, permission: { name: 'orders' } },
      { navLabel: 'Деталі замовлення', inNav: false, permission: { name: 'orders' } },
    ]);
    expect(catalog).toHaveLength(1);
    expect(catalog[0].label).toBe('Обробка замовлень');
  });

  it('skips routes without permission', () => {
    expect(collectPagePermissions([{ navLabel: 'Головна', inNav: true }])).toEqual([]);
  });
});

describe('routePermissionKey / normalizePermissionKey', () => {
  it('assembles page.settings.users', () => {
    expect(routePermissionKey({ parent: 'settings', permission: { name: 'users' } })).toBe(
      pageKey('settings', 'users')
    );
  });

  it('maps legacy keys', () => {
    expect(normalizePermissionKey('page.orders')).toBe(pageKey('main', 'orders'));
    expect(normalizePermissionKey('page.dashboard')).toBeNull();
  });

  it('accepts dotted action names', () => {
    expect(isPermissionKey(actionKey('warehouse', 'history.delete'))).toBe(true);
    expect(isPermissionKey(actionKey('products', 'setParentIds.read'))).toBe(true);
  });
});

describe('registerAction', () => {
  beforeEach(() => {
    resetActionRegistry();
  });

  it('registers once and reuses the same key', () => {
    const a = registerAction('products', 'edit', 'Редагувати товари');
    const b = registerAction('products', 'edit', 'Редагувати товари');
    expect(a).toBe(actionKey('products', 'edit'));
    expect(b).toBe(a);
    expect(listRegisteredActions()).toHaveLength(1);
    expect(listRegisteredActions()[0].group).toBe('actions.products');
  });

  it('maps dilovod/roles into existing UI groups', () => {
    registerAction('dilovod', 'read', 'Читання Dilovod');
    registerAction('roles', 'manage', 'Керувати ролями');
    expect(listRegisteredActions().find((item) => item.key === actionKey('dilovod', 'read'))?.group).toBe(
      'actions.integrations'
    );
    expect(listRegisteredActions().find((item) => item.key === actionKey('roles', 'manage'))?.group).toBe(
      'actions.users'
    );
  });

  it('throws when the same key is registered with a different label', () => {
    registerAction('products', 'edit', 'Редагувати товари');
    expect(() => registerAction('products', 'edit', 'Інша назва')).toThrow(/already registered/i);
  });
});

describe('parseUsersSettingsTab', () => {
  it('defaults to users', () => {
    expect(parseUsersSettingsTab('')).toBe('users');
    expect(parseUsersSettingsTab('?foo=1')).toBe('users');
  });

  it('reads tab=roles', () => {
    expect(parseUsersSettingsTab('?tab=roles')).toBe('roles');
    expect(parseUsersSettingsTab('tab=roles&x=1')).toBe('roles');
  });
});

describe('slugifyRoleName', () => {
  it('builds a kebab slug', () => {
    expect(slugifyRoleName(' Night Shift ')).toBe('night-shift');
  });
});

describe('permissionLayer', () => {
  it('splits page vs action keys', () => {
    expect(permissionLayer(PERMISSIONS.PAGE_ORDERS)).toBe('page');
    expect(permissionLayer(PERMISSIONS.ACTION_USERS_MANAGE)).toBe('action');
    expect(isPagePermission(PERMISSIONS.PAGE_ORDERS)).toBe(true);
    expect(isActionPermission(PERMISSIONS.ACTION_USERS_MANAGE)).toBe(true);
    expect(permissionLayer('other.key')).toBeNull();
  });
});

describe('permissionsFingerprint', () => {
  it('is stable regardless of key order', () => {
    const a = permissionsFingerprint('storekeeper', [PERMISSIONS.PAGE_ORDERS, PERMISSIONS.ACTION_WAREHOUSE_OPERATE]);
    const b = permissionsFingerprint('storekeeper', [PERMISSIONS.ACTION_WAREHOUSE_OPERATE, PERMISSIONS.PAGE_ORDERS]);
    expect(a).toBe(b);
  });

  it('changes when role or keys change', () => {
    const base = permissionsFingerprint('storekeeper', [PERMISSIONS.PAGE_ORDERS]);
    expect(permissionsFingerprint('admin', [PERMISSIONS.PAGE_ORDERS])).not.toBe(base);
    expect(permissionsFingerprint('storekeeper', [PERMISSIONS.PAGE_ORDERS, 'page.main.dashboard'])).not.toBe(base);
  });
});
