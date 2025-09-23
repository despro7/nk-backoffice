import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Button } from '@heroui/react';
import { Card, CardBody, CardHeader, CardFooter } from '@heroui/react';
import { Input } from '@heroui/react';
import { Switch } from '@heroui/react';

interface AuthSetting {
  id: number;
  key: string;
  value: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AuthSettingsData {
  accessTokenExpiresIn: string;
  refreshTokenExpiresIn: string;
  userActivityThresholdDays: number;
  middlewareRefreshThresholdSeconds: number;
  clientRefreshThresholdMinutes: number;
  tokenRefreshEnabled: boolean;
  middlewareAutoRefreshEnabled: boolean;
  clientAutoRefreshEnabled: boolean;
}

export const AuthSettings: React.FC = () => {
  const { apiCall } = useApi();
  const [settings, setSettings] = useState<AuthSettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Загружаем настройки
  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const response = await apiCall('/api/auth/settings/admin');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      } else {
        setMessage({ type: 'error', text: 'Ошибка загрузки настроек' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Ошибка загрузки настроек' });
    } finally {
      setIsLoading(false);
    }
  };

  // Сохраняем настройки
  const saveSettings = async () => {
    if (!settings) return;

    try {
      setIsSaving(true);
      const response = await apiCall('/api/auth/settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Настройки успешно сохранены' });
        // Очищаем кеш на сервере
        await apiCall('/api/auth/settings/clear-cache', { method: 'POST' });
      } else {
        setMessage({ type: 'error', text: 'Ошибка сохранения настроек' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Ошибка сохранения настроек' });
    } finally {
      setIsSaving(false);
    }
  };

  // Сброс к значениям по умолчанию
  const resetToDefaults = async () => {
    if (!confirm('Вы уверены, что хотите сбросить настройки к значениям по умолчанию?')) {
      return;
    }

    try {
      setIsSaving(true);
      const response = await apiCall('/api/auth/settings/reset', { method: 'POST' });
      
      if (response.ok) {
        setMessage({ type: 'success', text: 'Настройки сброшены к значениям по умолчанию' });
        await loadSettings();
      } else {
        setMessage({ type: 'error', text: 'Ошибка сброса настроек' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Ошибка сброса настроек' });
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  if (isLoading) {
    return (
      <Card className="w-full p-2">
        <CardBody className="flex flex-col items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Загрузка настроек авторизации...</p>
        </CardBody>
      </Card>
    );
  }

  if (!settings) {
    return (
      <Card className="w-full p-2">
        <CardBody className="text-center py-12">
          <p className="text-red-600">Ошибка загрузки настроек авторизации</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="w-full p-2">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-xl font-semibold">Настройки авторизации</h3>
            <p className="text-sm text-gray-600">
              Управление параметрами токенов и безопасности
            </p>
          </div>
        </div>
      </CardHeader>

      <CardBody className="space-y-6">
        {/* Сообщения */}
        {message && (
          <div className={`p-3 rounded-md ${
            message.type === 'success' 
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Время жизни токенов */}
          <div className="space-y-4 flex-1">
            <h4 className="text-md font-bold">Время жизни токенов</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Access Token
                </label>
                <Input
                  placeholder="1h, 2h, 30m, etc."
                  value={settings.accessTokenExpiresIn}
                  onChange={(e) => setSettings({...settings, accessTokenExpiresIn: e.target.value})}
                  size="sm"
                />
                <p className="text-xs text-gray-500 mt-1">Примеры: 1h, 2h, 30m, 1d</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Refresh Token
                </label>
                <Input
                  placeholder="30d, 7d, 1d, etc."
                  value={settings.refreshTokenExpiresIn}
                  onChange={(e) => setSettings({...settings, refreshTokenExpiresIn: e.target.value})}
                  size="sm"
                />
                <p className="text-xs text-gray-500 mt-1">Примеры: 30d, 7d, 1d</p>
              </div>
            </div>
          </div>

          {/* Пороги обновления */}
          <div className="space-y-4 flex-1">
            <h4 className="text-md font-bold">Пороги обновления</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Middleware (секунды)
                </label>
                <Input
                  type="number"
                  value={settings.middlewareRefreshThresholdSeconds.toString()}
                  onChange={(e) => setSettings({...settings, middlewareRefreshThresholdSeconds: parseInt(e.target.value)})}
                  min="60"
                  max="3600"
                  size="sm"
                />
                <p className="text-xs text-gray-500 mt-1">За сколько секунд до истечения обновлять в middleware</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Клиент (минуты)
                </label>
                <Input
                  type="number"
                  value={settings.clientRefreshThresholdMinutes.toString()}
                  onChange={(e) => setSettings({...settings, clientRefreshThresholdMinutes: parseInt(e.target.value)})}
                  min="1"
                  max="60"
                  size="sm"
                />
                <p className="text-xs text-gray-500 mt-1">За сколько минут до истечения обновлять в клиенте</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Порог неактивности (дни)
                </label>
                <Input
                  type="number"
                  value={settings.userActivityThresholdDays.toString()}
                  onChange={(e) => setSettings({...settings, userActivityThresholdDays: parseInt(e.target.value)})}
                  min="1"
                  max="365"
                  size="sm"
                />
                <p className="text-xs text-gray-500 mt-1">Через сколько дней неактивности блокировать пользователя</p>
              </div>
            </div>
          </div>

          {/* Включение/отключение функций */}
          <div className="space-y-4">
            <h4 className="text-md font-bold">Включение функций</h4>
            <div className="space-y-4 mt-6">
              <div className="flex items-start gap-3">
              <Switch
                size="sm"
                isSelected={settings.tokenRefreshEnabled}
                onValueChange={(checked) => setSettings({...settings, tokenRefreshEnabled: checked})}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium text-sm">Автоматическое обновление токенов</div>
                <div className="text-xs text-gray-400">tokenRefreshEnabled - true/false</div>
              </div>
              </div>

              <div className="flex items-start gap-3">
              <Switch
                size="sm"
                isSelected={settings.middlewareAutoRefreshEnabled}
                onValueChange={(checked) => setSettings({...settings, middlewareAutoRefreshEnabled: checked})}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium text-sm">Автообновление в middleware</div>
                <div className="text-xs text-gray-400">Обновление токенов на сервере</div>
              </div>
              </div>

              <div className="flex items-start gap-3">
              <Switch
                size="sm"
                isSelected={settings.clientAutoRefreshEnabled}
                onValueChange={(checked) => setSettings({...settings, clientAutoRefreshEnabled: checked})}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium text-sm">Автообновление в клиенте</div>
                <div className="text-xs text-gray-400">Обновление токенов в браузере</div>
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
            isLoading={isSaving}
            isDisabled={!settings}
          >
            {isSaving ? 'Сохранение...' : 'Сохранить настройки'}
          </Button>

          <Button
            color="default"
            variant="light"
            onPress={resetToDefaults}
            isDisabled={isSaving}
          >
            Сбросить к умолчанию
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};
