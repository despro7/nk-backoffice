import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LoggingService } from '../services/LoggingService';

export const useApi = () => {
  const { refreshToken, forceLogout, checkAuthStatus } = useAuth();

  const apiCall = useCallback(async (url: string, options: RequestInit = {}) => {
    const startTime = Date.now();
    const method = options.method || 'GET';
    LoggingService.apiLog(`🚀 Starting ${method} request to ${url}`);

    try {
      const response = await fetch(url, {
        ...options,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const responseTime = Date.now() - startTime;
      LoggingService.apiLog(`📨 ${method} ${url} -> Status: ${response.status}`);
      LoggingService.perfLog(`⚡ Request time: ${responseTime}ms`);

      // Проверяем, был ли токен обновлен автоматически (через заголовки)
      if (response.status === 200) {
        const tokenRefreshed = response.headers.get('X-Token-Refreshed');
        if (tokenRefreshed === 'true') {
          LoggingService.apiLog('✅ Token was refreshed automatically by server');
          // Обновляем статус аутентификации в контексте
          await checkAuthStatus();
          // Возвращаем оригинальный ответ (токен уже обновлен в cookies)
          return response;
        }
      }

      // Если получили 401, пробуем обновить токен и повторить запрос
      if (response.status === 401) {
        LoggingService.apiLog(`🔐 Received 401, attempting token refresh...`);
        const errorData = await response.json().catch(() => ({}));

        // Если это expired токен, пробуем обновить
        if (errorData.shouldRefresh || errorData.code === 'TOKEN_EXPIRED') {
          LoggingService.apiLog(`🔄 Token expired, refreshing...`);
          const refreshSuccess = await refreshToken();

          if (refreshSuccess) {
            LoggingService.apiLog(`✅ Token refreshed successfully, updating auth status...`);
            // Обновляем статус аутентификации в контексте
            LoggingService.debugLog(`🔄 Calling checkAuthStatus...`);
            await checkAuthStatus();
            LoggingService.debugLog(`🎯 checkAuthStatus completed`);

            // Повторяем оригинальный запрос с новым токеном
            const retryResponse = await fetch(url, {
              ...options,
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                ...options.headers,
              },
            });

            const retryTime = Date.now() - startTime;
            LoggingService.apiLog(`🔁 Retry ${method} ${url} -> Status: ${retryResponse.status}`);
            LoggingService.perfLog(`⚡ Total retry time: ${retryTime}ms`);
            return retryResponse;
          } else {
            // Не удалось обновить токен, выходим из системы
            LoggingService.apiLog(`❌ Token refresh failed, forcing logout`);
            forceLogout();
            throw new Error('Сесія закінчилася. Будь ласка, увійдіть знову.');
          }
        } else {
          // Другие 401 ошибки (неверные учетные данные)
          LoggingService.apiLog(`❌ 401 error, not token related, forcing logout`);
          forceLogout();
          throw new Error('Потрібна авторизація');
        }
      }

      return response;
    } catch (error) {
      const errorTime = Date.now() - startTime;
      LoggingService.apiLog(`❌ Request failed after ${errorTime}ms:`, error);
      LoggingService.perfLog(`❌ Failed request time: ${errorTime}ms`);
      throw error;
    }
  }, [checkAuthStatus, forceLogout, refreshToken]);

  return { apiCall };
};
