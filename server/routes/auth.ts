import { Router, Request, Response } from 'express';
import { prisma } from '../lib/utils.js';
import { AuthService } from '../services/authService.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { LoginRequest, RegisterRequest, UpdateProfileRequest, RefreshTokenRequest } from '../types/auth.js';
import { RoleError, roleService } from '../services/RoleService.js';
import { ROLE_LABELS, type RoleValue } from '../../shared/constants/roles.js';


const router = Router();
const usersManage = requirePermission('users', 'manage', 'Керувати користувачами');

async function withRoleAccess<T extends { role: string; roleName?: string | null }>(user: T) {
  const permissions = [...await roleService.getPermissionSet(user.role)];
  const roleMeta = await roleService.getRoleBySlug(user.role);
  return {
    ...user,
    permissions,
    roleMeta: roleMeta
      ? { slug: roleMeta.slug, name: roleMeta.name, rank: roleMeta.rank }
      : { slug: user.role, name: user.roleName || user.role, rank: 0 },
  };
}

// Регистрация (только для админов)
router.post('/register', authenticateToken, usersManage, async (req: Request<{}, {}, RegisterRequest>, res: Response) => {
  try {
    const result = await AuthService.register(req.body);
    res.status(201).json({
      user: result.user,
      message: 'User successfully registered'
    });
  } catch (error) {
    console.error('❌ Register error:', error);
    res.status(400).json({ message: error instanceof Error ? error.message : 'Registration failed' });
  }
});

// Логин
router.post('/login', async (req: Request, res: Response) => {
  try {
    console.log('🔍 Login request body:', req.body);
    console.log('🔍 Login request body type:', typeof req.body);
    console.log('🔍 Login request body keys:', Object.keys(req.body));
    console.log('🔍 Login request body email:', req.body.email);
    
    const result = await AuthService.login(req.body);
    
    // Устанавливаем cookies
    await AuthService.setAuthCookies(res, result.token, result.refreshToken);
    
    res.json({
      user: await withRoleAccess(result.user),
      expiresIn: result.expiresIn,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(401).json({ message: error instanceof Error ? error.message : 'Login failed' });
  }
});

// Обновление токена
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    // Получаем refresh token из cookies
    const { refreshToken } = await AuthService.getTokenFromCookies(req);
    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token not found' });
    }

    // Обновляем токен используя refresh token из cookies
    const result = await AuthService.refreshToken({ refreshToken });
    
    // Устанавливаем новые cookies
    await AuthService.setAuthCookies(res, result.token, result.refreshToken);
    
    // Отправляем ответ без токенов (они в cookies)
    res.json({
      expiresIn: result.expiresIn,
      message: 'Token successfully refreshed'
    });
  } catch (error) {
    res.status(401).json({ message: error instanceof Error ? error.message : 'Failed to refresh token' });
  }
});

// Выход из системы
router.post('/logout', authenticateToken, async (req: Request, res: Response) => {
  try {
    await AuthService.logout(req.user!.userId);
    
    // Очищаем cookies
    await AuthService.clearAuthCookies(res);
    
    res.json({ message: 'Successfully logged out' });
  } catch (error) {
    res.status(500).json({ message: 'Logout failed' });
  }
});

// Получить профиль пользователя (защищенный роут)
router.get('/profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = await AuthService.getUserById(req.user!.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { password, ...userWithoutPassword } = user;
    res.json({
      ...(await withRoleAccess(userWithoutPassword)),
      expiresIn: req.user!.expiresIn,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get profile' });
  }
});

// Обновить профиль пользователя (защищенный роут)
router.put('/profile', authenticateToken, async (req: Request<{}, {}, UpdateProfileRequest>, res: Response) => {
  try {
    const updatedUser = await AuthService.updateProfile(req.user!.userId, req.body);
    res.json({ 
      success: true, 
      message: 'Profile successfully updated',
      user: updatedUser
    });
  } catch (error) {
    res.status(400).json({ 
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update profile' 
    });
  }
});

router.get('/effective-permissions', authenticateToken, async (req: Request, res: Response) => {
  try {
    const slug = req.user!.role;
    const permissions = [...await roleService.getPermissionSet(slug)];
    const roleMeta = await roleService.getRoleBySlug(slug);
    res.json({
      role: slug,
      permissions,
      roleMeta: roleMeta
        ? { slug: roleMeta.slug, name: roleMeta.name, rank: roleMeta.rank }
        : { slug, name: slug, rank: 0 },
    });
  } catch (error) {
    console.error('Error fetching effective permissions:', error);
    res.status(500).json({ message: 'Failed to get permissions' });
  }
});

router.get('/roles', authenticateToken, usersManage, async (_req: Request, res: Response) => {
  try {
    const roles = await roleService.listRoles();
    res.json(roles.map((role) => ({ value: role.slug, label: role.name })));
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ message: 'Failed to fetch roles' });
  }
});

function getRoleLabel(role: string): string {
  return ROLE_LABELS[role as RoleValue] || role;
}

const USER_LIST_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  roleName: true,
  isActive: true,
  createdAt: true,
  lastLoginAt: true,
  lastActivityAt: true,
  dilovodUserId: true,
} as const;

