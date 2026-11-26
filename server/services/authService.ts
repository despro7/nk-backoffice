import { prisma } from '../lib/utils.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { UserType, LoginRequest, RegisterRequest, UpdateProfileRequest, AuthResponse, RefreshTokenRequest, RefreshTokenResponse, SessionMeta, AuthError, sanitizeUser } from "../types/auth.js";
import { AuthSettingsService } from './authSettingsService.js';
import { parseUserAgent, purgeAuthHistory, recordLoginAttempt, revokeSessions } from './authSessionService.js';

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


// Скільки після ротації старий refresh токен ще видає access (паралельні запити, вкладки)
export const REFRESH_ROTATION_GRACE_MS = 60_000;

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
      },
    });

    return {
      token: '',
      refreshToken: '',
      user: sanitizeUser(newUser),
      expiresIn: 0,
    };
  }

  static async login(credentials: LoginRequest, meta: SessionMeta = {}): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: {
        email: credentials.email
      }
    });

    if (!user) {
      await recordLoginAttempt(credentials.email, meta, { reason: 'unknown_email' });
      throw new Error('Невірні облікові дані');
    }

    const isValidPassword = await bcrypt.compare(credentials.password, user.password);
    if (!isValidPassword) {
      await recordLoginAttempt(credentials.email, meta, { userId: user.id, reason: 'bad_password' });
      throw new Error('Невірні облікові дані');
    }

    // Проверяем, не заблокирован ли пользователь
    if (!user.isActive) {
      await recordLoginAttempt(credentials.email, meta, { userId: user.id, reason: 'user_blocked' });
      throw new Error('Користувач заблокований');
    }

    const sessionId = crypto.randomUUID();
    const { accessToken, refreshToken, expiresIn } = await this.generateTokenPair(user as UserType, sessionId);
    const now = new Date();

    // Принагідно прибираємо стару історію входів
    await purgeAuthHistory(user.id);

    await prisma.userSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(now.getTime() + await this.getRefreshTokenExpiryMs()),
        lastUsedAt: now,
        userAgent: meta.userAgent?.slice(0, 255) || null,
        ip: meta.ip || null,
        lastIp: meta.ip || null,
        city: meta.city ?? null,
        region: meta.region ?? null,
        country: meta.country ?? null,
        ...parseUserAgent(meta.userAgent),
      }
    });
    await recordLoginAttempt(credentials.email, meta, { userId: user.id });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now, lastActivityAt: now }
    });

    return { 
      token: accessToken, 
      refreshToken, 
      user: sanitizeUser(user),
      expiresIn
    };
  }

  static async refreshToken(refreshTokenData: RefreshTokenRequest, meta: SessionMeta = {}): Promise<RefreshTokenResponse> {
    const hashedToken = this.hashToken(refreshTokenData.refreshToken);
    const now = new Date();

    const session = await prisma.userSession.findFirst({
      where: { tokenHash: hashedToken, revokedAt: null, expiresAt: { gt: now } },
      include: { user: true }
    });

    if (session) {
      await this.assertUserMayRefresh(session.user);

      const { accessToken, refreshToken, expiresIn } = await this.generateTokenPair(session.user as UserType, session.id);

      // Атомарна ротація: умова по старому хешу пропускає лише один з паралельних запитів
      const { count } = await prisma.userSession.updateMany({
        where: { id: session.id, tokenHash: hashedToken, revokedAt: null },
        data: {
          tokenHash: this.hashToken(refreshToken),
          prevTokenHash: hashedToken,
          rotatedAt: now,
          lastUsedAt: now,
          // Нова IP: переписуємо й місцезнаходження
          ...(meta.ip && meta.ip !== session.lastIp
            ? { lastIp: meta.ip, city: meta.city ?? null, region: meta.region ?? null, country: meta.country ?? null }
            : {}),
          expiresAt: new Date(now.getTime() + await this.getRefreshTokenExpiryMs()),
        }
      });

      if (count === 1) {
        return { token: accessToken, refreshToken, expiresIn };
      }
    }

    return this.refreshWithinGrace(hashedToken);
  }

  // Токен щойно ротовано іншим запитом: видаємо лише access, refresh cookie вже нова
  private static async refreshWithinGrace(hashedToken: string): Promise<RefreshTokenResponse> {
    const now = Date.now();
    const session = await prisma.userSession.findFirst({
      where: {
        prevTokenHash: hashedToken,
        revokedAt: null,
        rotatedAt: { gte: new Date(now - REFRESH_ROTATION_GRACE_MS) },
        expiresAt: { gt: new Date(now) }
      },
      include: { user: true }
    });

    if (!session) {
      throw new AuthError('REFRESH_INVALID', 'Невірний або застарілий refresh токен');
    }

    await this.assertUserMayRefresh(session.user);

    const { accessToken, expiresIn } = await this.generateTokenPair(session.user as UserType, session.id);

    return { token: accessToken, refreshToken: null, expiresIn };
  }

  private static async assertUserMayRefresh(user: UserType): Promise<void> {
    if (!user.isActive) {
      throw new AuthError('USER_BLOCKED', 'Користувач заблокований');
    }

    const settings = await this.getSettings();

    // Проверяем, не слишком ли давно пользователь был активен
    const lastActivity = user.lastActivityAt || user.lastLoginAt || user.createdAt;
    const timeSinceLastActivity = Date.now() - lastActivity.getTime();
    const userActivityThresholdMs = settings.userActivityThresholdDays * 24 * 60 * 60 * 1000;

    if (timeSinceLastActivity > userActivityThresholdMs) {
      console.log('❌ [RefreshToken] Пользователь заблокирован через неактивность');
      await prisma.user.update({
        where: { id: user.id },
        data: { isActive: false }
      });
      await revokeSessions(user.id, { reason: 'inactivity' });
      throw new AuthError('USER_BLOCKED', 'Користувач заблокований через неактивність');
    }
  }

  // Без sid (токен, виданий до появи сесій) виходимо на всіх пристроях
  static async logout(userId: number, sid?: string): Promise<void> {
    await revokeSessions(userId, { reason: 'logout', byUserId: userId, sessionIds: sid ? [sid] : undefined });

    console.log(`✅ [AuthService] Сесію завершено для користувача ${userId}`);
  }

  static async updateUserActivity(userId: number): Promise<void> {
    // Обновляем время последней активности пользователя
    await prisma.user.update({
      where: { id: userId },
      data: { lastActivityAt: new Date() }
    });
  }

  private static async generateTokenPair(user: UserType, sid: string): Promise<{ accessToken: string, refreshToken: string, expiresIn: number }> {
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
        tokenType: 'access',
        sid
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
        tokenType: 'refresh',
        sid
      },
      secret,
      // jwtid: інакше два токени, видані в одну секунду, були б однаковими
      { expiresIn: settings.refreshTokenExpiresIn, jwtid: crypto.randomUUID() }
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

  static async updateProfile(userId: number, updateData: UpdateProfileRequest, currentSid?: string): Promise<Omit<UserType, "password">> {
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

    if (updateData.newPassword) {
      await revokeSessions(userId, { reason: 'password_change', byUserId: userId, exceptSid: currentSid });
    }

    return sanitizeUser(updatedUser) as Omit<UserType, "password">;
  }

  static async setAuthCookies(res: Response, accessToken: string, refreshToken: string | null) {
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

    if (!refreshToken) return;

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
