import { useAuth } from '../contexts/AuthContext';

export const useApi = () => {
  const { refreshToken, forceLogout, checkAuthStatus } = useAuth();

  const apiCall = async (url: string, options: RequestInit = {}) => {
    const startTime = Date.now();
    const method = options.method || 'GET';
    // console.log(`🚀 [CLIENT] useApi: Starting ${method} request to ${url}`);

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
      // console.log(`📨 [CLIENT] useApi: ${method} ${url} -> Status: ${response.status} (${responseTime}ms)`);

      // Проверяем, был ли токен обновлен автоматически (через заголовки)
      if (response.status === 200) {
        const tokenRefreshed = response.headers.get('X-Token-Refreshed');
        if (tokenRefreshed === 'true') {
          console.log('✅ [CLIENT] useApi: Token was refreshed automatically by server');
          // Обновляем статус аутентификации в контексте
          await checkAuthStatus();
          // Возвращаем оригинальный ответ (токен уже обновлен в cookies)
          return response;
        }
      }

      // Если получили 401, пробуем обновить токен и повторить запрос
      if (response.status === 401) {
        // console.log(`🔐 [CLIENT] useApi: Received 401, attempting token refresh...`);
        const errorData = await response.json().catch(() => ({}));

        // Если это expired токен, пробуем обновить
        if (errorData.shouldRefresh || errorData.code === 'TOKEN_EXPIRED') {
          // console.log(`🔄 [CLIENT] useApi: Token expired, refreshing...`);
          const refreshSuccess = await refreshToken();

          if (refreshSuccess) {
            // console.log(`✅ [CLIENT] useApi: Token refreshed successfully, updating auth status...`);
            // Обновляем статус аутентификации в контексте
            // console.log(`🔄 [CLIENT] useApi: Calling checkAuthStatus...`);
            await checkAuthStatus();
            // console.log(`🎯 [CLIENT] useApi: checkAuthStatus completed`);

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
            // console.log(`🔁 [CLIENT] useApi: Retry ${method} ${url} -> Status: ${retryResponse.status} (${retryTime}ms)`);
            return retryResponse;
          } else {
            // Не удалось обновить токен, выходим из системы
            console.error(`❌ [CLIENT] useApi: Token refresh failed, forcing logout`);
            forceLogout();
            throw new Error('Сесія закінчилася. Будь ласка, увійдіть знову.');
          }
        } else {
          // Другие 401 ошибки (неверные учетные данные)
          console.error(`❌ [CLIENT] useApi: 401 error, not token related, forcing logout`);
          forceLogout();
          throw new Error('Потрібна авторизація');
        }
      }

      return response;
    } catch (error) {
      const errorTime = Date.now() - startTime;
      console.error(`❌ [CLIENT] useApi: Request failed after ${errorTime}ms:`, error);
      throw error;
    }
  };

  return { apiCall };
};
