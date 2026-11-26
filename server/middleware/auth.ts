import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { JwtPayload } from '../types/auth.js';
import { AuthService } from '../services/authService.js';
import { ROLES, ROLE_SETS, hasAccess, ROLE_HIERARCHY, canApplyRolePreview, isRolePreviewExemptPath, ROLE_PREVIEW_HEADER, ROLE_PREVIEW_APPLIED_HEADER } from '../../shared/constants/roles.js';
import type { RoleValue } from '../../shared/constants/roles.js';
import { roleService } from '../services/RoleService.js';
import { isSessionActive, touchSession } from '../services/authSessionService.js';
import { requirePermission, requirePermissionKey, requireAnyPermissionKey, sendInsufficientRole } from './requirePermission.js';
import type { HrTimesheetEditorMode } from '../../shared/types/hr.js';

export { ROLES, ROLE_SETS, requirePermission, requirePermissionKey, requireAnyPermissionKey };

export const SYSTEM_TOKEN_HEADER = 'x-system-token';
const MIN_SYSTEM_TOKEN_LENGTH = 32;

/**
 * Системний запит дозволено лише коли SYSTEM_REQUEST_TOKEN задано (>= 32 символи)
 * і заголовок `x-system-token` збігається з ним (порівняння за сталий час).
 * Без змінної середовища обхід авторизації вимкнено повністю.
 */
export function isValidSystemRequest(req: Request): boolean {
  const expected = process.env.SYSTEM_REQUEST_TOKEN;
  if (!expected || expected.length < MIN_SYSTEM_TOKEN_LENGTH) return false;

  const provided = req.get(SYSTEM_TOKEN_HEADER);
  if (!provided) return false;

  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

// Розширюємо інтерфейс Request для додавання користувача
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      timesheetEditMode?: HrTimesheetEditorMode;
    }
  }
}

// Лічильник для відстеження перевірок токенів
let tokenCheckCount = 0;

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  // Системні запити (cron, скрипти): лише з секретом SYSTEM_REQUEST_TOKEN у заголовку
  // `x-system-token`. Перевірка за IP небезпечна: за reverse proxy req.ip завжди локальний.
  if (isValidSystemRequest(req)) {
    req.user = { 
      userId: 0, 
      email: 'system@cron', 
      role: 'admin', 
      name: 'System Cron',
      roleName: 'System',
      tokenType: 'access'
    };
    return next();
  }

  try {
    tokenCheckCount++;

    // Розширене логування для тестування
    const shouldLog = process.env.NODE_ENV === 'development';

    // Отримуємо токени з cookies
    const { accessToken, refreshToken } = await AuthService.getTokenFromCookies(req);

    if (!accessToken) {
      // Якщо access token відсутній, але є refresh token,
      // це сигнал для клієнта, що потрібно спробувати оновити токен.
      // Це покриває випадок, коли cookie access token закінчився.
      if (refreshToken) {
        console.log('⚠️  [Middleware] Access token відсутній, але refresh token присутній. Потрібно оновити.');
        return res.status(401).json({
          message: 'Access token required, refresh needed',
          code: 'TOKEN_EXPIRED', // Використовуємо той же код, що і для закінченого токена
          shouldRefresh: true,
        });
      }

      // Якщо немає ні access, ні refresh токена, то користувач не авторизований.
      if (shouldLog) {
        console.log('❌ [Middleware] Access token не знайдений');
      }
      return res.status(401).json({
        message: 'Access token required. Please login first.',
        code: 'NO_TOKEN',
        details: 'You need to authenticate before accessing this resource'
      });
    }

    const secret = process.env.JWT_SECRET || 'fallback_secret';
    const decoded = jwt.verify(accessToken, secret) as JwtPayload;

    // Перевіряємо тип токена
    if (decoded.tokenType !== 'access') {
      console.log(`❌ [Middleware] Неправильний тип токена: ${decoded.tokenType}`);
      return res.status(403).json({
        message: 'Invalid token type',
        code: 'INVALID_TOKEN_TYPE',
        details: 'The provided token is not an access token'
      });
    }
    
    // Відкликана сесія не повинна жити до кінця TTL access токена
    if (decoded.sid) {
      // Збій БД не розлогінює: підпис і термін токена вже перевірені
      const active = await isSessionActive(decoded.sid).catch((error) => {
        console.error('❌ [Middleware] Не вдалося перевірити сесію:', error.message);
        return true;
      });
      if (!active) {
        return res.status(401).json({
          message: 'Сесію завершено. Увійдіть знову.',
          code: 'SESSION_REVOKED',
        });
      }
      touchSession(decoded.sid);
    }

    // Розраховуємо залишковий час існування токена
    if (decoded.exp) {
      const now = Math.floor(Date.now() / 1000);
      decoded.expiresIn = Math.max(0, decoded.exp - now);
    }
    
    req.user = decoded;

    await applyRolePreview(req, res);

    // Тихе оновлення активности користувача
    AuthService.updateUserActivity(decoded.userId).catch(() => {});

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.log('⚠️ [Middleware] Access token закінчився, повертаємо shouldRefresh');
      console.log('🔄 [Middleware] Додаток повинен автоматично оновити токен через refresh token');
      return res.status(401).json({
        message: 'Access token expired',
        code: 'TOKEN_EXPIRED',
        shouldRefresh: true,
        details: 'Your session has expired. Token will be automatically refreshed.'
      });
    }

    console.log(`❌ [Middleware] Помилка перевірки токена: ${error.message}`);
    if (error.message.includes('invalid signature')) {
      console.log('❌ [Middleware] Неправильна підпис токена - можливо, JWT_SECRET змінився');
    } else if (error.message.includes('malformed')) {
      console.log('❌ [Middleware] Пошкоджений токен - можливо, помилка кодування');
    }

    return res.status(403).json({
      message: 'Invalid token',
      code: 'INVALID_TOKEN',
      details: 'The provided token is malformed or invalid'
    });
  }
};

