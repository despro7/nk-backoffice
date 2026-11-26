import { User as PrismaUser } from "@prisma/client";

export type UserType = PrismaUser;

export interface LoginRequest {
  email: PrismaUser["email"];
  password: PrismaUser["password"];
}

export interface RegisterRequest {
  email: PrismaUser["email"];
  name?: PrismaUser["name"];
  password: PrismaUser["password"];
  role?: PrismaUser["role"];
  roleName?: PrismaUser["roleName"];
  dilovodUserId?: PrismaUser["dilovodUserId"];
  /** Роль користувача в Dilovod (catalogs.roles) */
  dilovodRoleId?: string;
  /**
   * @deprecated Dilovod API не дозволяє create catalogs.users (writeAccessDenied).
   * Запит з цим прапорцем відхиляється — створюйте лише в Backoffice або привʼяжіть існуючого.
   */
  createDilovodUser?: boolean;
  /** Активувати вимкненого користувача Dilovod (disabled → false) при привʼязці */
  activateDilovodUser?: boolean;
}

export interface UpdateProfileRequest {
  name?: PrismaUser["name"];
  email?: PrismaUser["email"];
  currentPassword?: string;
  newPassword?: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: Omit<UserType, "password" | "refreshToken" | "refreshTokenExpiresAt">;
  expiresIn: number; // Час існування access токена у секундах
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  token: string;
  /** null: повтор щойно ротованого токена, refresh cookie не чіпаємо */
  refreshToken: string | null;
  expiresIn: number;
}

export interface JwtPayload {
  userId: PrismaUser["id"];
  role: PrismaUser["role"];
  email: PrismaUser["email"];
  name: PrismaUser["name"];
  roleName: PrismaUser["roleName"];
  tokenType: 'access' | 'refresh'; // Тип токена
  sid?: string; // ID сесії (user_sessions)
  exp?: number; // Час закінчення терміну дії токена (стандартне поле JWT)
  iat?: number; // Час створення токена (стандартное JWT поле)
  expiresIn?: number; // Залишковий час існування токена у секундах (розраховується у middleware)
  /** Оригінальна роль з JWT, якщо на запит застосовано X-Role-Preview */
  realRole?: PrismaUser["role"];
}

export interface SessionMeta {
  userAgent?: string | null;
  ip?: string | null;
  city?: string | null;
  region?: string | null;
  /** ISO 3166-1 alpha-2 */
  country?: string | null;
}

export type AuthErrorCode = 'REFRESH_INVALID' | 'USER_BLOCKED';

export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export function sanitizeUser(user: UserType): Omit<UserType, "password" | "refreshToken" | "refreshTokenExpiresAt"> {
  const { password, refreshToken, refreshTokenExpiresAt, ...safeUser } = user;
  return safeUser;
}