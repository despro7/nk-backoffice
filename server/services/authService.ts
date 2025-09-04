import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { UserType, LoginRequest, RegisterRequest, UpdateProfileRequest, AuthResponse, RefreshTokenRequest, RefreshTokenResponse, sanitizeUser } from "../types/auth.js";

const prisma = new PrismaClient();

export class AuthService {
  // Константы для токенов
  private static readonly ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h'; // 1 час
  private static readonly REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d'; // 30 дней
  private static readonly USER_ACTIVITY_THRESHOLD = 30 * 24 * 60 * 60 * 1000; // 30 дней в миллисекундах
  
  // Получаем время жизни access token в миллисекундах для cookies
  private static getAccessTokenCookieMaxAge(): number {
    const envValue = process.env.ACCESS_TOKEN_COOKIE_MAX_AGE;
    if (envValue) {
      return parseInt(envValue) * 60 * 1000; // конвертируем минуты в миллисекундах
    }
    return 60 * 60 * 1000; // по умолчанию 1 час
  }

  // Логируем настройки токенов при инициализации
  static {
    console.log('🔐 [AuthService] Настройки токенов:');
    console.log(`🔐 [AuthService] ACCESS_TOKEN_EXPIRES_IN: ${this.ACCESS_TOKEN_EXPIRES_IN}`);
    console.log(`🔐 [AuthService] REFRESH_TOKEN_EXPIRES_IN: ${this.REFRESH_TOKEN_EXPIRES_IN}`);
    console.log(`🔐 [AuthService] ACCESS_TOKEN_COOKIE_MAX_AGE: ${this.getAccessTokenCookieMaxAge() / 60 / 1000} минут`);
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

    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    // Сначала создаем пользователя в БД
    const newUser = await prisma.user.create({
      data: {
        name: userData.name || "",
        email: userData.email,
        password: hashedPassword,
        role: userData.role || "user",
        roleName: userData.roleName || "Користувач",
        lastLoginAt: new Date(),
        lastActivityAt: new Date(),
        isActive: true,
        // Пока не устанавливаем refresh token
        refreshToken: null,
        refreshTokenExpiresAt: null,
      },
    });

    // Теперь генерируем токены с реальным user.id
    const { accessToken, refreshToken, expiresIn } = await this.generateTokenPair(newUser as UserType);

    // Обновляем пользователя с хешем refresh token
    await prisma.user.update({
      where: { id: newUser.id },
      data: {
        refreshToken: this.hashToken(refreshToken),
        refreshTokenExpiresAt: new Date(Date.now() + this.getRefreshTokenExpiryMs()),
      },
    });

    return { 
      token: accessToken, 
      refreshToken, 
      user: sanitizeUser(newUser),
      expiresIn
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
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastActivityAt: new Date(),
        refreshToken: this.hashToken(refreshToken),
        refreshTokenExpiresAt: new Date(Date.now() + this.getRefreshTokenExpiryMs()),
      }
    });

    return { 
      token: accessToken, 
      refreshToken, 
      user: sanitizeUser(user),
      expiresIn
    };
  }

  static async refreshToken(refreshTokenData: RefreshTokenRequest): Promise<RefreshTokenResponse> {
    try {
      console.log('🔄 [AuthService] Начинаем обновление токена...');
      console.log('🔍 [AuthService] Получен refresh token из cookies:', refreshTokenData.refreshToken ? '✅' : '❌');
      
      // Находим пользователя по refresh токену
      const hashedToken = this.hashToken(refreshTokenData.refreshToken);
      console.log('🔍 [AuthService] Хешированный refresh token:', hashedToken.substring(0, 20) + '...');
      console.log('🔍 [AuthService] Ищем пользователя по refresh токену...');
      
      const user = await prisma.user.findFirst({
        where: { 
          refreshToken: hashedToken,
          refreshTokenExpiresAt: { gt: new Date() }
        }
      });

      if (!user) {
        console.log('❌ [AuthService] Refresh токен не найден или истек');
        throw new Error('Невірний або застарілий refresh токен');
      }

      console.log('✅ [AuthService] Refresh токен найден, проверяем пользователя...');
      console.log(`👤 [AuthService] Проверяем пользователя: ${user.email} (ID: ${user.id})`);
      
      if (!user.isActive) {
        console.log('❌ [AuthService] Пользователь заблокирован');
        throw new Error('Користувач заблокований');
      }

      // Проверяем, не слишком ли давно пользователь был активен
      const lastActivity = user.lastActivityAt || user.lastLoginAt || user.createdAt;
      const timeSinceLastActivity = Date.now() - lastActivity.getTime();
      const daysSinceLastActivity = Math.round(timeSinceLastActivity / (1000 * 60 * 60 * 24));
      
      console.log(`⏰ [AuthService] Последняя активность: ${lastActivity}`);
      console.log(`⏰ [AuthService] Прошло дней: ${daysSinceLastActivity}`);
      console.log(`⏰ [AuthService] Порог неактивности: ${this.USER_ACTIVITY_THRESHOLD / (1000 * 60 * 60 * 24)} дней`);
      
      if (timeSinceLastActivity > this.USER_ACTIVITY_THRESHOLD) {
        console.log('❌ [AuthService] Пользователь неактивен слишком долго, блокируем');
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

      console.log('✅ [AuthService] Все проверки пройдены, обновляем токены...');
      
      // Генерируем новую пару токенов
      const { accessToken, refreshToken, expiresIn } = await this.generateTokenPair(user as UserType);
      console.log(`✅ [AuthService] Новые токены сгенерированы, expiresIn: ${expiresIn} секунд`);

      // Обновляем refresh token в базе
      await prisma.user.update({
        where: { id: user.id },
        data: {
          refreshToken: this.hashToken(refreshToken),
          refreshTokenExpiresAt: new Date(Date.now() + this.getRefreshTokenExpiryMs()),
        }
      });

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
    
    console.log(`🔑 [AuthService] Генерируем токены для пользователя: ${user.email}`);
    console.log(`⏰ [AuthService] ACCESS_TOKEN_EXPIRES_IN: ${this.ACCESS_TOKEN_EXPIRES_IN}`);
    console.log(`⏰ [AuthService] REFRESH_TOKEN_EXPIRES_IN: ${this.REFRESH_TOKEN_EXPIRES_IN}`);
    
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
      { expiresIn: this.ACCESS_TOKEN_EXPIRES_IN }
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
      { expiresIn: this.REFRESH_TOKEN_EXPIRES_IN }
    );

    // Вычисляем время жизни access токена в секундах
    const expiresIn = this.parseExpiryTime(this.ACCESS_TOKEN_EXPIRES_IN);
    
    console.log(`✅ [AuthService] Токены сгенерированы успешно`);
    console.log(`⏰ [AuthService] Access токен истекает через: ${expiresIn} секунд`);
    
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

  private static getRefreshTokenExpiryMs(): number {
    const expiryTime = this.REFRESH_TOKEN_EXPIRES_IN;
    const unit = expiryTime.slice(-1);
    const value = parseInt(expiryTime.slice(0, -1));
    
    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 30 * 24 * 60 * 60 * 1000; // 30 дней по умолчанию
    }
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
    console.log('🍪 [AuthService] Устанавливаем cookies для токенов...');
    
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
    
    console.log(`🍪 [AuthService] Cookie settings: secure=${cookieOptions.secure}, sameSite=${cookieOptions.sameSite}`);
    console.log(`🍪 [AuthService] Environment: NODE_ENV=${process.env.NODE_ENV}, HTTPS=${process.env.HTTPS}`);
    
    // Устанавливаем access token cookie (настраивается через переменные окружения)
    const accessTokenMaxAge = this.getAccessTokenCookieMaxAge();
    res.cookie('accessToken', accessToken, {
      ...cookieOptions,
      maxAge: accessTokenMaxAge,
    });
    console.log(`🍪 [AuthService] Access token cookie установлен:`);
    console.log(`    - name: accessToken`);
    console.log(`    - maxAge: ${accessTokenMaxAge} ms (${accessTokenMaxAge/1000/60} минут)`);
    console.log(`    - httpOnly: ${cookieOptions.httpOnly}`);
    console.log(`    - secure: ${cookieOptions.secure}`);
    console.log(`    - sameSite: ${cookieOptions.sameSite}`);
    console.log(`    - token length: ${accessToken.length} chars`);

    // Устанавливаем refresh token cookie (30 дней)
    const refreshTokenMaxAge = 30 * 24 * 60 * 60 * 1000; // 30 дней
    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: refreshTokenMaxAge,
    });
    console.log(`🍪 [AuthService] Refresh token cookie установлен:`);
    console.log(`    - name: refreshToken`);
    console.log(`    - maxAge: ${refreshTokenMaxAge} ms (${refreshTokenMaxAge/1000/60/24} дней)`);
    console.log(`    - token length: ${refreshToken.length} chars`);
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
    console.log('🍪 [AuthService] Получаем токены из cookies...');
    
    // Пробуем получить из parsed cookies
    let accessToken = req.cookies?.accessToken;
    let refreshToken = req.cookies?.refreshToken;
    
    console.log(`🍪 [AuthService] Parsed cookies - Access: ${accessToken ? '✅' : '❌'}, Refresh: ${refreshToken ? '✅' : '❌'}`);
    
    // Если cookie-parser не справился, парсим вручную
    if (!accessToken || !refreshToken) {
      console.log('🍪 [AuthService] Cookie-parser не справился, парсим вручную...');
      const cookieHeader = req.headers.cookie;
      if (cookieHeader) {
        console.log('🍪 [AuthService] Cookie header:', cookieHeader);
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
          const [key, value] = cookie.trim().split('=');
          if (key && value) {
            acc[key] = value;
          }
          return acc;
        }, {} as Record<string, string>);
        
        console.log('🍪 [AuthService] Parsed cookies manually:', cookies);
        
        accessToken = accessToken || cookies.accessToken;
        refreshToken = refreshToken || cookies.refreshToken;
      } else {
        console.log('🍪 [AuthService] Cookie header отсутствует');
      }
    }
    
    console.log(`🍪 [AuthService] Итоговый результат - Access: ${accessToken ? '✅' : '❌'}, Refresh: ${refreshToken ? '✅' : '❌'}`);
    
    return { accessToken, refreshToken };
  }
}