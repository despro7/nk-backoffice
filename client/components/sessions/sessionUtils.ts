import { formatDateTime } from '@/lib/formatUtils';
import type {
  AuthSessionDto,
  LoginAttemptReason,
  SessionDeviceType,
  SessionRevokedReason,
} from '@shared/types/authSessions';

export const REVOKED_REASON_LABELS: Record<SessionRevokedReason, string> = {
  logout: 'Вихід',
  admin_revoke: 'Завершено адміністратором',
  self_revoke: 'Завершено користувачем',
  password_change: 'Зміна паролю',
  user_blocked: 'Користувача заблоковано',
  inactivity: 'Неактивність',
  expired: 'Минув термін',
};

export const ATTEMPT_REASON_LABELS: Record<LoginAttemptReason, string> = {
  unknown_email: 'Невідомий email',
  bad_password: 'Невірний пароль',
  user_blocked: 'Користувача заблоковано',
};

export const DEVICE_ICONS: Record<SessionDeviceType, 'monitor' | 'smartphone' | 'tablet'> = {
  desktop: 'monitor',
  mobile: 'smartphone',
  tablet: 'tablet',
};

export const deviceLabel = (browser: string | null, os: string | null): string => {
  if (browser && os) return `${browser} (${os})`;
  return browser || os || '–';
};

let regionNames: Intl.DisplayNames | null = null;

const countryName = (code: string): string => {
  try {
    regionNames ??= new Intl.DisplayNames(['uk'], { type: 'region' });
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
};

export const locationLabel = (session: AuthSessionDto): string => {
  if (session.isLocalNetwork) return 'Локальна мережа';
  const parts = [session.city, session.region, session.country && countryName(session.country)];
  return parts.filter(Boolean).join(', ') || 'Невідомо';
};

/** «25 лист., 16:23», рік лише якщо не поточний */
export const formatShortDate = (value: string | null): string => {
  if (!value) return '–';
  const date = new Date(value);
  const yearOf = (d: Date) => d.toLocaleDateString('uk-UA', { year: 'numeric', timeZone: 'Europe/Kyiv' });

  return date.toLocaleString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...(yearOf(date) !== yearOf(new Date()) ? { year: 'numeric' } : {}),
  });
};

export const formatFullDate = (value: string | null): string => (value ? formatDateTime(value) : '–');
