import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { DynamicIcon } from 'lucide-react/dynamic';

interface ServerStatusSettingsData {
  id?: number;
  key: string;
  value: string;
  description?: string;
}

export const ServerStatusSettings: React.FC = () => {
  const [settings, setSettings] = useState<ServerStatusSettingsData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  useEffect(() => {
    fetchServerSettings();
  }, []);

  const fetchServerSettings = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/settings', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        // Фильтруем только настройки, связанные со статусом сервера
        const serverSettings = data.filter((setting: ServerStatusSettingsData) =>
          setting.key.startsWith('server_status_') || setting.key === 'server_check_interval'
        );
        setSettings(serverSettings);
      }
    } catch (error) {
      console.error('Error fetching server settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateSetting = async (key: string) => {
    if (!editingValue.trim()) {
      alert('Значення не може бути порожнім');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/settings/${key}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ value: editingValue })
      });

      if (response.ok) {
        await fetchServerSettings();
        setEditingKey(null);
        setEditingValue('');
      } else {
        throw new Error('Failed to update setting');
      }
    } catch (error) {
      console.error('Error updating server setting:', error);
      alert('Помилка оновлення налаштування');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSetting = async () => {
    const settingKey = 'server_check_interval';
    const settingValue = '30000';
    const description = 'Інтервал перевірки статусу сервера в мілісекундах (за замовчуванням 30000мс = 30сек)';

    setIsLoading(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          key: settingKey,
          value: settingValue,
          description: description
        })
      });

      if (response.ok) {
        await fetchServerSettings();
      } else {
        throw new Error('Failed to create setting');
      }
    } catch (error) {
      console.error('Error creating server setting:', error);
      alert('Помилка створення налаштування');
    } finally {
      setIsLoading(false);
    }
  };

  const startEditing = (setting: ServerStatusSettingsData) => {
    setEditingKey(setting.key);
    setEditingValue(setting.value);
  };

  const cancelEditing = () => {
    setEditingKey(null);
    setEditingValue('');
  };

  const hasIntervalSetting = settings.some(setting => setting.key === 'server_check_interval');

  return (
    <div className="space-y-6">

      {/* Создание настройки интервала, если её нет */}
      {!hasIntervalSetting && (
        <div className="p-4 border rounded-lg bg-blue-50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-blue-900">Створити налаштування інтервалу перевірки</h3>
              <p className="text-sm text-blue-700 mt-1">
                Налаштування для інтервалу перевірки статусу сервера ще не створено
              </p>
            </div>
            <Button
              onClick={handleCreateSetting}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLoading ? 'Створення...' : 'Створити'}
            </Button>
          </div>
        </div>
      )}

      {/* Список настроек статуса сервера */}
      <div className="p-4 border rounded-lg bg-white">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Налаштування статусу сервера</h3>

        <div className="space-y-4">
          {settings.map((setting) => (
            <div key={setting.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <div className="flex items-center space-x-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <DynamicIcon name="server" size={16} className="text-gray-500" />
                      <p className="text-sm font-medium text-gray-900">{setting.key}</p>
                    </div>
                    {setting.description && (
                      <p className="text-sm text-gray-500">{setting.description}</p>
                    )}
                  </div>

                  {editingKey === setting.key ? (
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-32"
                        placeholder="мс"
                        min="1000"
                        step="1000"
                      />
                      <Button
                        onClick={() => handleUpdateSetting(setting.key)}
                        disabled={isLoading}
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <DynamicIcon name="check" size={16} />
                      </Button>
                      <Button
                        onClick={cancelEditing}
                        variant="outline"
                        size="sm"
                      >
                        <DynamicIcon name="x" size={16} />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-900 font-mono bg-gray-100 px-3 py-1 rounded">
                        {setting.key === 'server_check_interval' ? `${setting.value}мс` : setting.value}
                      </span>
                      <Button
                        onClick={() => startEditing(setting)}
                        variant="outline"
                        size="sm"
                      >
                        <DynamicIcon name="edit" size={16} />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="mt-3 text-xs text-gray-400">
                  Оновлено: {setting.id ? new Date().toLocaleString('uk-UA') : 'Щойно створено'}
                </div>
              </div>
            </div>
          ))}

          {settings.length === 0 && (
            <p className="text-gray-500 text-center py-8">Налаштування статусу сервера не знайдено</p>
          )}
        </div>
      </div>
    </div>
  );
};
