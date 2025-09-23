import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types/auth.js';
import { AuthService } from '../services/authService.js';
import { AuthSettingsService } from '../services/authSettingsService.js';

// Расширяем интерфейс Request для добавления пользователя
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// Счетчик для отслеживания проверок токенов
let tokenCheckCount = 0;

// Глобальная блокировка для предотвращения параллельных обновлений токенов
let refreshInProgress = false;
let refreshPromise: Promise<any> | null = null;

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    tokenCheckCount++;
    // console.log(`🔍 [Middleware] #${tokenCheckCount} Проверка токена для пути: ${req.path}`);

    // Расширенное логирование для тестирования
    const shouldLog = process.env.NODE_ENV === 'development';

    // Получаем токены из cookies
    const { accessToken, refreshToken } = await AuthService.getTokenFromCookies(req);

    // Логируем для отладки
    // console.log('🔍 [Middleware] Access token из cookie:', accessToken ? 'присутствует' : 'отсутствует');
    // console.log('🔍 [Middleware] Refresh token из cookie:', refreshToken ? 'присутствует' : 'отсутствует');

    if (accessToken) {
      // console.log('🔍 [Middleware] Access token найден, проверяем его валидность...');
      
      // Проверяем время истечения токена ДО его валидации
      try {
        const secret = process.env.JWT_SECRET || 'fallback_secret';
        const decoded = jwt.decode(accessToken) as any;
        
        if (decoded && decoded.exp) {
          const now = Math.floor(Date.now() / 1000);
          const timeUntilExpiry = decoded.exp - now;
          
          // Получаем настройки из БД
          const settings = await AuthSettingsService.getAuthSettings();
          
          // Если автоматическое обновление включено и токен истекает в ближайшее время
          if (settings.middlewareAutoRefreshEnabled && timeUntilExpiry <= settings.middlewareRefreshThresholdSeconds && timeUntilExpiry > 0) {
            console.log(`⚠️  [Middleware] Access token истекает через ${timeUntilExpiry} секунд, обновляем...`);
            
            if (refreshToken) {
              // Проверяем блокировку обновлений
              if (refreshInProgress) {
                console.log('⏭️ [Middleware] Обновление уже в процессе, пропускаем этот запрос (избегаем блокировки пула БД)');
                // НЕ ждем - просто продолжаем с текущим токеном
                // Это избегает исчерпания пула соединений к БД
              } else {
                // Устанавливаем блокировку и начинаем обновление
                refreshInProgress = true;
                console.log('🔒 [Middleware] Установлена блокировка обновления токенов');
                
                refreshPromise = (async () => {
                  try {
                    const refreshResult = await AuthService.refreshToken({ refreshToken });
                    
                    // Устанавливаем новые cookies
                    await AuthService.setAuthCookies(res, refreshResult.token, refreshResult.refreshToken);
                    
                    console.log('✅ [Middleware] Токен успешно обновлен автоматически');
                    
                    // Устанавливаем заголовок для уведомления клиента об обновлении
                    res.setHeader('X-Token-Refreshed', 'true');
                    res.setHeader('X-User-Email', decoded.email || 'unknown');
                    
                    return refreshResult;
                  } catch (refreshError) {
                    console.log('❌ [Middleware] Ошибка автоматического обновления токена:', refreshError.message);
                    throw refreshError;
                  } finally {
                    // Освобождаем блокировку
                    refreshInProgress = false;
                    refreshPromise = null;
                    console.log('🔓 [Middleware] Блокировка обновления токенов снята');
                  }
                })();
                
                // НЕ ждем завершения - запускаем обновление в фоне
                // Продолжаем с текущим токеном, чтобы не блокировать пул БД
              }
            }
          }
        }
      } catch (decodeError) {
        // Если не удалось декодировать токен, продолжаем с обычной валидацией
        console.log('⚠️ [Middleware] Не удалось декодировать токен для проверки времени:', decodeError.message);
      }
    }
    
    if (!accessToken) {
      // Если access token отсутствует, но есть refresh token,
      // это сигнал для клиента, что нужно попытаться обновить токен.
      // Это покрывает случай, когда cookie access token истек.
      if (refreshToken) {
        console.log('⚠️  [Middleware] Access token отсутствует, но refresh token есть. Требуется обновление.');
        return res.status(401).json({
          message: 'Access token required, refresh needed',
          code: 'TOKEN_EXPIRED', // Используем тот же код, что и для истекшего токена
          shouldRefresh: true,
        });
      }

      // Если нет ни access, ни refresh токена, то пользователь не авторизован.
      if (shouldLog) {
        console.log('❌ [Middleware] Access token не найден');
      }
      return res.status(401).json({
        message: 'Access token required. Please login first.',
        code: 'NO_TOKEN',
        details: 'You need to authenticate before accessing this resource'
      });
    }

    const secret = process.env.JWT_SECRET || 'fallback_secret';
    // console.log('🔍 [Middleware] Проверяем access token...');
    const decoded = jwt.verify(accessToken, secret) as JwtPayload;

    // console.log(`👤 [Middleware] Access token валиден для пользователя: ${decoded.email}`);
    // console.log(`🔍 [Middleware] Тип токена: ${decoded.tokenType}`);

    // Проверяем тип токена
    if (decoded.tokenType !== 'access') {
      console.log('❌ [Middleware] Неверный тип токена:', decoded.tokenType);
      return res.status(403).json({
        message: 'Invalid token type',
        code: 'INVALID_TOKEN_TYPE',
        details: 'The provided token is not an access token'
      });
    }
    
    // Рассчитываем оставшееся время жизни токена
    if (decoded.exp) {
      const now = Math.floor(Date.now() / 1000);
      decoded.expiresIn = Math.max(0, decoded.exp - now);
      console.log(`⏱️  [Middleware] Токен истекает через: ${decoded.expiresIn} сек`);
    }
    
    req.user = decoded;

    // console.log(`✅ [Middleware] #${tokenCheckCount} Токен успешно валидирован для ${decoded.email}`);

    // Тихое обновление активности пользователя
    AuthService.updateUserActivity(decoded.userId).catch(() => {});

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.log('⚠️ [Middleware] Access token истек, возвращаем shouldRefresh');
      console.log('🔄 [Middleware] Приложение должно автоматически обновить токен через refresh token');
      return res.status(401).json({
        message: 'Access token expired',
        code: 'TOKEN_EXPIRED',
        shouldRefresh: true,
        details: 'Your session has expired. Token will be automatically refreshed.'
      });
    }

    console.log('❌ [Middleware] Ошибка проверки токена:', error.message);
    if (error.message.includes('invalid signature')) {
      console.log('❌ [Middleware] Неверная подпись токена - возможно, JWT_SECRET изменился');
    } else if (error.message.includes('malformed')) {
      console.log('❌ [Middleware] Поврежденный токен - возможно, ошибка кодирования');
    }

    return res.status(403).json({
      message: 'Invalid token',
      code: 'INVALID_TOKEN',
      details: 'The provided token is malformed or invalid'
    });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        message: 'Authentication required',
        code: 'NO_AUTH',
        details: 'You need to be authenticated to access this resource'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
        details: 'You do not have the required role to access this resource'
      });
    }

    next();
  };
};
