import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const SettingsTestAuth: React.FC = () => {
  const { user, logout } = useAuth();
  const [tokenInfo, setTokenInfo] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Обновляем время каждую секунду
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Проверяем информацию о токене
  const checkTokenInfo = async () => {
    try {
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
      } else {
        setTokenInfo({
          status: 'invalid',
          error: response.status,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      setTokenInfo({
        status: 'error',
        error: error,
        timestamp: new Date().toISOString()
      });
    }
  };

  // Тестируем refresh токена
  const testRefreshToken = async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        alert(`✅ Токен обновлен успешно!\nExpiresIn: ${data.expiresIn} секунд`);
        checkTokenInfo(); // Обновляем информацию
      } else {
        const error = await response.json();
        alert(`❌ Ошибка обновления токена: ${error.message}`);
      }
    } catch (error) {
      alert(`❌ Сетевая ошибка: ${error}`);
    }
  };

  // Проверяем cookies
  const checkCookies = () => {
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, string>);

    console.log('🍪 Все доступные cookies:', cookies);
    console.log('🍪 Сырые cookies:', document.cookie);
    
    // Проверяем localStorage
    console.log('💾 localStorage:', localStorage);
    const localStorageTokens = Object.keys(localStorage).filter(key => 
      key.toLowerCase().includes('token') || 
      key.toLowerCase().includes('auth') || 
      key.toLowerCase().includes('jwt')
    );
    
    // Проверяем sessionStorage
    console.log('📱 sessionStorage:', sessionStorage);
    const sessionStorageTokens = Object.keys(sessionStorage).filter(key => 
      key.toLowerCase().includes('token') || 
      key.toLowerCase().includes('auth') || 
      key.toLowerCase().includes('jwt')
    );
    
    // Проверяем разные возможные варианты имен куки
    const possibleNames = [
      'accessToken', 'access_token', 'access-token',
      'refreshToken', 'refresh_token', 'refresh-token',
      'token', 'auth_token', 'jwt'
    ];
    
    const foundTokens = possibleNames.filter(name => cookies[name]);
    
    let resultMessage = '';
    
    if (foundTokens.length > 0) {
      resultMessage += `✅ Найденные токены в cookies:\n${foundTokens.map(name => `${name}: ${cookies[name]?.substring(0, 20)}...`).join('\n')}\n\n`;
    }
    
    if (localStorageTokens.length > 0) {
      resultMessage += `✅ Найденные токены в localStorage:\n${localStorageTokens.map(name => `${name}: ${localStorage.getItem(name)?.substring(0, 20)}...`).join('\n')}\n\n`;
    }
    
    if (sessionStorageTokens.length > 0) {
      resultMessage += `✅ Найденные токены в sessionStorage:\n${sessionStorageTokens.map(name => `${name}: ${sessionStorage.getItem(name)?.substring(0, 20)}...`).join('\n')}\n\n`;
    }
    
    if (foundTokens.length === 0 && localStorageTokens.length === 0 && sessionStorageTokens.length === 0) {
      resultMessage = `🔒 Токены НЕ найдены в доступных для JavaScript местах хранения.\n\n` +
        `📝 Объяснение:\n` +
        `• Ваши токены работают через HTTP-only cookies (безопасность)\n` +
        `• HTTP-only cookies НЕ доступны для JavaScript (защита от XSS)\n` +
        `• Токены автоматически отправляются с каждым запросом\n` +
        `• Это нормально и безопасно!\n\n` +
        `🍪 Доступные cookies:\n${Object.keys(cookies).length > 0 ? Object.keys(cookies).join(', ') : 'Нет cookies'}\n\n` +
        `📡 Сырые cookies:\n${document.cookie || 'Пусто'}`;
    }
    
    console.log('🔍 Результат поиска токенов:', resultMessage);
    alert(resultMessage);
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
    <div className="max-w-4xl">
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">🔐 Тест системы авторизации</h1>
          
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Информация о пользователе */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-blue-900 mb-3">👤 Информация о пользователе</h2>
            <div className="space-y-2 text-sm">
              <p><strong>ID:</strong> {user.id}</p>
              <p><strong>Email:</strong> {user.email}</p>
              <p><strong>Имя:</strong> {user.name}</p>
              <p><strong>Роль:</strong> {user.roleName}</p>
              <p><strong>Последний вход:</strong> {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Неизвестно'}</p>
              <p><strong>Последняя активность:</strong> {user.lastActivityAt ? new Date(user.lastActivityAt).toLocaleString() : 'Неизвестно'}</p>
            </div>
          </div>

          {/* Текущее время */}
          <div className="bg-green-50 p-4 rounded-lg">
            <h2 className="text-lg font-semibold text-green-900 mb-3">⏰ Текущее время</h2>
            <div className="space-y-2 text-sm">
              <p><strong>Локальное время:</strong> {currentTime.toLocaleString()}</p>
              <p><strong>UTC время:</strong> {currentTime.toISOString()}</p>
              <p><strong>Timestamp:</strong> {currentTime.getTime()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Тестирование токенов */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">🧪 Тестирование токенов</h2>
          
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <button
            onClick={checkTokenInfo}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            🔍 Проверить токен
          </button>
            
          <button
            onClick={testRefreshToken}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
          >
            🔄 Обновить токен
          </button>
            
          <button
            onClick={checkCookies}
            className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition-colors"
          >
            🍪 Проверить cookies
          </button>
          
          <button
            onClick={checkTokenSettings}
            className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 transition-colors"
          >
            ⚙️ Настройки токенов
          </button>
        </div>

        {/* Результат тестирования */}
        {tokenInfo && (
          <div className={`p-4 rounded-lg ${
            tokenInfo.status === 'valid' ? 'bg-green-50 border border-green-200' :
            tokenInfo.status === 'invalid' ? 'bg-red-50 border border-red-200' :
            'bg-yellow-50 border border-yellow-200'
          }`}>
            <h3 className="font-semibold mb-2">
              {tokenInfo.status === 'valid' ? '✅ Токен валиден' :
               tokenInfo.status === 'invalid' ? '❌ Токен невалиден' :
               '⚠️ Ошибка проверки'}
            </h3>
            <pre className="text-sm overflow-auto">
              {JSON.stringify(tokenInfo, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Логи консоли */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">📋 Логи консоли</h2>
        <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm h-64 overflow-auto">
          <p>🔐 Откройте DevTools → Console для просмотра логов авторизации</p>
          <p>📡 Все запросы к API логируются с временными метками</p>
          <p>⏰ Таймеры обновления токенов показывают точное время</p>
          <p>⚠️ Ошибки авторизации детально логируются</p>
        </div>
      </div>

      {/* Инструкции */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">📖 Инструкции по тестированию</h2>
          
        <div className="space-y-4 text-sm">
          <div className="bg-blue-50 p-3 rounded">
            <h3 className="font-semibold text-blue-900">1. Проверка токена</h3>
            <p>Нажмите "Проверить токен" для проверки текущего состояния авторизации</p>
          </div>
            
          <div className="bg-green-50 p-3 rounded">
            <h3 className="font-semibold text-green-900">2. Обновление токена</h3>
            <p>Нажмите "Обновить токен" для принудительного обновления access token</p>
          </div>
            
          <div className="bg-purple-50 p-3 rounded">
            <h3 className="font-semibold text-purple-900">3. Проверка cookies</h3>
            <p>Нажмите "Проверить cookies" для проверки наличия токенов в браузере</p>
          </div>
            
          <div className="bg-yellow-50 p-3 rounded">
            <h3 className="font-semibold text-yellow-900">4. Мониторинг логов</h3>
            <p>Откройте DevTools → Console для просмотра детальных логов авторизации</p>
          </div>
        </div>
      </div>

      {/* Кнопка выхода */}
      <div className="text-center mt-6">
        <button
          onClick={logout}
          className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 transition-colors"
        >
          🚪 Выйти из системы
        </button>
      </div>
    </div>
  );
};

export default SettingsTestAuth;
