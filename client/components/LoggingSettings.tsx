import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Switch,
  Input,
  Button
} from '@heroui/react';
import { ToastService } from '../services/ToastService';

export interface ConsoleLoggingSettings {
  logAccessToken: boolean;
  logRefreshToken: boolean;
  logTokenExpiry: boolean;
  logFrequency: number; // в минутах
}

export interface ToastLoggingSettings {
  logLoginLogout: boolean;
  logTokenGenerated: boolean;
  logTokenRefreshed: boolean;
  logTokenRemoved: boolean;
  logTokenExpired: boolean;
  logAuthError: boolean;
  logRefreshError: boolean;
}

export interface LoggingSettings {
  console: ConsoleLoggingSettings;
  toast: ToastLoggingSettings;
}

const defaultSettings: LoggingSettings = {
  console: {
    logAccessToken: true,
    logRefreshToken: true,
    logTokenExpiry: true,
    logFrequency: 5
  },
  toast: {
    logLoginLogout: true,
    logTokenGenerated: false,
    logTokenRefreshed: true,
    logTokenRemoved: true,
    logTokenExpired: true,
    logAuthError: true,
    logRefreshError: true
  }
};

export const LoggingSettings: React.FC = () => {
  const [settings, setSettings] = useState<LoggingSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Завантажуємо налаштування при монтуванні
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      console.log('🔧 [LoggingSettings] Завантажуємо налаштування логування...');

      // Перевіряємо наявність cookies перед запитом
      const hasCookies = document.cookie.includes('accessToken') || document.cookie.includes('refreshToken');
      console.log('🔧 [LoggingSettings] Cookies присутні:', hasCookies);

      if (!hasCookies) {
        console.log('🔧 [LoggingSettings] Cookies не знайдено, використовуємо налаштування за замовчуванням');
        setSettings(defaultSettings);
        setIsInitialized(true);
        return;
      }

      const response = await fetch('/api/settings/logging', {
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache',
          'Content-Type': 'application/json'
        }
      });

      console.log(`🔧 [LoggingSettings] Відповідь сервера: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        console.log('🔧 [LoggingSettings] Налаштування успішно завантажено:', data);

        // Проверяем структуру полученных данных
        if (data && data.console && data.toast) {
          setSettings(data);
          setIsInitialized(true);

          // Обновляем настройки в ToastService
          ToastService.updateSettings(data);
          console.log('🔧 [LoggingSettings] Настройки переданы в ToastService');
        } else {
          console.error('🔧 [LoggingSettings] Получены некорректные данные:', data);
          setSettings(defaultSettings);
          setIsInitialized(true);
        }
      } else if (response.status === 401) {
        console.log('🔧 [LoggingSettings] Користувач не авторизований, використовуємо налаштування за замовчуванням');
        // Спробуємо перевірити профіль користувача
        try {
          const profileResponse = await fetch('/api/auth/profile', {
            credentials: 'include'
          });
          if (profileResponse.ok) {
            console.log('🔧 [LoggingSettings] Профіль доступний, можливо токени закінчилися - пробуємо знову');
            // Повторюємо запит через невелику затримку
            setTimeout(() => loadSettings(), 1000);
          } else {
            setSettings(defaultSettings);
            setIsInitialized(true);
          }
        } catch {
          setSettings(defaultSettings);
          setIsInitialized(true);
        }
      } else {
        console.error(`🔧 [LoggingSettings] Помилка завантаження налаштувань: ${response.status}`);
        // У разі інших помилок теж використовуємо налаштування за замовчуванням
        setSettings(defaultSettings);
        setIsInitialized(true);
      }
    } catch (error) {
      console.error('🔧 [LoggingSettings] Помилка мережі при завантаженні налаштувань:', error);
      // У разі помилки мережі використовуємо налаштування за замовчуванням
      setSettings(defaultSettings);
      setIsInitialized(true);
    }
  };

  const saveSettings = async () => {
    setIsLoading(true);
    try {
      console.log('🔧 [LoggingSettings] Сохранение настроек логирования...');
      console.log('🔧 [LoggingSettings] Отправляемые данные:', JSON.stringify(settings, null, 2));
      console.log('🔧 [LoggingSettings] Инициализировано:', isInitialized);

      // Проверяем, что настройки инициализированы
      if (!isInitialized) {
        console.error('🔧 [LoggingSettings] Настройки не инициализированы, ждем загрузки...');
        ToastService.show({
          title: "⏳ Зачекайте",
          description: "Завантаження налаштувань...",
          color: "warning"
        });
        setIsLoading(false);
        return;
      }

      // Проверяем структуру данных перед отправкой
      if (!settings || !settings.console || !settings.toast) {
        console.error('🔧 [LoggingSettings] Некорректная структура настроек:', settings);
        ToastService.show({
          title: "❌ Помилка валідації",
          description: "Налаштування мають некоректну структуру",
          color: "danger"
        });
        setIsLoading(false);
        return;
      }

      const requestBody = JSON.stringify(settings);
      console.log('🔧 [LoggingSettings] Request body length:', requestBody.length);
      console.log('🔧 [LoggingSettings] Request body preview:', requestBody.substring(0, 200) + '...');

      const response = await fetch('/api/settings/logging', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: requestBody
      });

      console.log(`🔧 [LoggingSettings] Ответ сервера: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const savedData = await response.json();
        console.log('🔧 [LoggingSettings] Успешный ответ сервера:', savedData);
        setHasChanges(false);

        // Оновлюємо налаштування в ToastService
        ToastService.updateSettings(settings);

        // Показуємо сповіщення про успішне збереження (с учетом настроек)
        ToastService.show({
          title: "✅ Налаштування збережено",
          description: "Налаштування логування успішно оновлено",
          color: "success"
        });

        console.log('🔧 [LoggingSettings] Настройки сохранены и обновлены в ToastService');
      } else {
        // Получаем тело ответа об ошибке
        let errorMessage = 'Неизвестная ошибка';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || 'Ошибка сервера';
          console.error('🔧 [LoggingSettings] Ответ сервера с ошибкой:', errorData);
        } catch (e) {
          console.error('🔧 [LoggingSettings] Не удалось распарсить ответ сервера');
        }

        console.error(`🔧 [LoggingSettings] Ошибка сохранения: ${errorMessage}`);
        ToastService.show({
          title: "❌ Помилка збереження",
          description: errorMessage,
          color: "danger"
        });
      }
    } catch (error) {
      console.error('Error saving logging settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateConsoleSetting = (key: keyof ConsoleLoggingSettings, value: boolean | number) => {
    setSettings(prev => ({
      ...prev,
      console: {
        ...prev.console,
        [key]: value
      }
    }));
    setHasChanges(true);
  };

  const updateToastSetting = (key: keyof ToastLoggingSettings, value: boolean) => {
    setSettings(prev => ({
      ...prev,
      toast: {
        ...prev.toast,
        [key]: value
      }
    }));
    setHasChanges(true);
  };

  const resetToDefaults = () => {
    setSettings(defaultSettings);
    setHasChanges(true);
  };

  // Функции для демонстрации настроек
  const demonstrateConsoleLog = (type: string) => {
    const timestamp = new Date().toISOString();
    switch (type) {
      case 'accessToken':
        console.log(`🔑 [AuthService] Access token: eyJhbGciOiJIUzI1NiIs...`);
        break;
      case 'refreshToken':
        console.log(`🔄 [AuthService] Refresh token: eyJhbGciOiJIUzI1NiIs...`);
        break;
      case 'tokenExpiry':
        console.log(`⏰ [AuthService] Access закінчується через: 3600 сек`);
        break;
    }
  };

  const demonstrateToast = (type: string) => {
    switch (type) {
      case 'loginLogout':
        ToastService.show({
          title: "✅ Авторизація успішна",
          description: `Ласкаво просимо, demo@example.com`,
          color: "success"
        });
        break;
      case 'tokenGenerated':
        ToastService.show({
          title: "🔑 Нові токени створено",
          description: `Токени успішно створені для користувача demo@example.com`,
          color: "success"
        });
        break;
      case 'tokenRefreshed':
        ToastService.show({
          title: "🔄 Токени оновлено",
          description: `Сесія автоматично оновлена для demo@example.com`,
          color: "success"
        });
        break;
      case 'tokenRemoved':
        ToastService.show({
          title: "🗑️ Токени видалено",
          description: `Сесія завершена для користувача demo@example.com`,
          color: "default"
        });
        break;
      case 'tokenExpired':
        ToastService.show({
          title: "⏰ Сесія закінчилася",
          description: "Ваша сесія закінчилася. Виконується автоматичне оновлення...",
          color: "default"
        });
        break;
      case 'authError':
        ToastService.show({
          title: "❌ Помилка авторизації",
          description: "Невірні облікові дані",
          color: "danger"
        });
        break;
      case 'refreshError':
        ToastService.show({
          title: "❌ Помилка оновлення сесії",
          description: "Не вдалося оновити токени. Будь ласка, увійдіть знову.",
          color: "danger"
        });
        break;
    }
  };

  return (
    <Card className="w-full p-2">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-xl font-semibold">Налаштування логування</h3>
            <p className="text-sm text-gray-600">
              Керування логуванням токенів та сповіщень
            </p>
          </div>
        </div>
      </CardHeader>

      <CardBody className="space-y-6">
        <div className="flex gap-4">
			{/* Логування в консолі браузера */}
			<div className="space-y-4 flex-1">
			  <h4 className="text-md font-bold">
				Логування в консолі браузера
			  </h4>
			  <div className="space-y-4">
				            <div className="flex items-start gap-3">
              <Switch
                size="sm"
                isSelected={settings.console.logAccessToken}
                onValueChange={(value) => updateConsoleSetting('logAccessToken', value)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium text-sm">Загальні дані по access токенах</div>
                <div className="flex items-center gap-2 mt-1">
                  <Button
                    size="sm"
                    variant="light"
                    color="primary"
                    onPress={() => demonstrateConsoleLog('accessToken')}
                    className="h-6 px-2 text-xs"
                  >
                    Перевірити
                  </Button>
                  <span className="text-xs text-gray-500">
                    Перевірте консоль браузера
                  </span>
                </div>
              </div>
            </div>
				<div className="flex items-start gap-3">
				  <Switch
					size="sm"
					isSelected={settings.console.logRefreshToken}
					onValueChange={(value) => updateConsoleSetting('logRefreshToken', value)}
					className="mt-1"
				  />
				  <div className="flex-1">
					<div className="font-medium text-sm">Загальні дані по refresh токенах</div>
					<div className="flex items-center gap-2 mt-1">
					  <Button
						size="sm"
						variant="light"
						color="primary"
						onPress={() => demonstrateConsoleLog('refreshToken')}
						className="h-6 px-2 text-xs"
					  >
						Перевірити
					  </Button>
					  <span className="text-xs text-gray-500">
						Перевірте консоль браузера
					  </span>
					</div>
				  </div>
				</div>
				<div className="flex items-start gap-3">
				  <Switch
					size="sm"
					isSelected={settings.console.logTokenExpiry}
					onValueChange={(value) => updateConsoleSetting('logTokenExpiry', value)}
					className="mt-1"
				  />
				  <div className="flex-1">
					<div className="font-medium text-sm">Час до закінчення токенів</div>
					<div className="flex items-center gap-2 mt-1">
					  <Button
						size="sm"
						variant="light"
						color="primary"
						onPress={() => demonstrateConsoleLog('tokenExpiry')}
						className="h-6 px-2 text-xs"
					  >
						Перевірити
					  </Button>
					  <span className="text-xs text-gray-500">
						Перевірте консоль браузера
					  </span>
					</div>
				  </div>
				</div>
				<div className="flex items-start gap-3">
				  <div className="w-10"></div>
				  <div className="flex-1">
					<div className="font-medium text-sm mb-2">Частота логування</div>
					<div className="flex items-center gap-2">
					  <Input
						type="number"
						value={settings.console.logFrequency.toString()}
						onValueChange={(value) => updateConsoleSetting('logFrequency', parseInt(value) || 5)}
						className="max-w-24"
						size="sm"
						min={1}
						max={60}
					  />
					  <span className="text-sm text-gray-600">хвилин</span>
					</div>
				  </div>
				</div>
			  </div>
			</div>

			{/* Логування в Toast */}
			<div className="space-y-4 flex-1">
			  <h4 className="text-md font-bold">
				Логування в Toast сповіщеннях
			  </h4>
			  <div className="space-y-4">
				<div className="flex items-start gap-3">
				  <Switch
					size="sm"
					isSelected={settings.toast.logLoginLogout}
					onValueChange={(value) => updateToastSetting('logLoginLogout', value)}
					className="mt-1"
				  />
				  <div className="flex-1">
					<div className="font-medium text-sm">Вхід та вихід з системи</div>
					<div className="flex items-center gap-2 mt-1">
					  <Button
						size="sm"
						variant="light"
						color="success"
						onPress={() => demonstrateToast('loginLogout')}
						className="h-6 px-2 text-xs"
					  >
						Перевірити
					  </Button>
					  <span className="text-xs text-gray-500">
						Приклад: "✅ Авторизація успішна"
					  </span>
					</div>
				  </div>
				</div>
				<div className="flex items-start gap-3">
				  <Switch
					size="sm"
					isSelected={settings.toast.logTokenGenerated}
					onValueChange={(value) => updateToastSetting('logTokenGenerated', value)}
					className="mt-1"
				  />
				  <div className="flex-1">
					<div className="font-medium text-sm">Генерація нових токенів</div>
					<div className="flex items-center gap-2 mt-1">
					  <Button
						size="sm"
						variant="light"
						color="success"
						onPress={() => demonstrateToast('tokenGenerated')}
						className="h-6 px-2 text-xs"
					  >
						Перевірити
					  </Button>
					  <span className="text-xs text-gray-500">
						Приклад: "🔑 Нові токени створено"
					  </span>
					</div>
				  </div>
				</div>
				<div className="flex items-start gap-3">
				  <Switch
					size="sm"
					isSelected={settings.toast.logTokenRefreshed}
					onValueChange={(value) => updateToastSetting('logTokenRefreshed', value)}
					className="mt-1"
				  />
				  <div className="flex-1">
					<div className="font-medium text-sm">Оновлення токенів</div>
					<div className="flex items-center gap-2 mt-1">
					  <Button
						size="sm"
						variant="light"
						color="success"
						onPress={() => demonstrateToast('tokenRefreshed')}
						className="h-6 px-2 text-xs"
					  >
						Перевірити
					  </Button>
					  <span className="text-xs text-gray-500">
						Приклад: "🔄 Токени оновлено"
					  </span>
					</div>
				  </div>
				</div>
				<div className="flex items-start gap-3">
				  <Switch
					size="sm"
					isSelected={settings.toast.logTokenRemoved}
					onValueChange={(value) => updateToastSetting('logTokenRemoved', value)}
					className="mt-1"
				  />
				  <div className="flex-1">
					<div className="font-medium text-sm">Видалення токенів</div>
					<div className="flex items-center gap-2 mt-1">
					  <Button
						size="sm"
						variant="light"
						color="warning"
						onPress={() => demonstrateToast('tokenRemoved')}
						className="h-6 px-2 text-xs"
					  >
						Перевірити
					  </Button>
					  <span className="text-xs text-gray-500">
						Приклад: "🗑️ Токени видалено"
					  </span>
					</div>
				  </div>
				</div>
				<div className="flex items-start gap-3">
				  <Switch
					size="sm"
					isSelected={settings.toast.logTokenExpired}
					onValueChange={(value) => updateToastSetting('logTokenExpired', value)}
					className="mt-1"
				  />
				  <div className="flex-1">
					<div className="font-medium text-sm">Закінчення терміну токенів</div>
					<div className="flex items-center gap-2 mt-1">
					  <Button
						size="sm"
						variant="light"
						color="warning"
						onPress={() => demonstrateToast('tokenExpired')}
						className="h-6 px-2 text-xs"
					  >
						Перевірити
					  </Button>
					  <span className="text-xs text-gray-500">
						Приклад: "⏰ Сесія закінчилася"
					  </span>
					</div>
				  </div>
				</div>
				<div className="flex items-start gap-3">
				  <Switch
					size="sm"
					isSelected={settings.toast.logAuthError}
					onValueChange={(value) => updateToastSetting('logAuthError', value)}
					className="mt-1"
				  />
				  <div className="flex-1">
					<div className="font-medium text-sm">Помилки авторизації</div>
					<div className="flex items-center gap-2 mt-1">
					  <Button
						size="sm"
						variant="light"
						color="danger"
						onPress={() => demonstrateToast('authError')}
						className="h-6 px-2 text-xs"
					  >
						Перевірити
					  </Button>
					  <span className="text-xs text-gray-500">
						Приклад: "❌ Помилка авторизації"
					  </span>
					</div>
				  </div>
				</div>
				<div className="flex items-start gap-3">
				  <Switch
					size="sm"
					isSelected={settings.toast.logRefreshError}
					onValueChange={(value) => updateToastSetting('logRefreshError', value)}
					className="mt-1"
				  />
				  <div className="flex-1">
					<div className="font-medium text-sm">Помилки оновлення сесії</div>
					<div className="flex items-center gap-2 mt-1">
					  <Button
						size="sm"
						variant="light"
						color="danger"
						onPress={() => demonstrateToast('refreshError')}
						className="h-6 px-2 text-xs"
					  >
						Перевірити
					  </Button>
					  <span className="text-xs text-gray-500">
						Приклад: "❌ Помилка оновлення сесії"
					  </span>
					</div>
				  </div>
				</div>
			  </div>
			</div>
		</div>
      </CardBody>

      <CardFooter className="flex flex-col gap-4">
        <div className="flex justify-start items-center w-full mt-3 gap-4">
          <Button
            color="primary"
            onPress={saveSettings}
            isLoading={isLoading}
            isDisabled={!hasChanges}
          >
            {isLoading ? 'Збереження...' : 'Зберегти налаштування'}
          </Button>

          <Button
            color="default"
            variant="light"
            onPress={resetToDefaults}
            isDisabled={!hasChanges}
          >
            Скинути до типових
          </Button>

          <div className="ml-auto flex gap-2">
            <Button
              color="secondary"
              variant="light"
              onPress={() => demonstrateConsoleLog('accessToken')}
              size="sm"
            >
              🧪 Тест консолі
            </Button>
            <Button
              color="secondary"
              variant="light"
              onPress={() => demonstrateToast('loginLogout')}
              size="sm"
            >
              🔔 Тест Toast
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
};
