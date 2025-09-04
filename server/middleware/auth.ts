import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types/auth.js';
import { AuthService } from '../services/authService.js';

// Расширяем интерфейс Request для добавления пользователя
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('🔐 [Middleware] Проверяем токен доступа...');
    
    // Получаем токены из cookies
    const { accessToken, refreshToken } = await AuthService.getTokenFromCookies(req);
    
    // Если нет access token, но есть refresh token - пытаемся обновить
    if (!accessToken && refreshToken) {
      console.log('🔄 [Middleware] Access token отсутствует, пытаемся обновить через refresh token...');
      
      try {
        const refreshResult = await AuthService.refreshToken({ refreshToken });
        
        // Устанавливаем новые cookies
        await AuthService.setAuthCookies(res, refreshResult.token, refreshResult.refreshToken);
        console.log('✅ [Middleware] Токены обновлены, используем новый access token');
        
        // Используем новый access token
        const secret = process.env.JWT_SECRET || 'fallback_secret';
        const decoded = jwt.verify(refreshResult.token, secret) as JwtPayload;
        
        req.user = decoded;
        console.log(`👤 [Middleware] Пользователь авторизован после refresh: ${decoded.email} (ID: ${decoded.userId})`);
        
        // Обновляем активность пользователя
        try {
          await AuthService.updateUserActivity(decoded.userId);
          console.log('✅ [Middleware] Активность пользователя обновлена');
        } catch (error) {
          console.error('❌ [Middleware] Failed to update user activity:', error);
        }
        
        return next();
      } catch (refreshError) {
        console.log('❌ [Middleware] Не удалось обновить токен:', refreshError);
              return res.status(401).json({
        message: 'Session expired. Please login again.',
        code: 'REFRESH_FAILED',
        shouldRefresh: false
      });
      }
    }
    
    if (!accessToken) {
      console.log('❌ [Middleware] Access token не найден в cookies и нет refresh token');
      return res.status(401).json({
        message: 'Access token required. Please login first.',
        code: 'NO_TOKEN',
        details: 'You need to authenticate before accessing this resource'
      });
    }

    console.log('✅ [Middleware] Access token найден в cookies, проверяем...');
    
    const secret = process.env.JWT_SECRET || 'fallback_secret';
    const decoded = jwt.verify(accessToken, secret) as JwtPayload;
    
    console.log(`👤 [Middleware] Токен декодирован, пользователь: ${decoded.email} (ID: ${decoded.userId})`);
    
    // Проверяем тип токена
    if (decoded.tokenType !== 'access') {
      console.log('❌ [Middleware] Неверный тип токена:', decoded.tokenType);
      return res.status(403).json({
        message: 'Invalid token type',
        code: 'INVALID_TOKEN_TYPE',
        details: 'The provided token is not an access token'
      });
    }
    
    req.user = decoded;
    console.log('✅ [Middleware] Токен валиден, пропускаем запрос');
    
    // Обновляем активность пользователя
    try {
      await AuthService.updateUserActivity(decoded.userId);
      console.log('✅ [Middleware] Активность пользователя обновлена');
    } catch (error) {
      console.error('❌ [Middleware] Failed to update user activity:', error);
    }
    
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      console.log('⚠️ [Middleware] Токен истек, возвращаем shouldRefresh');
      return res.status(401).json({
        message: 'Access token expired',
        code: 'TOKEN_EXPIRED',
        shouldRefresh: true,
        details: 'Your session has expired. Token will be automatically refreshed.'
      });
    }
    
    console.log('❌ [Middleware] Ошибка проверки токена:', error);
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
