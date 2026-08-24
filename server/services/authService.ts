import { prisma } from '../lib/utils.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { UserType, LoginRequest, RegisterRequest, UpdateProfileRequest, AuthResponse, RefreshTokenRequest, RefreshTokenResponse, sanitizeUser } from "../types/auth.js";
import { AuthSettingsService } from './authSettingsService.js';

// Импорт настроек логирования с сервера
let loggingSettings: any = {
  console: {
    logAccessToken: true,
    logRefreshToken: true,
    logTokenExpiry: true,
    logFrequency: 5
  },
  toast: {
    logLoginLogout: true,
    logTokenGenerated: false,
    logTokenRefreshed: true,
    logTokenRemoved: true,
    logTokenExpired: true,
    logAuthError: true,
    logRefreshError: true
  }
};

// Функция для обновления настроек логирования
export function updateLoggingSettings(newSettings: any) {
  loggingSettings = newSettings;
}


export class AuthService {
  // Получаем настройки из БД
  private static async getSettings() {
    return await AuthSettingsService.getAuthSettings();
  }
  
  // Получаем время жизни access token в миллисекундах для cookies
  private static async getAccessTokenCookieMaxAge(): Promise<number> {
    const settings = await this.getSettings();
    return AuthSettingsService.parseExpiryTimeMs(settings.accessTokenExpiresIn);
  }

  // Настройки токенов (без логирования)
  static {
    // Инициализация настроек без вывода в консоль
  }

  static async register(userData: RegisterRequest): Promise<AuthResponse> {
    const existingUser = await prisma.user.findUnique({
      where: {
        email: userData.email
      }
    });

    if (existingUser) {
      throw new Error('Користувач вже існує');
    }

    if (!userData.role) {
      throw new Error('Роль обовʼязкова');
    }

    const { roleService } = await import('./RoleService.js');
    const role = await roleService.assertRoleExists(userData.role);

    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const dilovodUserId = userData.dilovodUserId?.trim() || null;

    // Адмін створює обліковку: без сесії і без lastLoginAt (користувач ще не входив).
    const newUser = await prisma.user.create({
      data: {
        name: userData.name || "",
        email: userData.email,
        password: hashedPassword,
        role: role.slug,
        roleName: userData.roleName || role.name,
        dilovodUserId,
        isActive: true,
        refreshToken: null,
        refreshTokenExpiresAt: null,
      },
    });

    return {
      token: '',
      refreshToken: '',
      user: sanitizeUser(newUser),
      expiresIn: 0,
    };
  }

