import { beforeEach, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../../shared/constants/permissions';
import { ROLES } from '../../shared/constants/roles';
import { RoleService } from './RoleService';

type RoleRow = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  rank: number;
  isSystem: boolean;
};

type PermRow = { roleId: number; permissionKey: string };

function createMemoryDb(userCounts: Record<string, number> = {}) {
  const roles: RoleRow[] = [];
  const perms: PermRow[] = [];
  let nextId = 1;

  const db = {
    role: {
      count: async () => roles.length,
      findMany: async (args?: { include?: { permissions?: boolean }; orderBy?: unknown }) => {
        return roles.map((role) => ({
          ...role,
          permissions: args?.include?.permissions
            ? perms.filter((p) => p.roleId === role.id).map((p) => ({ permissionKey: p.permissionKey }))
            : undefined,
        }));
      },
      findUnique: async ({ where }: { where: { id?: number; slug?: string } }) => {
        const role = roles.find((r) => (where.id != null && r.id === where.id) || (where.slug && r.slug === where.slug));
        if (!role) return null;
        return {
          ...role,
          permissions: perms.filter((p) => p.roleId === role.id).map((p) => ({ permissionKey: p.permissionKey })),
        };
      },
      create: async ({ data }: { data: Omit<RoleRow, 'id'> }) => {
        const role = { id: nextId++, ...data };
        roles.push(role);
        return role;
      },
      update: async ({ where, data }: { where: { id: number }; data: Partial<RoleRow> }) => {
        const role = roles.find((r) => r.id === where.id);
        if (!role) throw new Error('not found');
        Object.assign(role, data);
        return role;
      },
      delete: async ({ where }: { where: { id: number } }) => {
        const idx = roles.findIndex((r) => r.id === where.id);
        if (idx < 0) throw new Error('not found');
        const [removed] = roles.splice(idx, 1);
        for (let i = perms.length - 1; i >= 0; i--) {
          if (perms[i].roleId === where.id) perms.splice(i, 1);
        }
        return removed;
      },
    },
    rolePermission: {
      createMany: async ({ data }: { data: PermRow[] }) => {
        perms.push(...data);
        return { count: data.length };
      },
      deleteMany: async ({ where }: { where: { roleId: number } }) => {
        const before = perms.length;
        for (let i = perms.length - 1; i >= 0; i--) {
          if (perms[i].roleId === where.roleId) perms.splice(i, 1);
        }
        return { count: before - perms.length };
      },
    },
    user: {
      count: async ({ where }: { where: { role: string } }) => userCounts[where.role] ?? 0,
    },
  };

  return { db, roles, perms, userCounts };
}

describe('RoleService', () => {
  let service: RoleService;
  let memory: ReturnType<typeof createMemoryDb>;

  beforeEach(async () => {
    memory = createMemoryDb();
    service = new RoleService(memory.db as never);
    await service.ensureSeeded();
  });

  it('admin always has every permission even without stored keys', async () => {
    expect(await service.hasPermission(ROLES.ADMIN, PERMISSIONS.ACTION_USERS_MANAGE)).toBe(true);
    expect(await service.hasPermission(ROLES.ADMIN, 'action.unknown')).toBe(true);
  });

  it('unknown slug has no permissions', async () => {
    expect(await service.hasPermission('ghost', PERMISSIONS.PAGE_ORDERS)).toBe(false);
  });

  it('seeded storekeeper has orders, custom role only its keys', async () => {
    expect(await service.hasPermission(ROLES.STOREKEEPER, PERMISSIONS.PAGE_ORDERS)).toBe(true);
    expect(await service.hasPermission(ROLES.STOREKEEPER, PERMISSIONS.ACTION_USERS_MANAGE)).toBe(false);

    const created = await service.createRole({
      name: 'Night',
      slug: 'night-shift',
      permissions: [PERMISSIONS.PAGE_DASHBOARD],
    });
    expect(await service.hasPermission(created.slug, PERMISSIONS.PAGE_DASHBOARD)).toBe(true);
    expect(await service.hasPermission(created.slug, PERMISSIONS.PAGE_ORDERS)).toBe(false);
  });

  it('refuses to delete admin or change its slug', async () => {
    const admin = await service.getRoleBySlug(ROLES.ADMIN);
    await expect(service.deleteRole(admin!.id)).rejects.toThrow(/системн/i);
    await expect(service.updateRole(admin!.id, { slug: 'root' })).rejects.toThrow(/slug/i);
  });

  it('refuses to delete a role that still has users', async () => {
    const created = await service.createRole({
      name: 'Temp',
      slug: 'temp-users',
      permissions: [PERMISSIONS.PAGE_DASHBOARD],
    });
    memory.userCounts['temp-users'] = 2;
    await expect(service.deleteRole(created.id)).rejects.toThrow(/користувач/i);
  });

  it('invalidates cache after permission update', async () => {
    const created = await service.createRole({
      name: 'Temp',
      slug: 'temp',
      permissions: [PERMISSIONS.PAGE_DASHBOARD],
    });
    expect(await service.hasPermission('temp', PERMISSIONS.PAGE_ORDERS)).toBe(false);
    await service.setPermissions(created.id, [PERMISSIONS.PAGE_DASHBOARD, PERMISSIONS.PAGE_ORDERS]);
    expect(await service.hasPermission('temp', PERMISSIONS.PAGE_ORDERS)).toBe(true);
  });

  it('assertRoleExists rejects unknown slug', async () => {
    await expect(service.assertRoleExists('nope')).rejects.toThrow();
    await expect(service.assertRoleExists(ROLES.ADMIN)).resolves.toBeDefined();
  });
});
