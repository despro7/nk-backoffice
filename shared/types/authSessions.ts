export type SessionRevokedReason =
  | 'logout'
  | 'admin_revoke'
  | 'self_revoke'
  | 'password_change'
  | 'user_blocked'
  | 'inactivity'
  | 'expired';

export type SessionDeviceType = 'desktop' | 'mobile' | 'tablet';

export interface AuthSessionDto {
  id: string;
  deviceType: SessionDeviceType;
  browser: string | null;
  os: string | null;
  /** IP під час входу */
  ip: string | null;
  /** IP під час останнього оновлення токена */
  lastIp: string | null;
  city: string | null;
  region: string | null;
  /** ISO 3166-1 alpha-2 */
  country: string | null;
  /** Остання IP локальна або приватна */
  isLocalNetwork: boolean;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  isActive: boolean;
  isCurrent: boolean;
  /** Коли сесія завершилась (відкликана або прострочена) */
  revokedAt: string | null;
  revokedReason: SessionRevokedReason | null;
}

export type LoginAttemptReason = 'unknown_email' | 'bad_password' | 'user_blocked';

export interface AuthLoginAttemptDto {
  id: number;
  email: string;
  ip: string | null;
  userAgent: string | null;
  deviceType: SessionDeviceType;
  browser: string | null;
  os: string | null;
  success: boolean;
  reason: LoginAttemptReason | null;
  createdAt: string;
}

export interface AuthSessionsResponse {
  /** Спершу активні, далі завершені (найновіші першими) */
  sessions: AuthSessionDto[];
  /** Є ще завершені сесії */
  hasMore: boolean;
}

export interface AuthLoginAttemptsResponse {
  /** Лише невдалі спроби */
  attempts: AuthLoginAttemptDto[];
  hasMore: boolean;
}

export interface RevokeSessionsResponse {
  revoked: number;
}
