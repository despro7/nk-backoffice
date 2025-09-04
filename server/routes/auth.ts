import { Router, Request, Response } from 'express';
import { AuthService } from '../services/authService.js';
import { authenticateToken } from '../middleware/auth.js';
import { LoginRequest, RegisterRequest, UpdateProfileRequest, RefreshTokenRequest } from '../types/auth.js';

const router = Router();

// Регистрация
router.post('/register', async (req: Request<{}, {}, RegisterRequest>, res: Response) => {
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

export default router;
