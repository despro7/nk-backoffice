import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { UserType, LoginRequest, RegisterRequest } from '../../server/types/auth';
import { log } from '@/lib/utils';
import { useEquipment, EquipmentState, EquipmentActions } from '../hooks/useEquipment';
import { ToastService } from '../services/ToastService';

// Расширенный тип пользователя с информацией о времени жизни токена
interface UserWithExpiry extends Omit<UserType, 'password' | 'refreshToken' | 'refreshTokenExpiresAt'> {
  expiresIn?: number; // Время жизни access токена в секундах
}

interface AuthContextType {
  user: UserWithExpiry | null;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<boolean>;
  register: (userData: RegisterRequest) => Promise<boolean>;
  logout: () => Promise<void>;
  forceLogout: () => void;
  refreshToken: () => Promise<boolean>;
  checkAuthStatus: () => Promise<void>;
  equipmentState: EquipmentState;
  equipmentActions: EquipmentActions;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Хук для доступа к состоянию оборудования через AuthContext
export const useEquipmentFromAuth = () => {
  const { equipmentState, equipmentActions } = useAuth();
  return [equipmentState, equipmentActions] as const;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserWithExpiry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Глобальное состояние оборудования
  const [equipmentState, equipmentActions] = useEquipment();

  // Рассчитываем время до истечения токена на основе expiresIn
  const getRefreshDelay = (expiresIn?: number): number => {
    if (expiresIn) {
      return Math.max((expiresIn * 1000) - (5 * 60 * 1000), 60000);
    }
    return 55 * 60 * 1000; // По умолчанию 55 минут
  };

  // Проверяем статус аутентификации при загрузке
  useEffect(() => {
    log('🔄 Проверяем статус аутентификации при загрузке');
    checkAuthStatus();
  }, []);

  // Умное обновление токенов - обновляем за 5 минут до истечения (тестовый режим)
  useEffect(() => {
    if (user) {
      log('👤 Пользователь авторизован, настраиваем обновление токенов');
      
      // Обновляем токен за 5 минут до истечения
      const scheduleTokenRefresh = (expiresIn?: number) => {
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
        }
        
        const refreshDelay = getRefreshDelay(expiresIn);
        refreshTimeoutRef.current = setTimeout(() => {
          refreshToken();
        }, refreshDelay);
      };

      scheduleTokenRefresh(user.expiresIn);

      return () => {
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
        }
      };
    }
  }, [user]);

  // Обработка активности пользователя и восстановление сессии
  useEffect(() => {
    if (user) {
      let lastActivityTime = Date.now();

      // Обработчик изменения видимости страницы
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          const timeSinceLastActivity = Date.now() - lastActivityTime;
          
          // Если вкладка была неактивна более 30 минут, проверяем токен
          if (timeSinceLastActivity > 30 * 60 * 1000) {
            checkAuthStatus();
          }
        }
      };

      // Обработчики активности пользователя
      const updateActivity = () => {
        const now = Date.now();
        lastActivityTime = now;
      };

      const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
      events.forEach(event => {
        document.addEventListener(event, updateActivity, true);
      });

      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        events.forEach(event => {
          document.removeEventListener(event, updateActivity, true);
        });
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [user]);

  const checkAuthStatus = async () => {
    console.log('🔍 [AuthContext] checkAuthStatus called');
    try {
      const response = await fetch('/api/auth/profile', {
        credentials: 'include'
      });

      console.log('📡 [AuthContext] checkAuthStatus response:', response.status);

      if (response.ok) {
        const userData = await response.json();
        console.log('✅ [AuthContext] checkAuthStatus success, userData:', userData);

        // Сохраняем информацию о времени жизни токена
        const userWithExpiry = {
          ...userData,
          expiresIn: userData.expiresIn
        };
        setUser(userWithExpiry);
        console.log('👤 [AuthContext] User state updated:', userWithExpiry);
        
        // Если токен валиден, планируем следующее обновление
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
        }
        
        // Используем информацию о времени жизни токена для планирования
        const refreshDelay = userData.expiresIn ? 
          getRefreshDelay(userData.expiresIn) : 
          60000;
        
        refreshTimeoutRef.current = setTimeout(() => {
          refreshToken();
        }, refreshDelay);
      } else {
        // Если получили 401, пробуем обновить токен
        if (response.status === 401) {
          console.log('⚠️ [AuthContext] checkAuthStatus: Got 401, attempting token refresh');
          const refreshResult = await refreshToken();
          if (refreshResult) {
            console.log('✅ [AuthContext] checkAuthStatus: Token refreshed successfully');
            // После успешного обновления токена, рекурсивно вызываем checkAuthStatus
            // чтобы обновить состояние пользователя
            return checkAuthStatus();
          } else {
            console.error('❌ [AuthContext] checkAuthStatus: Token refresh failed, logging out');
            setUser(null);
          }
        } else {
          console.error(`❌ [AuthContext] checkAuthStatus: Error ${response.status}, logging out`);
          setUser(null);
        }
      }
    } catch (error) {
      console.error('❌ Ошибка проверки статуса аутентификации:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshToken = async (): Promise<boolean> => {
    log('🔄 Начинаем обновление токена...');
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include'
      });

      log(`📡 Ответ на обновление токена: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        log('✅ Токен успешно обновлен');

        // Проверяем, было ли автоматическое обновление токена в middleware
        const tokenRefreshed = response.headers.get('X-Token-Refreshed');
        const userEmail = response.headers.get('X-User-Email');

        if (tokenRefreshed === 'true' && userEmail) {
          ToastService.tokenRefreshed(userEmail);
        }

        // Обновляем информацию о времени жизни токена
        if (data.expiresIn && user) {
          const updatedUser = {
            ...user,
            expiresIn: data.expiresIn
          };
          setUser(updatedUser);
        }
        
        // Токен обновлен успешно, планируем следующее обновление
        if (refreshTimeoutRef.current) {
          log('🔧 refreshTimeoutRef', refreshTimeoutRef);
          log('🔧 refreshTimeoutRef.current', refreshTimeoutRef.current);
          clearTimeout(refreshTimeoutRef.current);
          log('🔧 Следующее обновление токенов', refreshTimeoutRef.current);
        }
        
        // Используем информацию о времени жизни токена для планирования
        const refreshDelay = data.expiresIn ? getRefreshDelay(data.expiresIn) : 60000;
        refreshTimeoutRef.current = setTimeout(() => refreshToken(), refreshDelay);
        
        return true;
      } else {
        const error = await response.json();
        console.error('❌ Ошибка обновления токена', error);
        
        if (error.message.includes('застарів') || error.message.includes('неактивний')) {
          console.error('❌ Токен устарел или неактивен, выходим из системы');
          ToastService.refreshError();
          forceLogout();
          return false;
        }
        return false;
      }
    } catch (error) {
      console.error('❌ Ошибка обновления токена:', error);
      console.error('❌ Сетевая ошибка при обновлении токена', error);
      return false;
    }
  };

  const login = async (credentials: LoginRequest): Promise<boolean> => {
    log('🔑 Начинаем вход в систему...', { email: credentials.email });
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(credentials),
      });

      log(`📡 Ответ на вход: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        log('✅ Успешный вход, устанавливаем пользователя', data.user);

        // Показываем Toast уведомление
        ToastService.loginSuccess(data.user.email);

        // Сохраняем информацию о времени жизни токена
        const userWithExpiry = {
          ...data.user,
          expiresIn: data.expiresIn
        };
        setUser(userWithExpiry);
        
        // Планируем обновление токена
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
        }
        
        // Используем информацию о времени жизни токена для планирования
        const refreshDelay = data.expiresIn ? getRefreshDelay(data.expiresIn) : 60000;
        refreshTimeoutRef.current = setTimeout(() => refreshToken(), refreshDelay);
        
        return true;
      } else {
        const error = await response.json();
        console.error('❌ Ошибка входа:', error.message);
        return false;
      }
    } catch (error) {
      console.error('❌ Ошибка сети при входе:', error);
      return false;
    }
  };

  const register = async (userData: RegisterRequest): Promise<boolean> => {
    log('📝 Начинаем регистрацию...', { email: userData.email });
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(userData),
      });

      log(`📡 Ответ на регистрацию: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        log('✅ Успешная регистрация, устанавливаем пользователя', data.user);

        // Показываем Toast уведомление
        ToastService.loginSuccess(data.user.email);

        // Сохраняем информацию о времени жизни токена
        const userWithExpiry = {
          ...data.user,
          expiresIn: data.expiresIn
        };
        setUser(userWithExpiry);
        
        // Планируем обновление токена
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
        }
        
        // Используем информацию о времени жизни токена для планирования
        const refreshDelay = data.expiresIn ? getRefreshDelay(data.expiresIn) : 60000;
        refreshTimeoutRef.current = setTimeout(() => refreshToken(), refreshDelay);

        
        return true;
      } else {
        const error = await response.json();
        console.error('❌ Ошибка регистрации:', error.message);
        return false;
      }
    } catch (error) {
      console.error('❌ Ошибка сети при регистрации:', error);
      return false;
    }
  };

  const logout = async () => {
    log('🚪 Начинаем выход из системы...');
    try {
      // Очищаем таймер обновления токена
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }

      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
      log('✅ Успешный выход из системы');

      // Показываем Toast уведомление
      ToastService.logoutSuccess();
    } catch (error) {
      console.error('❌ Ошибка при выходе:', error);
    } finally {
      setUser(null);
    }
  };

  const forceLogout = () => {
    log('🔄 Принудительный выход из системы');
    // Очищаем таймер обновления токена
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    isLoading,
    login,
    register,
    logout,
    forceLogout,
    refreshToken,
    checkAuthStatus,
    equipmentState,
    equipmentActions,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};