import { Router, Request, Response } from 'express';
import { AuthService } from '../services/authService.js';
import { authenticateToken } from '../middleware/auth.js';
import { LoginRequest, RegisterRequest, UpdateProfileRequest, RefreshTokenRequest } from '../types/auth';

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
      message: 'Користувача успішно зареєстровано'
    });
  } catch (error) {
    console.error('❌ Register error:', error);
    res.status(400).json({ message: error instanceof Error ? error.message : 'Помилка реєстрації' });
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
      message: 'Успішний вхід в систему'
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(401).json({ message: error instanceof Error ? error.message : 'Помилка входу' });
  }
});

// Обновление токена
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    // Получаем refresh token из cookies
    const { refreshToken } = await AuthService.getTokenFromCookies(req);
    
    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh токен не знайдено' });
    }

    // Обновляем токен используя refresh token из cookies
    const result = await AuthService.refreshToken({ refreshToken });
    
    // Устанавливаем новые cookies
    await AuthService.setAuthCookies(res, result.token, result.refreshToken);
    
    // Отправляем ответ без токенов (они в cookies)
    res.json({
      expiresIn: result.expiresIn,
      message: 'Токен успішно оновлено'
    });
  } catch (error) {
    res.status(401).json({ message: error instanceof Error ? error.message : 'Не вдалося оновити токен' });
  }
});

// Выход из системы
router.post('/logout', authenticateToken, async (req: Request, res: Response) => {
  try {
    await AuthService.logout(req.user!.userId);
    
    // Очищаем cookies
    await AuthService.clearAuthCookies(res);
    
    res.json({ message: 'Успішно вийшли з системи' });
  } catch (error) {
    res.status(500).json({ message: 'Помилка при виході з системи' });
  }
});

// Получить профиль пользователя (защищенный роут)
router.get('/profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = await AuthService.getUserById(req.user!.userId);
    if (!user) {
      return res.status(404).json({ message: 'Користувача не знайдено' });
    }

    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    res.status(500).json({ message: 'Не вдалося отримати профіль' });
  }
});

// Обновить профиль пользователя (защищенный роут)
router.put('/profile', authenticateToken, async (req: Request<{}, {}, UpdateProfileRequest>, res: Response) => {
  try {
    const updatedUser = await AuthService.updateProfile(req.user!.userId, req.body);
    res.json({ 
      success: true, 
      message: 'Профіль успішно оновлено',
      user: updatedUser
    });
  } catch (error) {
    res.status(400).json({ 
      success: false,
      message: error instanceof Error ? error.message : 'Не вдалося оновити профіль' 
    });
  }
});

export default router;
