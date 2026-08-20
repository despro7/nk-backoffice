import { prisma } from '../lib/utils.js';
import {
  ALL_PERMISSION_KEYS,
  isPermissionKey,
  seedPermissionKeysForRole,
  slugifyRoleName,
  SYSTEM_ROLES_SEED,
  type PermissionKey,
} from '../../shared/constants/permissions.js';
import { ROLES } from '../../shared/constants/roles.js';

export class RoleError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'RoleError';
    this.status = status;
  }
}

export interface RoleDto {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  rank: number;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}

type RoleRecord = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  rank: number;
  isSystem: boolean;
  permissions?: Array<{ permissionKey: string }>;
};

interface RoleDb {
  role: {
    count: () => Promise<number>;
    findMany: (args?: object) => Promise<RoleRecord[]>;
    findUnique: (args: object) => Promise<RoleRecord | null>;
    create: (args: object) => Promise<RoleRecord>;
    update: (args: object) => Promise<RoleRecord>;
    delete: (args: object) => Promise<RoleRecord>;
  };
  rolePermission: {
    createMany: (args: object) => Promise<{ count: number }>;
    deleteMany: (args: object) => Promise<{ count: number }>;
  };
  user: {
    count: (args: object) => Promise<number>;
  };
}

export class RoleService {
  private cache = new Map<string, Set<string>>();
  private seedPromise: Promise<void> | null = null;

  constructor(private db: RoleDb = prisma as unknown as RoleDb) {}

  invalidateCache(): void {
    this.cache.clear();
  }

  async ensureSeeded(): Promise<void> {
    if (this.seedPromise) return this.seedPromise;
    this.seedPromise = this.seedIfEmpty();
    try {
      await this.seedPromise;
    } finally {
      this.seedPromise = null;
    }
  }

  private async seedIfEmpty(): Promise<void> {
    const count = await this.db.role.count();
    if (count > 0) return;

    for (const spec of SYSTEM_ROLES_SEED) {
      const created = await this.db.role.create({
        data: {
          slug: spec.slug,
          name: spec.name,
          description: null,
          rank: spec.rank,
          isSystem: true,
        },
      });
      if (spec.slug === ROLES.ADMIN) continue;
      const keys = seedPermissionKeysForRole(spec.slug);
      if (keys.length === 0) continue;
      await this.db.rolePermission.createMany({
        data: keys.map((permissionKey) => ({ roleId: created.id, permissionKey })),
      });
    }
    this.invalidateCache();
  }

  async hasPermission(slug: string, key: string): Promise<boolean> {
    if (slug === ROLES.ADMIN) return true;
    const keys = await this.getPermissionSet(slug);
    return keys.has(key);
  }

  async roleExists(slug: string): Promise<boolean> {
    await this.ensureSeeded();
    const role = await this.db.role.findUnique({ where: { slug } });
    return Boolean(role);
  }

  async assertRoleExists(slug: string): Promise<RoleRecord> {
    await this.ensureSeeded();
    const role = await this.db.role.findUnique({ where: { slug } });
    if (!role) {
      throw new RoleError(`Невідома роль: ${slug}`, 400);
    }
    return role;
  }

  async getPermissionSet(slug: string): Promise<Set<string>> {
    await this.ensureSeeded();
    if (slug === ROLES.ADMIN) return new Set(['*', ...ALL_PERMISSION_KEYS]);

    const cached = this.cache.get(slug);
    if (cached) return cached;

    const role = await this.db.role.findUnique({
      where: { slug },
      include: { permissions: true },
    });
    const set = new Set((role?.permissions ?? []).map((p) => p.permissionKey));
    this.cache.set(slug, set);
    return set;
  }

  async listRoles(): Promise<RoleDto[]> {
    await this.ensureSeeded();
    const roles = await this.db.role.findMany({
      include: { permissions: true },
      orderBy: { rank: 'desc' },
    });

    const result: RoleDto[] = [];
    for (const role of roles) {
      result.push(await this.toDto(role));
    }
    return result;
  }

  async getRoleById(id: number): Promise<RoleDto | null> {
    await this.ensureSeeded();
    const role = await this.db.role.findUnique({
      where: { id },
      include: { permissions: true },
    });
    return role ? this.toDto(role) : null;
  }

  async getRoleBySlug(slug: string): Promise<RoleDto | null> {
    await this.ensureSeeded();
    const role = await this.db.role.findUnique({
      where: { slug },
      include: { permissions: true },
    });
    return role ? this.toDto(role) : null;
  }

