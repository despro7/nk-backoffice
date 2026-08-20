import { Router, Request, Response } from 'express';
import { prisma } from '../lib/utils.js';
import { AuthService } from '../services/authService.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';
import { LoginRequest, RegisterRequest, UpdateProfileRequest, RefreshTokenRequest } from '../types/auth.js';
import { PERMISSIONS } from '../../shared/constants/permissions.js';
import { RoleError, roleService } from '../services/RoleService.js';
import { ROLE_LABELS, type RoleValue } from '../../shared/constants/roles.js';


const router = Router();

// Регистрация (только для админов)
router.post('/register', authenticateToken, requirePermission(PERMISSIONS.ACTION_USERS_MANAGE), async (req: Request<{}, {}, RegisterRequest>, res: Response) => {
  try {
    console.log('🔍 Register request body:', req.body);
    console.log('🔍 Register request body type:', typeof req.body);
    console.log('🔍 Register request body keys:', Object.keys(req.body));
    console.log('🔍 Register request body email:', req.body.email);
    
    const result = await AuthService.register(req.body);
    
    // Устанавливаем cookies
    await AuthService.setAuthCookies(res, result.token, result.refreshToken);
    
    // Отправляем ответ без токенов (они в cookies)
    res.status(201).json({
      user: result.user,
      expiresIn: result.expiresIn,
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
    
    // Отправляем ответ без токенов (они в cookies)
    res.json({
      user: result.user,
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
    const permissions = [...await roleService.getPermissionSet(user.role)];
    const roleMeta = await roleService.getRoleBySlug(user.role);
    
    // Добавляем информацию о времени жизни токена из middleware
    const response = {
      ...userWithoutPassword,
      expiresIn: req.user!.expiresIn,
      permissions,
      roleMeta: roleMeta
        ? { slug: roleMeta.slug, name: roleMeta.name, rank: roleMeta.rank }
        : { slug: user.role, name: user.roleName || user.role, rank: 0 },
    };
    
    res.json(response);
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

router.get('/roles', authenticateToken, requirePermission(PERMISSIONS.ACTION_USERS_MANAGE), async (_req: Request, res: Response) => {
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

// Получить список пользователей (только для админов)
router.get('/users', authenticateToken, requirePermission(PERMISSIONS.ACTION_USERS_MANAGE), async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        roleName: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        lastActivityAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Форматируем пользователей для фронтенда
    const formattedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name || '',
      role: user.role,
      roleName: user.roleName || '',
      roleLabel: user.roleName || getRoleLabel(user.role),
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      lastActivityAt: user.lastActivityAt
    }));

    res.json(formattedUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// Обновить пользователя (только для админов)
router.put('/users/:id', authenticateToken, requirePermission(PERMISSIONS.ACTION_USERS_MANAGE), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, password, role, roleName, isActive } = req.body;

    // Проверяем, что новый email не занят другим пользователем
    if (email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: email,
          NOT: { id: parseInt(id) }
        }
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

    if (role) {
      const roleRecord = await roleService.assertRoleExists(role);
      updateData.role = roleRecord.slug;
      updateData.roleName = roleName || roleRecord.name;
    } else if (roleName !== undefined) {
      updateData.roleName = roleName;
    }

    // Хешируем новый пароль, если он был передан
    if (password) {
      const bcrypt = await import('bcryptjs');
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        roleName: true,
        isActive: true,
        updatedAt: true
      }
    });

    res.json({
      success: true,
      message: 'Користувач успішно оновлений',
      user: {
        ...updatedUser,
        roleLabel: updatedUser.roleName || getRoleLabel(updatedUser.role)
      }
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
router.delete('/users/:id', authenticateToken, requirePermission(PERMISSIONS.ACTION_USERS_MANAGE), async (req: Request, res: Response) => {
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
