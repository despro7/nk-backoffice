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
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  userId: PrismaUser["id"];
  role: PrismaUser["role"];
  email: PrismaUser["email"];
  name: PrismaUser["name"];
  roleName: PrismaUser["roleName"];
  tokenType: 'access' | 'refresh'; // Тип токена
  exp?: number; // Час закінчення терміну дії токена (стандартне поле JWT)
  iat?: number; // Час створення токена (стандартное JWT поле)
  expiresIn?: number; // Залишковий час існування токена у секундах (розраховується у middleware)
  /** Оригінальна роль з JWT, якщо на запит застосовано X-Role-Preview */
  realRole?: PrismaUser["role"];
}

export function sanitizeUser(user: UserType): Omit<UserType, "password" | "refreshToken" | "refreshTokenExpiresAt"> {
  const { password, refreshToken, refreshTokenExpiresAt, ...safeUser } = user;
  return safeUser;
}