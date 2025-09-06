import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthService } from '../services/authService.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { LoginRequest, RegisterRequest, UpdateProfileRequest, RefreshTokenRequest } from '../types/auth.js';

const prisma = new PrismaClient();

const router = Router();

// Регистрация (только для админов)
router.post('/register', authenticateToken, requireRole(['admin']), async (req: Request<{}, {}, RegisterRequest>, res: Response) => {
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
    res.json(userWithoutPassword);
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

// Получить уникальные роли пользователей (защищенный роут для админов)
router.get('/roles', authenticateToken, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const roles = await prisma.user.findMany({
      select: {
        role: true,
        roleName: true
      },
      where: {
        isActive: true
      },
      distinct: ['role']
    });

    // Форматируем роли для фронтенда с поддержкой системных ролей
    const uniqueRoles = roles.map(user => ({
      value: user.role,
      label: user.roleName || getRoleLabel(user.role)
    }));

    // Добавляем базовые системные роли если их нет
    const baseRoles = [
      { value: 'admin', label: 'Адміністратор' },
      { value: 'boss', label: 'Начальник' },
      { value: 'shop-manager', label: 'Менеджер магазину' },
      { value: 'ads-manager', label: 'Менеджер реклами' },
      { value: 'storekeeper', label: 'Комірник' }
    ];

    // Объединяем и убираем дубликаты
    const allRoles = [...baseRoles];
    uniqueRoles.forEach(role => {
      if (!allRoles.find(r => r.value === role.value)) {
        allRoles.push(role);
      }
    });

    res.json(allRoles);
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ message: 'Failed to fetch roles' });
  }
});

// Вспомогательная функция для получения названия роли
function getRoleLabel(role: string): string {
  const roleLabels: Record<string, string> = {
    'admin': 'Адміністратор',
    'boss': 'Начальник',
    'shop-manager': 'Менеджер магазину',
    'ads-manager': 'Менеджер реклами',
    'storekeeper': 'Комірник'
  };
  return roleLabels[role] || role.charAt(0).toUpperCase() + role.slice(1);
}

// Получить список пользователей (только для админов)
router.get('/users', authenticateToken, requireRole(['admin']), async (req: Request, res: Response) => {
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
router.put('/users/:id', authenticateToken, requireRole(['admin']), async (req: Request, res: Response) => {
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

    // Подготавливаем данные для обновления
    const updateData: any = {
      name: name || undefined,
      email: email || undefined,
      role: role || undefined,
      roleName: roleName || undefined,
      isActive: isActive !== undefined ? isActive : undefined
    };

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
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Failed to update user' });
  }
});

// Удалить пользователя (только для админов)
router.delete('/users/:id', authenticateToken, requireRole(['admin']), async (req: Request, res: Response) => {
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
