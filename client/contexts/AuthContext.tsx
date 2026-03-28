import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { UserType, LoginRequest, RegisterRequest } from '../../server/types/auth';
import { useEquipment, EquipmentState, EquipmentActions } from '../hooks/useEquipment';
import { LoggingService } from '../services/LoggingService';
import { formatDuration } from '@/lib/formatUtils';
import { ToastService } from '@/services/ToastService';

// Розширений тип користувача з інформацією про час життя токена
interface UserWithExpiry extends Omit<UserType, 'password' | 'refreshToken' | 'refreshTokenExpiresAt'> {
  expiresIn?: number; // Час життя access токена в секундах
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

// Хук для доступу до стану обладнання через AuthContext
export const useEquipmentFromAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useEquipmentFromAuth must be used within an AuthProvider');
  }
  const { equipmentState, equipmentActions } = context;
  return [equipmentState, equipmentActions] as const;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserWithExpiry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimeoutRef = useRef<number | null>(null);

  // Кеш для профілю користувача (5 хвилин)
  const profileCacheRef = useRef<{ data: UserWithExpiry | null; timestamp: number } | null>(null);
  const PROFILE_CACHE_DURATION = 5 * 60 * 1000; // 5 хвилин
  

  // Глобальний стан обладнання — передаємо !!user щоб уникнути запитів до авторизації
  const [equipmentState, equipmentActions] = useEquipment(!!user);
  
  // Перевіряємо, що стан обладнання ініціалізовано
  const isEquipmentReady = equipmentState && equipmentActions;

  // Налаштування авторизації з БД
  const [authSettings, setAuthSettings] = useState<any>(null);

  // Завантажуємо налаштування авторизації
  const loadAuthSettings = async () => {
    try {
      LoggingService.authLog('🔄 [AuthContext] Завантажуємо налаштування авторизації...');
      const response = await fetch('/api/auth/settings', {
        credentials: 'include'
      });

      // LoggingService.authLog(`📡 [AuthContext] Відповідь на запит налаштувань авторизації: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const settings = await response.json();
        LoggingService.authLog('✅ [AuthContext] Налаштування авторизації завантажено:', settings);
        setAuthSettings(settings);
      } else {
        LoggingService.authLog(`⚠️ [AuthContext] Не вдалося завантажити налаштування авторизації: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Помилка завантаження налаштувань авторизації:', error);
      LoggingService.authLog('❌ [AuthContext] Помилка завантаження налаштувань авторизації:', error);
    }
  };

  // Розраховуємо час до закінчення токена на основі expiresIn та налаштувань
  const getRefreshDelay = (expiresIn?: number): number => {
    if (expiresIn) {
      // Використовуємо налаштування з БД або значення за замовчуванням
      const thresholdMinutes = authSettings?.clientRefreshThresholdMinutes || 10;
      const isEnabled = authSettings?.clientAutoRefreshEnabled !== false;
      
      if (!isEnabled) {
        return 24 * 60 * 60 * 1000; // 24 години якщо вимкнено
      }
      
      return Math.max((expiresIn * 1000) - (thresholdMinutes * 60 * 1000), 60000);
    }
    return 50 * 60 * 1000; // За замовчуванням 50 хвилин
  };

  // Функція планування оновлення токена (вийнята окремо для повторного використання)
  const scheduleTokenRefresh = (expiresIn?: number) => {
    // Використовуємо fallback налаштування якщо authSettings ще не завантажені
    const fallbackSettings = {
      clientRefreshThresholdMinutes: 10,
      clientAutoRefreshEnabled: true
    };
    
    const currentSettings = authSettings || fallbackSettings;
    const isEnabled = currentSettings.clientAutoRefreshEnabled !== false;
    
    // LoggingService.authLog('🔧 [AuthContext] scheduleTokenRefresh', { expiresIn, currentSettings, isEnabled });

    if (isEnabled) {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      
      const refreshDelay = getRefreshDelay(expiresIn);
      LoggingService.authLog(`⏰ [AuthContext] Плануємо оновлення токена через ${formatDuration(refreshDelay, { unit: 'ms' })}`);
      
      refreshTimeoutRef.current = window.setTimeout(() => {
        LoggingService.authLog('🔄 [AuthContext] Запускаємо автоматичне оновлення токена');
        refreshToken(); 
      }, refreshDelay);
    } else {
      LoggingService.authLog('⚠️ [AuthContext] Автоматичне оновлення токенів вимкнено в налаштуваннях');
    }
  };

  // Перезавантажуємо налаштування авторизації тільки при зміні користувача (не при першій загрузці)
  const prevUserIdRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (user && prevUserIdRef.current !== undefined && prevUserIdRef.current !== user.id) {
      // Реальна зміна користувача - перезавантажуємо налаштування
      LoggingService.authLog('🔄 [AuthContext] Зміна користувача виявлена, перезавантажуємо налаштування...');
      loadAuthSettings();
    }
    prevUserIdRef.current = user?.id;
  }, [user?.id]);

  // Перевіряємо статус аутентифікації при загрузці з невеликою затримкою
  useEffect(() => {
    const timer = setTimeout(() => {
      // if (process.env.NODE_ENV === 'development') {
        // log('🔄 Перевіряємо статус аутентифікації при загрузці');
      // }
      checkAuthStatus();
    }, 100); // Невелика затримка для запобігання одночасним запитам

    return () => clearTimeout(timer);
  }, []);

  // Розумне оновлення токенів - плануємо оновлення в разі зміни користувача або налаштувань
  const prevTokenRefreshKey = useRef<string>('');
  useEffect(() => {
    if (user) {
      // Створюємо унікальний ключ для запобігання повторного логування
      const currentKey = `${user.id}-${user.expiresIn}-${authSettings?.clientAutoRefreshEnabled}-${authSettings?.middlewareAutoRefreshEnabled}`;
      
      if (prevTokenRefreshKey.current !== currentKey) {
        if (!authSettings) {
          // Якщо налаштування ще не завантажені, плануємо з fallback значеннями
          LoggingService.authLog('👤 Користувач авторизований (налаштування поки не завантажені...) \n🔄 [Fallback] Автооновлення токенів за 10 хвилин до закінчення');
        } else {
          // Якщо налаштування завантажені, плануємо з реальними значеннями
          LoggingService.authLog(`👤 Користувач авторизований і налаштування успішно завантажені! 
🔄 clientAutoRefresh: ${authSettings.clientAutoRefreshEnabled ? 'ON (за ' + authSettings.clientRefreshThresholdMinutes + ' хвилин до закінчення)' : 'OFF'}
🔄 middlewareRefresh: ${authSettings.middlewareAutoRefreshEnabled ? 'ON (за ' + authSettings.middlewareRefreshThresholdSeconds + ' сек до закінчення)' : 'OFF'}
🔄 expiresIn: ${Math.floor(user.expiresIn / 60) > 0 && (Math.floor(user.expiresIn / 60) + 'хв')} ${user.expiresIn % 60} сек`);
        }
        
        prevTokenRefreshKey.current = currentKey;
      }
      
      scheduleTokenRefresh(user.expiresIn);

      return () => {
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
        }
      };
    }
  }, [user, authSettings]);

  // Обробка активності користувача та відновлення сесії
  useEffect(() => {
    if (user) {
      let lastActivityTime = Date.now();

      // Обробник зміни видимості сторінки
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          const timeSinceLastActivity = Date.now() - lastActivityTime;

          // Якщо вкладка була неактивна більше 30 хвилин, перевіряємо токен
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
    // LoggingService.authLog('🔍 [AuthContext] checkAuthStatus called');

    // Перевіряємо кеш профілю
    const now = Date.now();

    // Вимикаємо кеш для коротких токенів (менше 5 хвилин)
    const shouldUseCache = profileCacheRef.current &&
      (now - profileCacheRef.current.timestamp) < PROFILE_CACHE_DURATION &&
      (!profileCacheRef.current.data?.expiresIn || 
       profileCacheRef.current.data.expiresIn >= 300); // 300 секунд = 5 хвилин

    if (shouldUseCache) {
      LoggingService.authLog('📋 [AuthContext] Using cached profile');
      
      // Ініціалізуємо сервіси навіть при використанні кешу
      await LoggingService.initialize();
      await ToastService.initialize();
      
      setUser(profileCacheRef.current.data);
      setIsLoading(false);
      return;
    }

    // Якщо кеш відключений для коротких токенів, логуємо це
    if (profileCacheRef.current && 
        profileCacheRef.current.data?.expiresIn && 
        profileCacheRef.current.data.expiresIn < 300) {
      LoggingService.authLog('🚫 [AuthContext] Cache disabled for short token (expiresIn < 5min)');
    }

    try {
      const response = await fetch('/api/auth/profile', {
        credentials: 'include'
      });

      // LoggingService.authLog('📡 [AuthContext] checkAuthStatus response:', response.status);

      if (response.ok) {
        const userData = await response.json();
        LoggingService.authLog('✅ [AuthContext] checkAuthStatus success');

        // Зберігаємо інформацію про час життя токена
        const userWithExpiry = {
          ...userData,
          expiresIn: userData.expiresIn
        };

        // Зберігаємо в кеш
        profileCacheRef.current = {
          data: userWithExpiry,
          timestamp: now
        };

        // Ініціалізуємо сервіси після успішного отримання профілю
        await LoggingService.initialize();
        await ToastService.initialize();
        await loadAuthSettings();

        // Токен валідний, useEffect автоматично перепланує оновлення під час setUser
        setUser(userWithExpiry);
        
      } else {
        // Якщо отримали 401, пробуємо оновити токен
        if (response.status === 401) {
          LoggingService.authLog('⚠️ [AuthContext] checkAuthStatus: Got 401, attempting token refresh');
          const refreshResult = await refreshToken();
          if (refreshResult) {
            LoggingService.authLog('✅ [AuthContext] checkAuthStatus: Token refreshed successfully');
            // Після успішного оновлення токена, рекурсивно викликаємо checkAuthStatus
            // щоб оновити стан користувача
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
    // log('🔄 Починаємо оновлення токена...');
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include'
      });

      // log(`📡 Відповідь на оновлення токена: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        LoggingService.authLog('✅ Токен успішно оновлено');

        // Перевіряємо, чи було автоматичне оновлення токена в middleware
        const tokenRefreshed = response.headers.get('X-Token-Refreshed');
        const userEmail = response.headers.get('X-User-Email');

        if (tokenRefreshed === 'true' && userEmail) {
          ToastService.tokenRefreshed(userEmail);
        }

        // Оновлюємо інформацію про час життя токена
        if (data.expiresIn && user) {
          const updatedUser = {
            ...user,
            expiresIn: data.expiresIn
          };
          setUser(updatedUser);
        }

        // Токен успішно оновлено, useEffect автоматично перепланує оновлення під час setUser

        return true;
      } else {
        const error = await response.json();
        console.error('❌ Помилка оновлення токена', error);
        
        if (error.message.includes('застарів') || error.message.includes('неактивний')) {
          console.error('❌ Токен застарів або неактивний, виходимо з системи');
          ToastService.refreshError();
          forceLogout();
          return false;
        }
        return false;
      }
    } catch (error) {
      console.error('❌ Помилка оновлення токена:', error);
      console.error('❌ Мережева помилка при оновленні токена', error);
      return false;
    }
  };

  const login = async (credentials: LoginRequest): Promise<boolean> => {
    LoggingService.authLog('🔑 [AuthContext]: Починаємо вхід в систему...', { email: credentials.email });
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(credentials),
      });

      LoggingService.authLog(`📡 [AuthContext]: Відповідь на вхід: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        LoggingService.authLog('✅ [AuthContext]: Успішний вхід, встановлюємо користувача', data.user);

        // Зберігаємо інформацію про час життя токена і оновлюємо стан користувача
        const userWithExpiry = {
          ...data.user,
          expiresIn: data.expiresIn
        };
        // Встановлюємо користувача у стан перед ініціалізацією сервісів,
        // щоб сесійні куки / контекст були доступні для захищених запитів
        setUser(userWithExpiry);

        // Повторно ініціалізуємо LoggingService після встановлення user.
        await LoggingService.initialize();
        await ToastService.initialize();

        LoggingService.authLog('🔄 [AuthContext]: LoggingService переініціалізований після входу');

        // Перезавантажуємо налаштування авторизації
        await loadAuthSettings();

        // Оновлюємо конфігурацію обладнання після авторизації
        if (equipmentActions?.refreshConfig) {
          LoggingService.authLog('🔄 [AuthContext]: Оновлюємо конфігурацію обладнання після входу');
          await equipmentActions.refreshConfig();
        }

        // Показуємо Toast повідомлення
        ToastService.loginSuccess(data.user.email);

        // useEffect автоматично запланує оновлення токена при setUser

        return true;
      } else {
        const error = await response.json();
        console.error('❌ Помилка входу:', error.message);
        throw new Error(error.message || 'Не вдалося увійти');
      }
    } catch (error) {
      console.error('❌ Мережева помилка при вході:', error);
      throw error;
    }
  };

  const register = async (userData: RegisterRequest): Promise<boolean> => {
    LoggingService.authLog('📝 [AuthContext]: Починаємо реєстрацію...', { email: userData.email });
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(userData),
      });

      LoggingService.authLog(`📡 [AuthContext]: Відповідь на реєстрацію: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        LoggingService.authLog('✅ [AuthContext]: Успішна реєстрація, встановлюємо користувача', data.user);

        // Показуємо Toast повідомлення
        ToastService.loginSuccess(data.user.email);

        // Зберігаємо інформацію про час життя токена
        const userWithExpiry = {
          ...data.user,
          expiresIn: data.expiresIn
        };
        setUser(userWithExpiry);
        
        // useEffect автоматически запланирует обновление токена при setUser

        
        return true;
      } else {
        const error = await response.json();
        console.error('❌ Помилка реєстрації:', error.message);
        return false;
      }
    } catch (error) {
      console.error('❌ Мережева помилка при реєстрації:', error);
      return false;
    }
  };

  const logout = async () => {
    LoggingService.authLog('🔚 [AuthContext]: Починаємо вихід з системи...');
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

      LoggingService.authLog('✅ [AuthContext]: Успішний вихід з системи');

      // Показуємо Toast повідомлення
      ToastService.logoutSuccess();
    } catch (error) {
      console.error('❌ Помилка при виході:', error);
    } finally {
      setUser(null);
    }
  };

  const forceLogout = () => {
    LoggingService.authLog('⛔ [AuthContext]: Примусовий вихід з системи');
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
    equipmentState: isEquipmentReady ? equipmentState : null,
    equipmentActions: isEquipmentReady ? equipmentActions : null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};