/**
 * Обережне зниження ролі на запит: лише для реального admin,
 * лише на відому роль нижче admin. Identity (userId/email) не змінюється.
 * Не застосовується до cron і до ендпоінтів сесії.
 */
async function applyRolePreview(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user || user.userId === 0) return;
  if (isRolePreviewExemptPath(req.originalUrl || req.path || '')) return;

  const rawHeader = req.get(ROLE_PREVIEW_HEADER);
  if (!rawHeader) return;

  const exists = await roleService.roleExists(rawHeader);
  if (!canApplyRolePreview(user.role, rawHeader, exists)) return;

  user.realRole = user.role;
  user.role = rawHeader;
  res.setHeader(ROLE_PREVIEW_APPLIED_HEADER, rawHeader);
}

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        message: 'Authentication required',
        code: 'NO_AUTH',
        details: 'You need to be authenticated to access this resource'
      });
    }

    if (!hasAccess(req.user.role, roles)) {
      return sendInsufficientRole(res, `Required roles: ${roles.join(', ')}`);
    }

    next();
  };
};

/**
 * Middleware для перевірки мінімального рівня ролі в ієрархії.
 * Автоматично враховує всі ролі вище вказаної — не потрібно оновлювати при додаванні нових ролей.
 * @example router.get('/sync', authenticateToken, requireMinRole(ROLES.STOREKEEPER), handler)
 */
export const requireMinRole = (minRole: RoleValue) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        message: 'Authentication required',
        code: 'NO_AUTH',
        details: 'You need to be authenticated to access this resource'
      });
    }

    if (!hasAccess(req.user.role, undefined, minRole)) {
      const userLevel = ROLE_HIERARCHY[req.user.role as RoleValue] ?? 0;
      const requiredLevel = ROLE_HIERARCHY[minRole];
      return sendInsufficientRole(
        res,
        `Required minimum role: ${minRole} (level ${requiredLevel}), your role: ${req.user.role} (level ${userLevel})`
      );
    }

    next();
  };
};
