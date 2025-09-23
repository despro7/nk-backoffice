import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Switch,
  Button
} from '@heroui/react';
import { LoggingService, LoggingSettings as LoggingSettingsType, ConsoleLoggingSettings, ToastLoggingSettings } from '../services/LoggingService';
import { DynamicIcon } from 'lucide-react/dynamic';

export const LoggingSettingsComponent: React.FC = () => {
  const [settings, setSettings] = useState<LoggingSettingsType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Загружаем настройки при монтировании
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      LoggingService.loggingSettingsLog('🔧 Завантажуємо налаштування логування...');

      // Получаем настройки из LoggingService
      const currentSettings = LoggingService.getSettings();
      setSettings(currentSettings);
      setIsInitialized(true);
      LoggingService.loggingSettingsLog('🔧 Настройки загружены из LoggingService:', currentSettings);

    } catch (error) {
      console.error('🔧 [LoggingSettings] Ошибка при загрузке настроек:', error);
      // При ошибке используем пустое состояние - компонент покажет лоадер
      setIsInitialized(true);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    
    setIsLoading(true);
    try {
      LoggingService.loggingSettingsLog('🔧 Сохранение настроек логирования...');
      LoggingService.loggingSettingsLog('🔧 Отправляемые данные:', JSON.stringify(settings, null, 2));

      // Применяем настройки локально сразу (для немедленного эффекта)
      LoggingService.updateSettings(settings);
      LoggingService.loggingSettingsLog('🔧 Настройки применены локально');

      // Пытаемся сохранить на сервер
      const success = await LoggingService.saveSettings(settings);
      
      if (success) {
        setHasChanges(false);

        // Показываем уведомление об успешном сохранении
        LoggingService.toastSystemNotification(
          "✅ Налаштування збережено",
          "Налаштування логування успішно оновлено на сервер",
          "success"
        );

        LoggingService.loggingSettingsLog('🔧 Настройки успешно сохранены на сервер');
      } else {
        // Настройки уже применены локально, просто уведомляем о проблеме с сервером
        LoggingService.toastSystemNotification(
          "⚠️ Налаштування застосовано локально",
          "Зміни діють, але не збережено на сервер",
          "warning"
        );
      }
      
    } catch (error) {
      console.error('Error saving logging settings:', error);
      LoggingService.toastSystemNotification(
        "❌ Помилка збереження",
        "Не вдалося зберегти налаштування",
        "danger"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const updateConsoleSetting = (key: keyof ConsoleLoggingSettings, value: boolean) => {
    if (!settings) return;
    
    setSettings(prev => prev ? {
      ...prev,
      console: {
        ...prev.console,
        [key]: value
      }
    } : prev);
    setHasChanges(true);
  };

  const updateToastSetting = (key: keyof ToastLoggingSettings, value: boolean) => {
    if (!settings) return;
    
    setSettings(prev => prev ? {
      ...prev,
      toast: {
        ...prev.toast,
        [key]: value
      }
    } : prev);
    setHasChanges(true);
  };

  const resetToDefaults = () => {
    const defaultSettings: LoggingSettingsType = {
      console: {
        authContextLogs: true,
        apiCallLogs: false,
        routingLogs: false,
        equipmentLogs: true,
        debugLogs: false,
        performanceLogs: false,
        // Новые категории по умолчанию
        loggingSettingsLogs: false,
        orderAssemblyLogs: false,
        cookieLogs: false,
        warehouseMovementLogs: false,
        productSetsLogs: false
      },
      toast: {
        authSuccess: true,
        authErrors: true,
        tokenRefresh: true,
        tokenExpiry: true,
        apiErrors: true,
        equipmentStatus: true,
        systemNotifications: true
      }
    };
    
    setSettings(defaultSettings);
    setHasChanges(true);
  };

  // Функции для демонстрации настроек
  const demonstrateConsoleLog = (type: keyof ConsoleLoggingSettings) => {
    switch (type) {
      case 'authContextLogs':
        LoggingService.authLog('🔑 Демо: Токен успешно обновлен', { expiresIn: 120 });
        break;
      case 'apiCallLogs':
        LoggingService.apiLog('🚀 Демо: API запрос GET /api/orders -> 200 (150ms)');
        break;
      case 'routingLogs':
        LoggingService.routeLog('🧭 Демо: Переход на страницу /settings/logging');
        break;
      case 'equipmentLogs':
        LoggingService.equipmentLog('⚖️ Демо: Весы VTA-60 подключены, вес: 1.25 кг');
        break;
      case 'debugLogs':
        LoggingService.debugLog('🐛 Демо: Отладочная информация', { state: 'active', count: 5 });
        break;
      case 'performanceLogs':
        LoggingService.perfLog('⚡ Демо: Рендер компонента за 15ms');
        break;
      // Новые категории демонстрации
      case 'loggingSettingsLogs':
        LoggingService.loggingSettingsLog('⚙️ Демо: Налаштування логування збережено');
        break;
      case 'orderAssemblyLogs':
        LoggingService.orderAssemblyLog('📦 Демо: Замовлення №12345 готове до відправки');
        break;
      case 'cookieLogs':
        LoggingService.cookieLog('🍪 Демо: Cookie "user_theme" збережено зі значенням "dark"');
        break;
      case 'warehouseMovementLogs':
        LoggingService.warehouseMovementLog('🏭 Демо: Складський документ #WM-001 створено');
        break;
      case 'productSetsLogs':
        LoggingService.productSetsLog('🛒 Демо: Набір товарів створено');
        break;
    }
  };

  const demonstrateToast = (type: keyof ToastLoggingSettings) => {
    switch (type) {
      case 'authSuccess':
        LoggingService.toastAuthSuccess('demo@example.com');
        break;
      case 'authErrors':
        LoggingService.toastAuthError('Невірні облікові дані');
        break;
      case 'tokenRefresh':
        LoggingService.toastTokenRefreshed('demo@example.com');
        break;
      case 'tokenExpiry':
        LoggingService.toastTokenExpired();
        break;
      case 'apiErrors':
        LoggingService.toastApiError('Не вдалося завантажити дані');
        break;
      case 'equipmentStatus':
        LoggingService.toastEquipmentStatus('⚖️ Весы підключено', 'VTA-60 успішно підключені');
        break;
      case 'systemNotifications':
        LoggingService.toastSystemNotification('🔔 Системне повідомлення', 'Демо сповіщення працює!');
        break;
    }
  };

  // Конфигурация настроек для UI
  const consoleSettingsConfig: Array<{
    key: keyof ConsoleLoggingSettings;
    label: string;
    description: string;
    color: 'primary' | 'success' | 'warning' | 'danger';
  }> = [
    {
      key: 'authContextLogs',
      label: 'Логи авторизації (AuthContext)',
      description: 'Логи токенів, входу/виходу, обновлення сессий',
      color: 'primary'
    },
    {
      key: 'apiCallLogs',
      label: 'API запити',
      description: 'Логи HTTP запитів і відповідей сервера',
      color: 'success'
    },
    {
      key: 'routingLogs',
      label: 'Маршрутизація',
      description: 'Логи переходів між сторінками',
      color: 'primary'
    },
    {
      key: 'equipmentLogs',
      label: 'Обладнання (ваги, принтери)',
      description: 'Логи підключення і роботи обладнання',
      color: 'warning'
    },
    {
      key: 'debugLogs',
      label: 'Відладочні логи',
      description: 'Технічна інформація для розробників',
      color: 'danger'
    },
    {
      key: 'performanceLogs',
      label: 'Продуктивність',
      description: 'Логи часу виконання і продуктивності',
      color: 'success'
    },
    // Новые категории логирования
    {
      key: 'loggingSettingsLogs',
      label: 'Налаштування логування',
      description: 'Логи роботи системи керування логами',
      color: 'primary'
    },
    {
      key: 'orderAssemblyLogs',
      label: 'Комплектація замовлень',
      description: 'Логи процесу збирання та обробки замовлень',
      color: 'warning'
    },
    {
      key: 'productSetsLogs',
      label: 'Набір товарів',
      description: 'Логи роботи з наборами товарів',
      color: 'success'
    },
    {
      key: 'cookieLogs',
      label: 'Робота з Cookies',
      description: 'Логи збереження та читання cookies',
      color: 'success'
    },
    {
      key: 'warehouseMovementLogs',
      label: 'Складські переміщення',
      description: 'Логи операцій з складськими документами та рухом товарів',
      color: 'danger'
    }
  ];

  const toastSettingsConfig: Array<{
    key: keyof ToastLoggingSettings;
    label: string;
    description: string;
    color: 'primary' | 'success' | 'warning' | 'danger';
  }> = [
    {
      key: 'authSuccess',
      label: 'Успішна авторизація',
      description: 'Повідомлення про вхід і вихід з системи',
      color: 'success'
    },
    {
      key: 'authErrors',
      label: 'Помилки авторизації',
      description: 'Сповіщення про помилки входу і токенів',
      color: 'danger'
    },
    {
      key: 'tokenRefresh',
      label: 'Оновлення токенів',
      description: 'Повідомлення про автоматичне оновлення сесії',
      color: 'success'
    },
    {
      key: 'tokenExpiry',
      label: 'Закінчення токенів',
      description: 'Попередження про закінчення сесії',
      color: 'warning'
    },
    {
      key: 'apiErrors',
      label: 'Помилки API',
      description: 'Сповіщення про помилки запросів до сервера',
      color: 'danger'
    },
    {
      key: 'equipmentStatus',
      label: 'Статус обладнання',
      description: 'Повідомлення про підключення весов, принтерів',
      color: 'primary'
    },
    {
      key: 'systemNotifications',
      label: 'Системні сповіщення',
      description: 'Загальні повідомлення системи',
      color: 'primary'
    }
  ];

  if (!isInitialized || !settings) {
    return (
      <Card className="w-full p-2">
        <CardBody className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="text-lg">⏳ Завантаження налаштувань...</div>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="w-full p-2">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-xl font-semibold">Налаштування логування</h3>
            <p className="text-sm text-gray-600">
              Керування консольними логами та Toast сповіщеннями
            </p>
          </div>
        </div>
      </CardHeader>

      <CardBody className="space-y-6">
        <div className="flex gap-6">
          {/* Консольні логи */}
          <div className="space-y-4 flex-1">
            <h4 className="text-lg font-bold">
              Логування в консолі браузера
            </h4>
            <div className="space-y-4">
              {consoleSettingsConfig.map((config) => (
                <div key={config.key} className="flex items-start gap-3">
                  <Switch
                    size="sm"
                    isSelected={settings.console[config.key]}
                    onValueChange={(value) => updateConsoleSetting(config.key, value)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">
                      {config.label}
                      <Button
                          size="sm"
                          variant="flat"
                          color="default"
                          onPress={() => {demonstrateConsoleLog(config.key); LoggingService.toastSystemNotification('🔔 Тестування', 'Перевірте консоль браузера (F12)', 'default')}}
                          className="h-6 px-2 text-xs ml-2 gap-1"
                        >
                        <DynamicIcon name="bell-ring" strokeWidth={1.5} size={12} /> Тестувати
                        </Button>
                    </div>
                    <div className="text-xs text-gray-500 mb-1">{config.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Toast сповіщення */}
          <div className="space-y-4 flex-1">
            <h4 className="text-lg font-bold">
              Toast сповіщення
            </h4>
            <div className="space-y-4">
              {toastSettingsConfig.map((config) => (
                <div key={config.key} className="flex items-start gap-3">
                  <Switch
                    size="sm"
                    isSelected={settings.toast[config.key]}
                    onValueChange={(value) => updateToastSetting(config.key, value)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{config.label}</div>
                    <div className="text-xs text-gray-500 mb-1">{config.description}</div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="light"
                        color={config.color}
                        onPress={() => demonstrateToast(config.key)}
                        className="h-6 px-2 text-xs"
                      >
                        Перевірити
                      </Button>
                      <span className="text-xs text-gray-400">
                        Демо сповіщення
                      </span>
                    </div>
                  </div>
                </div>
              ))}
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
          >
            Скинути до типових
          </Button>

        </div>
      </CardFooter>
    </Card>
  );
};

// Экспорт для обратной совместимости
export const LoggingSettings = LoggingSettingsComponent;