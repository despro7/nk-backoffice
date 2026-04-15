import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardBody, CardFooter, Switch, Button } from '@heroui/react';
import { ToastService } from '../services/ToastService';
import { ToastSettingsTypes } from '../types/toast';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useAuth } from '../contexts/AuthContext';

export const ToastSettings: React.FC = () => {
  const [settings, setSettings] = useState<ToastSettingsTypes | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const { user, isLoading: authLoading } = useAuth();

  const DEFAULT_TOAST_SETTINGS: ToastSettingsTypes = {
    authSuccess: true,
    authErrors: true,
    tokenRefresh: true,
    tokenExpiry: true,
    apiErrors: true,
    equipmentStatus: true,
    systemNotifications: true,
  };


  useEffect(() => {
    const fetchSettings = async () => {
      // Якщо аутентифікація ще не завершилась — чекаємо
      if (authLoading) return;

      // Якщо користувач не залогінений — використовуємо локальні дефолти та не робимо запит
      if (!user) {
        setSettings(DEFAULT_TOAST_SETTINGS);
        setIsInitialized(true);
        return;
      }

      // If settings are already loaded by a global initializer (AuthContext), use them.
      // Otherwise, wait a short while for the global initializer to populate settings
      // (this avoids making a protected fetch here which can produce 401 during the
      // login cookie propagation race).
      const MAX_ATTEMPTS = 5;
      const DELAY_MS = 150;
      let currentSettings = ToastService.getSettings();
      let attempts = 0;
      while (!currentSettings && attempts < MAX_ATTEMPTS) {
        attempts++;
        await new Promise((r) => setTimeout(r, DELAY_MS));
        currentSettings = ToastService.getSettings();
      }

      if (currentSettings) {
        setSettings(currentSettings);
      } else {
        // If still not initialized, use local defaults and don't trigger the fetch here.
        setSettings(DEFAULT_TOAST_SETTINGS);
      }
      setIsInitialized(true);
    };
    fetchSettings();
  }, [user, authLoading]);



  const saveSettings = async () => {
    if (!settings) return;
    setIsLoading(true);
    try {
      await ToastService.saveSettings(settings);
      setHasChanges(false);
      ToastService.show({
        title: 'Налаштування toast збережено',
        description: 'Toast-налаштування успішно оновлено',
        color: 'success',
        hideIcon: false,
        icon: "check-circle",
      });
    } catch (error) {
      ToastService.show({
        title: 'Помилка збереження',
        description: 'Не вдалося зберегти toast-налаштування',
        color: 'danger',
        hideIcon: false,
        icon: "alert-circle",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateToastSetting = (key: keyof ToastSettingsTypes, value: boolean) => {
    if (!settings) return;
    setSettings(prev => prev ? { ...prev, [key]: value } : prev);
    setHasChanges(true);
  };

  const resetToDefaults = () => {
    const defaultSettings: ToastSettingsTypes = {
      authSuccess: true,
      authErrors: true,
      tokenRefresh: true,
      tokenExpiry: true,
      apiErrors: true,
      equipmentStatus: true,
      systemNotifications: true,
    };
    setSettings(defaultSettings);
    setHasChanges(true);
  };

  const demonstrateToast = (type: keyof ToastSettingsTypes) => {
    switch (type) {
      case 'authSuccess':
        ToastService.loginSuccess('demo@example.com');
        break;
      case 'authErrors':
        ToastService.authError('Невірні облікові дані');
        break;
      case 'tokenRefresh':
        ToastService.tokenRefreshed('demo@example.com');
        break;
      case 'tokenExpiry':
        ToastService.tokenExpired();
        break;
      case 'apiErrors':
        ToastService.show({ title: '❌ Помилка API', description: 'Не вдалося завантажити дані', color: 'danger' });
        break;
      case 'equipmentStatus':
        ToastService.show({ title: '⚖️ Ваги підключено', description: 'VTA-60 успішно підключені', color: 'success' });
        break;
      case 'systemNotifications':
        ToastService.show({ title: '🔔 Системне повідомлення', description: 'Демо сповіщення працює!' });
        break;
    }
  };

  const toastSettingsConfig: Array<{
    key: keyof ToastSettingsTypes;
    label: string;
    description: string;
    color: 'primary' | 'success' | 'warning' | 'danger' | 'default';
    timeout?: number;
  }> = [
    {
      key: 'authSuccess',
      label: 'Успішна авторизація',
      description: 'Повідомлення про вхід і вихід з системи',
      color: 'success',
    },
    {
      key: 'authErrors',
      label: 'Помилки авторизації',
      description: 'Сповіщення про помилки входу і токенів',
      color: 'danger',
    },
    {
      key: 'tokenRefresh',
      label: 'Оновлення токенів',
      description: 'Повідомлення про автоматичне оновлення сесії',
      color: 'success',
    },
    {
      key: 'tokenExpiry',
      label: 'Закінчення токенів',
      description: 'Попередження про закінчення сесії',
      color: 'warning',
    },
    {
      key: 'apiErrors',
      label: 'Помилки API',
      description: 'Сповіщення про помилки запросів до сервера',
      color: 'danger',
    },
    {
      key: 'equipmentStatus',
      label: 'Статус обладнання',
      description: 'Повідомлення про підключення весов, принтерів',
      color: 'success',
    },
    {
      key: 'systemNotifications',
      label: 'Системні сповіщення',
      description: 'Загальні повідомлення системи',
      color: 'default',
    },
  ];

  if (!isInitialized || !settings) {
    return (
      <Card className="flex-1 p-2">
        <CardBody className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="text-lg">⏳ Завантаження toast-налаштувань...</div>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="flex-1 p-2">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-xl font-semibold">Toast-сповіщення</h3>
            <p className="text-sm text-gray-600">
              Керування toast-сповіщеннями системи
            </p>
          </div>
        </div>
      </CardHeader>
      <CardBody className="space-y-6">
        <div className="space-y-4 flex-1">
          {toastSettingsConfig.map((config) => (
            <div key={config.key} className="flex items-start gap-3">
              <Switch
                size="sm"
                isSelected={settings[config.key]}
                onValueChange={(value) => updateToastSetting(config.key, value)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium text-sm">{config.label}</div>
                <div className="text-xs text-gray-500 mb-1">{config.description}</div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="flat"
                    color={config.color}
                    onPress={() => demonstrateToast(config.key)}
                    className="h-6 px-2 text-xs gap-1"
                  >
                    <DynamicIcon name="bell-ring" strokeWidth={1.5} size={12} /> Демо сповіщення
                  </Button>
                </div>
              </div>
            </div>
          ))}
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
            {isLoading ? 'Збереження...' : 'Зберегти toast-налаштування'}
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

export default ToastSettings;