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
  const refreshTimeoutRef = useRef<number | null>(null);

  // Кеш для профиля пользователя (5 минут)
  const profileCacheRef = useRef<{ data: UserWithExpiry | null; timestamp: number } | null>(null);
  const PROFILE_CACHE_DURATION = 5 * 60 * 1000; // 5 минут
  

  // Глобальное состояние оборудования
  const [equipmentState, equipmentActions] = useEquipment();

  // Настройки авторизации из БД
  const [authSettings, setAuthSettings] = useState<any>(null);

  // Загружаем настройки авторизации
  const loadAuthSettings = async () => {
    try {
      const response = await fetch('/api/auth/settings', {
        credentials: 'include'
      });
      if (response.ok) {
        const settings = await response.json();
        setAuthSettings(settings);
      }
    } catch (error) {
      console.error('❌ Ошибка загрузки настроек авторизации:', error);
    }
  };

  // Рассчитываем время до истечения токена на основе expiresIn и настроек
  const getRefreshDelay = (expiresIn?: number): number => {
    if (expiresIn) {
      // Используем настройки из БД или значения по умолчанию
      const thresholdMinutes = authSettings?.clientRefreshThresholdMinutes || 10;
      const isEnabled = authSettings?.clientAutoRefreshEnabled !== false;
      
      if (!isEnabled) {
        return 24 * 60 * 60 * 1000; // 24 часа если отключено
      }
      
      return Math.max((expiresIn * 1000) - (thresholdMinutes * 60 * 1000), 60000);
    }
    return 50 * 60 * 1000; // По умолчанию 50 минут
  };

  // Функция планирования обновления токена (вынесена отдельно для переиспользования)
  const scheduleTokenRefresh = (expiresIn?: number) => {
    // Используем fallback настройки если authSettings еще не загружены
    const fallbackSettings = {
      clientRefreshThresholdMinutes: 10,
      clientAutoRefreshEnabled: true
    };
    
    const currentSettings = authSettings || fallbackSettings;
    const isEnabled = currentSettings.clientAutoRefreshEnabled !== false;
    
    log('🔧 [AuthContext] scheduleTokenRefresh', { expiresIn, currentSettings, isEnabled });
    
    if (isEnabled) {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      
      const refreshDelay = getRefreshDelay(expiresIn);
      log(`⏰ [AuthContext] Планируем обновление токена через ${refreshDelay / 1000} секунд`);
      
      refreshTimeoutRef.current = window.setTimeout(() => {
        log('🔄 [AuthContext] Запускаем автоматическое обновление токена');
        refreshToken();
      }, refreshDelay);
    } else {
      log('⚠️ [AuthContext] Автоматическое обновление токенов отключено в настройках');
    }
  };

  // Загружаем настройки авторизации при инициализации
  useEffect(() => {
    loadAuthSettings();
  }, []);

  // Проверяем статус аутентификации при загрузке с небольшой задержкой
  useEffect(() => {
    const timer = setTimeout(() => {
      // if (process.env.NODE_ENV === 'development') {
        // log('🔄 Проверяем статус аутентификации при загрузке');
      // }
      checkAuthStatus();
    }, 100); // Небольшая задержка для предотвращения одновременных запросов

    return () => clearTimeout(timer);
  }, []);

  // Умное обновление токенов - планируем обновление при изменении пользователя или настроек
  useEffect(() => {
    if (user) {
      if (!authSettings) {
        // Если настройки еще не загружены, планируем с fallback значениями
        log('👤 Пользователь авторизован, планируем обновление токенов (настройки загружаются...)');
      } else {
        // Если настройки загружены, планируем с реальными значениями
        log('👤⚙️ Пользователь авторизован и настройки загружены, планируем обновление токенов');
      }
      
      scheduleTokenRefresh(user.expiresIn);

      return () => {
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
        }
      };
    }
  }, [user, authSettings]);

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
    // if (process.env.NODE_ENV === 'development') {
      // console.log('🔍 [AuthContext] checkAuthStatus called');
    // }

    // Проверяем кеш профиля
    const now = Date.now();
    
    // Отключаем кеш для коротких токенов (меньше 5 минут)
    const shouldUseCache = profileCacheRef.current &&
      (now - profileCacheRef.current.timestamp) < PROFILE_CACHE_DURATION &&
      (!profileCacheRef.current.data?.expiresIn || 
       profileCacheRef.current.data.expiresIn >= 300); // 300 секунд = 5 минут

    if (shouldUseCache) {
      if (process.env.NODE_ENV === 'development') {
        console.log('📋 [AuthContext] Using cached profile');
      }
      setUser(profileCacheRef.current.data);
      setIsLoading(false);
      return;
    }

    // Если кеш отключен для коротких токенов, логируем это
    if (profileCacheRef.current && 
        profileCacheRef.current.data?.expiresIn && 
        profileCacheRef.current.data.expiresIn < 300) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🚫 [AuthContext] Cache disabled for short token (expiresIn < 5min)');
      }
    }

    try {
      const response = await fetch('/api/auth/profile', {
        credentials: 'include'
      });

      // if (process.env.NODE_ENV === 'development') {
        // console.log('📡 [AuthContext] checkAuthStatus response:', response.status);
      // }

      if (response.ok) {
        const userData = await response.json();
        // if (process.env.NODE_ENV === 'development') {
          // console.log('✅ [AuthContext] checkAuthStatus success');
        // }

        // Сохраняем информацию о времени жизни токена
        const userWithExpiry = {
          ...userData,
          expiresIn: userData.expiresIn
        };

        // Сохраняем в кеш
        profileCacheRef.current = {
          data: userWithExpiry,
          timestamp: now
        };

        setUser(userWithExpiry);
        // if (process.env.NODE_ENV === 'development') {
          // console.log('👤 [AuthContext] User state updated');
        // }
        
        // Токен валиден, useEffect автоматически перепланирует обновление при setUser
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
    // log('🔄 Начинаем обновление токена...');
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include'
      });

      // log(`📡 Ответ на обновление токена: ${response.status} ${response.statusText}`);

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
        
        // Токен обновлен успешно, useEffect автоматически перепланирует обновление при setUser
        
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
        
        // useEffect автоматически запланирует обновление токена при setUser
        
        return true;
      } else {
        const error = await response.json();
        console.error('❌ Ошибка входа:', error.message);
        throw new Error(error.message || 'Не вдалося увійти');
      }
    } catch (error) {
      console.error('❌ Ошибка сети при входе:', error);
      throw error;
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
        
        // useEffect автоматически запланирует обновление токена при setUser

        
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
    if (process.env.NODE_ENV === 'development') {
      log('🚪 Начинаем выход из системы...');
    }
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

      // Очищаем кеш профиля
      profileCacheRef.current = null;

      if (process.env.NODE_ENV === 'development') {
        log('✅ Успешный выход из системы');
      }

      // Показываем Toast уведомление
      ToastService.logoutSuccess();
    } catch (error) {
      console.error('❌ Ошибка при выходе:', error);
    } finally {
      setUser(null);
    }
  };

  const forceLogout = () => {
    if (process.env.NODE_ENV === 'development') {
      log('🔄 Принудительный выход из системы');
    }
    // Очищаем таймер обновления токена
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }

    // Очищаем кеш профиля
    profileCacheRef.current = null;

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