  static async login(credentials: LoginRequest): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: {
        email: credentials.email
      }
    });

    if (!user) {
      throw new Error('Невірні облікові дані');
    }

    const isValidPassword = await bcrypt.compare(credentials.password, user.password);
    if (!isValidPassword) {
      throw new Error('Невірні облікові дані');
    }

    // Проверяем, не заблокирован ли пользователь
    if (!user.isActive) {
      throw new Error('Користувач заблокований');
    }

    const { accessToken, refreshToken, expiresIn } = await this.generateTokenPair(user as UserType);

    // Обновляем время последнего входа, активности и refresh token
    const refreshExpiryDate = new Date(Date.now() + await this.getRefreshTokenExpiryMs());
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastActivityAt: new Date(),
        refreshToken: this.hashToken(refreshToken),
        refreshTokenExpiresAt: refreshExpiryDate,
      }
    });

    // Компактное логирование установки refresh токена

    return { 
      token: accessToken, 
      refreshToken, 
      user: sanitizeUser(user),
      expiresIn
    };
  }

  static async refreshToken(refreshTokenData: RefreshTokenRequest): Promise<RefreshTokenResponse> {
    try {
      // Находим пользователя по refresh токену
      const hashedToken = this.hashToken(refreshTokenData.refreshToken);

      // Ищем пользователя с валидным токеном
      const user = await prisma.user.findFirst({
        where: {
          refreshToken: hashedToken,
          refreshTokenExpiresAt: { gt: new Date() }
        }
      });

      if (!user) {
        throw new Error('Невірний або застарілий refresh токен');
      }

      // console.log('🔍 [RefreshToken] Пользователь найден:', user.email);
      // console.log('🔍 [RefreshToken] Пользователь активен:', user.isActive);
      // console.log('🔍 [RefreshToken] refreshTokenExpiresAt:', user.refreshTokenExpiresAt);

      if (!user.isActive) {
        console.log('❌ [RefreshToken] Пользователь заблокирован');
        throw new Error('Користувач заблокований');
      }

      const settings = await this.getSettings();

      // Проверяем, не слишком ли давно пользователь был активен
      const lastActivity = user.lastActivityAt || user.lastLoginAt || user.createdAt;
      const timeSinceLastActivity = Date.now() - lastActivity.getTime();
      const userActivityThresholdMs = settings.userActivityThresholdDays * 24 * 60 * 60 * 1000;

      // console.log('🔍 [RefreshToken] Последняя активность:', lastActivity);
      // console.log('🔍 [RefreshToken] Дней с последней активности:', daysSinceLastActivity);
      // console.log('🔍 [RefreshToken] Порог неактивности (дней):', settings.userActivityThresholdDays);

      if (timeSinceLastActivity > userActivityThresholdMs) {
        console.log('❌ [RefreshToken] Пользователь заблокирован через неактивность');
        // Пользователь неактивен больше месяца, блокируем
        await prisma.user.update({
          where: { id: user.id },
          data: {
            isActive: false,
            refreshToken: null,
            refreshTokenExpiresAt: null
          }
        });
        throw new Error('Користувач заблокований через неактивність');
      }

      // Генерируем новую пару токенов
      const { accessToken, refreshToken, expiresIn } = await this.generateTokenPair(user as UserType);

      // Обновляем refresh token в базе
      const refreshExpiryDate = new Date(Date.now() + await this.getRefreshTokenExpiryMs());
      await prisma.user.update({
        where: { id: user.id },
        data: {
          refreshToken: this.hashToken(refreshToken),
          refreshTokenExpiresAt: refreshExpiryDate,
        }
      });

      // Компактное логирование установки refresh токена

      return { token: accessToken, refreshToken, expiresIn };
      
    } catch (error) {
      console.error('❌ Ошибка в refreshToken:', error);
      throw error;
    }
  }

  static async logout(userId: number): Promise<void> {
    // Очищаем refresh токен пользователя
    await prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: null,
        refreshTokenExpiresAt: null
      }
    });

    console.log(`✅ [AuthService] Токены успешно удалены для пользователя ${userId}`);
  }

  static async updateUserActivity(userId: number): Promise<void> {
    // Обновляем время последней активности пользователя
    await prisma.user.update({
      where: { id: userId },
      data: { lastActivityAt: new Date() }
    });
  }

  private static async generateTokenPair(user: UserType): Promise<{ accessToken: string, refreshToken: string, expiresIn: number }> {
    const secret = process.env.JWT_SECRET || 'fallback_secret';

    if (!secret) {
      throw new Error('JWT_SECRET не настроен');
    }

    const settings = await this.getSettings();

    // console.log('🔍 [TokenGen] ACCESS_TOKEN_EXPIRES_IN:', settings.accessTokenExpiresIn);
    // console.log('🔍 [TokenGen] REFRESH_TOKEN_EXPIRES_IN:', settings.refreshTokenExpiresIn);

    // Генерируем access токен
    const accessToken = (jwt as any).sign(
      {
        userId: user.id,
        role: user.role,
        email: user.email,
        name: user.name,
        roleName: user.roleName,
        tokenType: 'access'
      },
      secret,
      { expiresIn: settings.accessTokenExpiresIn }
    );

    // Генерируем refresh токен
    const refreshToken = (jwt as any).sign(
      {
        userId: user.id,
        role: user.role,
        email: user.email,
        name: user.name,
        roleName: user.roleName,
        tokenType: 'refresh'
      },
      secret,
      { expiresIn: settings.refreshTokenExpiresIn }
    );

    // Вычисляем время жизни access токена в секундах
    const expiresIn = AuthSettingsService.parseExpiryTime(settings.accessTokenExpiresIn);
    const accessExpiryDate = new Date(Date.now() + expiresIn * 1000);
    const refreshExpiryMs = AuthSettingsService.parseExpiryTimeMs(settings.refreshTokenExpiresIn);
    const refreshExpiryDate = new Date(Date.now() + refreshExpiryMs);

    // console.log('🔍 [TokenGen] Access token expires in:', expiresIn, 'seconds');
    // console.log('🔍 [TokenGen] Refresh token expires in:', refreshExpiryMs, 'ms');
    // console.log('🔍 [TokenGen] Refresh token expiry date:', refreshExpiryDate.toISOString());

    // Логируем генерацию токенов с учетом настроек

    return { accessToken, refreshToken, expiresIn };
  }

  private static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private static parseExpiryTime(expiryTime: string): number {
    const unit = expiryTime.slice(-1);
    const value = parseInt(expiryTime.slice(0, -1));
    
    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 24 * 60 * 60;
      default: return 3600; // 1 час по умолчанию
    }
  }

  private static async getRefreshTokenExpiryMs(): Promise<number> {
    const settings = await this.getSettings();
    return AuthSettingsService.parseExpiryTimeMs(settings.refreshTokenExpiresIn);
  }

  static async getUserById(id: number): Promise<UserType | null> {
    const user = await prisma.user.findUnique({
      where: { id: typeof id === "string" ? Number(id) : id },
    });
    return user as UserType;
  }

  static async updateProfile(userId: number, updateData: UpdateProfileRequest): Promise<Omit<UserType, "password">> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('Користувача не знайдено');
    }

    // Проверяем, не занят ли email другим пользователем
    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: updateData.email }
      });
      if (existingUser) {
        throw new Error('Email вже використовується');
      }
    }

    // Если меняется пароль, проверяем текущий пароль
    if (updateData.newPassword) {
      if (!updateData.currentPassword) {
        throw new Error('Поточний пароль обов\'язковий для зміни паролю');
      }
      
      const isValidPassword = await bcrypt.compare(updateData.currentPassword, user.password);
      if (!isValidPassword) {
        throw new Error('Невірний поточний пароль');
      }
    }

    // Подготавливаем данные для обновления
    const updateFields: any = {};
    
    if (updateData.name !== undefined) {
      updateFields.name = updateData.name;
    }
    
    if (updateData.email !== undefined) {
      updateFields.email = updateData.email;
    }
    
    if (updateData.newPassword) {
      updateFields.password = await bcrypt.hash(updateData.newPassword, 10);
    }

    // Обновляем пользователя
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateFields
    });

    return sanitizeUser(updatedUser) as Omit<UserType, "password">;
  }

  static async setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    // Определяем настройки для текущего окружения
    const isProduction = process.env.NODE_ENV === 'production';
    const isHTTPS = process.env.HTTPS === 'true' || isProduction;

    // Для cross-site обязательно SameSite=None и Secure=true (HTTPS)
    // Для localhost в dev — Secure=false
    const cookieOptions = {
      httpOnly: true,
      secure: isHTTPS,
      sameSite: isHTTPS ? 'none' as const : 'lax' as const, // none для HTTPS, lax для dev
      path: '/'
    };

    const settings = await this.getSettings();

    // Устанавливаем access token cookie (настраивается через БД)
    const accessTokenMaxAge = await this.getAccessTokenCookieMaxAge();
    res.cookie('accessToken', accessToken, {
      ...cookieOptions,
      maxAge: accessTokenMaxAge,
    });

    // Устанавливаем refresh token cookie (используем то же время что и в JWT токене)
    const refreshTokenMaxAge = AuthSettingsService.parseExpiryTimeMs(settings.refreshTokenExpiresIn);
    // console.log('🔍 [Cookies] Устанавливаем refresh token cookie с maxAge:', refreshTokenMaxAge, 'ms');

    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: refreshTokenMaxAge,
    });
  }

  static async clearAuthCookies(res: Response) {
    // Определяем настройки для текущего окружения (такие же как при установке)
    const isProduction = process.env.NODE_ENV === 'production';
    const isHTTPS = process.env.HTTPS === 'true' || isProduction;
    
    const cookieOptions = {
      httpOnly: true,
      secure: isHTTPS,
      sameSite: isHTTPS ? 'none' as const : 'lax' as const,
      path: '/'
    };
    
    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);
  }

  static async getTokenFromCookies(req: Request): Promise<{ accessToken?: string, refreshToken?: string }> {
    // Пробуем получить из parsed cookies
    let accessToken = req.cookies?.accessToken;
    let refreshToken = req.cookies?.refreshToken;

    // Логируем для отладки
    // console.log('🔍 [Cookies] Raw accessToken из cookie-parser:', accessToken ? accessToken.substring(0, 30) + '...' : 'null');
    // console.log('🔍 [Cookies] Raw refreshToken из cookie-parser:', refreshToken ? refreshToken.substring(0, 30) + '...' : 'null');

    // Если cookie-parser не справился, парсим вручную
    if (!accessToken || !refreshToken) {
      const cookieHeader = req.headers.cookie;
      // console.log('🔍 [Cookies] Cookie header:', cookieHeader);
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
          const [key, value] = cookie.trim().split('=');
          if (key && value) {
            acc[key] = decodeURIComponent(value); // Декодируем URL-encoded значения
          }
          return acc;
        }, {} as Record<string, string>);

        // console.log('🔍 [Cookies] Parsed cookies:', Object.keys(cookies));

        accessToken = accessToken || cookies.accessToken;
        refreshToken = refreshToken || cookies.refreshToken;

        // console.log('🔍 [Cookies] После ручного парсинга accessToken:', accessToken ? accessToken.substring(0, 30) + '...' : 'null');
        // console.log('🔍 [Cookies] После ручного парсинга refreshToken:', refreshToken ? refreshToken.substring(0, 30) + '...' : 'null');
      }
    }

    return { accessToken, refreshToken };
  }
}
