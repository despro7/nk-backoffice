import { useCallback } from 'react';
import { useAuth } from '../contexts/auth-context';
import { LoggingService } from '../services/LoggingService';

export const useApi = () => {
  const { refreshToken, forceLogout } = useAuth();

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

      // Если получили 401, пробуем обновить токен и повторить запрос
      if (response.status === 401) {
        LoggingService.apiLog(`🔐 Received 401, attempting token refresh...`);
        const errorData = await response.json().catch(() => ({}));

        // Сесію відкликано: refresh не допоможе
        if (errorData.code === 'SESSION_REVOKED') {
          LoggingService.apiLog(`⛔ Session revoked, forcing logout`);
          forceLogout();
          throw new Error('Сесію завершено. Увійдіть знову.');
        }

        // Если это expired токен, пробуем обновить
        if (errorData.shouldRefresh || errorData.code === 'TOKEN_EXPIRED') {
          LoggingService.apiLog(`🔄 Token expired, refreshing...`);
          const refreshSuccess = await refreshToken();

          if (refreshSuccess) {
            LoggingService.apiLog(`✅ Token refreshed successfully`);

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
            // Вихід за мертвої сесії робить сам refreshToken; мережевий збій не розлогінює
            LoggingService.apiLog(`❌ Token refresh failed`);
            throw new Error('Не вдалося оновити сесію. Спробуйте ще раз.');
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
  }, [forceLogout, refreshToken]);

  return { apiCall };
};