  async createRole(input: {
    name: string;
    slug?: string;
    description?: string | null;
    rank?: number;
    permissions?: string[];
  }): Promise<RoleDto> {
    await this.ensureSeeded();
    const name = input.name?.trim();
    if (!name) throw new RoleError('Назва ролі обовʼязкова');

    const slug = (input.slug?.trim() || slugifyRoleName(name)).toLowerCase();
    if (!slug) throw new RoleError('Slug ролі обовʼязковий');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new RoleError('Slug має бути kebab-case латиницею');
    }

    const existing = await this.db.role.findUnique({ where: { slug } });
    if (existing) throw new RoleError(`Роль «${slug}» вже існує`);

    const keys = this.sanitizeKeys(input.permissions);
    const created = await this.db.role.create({
      data: {
        slug,
        name,
        description: input.description ?? null,
        rank: input.rank ?? 0,
        isSystem: false,
      },
    });

    if (keys.length > 0) {
      await this.db.rolePermission.createMany({
        data: keys.map((permissionKey) => ({ roleId: created.id, permissionKey })),
      });
    }

    this.invalidateCache();
    return (await this.getRoleById(created.id))!;
  }

  async updateRole(
    id: number,
    input: { name?: string; slug?: string; description?: string | null; rank?: number }
  ): Promise<RoleDto> {
    await this.ensureSeeded();
    const role = await this.db.role.findUnique({ where: { id } });
    if (!role) throw new RoleError('Роль не знайдена', 404);

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new RoleError('Назва ролі обовʼязкова');
      data.name = name;
    }
    if (input.description !== undefined) data.description = input.description;
    if (input.rank !== undefined) data.rank = input.rank;

    if (input.slug !== undefined && input.slug !== role.slug) {
      if (role.slug === ROLES.ADMIN || role.isSystem) {
        throw new RoleError('Не можна змінювати slug системної ролі');
      }
      const slug = input.slug.trim().toLowerCase();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw new RoleError('Slug має бути kebab-case латиницею');
      }
      const clash = await this.db.role.findUnique({ where: { slug } });
      if (clash) throw new RoleError(`Роль «${slug}» вже існує`);
      data.slug = slug;
    }

    await this.db.role.update({ where: { id }, data });
    this.invalidateCache();
    return (await this.getRoleById(id))!;
  }

  async setPermissions(id: number, permissionKeys: string[]): Promise<RoleDto> {
    await this.ensureSeeded();
    const role = await this.db.role.findUnique({ where: { id } });
    if (!role) throw new RoleError('Роль не знайдена', 404);
    if (role.slug === ROLES.ADMIN) {
      throw new RoleError('Права адміністратора не редагуються');
    }

    const keys = this.sanitizeKeys(permissionKeys);
    await this.db.rolePermission.deleteMany({ where: { roleId: id } });
    if (keys.length > 0) {
      await this.db.rolePermission.createMany({
        data: keys.map((permissionKey) => ({ roleId: id, permissionKey })),
      });
    }
    this.invalidateCache();
    return (await this.getRoleById(id))!;
  }

  async deleteRole(id: number): Promise<void> {
    await this.ensureSeeded();
    const role = await this.db.role.findUnique({ where: { id } });
    if (!role) throw new RoleError('Роль не знайдена', 404);
    if (role.slug === ROLES.ADMIN || role.isSystem) {
      throw new RoleError('Не можна видалити системну роль', 400);
    }

    const users = await this.db.user.count({ where: { role: role.slug } });
    if (users > 0) {
      throw new RoleError('Неможливо видалити роль, на якій є користувачі', 400);
    }

    await this.db.role.delete({ where: { id } });
    this.invalidateCache();
  }

  private sanitizeKeys(keys: string[] | undefined): PermissionKey[] {
    if (!keys) return [];
    const unique = new Set<PermissionKey>();
    for (const key of keys) {
      if (isPermissionKey(key)) unique.add(key);
    }
    return [...unique];
  }

  private async toDto(role: RoleRecord): Promise<RoleDto> {
    const userCount = await this.db.user.count({ where: { role: role.slug } });
    const permissions =
      role.slug === ROLES.ADMIN
        ? [...ALL_PERMISSION_KEYS]
        : (role.permissions ?? []).map((p) => p.permissionKey);
    return {
      id: role.id,
      slug: role.slug,
      name: role.name,
      description: role.description,
      rank: role.rank,
      isSystem: role.isSystem,
      userCount,
      permissions,
    };
  }
}

export const roleService = new RoleService();