type UserListRow = {
  id: number;
  email: string;
  name: string | null;
  role: string;
  roleName: string | null;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  lastActivityAt: Date | null;
  dilovodUserId: string | null;
};

type UserActivityStats = {
  orders: number;
  warehouse: number;
  breakdown: {
    movements: number;
    inventories: number;
    returns: number;
    writeOffs: number;
    releases: number;
  };
};

const EMPTY_STATS: UserActivityStats = {
  orders: 0,
  warehouse: 0,
  breakdown: { movements: 0, inventories: 0, returns: 0, writeOffs: 0, releases: 0 },
};

async function loadUserStats(userIds: number[]): Promise<Map<number, UserActivityStats>> {
  const result = new Map<number, UserActivityStats>(
    userIds.map((id) => [id, { ...EMPTY_STATS, breakdown: { ...EMPTY_STATS.breakdown } }])
  );
  if (userIds.length === 0) return result;

  const [orders, movements, inventories, returns, writeOffs, releases] = await Promise.all([
    prisma.ordersHistory.groupBy({ by: ['userId'], where: { userId: { in: userIds } }, _count: { _all: true } }),
    prisma.warehouseMovement.groupBy({ by: ['createdBy'], where: { createdBy: { in: userIds } }, _count: { _all: true } }),
    prisma.warehouseInventory.groupBy({ by: ['createdBy'], where: { createdBy: { in: userIds } }, _count: { _all: true } }),
    prisma.warehouseReturnHistory.groupBy({ by: ['createdBy'], where: { createdBy: { in: userIds } }, _count: { _all: true } }),
    prisma.warehouseWriteOffHistory.groupBy({ by: ['createdBy'], where: { createdBy: { in: userIds } }, _count: { _all: true } }),
    prisma.warehouseReleaseSet.groupBy({ by: ['createdBy'], where: { createdBy: { in: userIds } }, _count: { _all: true } }),
  ]);

  const bump = (id: number | null, field: keyof UserActivityStats['breakdown'] | 'orders', count: number) => {
    if (id == null) return;
    const row = result.get(id);
    if (!row) return;
    if (field === 'orders') {
      row.orders += count;
      return;
    }
    row.breakdown[field] += count;
    row.warehouse += count;
  };

  for (const row of orders) bump(row.userId, 'orders', row._count._all);
  for (const row of movements) bump(row.createdBy, 'movements', row._count._all);
  for (const row of inventories) bump(row.createdBy, 'inventories', row._count._all);
  for (const row of returns) bump(row.createdBy, 'returns', row._count._all);
  for (const row of writeOffs) bump(row.createdBy, 'writeOffs', row._count._all);
  for (const row of releases) bump(row.createdBy, 'releases', row._count._all);

  return result;
}

function formatUser(user: UserListRow, stats: UserActivityStats = EMPTY_STATS) {
  return {
    id: user.id,
    email: user.email,
    name: user.name || '',
    role: user.role,
    roleName: user.roleName || '',
    roleLabel: user.roleName || getRoleLabel(user.role),
    isActive: user.isActive,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    lastActivityAt: user.lastActivityAt,
    dilovodUserId: user.dilovodUserId,
    stats,
  };
}

router.get('/users', authenticateToken, usersManage, async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: USER_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    const stats = await loadUserStats(users.map((user) => user.id));
    res.json(users.map((user) => formatUser(user, stats.get(user.id))));
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

router.put('/users/:id', authenticateToken, usersManage, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, password, role, roleName, isActive, dilovodUserId } = req.body;
    const userId = parseInt(id, 10);

    if (email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email,
          NOT: { id: userId },
        },
      });

      if (existingUser) {
        return res.status(400).json({ message: 'Цей email вже використовується іншим користувачем' });
      }
    }

    const updateData: Record<string, unknown> = {
      name: name || undefined,
      email: email || undefined,
      isActive: isActive !== undefined ? isActive : undefined,
    };

    if (dilovodUserId !== undefined) {
      updateData.dilovodUserId = typeof dilovodUserId === 'string' ? dilovodUserId.trim() || null : dilovodUserId;
    }

    if (role) {
      const roleRecord = await roleService.assertRoleExists(role);
      updateData.role = roleRecord.slug;
      updateData.roleName = roleName || roleRecord.name;
    } else if (roleName !== undefined) {
      updateData.roleName = roleName;
    }

    if (password) {
      const bcrypt = await import('bcryptjs');
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: USER_LIST_SELECT,
    });
    const stats = await loadUserStats([updatedUser.id]);

    res.json({
      success: true,
      message: 'Користувач успішно оновлений',
      user: formatUser(updatedUser, stats.get(updatedUser.id)),
    });
  } catch (error) {
    if (error instanceof RoleError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Failed to update user' });
  }
});

// Удалить пользователя (только для админов)
router.delete('/users/:id', authenticateToken, usersManage, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Проверяем, что пользователь существует
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) }
    });

    if (!user) {
      return res.status(404).json({ message: 'Користувач не знайдений' });
    }

    // Проверяем, что админ не удаляет сам себя
    if (user.id === req.user!.userId) {
      return res.status(400).json({ message: 'Неможливо видалити власний аккаунт' });
    }

    await prisma.user.delete({
      where: { id: parseInt(id) }
    });

    res.json({
      success: true,
      message: 'Користувач успішно видалений'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

export default router;
