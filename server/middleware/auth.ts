import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types/auth.js';
import { AuthService } from '../services/authService.js';
import { AuthSettingsService } from '../services/authSettingsService.js';
import { ROLES, ROLE_SETS, hasAccess, ROLE_HIERARCHY, canApplyRolePreview, isRolePreviewExemptPath, ROLE_PREVIEW_HEADER, ROLE_PREVIEW_APPLIED_HEADER } from '../../shared/constants/roles.js';
import type { RoleValue } from '../../shared/constants/roles.js';
import { roleService } from '../services/RoleService.js';
import { requirePermission, requirePermissionKey, sendInsufficientRole } from './requirePermission.js';

export { ROLES, ROLE_SETS, requirePermission, requirePermissionKey };

// Розширюємо інтерфейс Request для додавання користувача
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// Лічильник для відстеження перевірок токенів
let tokenCheckCount = 0;

// Глобальне блокування для запобігання паралельним оновленням токенів
let refreshInProgress = false;
let refreshPromise: Promise<any> | null = null;

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  // Дозволяємо системні запити від локального хоста (для Cron задач)
  const isLocalhostRequest = 
    (req.ip === '::1' || req.ip === '127.0.0.1' || req.ip === '::ffff:127.0.0.1') &&
    (req.headers['x-system-request'] === 'true');

  if (isLocalhostRequest) {
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

    if (accessToken) {
      // Перевіряємо час закінчення терміну дії токена ДО його валідації
      try {
        const secret = process.env.JWT_SECRET || 'fallback_secret';
        const decoded = jwt.decode(accessToken) as any;
        
        if (decoded && decoded.exp) {
          const now = Math.floor(Date.now() / 1000);
          const timeUntilExpiry = decoded.exp - now;
          
          // Отримуємо налаштування з БД
          const settings = await AuthSettingsService.getAuthSettings();
          
          // Якщо автоматичне оновлення увімкнено і токен закінчується в найближчому часі
          if (settings.middlewareAutoRefreshEnabled && timeUntilExpiry <= settings.middlewareRefreshThresholdSeconds && timeUntilExpiry > 0) {
            console.log(`⚠️  [Middleware] Access token закінчується через ${timeUntilExpiry} секунд, оновлюємо...`);
              
            if (refreshToken) {
              // Перевіряємо блокування оновлень
              if (refreshInProgress) {
                console.log('⏭️ [Middleware] Оновлення вже в процесі, пропускаємо цей запит (запобігаємо блокуванню пулу БД)');
                // НЕ чекаємо - просто продовжуємо з поточным токеном
                // Це запобігає вичерпанню пулу з'єднань з БД
              } else {
                // Встановлюємо блокування і починаємо оновлення
                refreshInProgress = true;
                console.log('🔒 [Middleware] Встановлено блокування оновлення токенів');
                
                refreshPromise = (async () => {
                  try {
                    const refreshResult = await AuthService.refreshToken({ refreshToken });
                    
                    // Встановлюємо нові cookies
                    await AuthService.setAuthCookies(res, refreshResult.token, refreshResult.refreshToken);
                    
                    console.log('✅ [Middleware] Токен успішно оновлений автоматично');
                    
                    // Встановлюємо заголовок для сповіщення клієнта про оновлення
                    res.setHeader('X-Token-Refreshed', 'true');
                    res.setHeader('X-User-Email', decoded.email || 'unknown');
                    
                    return refreshResult;
                  } catch (refreshError) {
                    console.log('❌ [Middleware] Помилка автоматичного оновлення токена:', refreshError.message);
                    // НЕ перекладаємо помилку — інакше буде unhandled rejection
                    // Клієнт отримає 401 при наступному запиті і зробить явне оновлення
                    return null;
                  } finally {
                    // Звільняємо блокування
                    refreshInProgress = false;
                    refreshPromise = null;
                    console.log('🔓 [Middleware] Блокування оновлення токенів знято');
                  }
                })();
                
                // Додаємо обробник для запобігання unhandled rejection
                refreshPromise.catch((error) => {
                  console.log('❌ [Middleware] Критична помилка в фоновому оновленні токена:', error.message);
                  // Помилка уже залогірована, просто запобігаємо падінню сервера
                });
                
                // НЕ чекаємо завершення - запускаємо оновлення в фоновому режимі
                // Продовжуємо з поточным токеном, щоб не блокувати пул БД
              }
            }
          }
        }
      } catch (decodeError) {
        // Якщо не вдалося декодувати токен, продовжуємо зі звичайною валідацією
        console.log(`⚠️ [Middleware] Не вдалося декодувати токен для перевірки часу: ${decodeError.message}`);
      }
    }
    
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
