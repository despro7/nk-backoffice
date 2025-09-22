import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useApi } from '../hooks/useApi';
import { Button } from '@heroui/react';

const SettingsTestAuth: React.FC = () => {
  const { user, logout, refreshToken } = useAuth();
  const { apiCall } = useApi();
  const [tokenInfo, setTokenInfo] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [logs, setLogs] = useState<string[]>([]);
  const [tokenExpiryInfo, setTokenExpiryInfo] = useState<any>(null);
  const [tokenCreatedAt, setTokenCreatedAt] = useState<number | null>(null);
  const [refreshCountdown, setRefreshCountdown] = useState<number | null>(null);
  const [authSettings, setAuthSettings] = useState<any>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Обновляем время каждую секунду
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Функция автоскролла логов
  const scrollLogsToBottom = () => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  };

  // Добавляем лог
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  // Загружаем настройки авторизации
  const loadAuthSettings = async () => {
    try {
      const response = await fetch('/api/auth/settings', {
        credentials: 'include'
      });
      if (response.ok) {
        const settings = await response.json();
        setAuthSettings(settings);
        addLog(`⚙️ ExpiresIn: ${settings.accessTokenExpiresIn} |  clientRefresh: ${settings.clientRefreshThresholdMinutes}м |  middlewareRefres: ${settings.middlewareRefreshThresholdSeconds}с`);
      } else {
        addLog(`❌ Ошибка загрузки настроек: ${response.status}`);
      }
    } catch (error) {
      addLog(`❌ Ошибка загрузки настроек: ${error.message}`);
    }
  };

  // Автоскролл при добавлении новых логов
  useEffect(() => {
    scrollLogsToBottom();
  }, [logs]);

  // Получаем информацию о времени истечения токена
  const getTokenExpiryInfo = () => {
    if (user?.expiresIn && tokenCreatedAt) {
      const now = Date.now();
      const expiresAt = tokenCreatedAt + (user.expiresIn * 1000);
      const timeLeft = Math.max(0, expiresAt - now);
      const minutesLeft = Math.floor(timeLeft / 60000);
      const secondsLeft = Math.floor((timeLeft % 60000) / 1000);
      
      // Рассчитываем прогресс для жизненного цикла токена
      const totalLifetime = user.expiresIn * 1000;
      const elapsed = totalLifetime - timeLeft;
      
      // Рассчитываем время до обновления токена
      // Используем реальные настройки из БД
      const clientRefreshThresholdMinutes = authSettings?.clientRefreshThresholdMinutes || 10;
      const middlewareRefreshThresholdSeconds = authSettings?.middlewareRefreshThresholdSeconds || 300;
      
      // Используем clientRefreshThresholdMinutes для всех токенов
      const refreshThresholdMinutes = clientRefreshThresholdMinutes;
        
      const refreshAt = expiresAt - (refreshThresholdMinutes * 60 * 1000);
      const timeToRefresh = Math.max(0, refreshAt - now);
      const refreshMinutesLeft = Math.floor(timeToRefresh / 60000);
      const refreshSecondsLeft = Math.floor((timeToRefresh % 60000) / 1000);
      
      // Для коротких токенов (меньше 10 минут) используем упрощенную логику
      let progressPercentage;
      let currentStage = 1;
      
      if (totalLifetime < 10 * 60 * 1000) {
        // Для коротких токенов: используем clientRefreshThresholdMinutes для определения этапов
        const clientThresholdMs = clientRefreshThresholdMinutes * 60 * 1000;
        const middlewareThresholdMs = middlewareRefreshThresholdSeconds * 1000;
        const refreshPoint = (totalLifetime - clientThresholdMs) / totalLifetime * 100;
        const middlewarePoint = (totalLifetime - middlewareThresholdMs) / totalLifetime * 100;
        
        if (elapsed < (totalLifetime - clientThresholdMs)) {
          // Этап 1: Движение к точке обновления AuthContext
          progressPercentage = (elapsed / (totalLifetime - clientThresholdMs)) * refreshPoint;
          currentStage = 1;
        } else if (elapsed < (totalLifetime - middlewareThresholdMs)) {
          // Этап 2: Движение к точке проверки Middleware (если AuthContext пропустил)
          const stage2Start = totalLifetime - clientThresholdMs;
          const stage2End = totalLifetime - middlewareThresholdMs;
          const stage2Progress = (elapsed - stage2Start) / (stage2End - stage2Start);
          progressPercentage = refreshPoint + (stage2Progress * (middlewarePoint - refreshPoint));
          currentStage = 2;
        } else {
          // Этап 3: Движение к истечению токена
          const stage3Start = totalLifetime - middlewareThresholdMs;
          const stage3Progress = (elapsed - stage3Start) / middlewareThresholdMs;
          progressPercentage = middlewarePoint + (stage3Progress * (100 - middlewarePoint));
          currentStage = 3;
        }
      } else {
        // Для длинных токенов: используем полную логику с точками обновления
        const refreshPoint = (totalLifetime - (refreshThresholdMinutes * 60 * 1000)) / totalLifetime * 100;
        const middlewarePoint = (totalLifetime - (middlewareRefreshThresholdSeconds * 1000)) / totalLifetime * 100;
        
        if (elapsed < (totalLifetime - (refreshThresholdMinutes * 60 * 1000))) {
          // Этап 1: Движение к точке обновления AuthContext
          progressPercentage = (elapsed / (totalLifetime - (refreshThresholdMinutes * 60 * 1000))) * refreshPoint;
          currentStage = 1;
        } else if (elapsed < (totalLifetime - (middlewareRefreshThresholdSeconds * 1000))) {
          // Этап 2: Движение к точке проверки Middleware (если AuthContext пропустил)
          const stage2Start = totalLifetime - (refreshThresholdMinutes * 60 * 1000);
          const stage2End = totalLifetime - (middlewareRefreshThresholdSeconds * 1000);
          const stage2Progress = (elapsed - stage2Start) / (stage2End - stage2Start);
          progressPercentage = refreshPoint + (stage2Progress * (middlewarePoint - refreshPoint));
          currentStage = 2;
        } else {
          // Этап 3: Движение к истечению токена
          const stage3Start = totalLifetime - (middlewareRefreshThresholdSeconds * 1000);
          const stage3Progress = (elapsed - stage3Start) / (middlewareRefreshThresholdSeconds * 1000);
          progressPercentage = middlewarePoint + (stage3Progress * (100 - middlewarePoint));
          currentStage = 3;
        }
      }
      
      // Вычисляем позиции этапов в процентах
      const clientThresholdMs = clientRefreshThresholdMinutes * 60 * 1000;
      const middlewareThresholdMs = middlewareRefreshThresholdSeconds * 1000;
      
      const stage1Position = 0; // Начало
      const stage2Position = ((totalLifetime - clientThresholdMs) / totalLifetime) * 100;
      const stage3Position = ((totalLifetime - middlewareThresholdMs) / totalLifetime) * 100;
      const stage4Position = 100; // Конец

      // Вычисляем время до каждого этапа
      const timeToStage2 = Math.max(0, clientThresholdMs - timeLeft);
      const timeToStage3 = Math.max(0, middlewareThresholdMs - timeLeft);
      const timeToStage4 = timeLeft; // Время до истечения

      setTokenExpiryInfo({
        expiresIn: user.expiresIn,
        timeLeft: timeLeft,
        minutesLeft,
        secondsLeft,
        expiresAt: new Date(expiresAt).toLocaleTimeString(),
        progressPercentage: Math.max(0, Math.min(100, progressPercentage)),
        currentStage,
        refreshMinutesLeft,
        refreshSecondsLeft,
        timeToRefresh,
        stagePositions: {
          stage1: stage1Position,
          stage2: stage2Position,
          stage3: stage3Position,
          stage4: stage4Position
        },
        stageTimes: {
          stage2: {
            minutes: Math.floor(timeToStage2 / 60000),
            seconds: Math.floor((timeToStage2 % 60000) / 1000)
          },
          stage3: {
            minutes: Math.floor(timeToStage3 / 60000),
            seconds: Math.floor((timeToStage3 % 60000) / 1000)
          },
          stage4: {
            minutes: Math.floor(timeToStage4 / 60000),
            seconds: Math.floor((timeToStage4 % 60000) / 1000)
          }
        }
      });
      
      // Обновляем таймер обратного отсчёта до обновления
      if (timeToRefresh > 0) {
        setRefreshCountdown(timeToRefresh);
      } else {
        setRefreshCountdown(null);
      }
    } else {
      // Если нет информации о токене, показываем пустое состояние
      setTokenExpiryInfo(null);
      setRefreshCountdown(null);
    }
  };

  // Обновляем информацию о токене каждую секунду
  useEffect(() => {
    getTokenExpiryInfo();
    const interval = setInterval(getTokenExpiryInfo, 1000);
    return () => clearInterval(interval);
  }, [user, tokenCreatedAt, authSettings]);

  // Слушаем изменения пользователя для обновления времени создания токена
  useEffect(() => {
    if (user && !tokenCreatedAt) {
      setTokenCreatedAt(Date.now());
    }
  }, [user, tokenCreatedAt]);

  // Слушаем изменения expiresIn для обновления времени создания токена при обновлении токена
  useEffect(() => {
    if (user?.expiresIn && tokenCreatedAt) {
      // Если токен был обновлен (expiresIn изменился), обновляем время создания
      setTokenCreatedAt(Date.now());
    }
  }, [user?.expiresIn]);

  // Инициализация логов и токена
  useEffect(() => {
    addLog('🚀 Страница тестирования токенов загружена');
    loadAuthSettings(); // Загружаем настройки авторизации
    if (user) {
      addLog(`👤 Пользователь: ${user.email}`);
      // Устанавливаем время создания токена как текущее время (приблизительно)
      // В реальном приложении это время должно приходить с сервера
      setTokenCreatedAt(Date.now());
    }
  }, [user]);

  // Тестируем API запрос
  const testApiCall = async () => {
    try {
      addLog('🔄 Тестируем API запрос...');
      const response = await apiCall('/api/settings/equipment');
      addLog(`✅ API запрос успешен: ${response.status}`);
    } catch (error) {
      addLog(`❌ API запрос ошибка: ${error.message}`);
    }
  };

  // Проверяем информацию о токене
  const checkTokenInfo = async () => {
    try {
      addLog('🔍 Проверяем информацию о токене...');
      const response = await fetch('/api/auth/profile', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const userData = await response.json();
        setTokenInfo({
          status: 'valid',
          user: userData,
          timestamp: new Date().toISOString()
        });
        addLog('✅ Токен валиден');
      } else {
        setTokenInfo({
          status: 'invalid',
          error: response.status,
          timestamp: new Date().toISOString()
        });
        addLog(`❌ Токен невалиден: ${response.status}`);
      }
    } catch (error) {
      setTokenInfo({
        status: 'error',
        error: error,
        timestamp: new Date().toISOString()
      });
      addLog(`❌ Ошибка проверки токена: ${error.message}`);
    }
  };

  // Тестируем refresh токена
  const testRefreshToken = async () => {
    try {
      addLog('🔄 Ручное обновление токена...');
      const success = await refreshToken();
      if (success) {
        addLog('✅ Токен обновлен успешно');
        // Обновляем время создания токена
        setTokenCreatedAt(Date.now());
        // Принудительно обновляем информацию о токене
        getTokenExpiryInfo();
        checkTokenInfo(); // Обновляем информацию
      } else {
        addLog('❌ Ошибка обновления токена');
      }
    } catch (error) {
      addLog(`❌ Ошибка: ${error.message}`);
    }
  };


  // Проверяем настройки токенов
  const checkTokenSettings = () => {
    const localDelay = localStorage.getItem('tokenRefreshDelay');
    const envDelay = import.meta.env.VITE_TOKEN_REFRESH_DELAY;
    
    let resultMessage = `🔧 Настройки времени обновления токенов:\n\n`;
    
    if (localDelay) {
      resultMessage += `💾 localStorage: ${localDelay} минут\n`;
    } else {
      resultMessage += `💾 localStorage: не настроено\n`;
    }
    
    if (envDelay) {
      resultMessage += `🌍 Переменные окружения: ${envDelay} минут\n`;
    } else {
      resultMessage += `🌍 Переменные окружения: не настроено\n`;
    }
    
    resultMessage += `\n⚙️ Используемое значение: ${localDelay || envDelay || '55'} минут (по умолчанию)\n\n`;
    resultMessage += `💡 Для изменения используйте:\n`;
    resultMessage += `localStorage.setItem('tokenRefreshDelay', '30'); // 30 минут\n`;
    resultMessage += `localStorage.setItem('tokenRefreshDelay', '120'); // 2 часа`;
    
    console.log('🔧 Настройки токенов:', { localDelay, envDelay, default: 55 });
    alert(resultMessage);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Тест авторизации</h1>
          <p className="text-gray-600 mb-4">Вы не авторизованы</p>
          <a href="/auth" className="text-blue-600 hover:text-blue-800">Войти в систему</a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* User Info Card */}
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-blue-600 text-lg">👤</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Пользователь</h3>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
          </div>
          <div className="space-y-1 text-sm">
            <p><span className="text-gray-500">ID:</span> <span className="font-mono">{user.id}</span></p>
            <p><span className="text-gray-500">Роль:</span> <span className="font-medium">{user.roleName}</span></p>
            <p><span className="text-gray-500">Активность:</span> {user.lastActivityAt ? new Date(user.lastActivityAt).toLocaleTimeString() : 'Неизвестно'}</p>
          </div>
        </div>

        {/* Token Info Card */}
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-green-600 text-lg">🔑</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Токен</h3>
              <p className="text-sm text-gray-500">{tokenExpiryInfo ? `${tokenExpiryInfo.expiresIn} сек` : 'Неизвестно'}</p>
            </div>
          </div>
          {tokenExpiryInfo ? (
            <div className="space-y-1 text-sm">
              <p><span className="text-gray-500">Создан:</span> {new Date(tokenCreatedAt || 0).toLocaleTimeString()}</p>
              <p><span className="text-gray-500">Истекает:</span> {tokenExpiryInfo.expiresAt} / через <span className="text-red-600">{tokenExpiryInfo.minutesLeft}м {tokenExpiryInfo.secondsLeft}с</span></p>
              {tokenExpiryInfo.timeToRefresh > 0 && authSettings.clientAutoRefreshEnabled && (
                <p><span className="text-gray-500">Обновление через:</span> <span className="font-medium text-blue-600">{tokenExpiryInfo.refreshMinutesLeft}м {tokenExpiryInfo.refreshSecondsLeft}с</span></p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Нет информации о токене</p>
          )}
        </div>

        {/* Status Card */}
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-purple-600 text-lg">📊</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Статус</h3>
              <p className="text-sm text-gray-500">Система авторизации</p>
            </div>
          </div>
          <div className="space-y-1 text-sm">
            <p><span className="text-gray-500">Логи:</span> <span className="font-medium">{logs.length}</span></p>
            <p><span className="text-gray-500">Время:</span> {currentTime.toLocaleTimeString()}</p>
            <p><span className="text-gray-500">Токен:</span> <span className={`font-medium ${tokenExpiryInfo ? 'text-green-600' : 'text-red-600'}`}>
              {tokenExpiryInfo ? 'Активен' : 'Неактивен'}
            </span></p>
          </div>
        </div>

        {/* Auth Settings Card */}
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <span className="text-orange-600 text-lg">⚙️</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Настройки</h3>
              <p className="text-sm text-gray-500">Авторизация</p>
            </div>
          </div>
          {authSettings ? (
            <div className="space-y-1 text-sm">
              <p><span className="text-gray-500">Клиент (браузер):</span> <span className="font-medium">{authSettings.clientRefreshThresholdMinutes}м</span> <span className={`font-medium ${authSettings.clientAutoRefreshEnabled ? 'text-green-600' : 'text-red-600'}`}>
                {authSettings.clientAutoRefreshEnabled ? 'Вкл' : 'Выкл'}
              </span></p>
              <p><span className="text-gray-500">Middleware (сервер):</span> <span className="font-medium">{authSettings.middlewareRefreshThresholdSeconds}с</span> <span className={`font-medium ${authSettings.middlewareAutoRefreshEnabled ? 'text-green-600' : 'text-red-600'}`}>
                {authSettings.middlewareAutoRefreshEnabled ? 'Вкл' : 'Выкл'}
              </span></p>
              <p><span className="text-gray-500">Обновление токена:</span> <span className={`font-medium ${authSettings.tokenRefreshEnabled ? 'text-green-600' : 'text-red-600'}`}>
                {authSettings.tokenRefreshEnabled ? 'Вкл' : 'Выкл'}
              </span></p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Загрузка настроек...</p>
          )}
        </div>
      </div>

      {/* Token Lifecycle Progress */}
      {tokenExpiryInfo && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">🔄 Жизненный цикл токена <span className='ml-2'>{Math.round(tokenExpiryInfo.progressPercentage || 0)}%</span></h2>
            <div className="text-sm text-gray-500">
              Этап {tokenExpiryInfo.currentStage} из 3
            </div>
          </div>
          
          {/* Progress Bar with Stages */}
          <div className="relative mb-24">
            {/* Progress Line */}
            <div className="relative h-3 bg-gray-200 rounded-full mb-8">
              <div 
                className={`absolute top-0 left-0 h-3 rounded-full transition-all duration-1000 ${
                  tokenExpiryInfo.currentStage === 1 ? 'bg-gradient-to-r from-blue-500 to-green-500' :
                  tokenExpiryInfo.currentStage === 2 ? 'bg-gradient-to-r from-green-500 to-orange-500' :
                  'bg-gradient-to-r from-orange-500 to-red-500'
                }`}
                style={{ width: `${tokenExpiryInfo.progressPercentage || 0}%` }}
              ></div>
            </div>

            {/* Stage Markers */}
            <div className="relative">
              {/* Stage 1: Login */}
              <div className="absolute left-2 bottom-0 transform">
                <div className={`w-6 h-6 rounded-full border-3 border-white shadow-lg flex items-center justify-center ${
                  tokenExpiryInfo.currentStage >= 1 ? 'bg-blue-500' : 'bg-gray-300'
                }`}>
                  <span className="text-white text-xs font-bold">1</span>
                </div>
                <div className="absolute top-8 left-1/2 transform -translate-x-1/2 text-center">
                  <p className="text-sm font-medium text-gray-900">Вход</p>
                  <p className="text-xs text-gray-600">получаем токен</p>
                </div>
              </div>

              {/* Stage 2: AuthContext Refresh */}
              <div 
                className="absolute bottom-0 transform -translate-x-1/2"
                style={{ left: `${tokenExpiryInfo.stagePositions?.stage2 || 83.33}%` }}
              >
                <div className={`w-6 h-6 rounded-full border-3 border-white shadow-lg flex items-center justify-center ${
                  tokenExpiryInfo.currentStage >= 2 ? 'bg-green-500' : 'bg-gray-300'
                }`}>
                  <span className="text-white text-xs font-bold">2</span>
                </div>
                <div className="absolute top-8 left-1/2 transform -translate-x-1/2 text-center">
                  <p className="text-sm font-medium text-gray-900">AuthContext</p>
                  <p className="text-xs text-gray-600">
                    {tokenExpiryInfo.stageTimes?.stage2 && tokenExpiryInfo.stageTimes.stage2.minutes > 0 ? (
                      <>через <span className="text-green-600">{tokenExpiryInfo.stageTimes.stage2.minutes}м {tokenExpiryInfo.stageTimes.stage2.seconds}с</span></>
                    ) : (
                      <>за <span className="text-green-600">{authSettings?.clientRefreshThresholdMinutes || 10} мин</span> до истечения</>
                    )}
                  </p>
                </div>
              </div>

              {/* Stage 3: Middleware Check */}
              <div 
                className="absolute bottom-0 transform -translate-x-1/2"
                style={{ left: `${tokenExpiryInfo.stagePositions?.stage3 || 91.67}%` }}
              >
                <div className={`w-6 h-6 rounded-full border-3 border-white shadow-lg flex items-center justify-center ${
                  tokenExpiryInfo.currentStage >= 3 ? 'bg-orange-500' : 'bg-gray-300'
                }`}>
                  <span className="text-white text-xs font-bold">3</span>
                </div>
                <div className="absolute top-8 left-1/2 transform -translate-x-1/2 text-center">
                  <p className="text-sm font-medium text-gray-900">Middleware</p>
                  <p className="text-xs text-gray-600">
                    {tokenExpiryInfo.stageTimes?.stage3 && tokenExpiryInfo.stageTimes.stage3.minutes > 0 ? (
                      <>через <span className="text-orange-600">{tokenExpiryInfo.stageTimes.stage3.minutes}м {tokenExpiryInfo.stageTimes.stage3.seconds}с</span></>
                    ) : (
                      <>за <span className="text-orange-600">{authSettings?.middlewareRefreshThresholdSeconds || 300} сек</span> до истечения</>
                    )}
                  </p>
                </div>
              </div>

              {/* Stage 4: Token Expiry */}
              <div className="absolute right-2 bottom-0 transform">
                <div className={`w-6 h-6 rounded-full border-3 border-white shadow-lg flex items-center justify-center ${
                  tokenExpiryInfo.progressPercentage >= 100 ? 'bg-red-500' : 'bg-gray-300'
                }`}>
                  <span className="text-white text-xs font-bold">4</span>
                </div>
                <div className="absolute top-8 left-1/2 transform -translate-x-1/2 text-center">
                  <p className="text-sm font-medium text-gray-900">Истечение</p>
                  <p className="text-xs text-gray-600">через<span className="text-red-600 block">{tokenExpiryInfo.expiresIn || 300} сек</span></p>
                </div>
              </div>
            </div>

            {/* Current Position Indicator */}
            <div 
              className="absolute top-0 transform -translate-x-1/2 transition-all duration-1000"
              style={{ left: `${tokenExpiryInfo.progressPercentage || 0}%` }}
            >
            </div>
          </div>

          
        </div>
      )}

      {/* Testing Section */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">🧪 Тестирование токенов</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <button
            onClick={testApiCall}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <span>🚀</span>
            <span>Тест API запроса</span>
          </button>
            
          <button
            onClick={checkTokenInfo}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            <span>🔍</span>
            <span>Проверить токен</span>
          </button>
            
          <button
            onClick={testRefreshToken}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
          >
            <span>🔄</span>
            <span>Обновить токен</span>
          </button>
          
          <button
            onClick={() => setLogs([])}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium"
          >
            <span>🗑️</span>
            <span>Очистить логи</span>
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Logs Section */}
           <div className="min-w-3/5 w-full bg-gray-50 text-neutral-800 p-2 font-mono text-sm rounded-md border">
             <div 
               ref={logsContainerRef}
               className="overflow-y-auto min-h-40 max-h-110 p-2"
             >
              {logs.length === 0 ? (
                <div className="text-gray-500 text-center py-8">
                  Логи пусты. Выполните тестирование для просмотра записей.
                </div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="mb-1">{log}</div>
                ))
              )}
            </div>
          </div>

          {/* Test Results */}
          {tokenInfo && (
            <div className={`min-w-0 p-4 rounded-lg border ${
              tokenInfo.status === 'valid' ? 'bg-green-50 border-green-200' :
              tokenInfo.status === 'invalid' ? 'bg-red-50 border-red-200' :
              'bg-yellow-50 border-yellow-200'
            }`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">
                  {tokenInfo.status === 'valid' ? '✅' :
                   tokenInfo.status === 'invalid' ? '❌' :
                   '⚠️'}
                </span>
                <h3 className="font-semibold text-gray-900">
                  {tokenInfo.status === 'valid' ? 'Токен валиден' :
                   tokenInfo.status === 'invalid' ? 'Токен невалиден' :
                   'Ошибка проверки'}
                </h3>
              <button
                onClick={() => setTokenInfo(null)}
                className="ml-auto flex items-center gap-1 px-2 py-1 text-gray-400 hover:text-gray-700 rounded transition-colors"
                title="Закрыть результаты"
                aria-label="Закрыть"
                type="button"
              >
                <span className="text-sm">✖️</span>
              </button>
              </div>
              <div className="p-2">
                <pre className="text-sm text-gray-700 overflow-auto">
                  {JSON.stringify(tokenInfo, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default SettingsTestAuth;
