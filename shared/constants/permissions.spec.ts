import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSION_KEYS,
  PERMISSIONS,
  canAccessRoute,
  hasPermission,
  parseUsersSettingsTab,
  seedPermissionKeysForRole,
  slugifyRoleName,
} from './permissions';
import { ROLES } from './roles';

describe('hasPermission', () => {
  it('passes when the key is in the set', () => {
    expect(hasPermission(['page.orders'], PERMISSIONS.PAGE_ORDERS)).toBe(true);
  });

  it('fails when the key is missing', () => {
    expect(hasPermission(['page.orders'], PERMISSIONS.PAGE_SETTINGS_USERS)).toBe(false);
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
});

describe('canAccessRoute', () => {
  it('uses permission key when present', () => {
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
