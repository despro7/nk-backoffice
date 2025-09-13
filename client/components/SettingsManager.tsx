import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';

interface SettingsBase {
  id: number;
  key: string;
  value: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateSettingInput {
  key: string;
  value: string;
  description?: string;
}

export const SettingsManager: React.FC = () => {
  const [settings, setSettings] = useState<SettingsBase[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newSetting, setNewSetting] = useState<CreateSettingInput>({
    key: '',
    value: '',
    description: ''
  });
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const handleCreateSetting = async () => {
    if (!newSetting.key || !newSetting.value) {
      alert('Ключ та значення обов\'язкові');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(newSetting)
      });

      if (response.ok) {
        await fetchSettings();
        setNewSetting({ key: '', value: '', description: '' });
        setIsCreating(false);
      } else {
        throw new Error('Failed to create setting');
      }
    } catch (error) {
      console.error('Error creating setting:', error);
      alert('Помилка створення налаштування');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateSetting = async (key: string) => {
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
        await fetchSettings();
        setEditingKey(null);
        setEditingValue('');
      } else {
        throw new Error('Failed to update setting');
      }
    } catch (error) {
      console.error('Error updating setting:', error);
      alert('Помилка оновлення налаштування');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSetting = async (key: string) => {
    if (!confirm('Ви впевнені, що хочете видалити це налаштування?')) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/settings/${key}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        await fetchSettings();
      } else {
        throw new Error('Failed to delete setting');
      }
    } catch (error) {
      console.error('Error deleting setting:', error);
      alert('Помилка видалення налаштування');
    } finally {
      setIsLoading(false);
    }
  };

  const startEditing = (setting: SettingsBase) => {
    setEditingKey(setting.key);
    setEditingValue(setting.value);
  };

  const cancelEditing = () => {
    setEditingKey(null);
    setEditingValue('');
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-900 mb-4">Загальні налаштування</h2>
      {/* Создание нового настройки */}
      <div className="p-4 border rounded-lg bg-white">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Додати нове налаштування</h3>
          <Button
            onClick={() => setIsCreating(!isCreating)}
            variant="outline"
            size="sm"
          >
            {isCreating ? 'Скасувати' : 'Додати'}
          </Button>
        </div>

        {isCreating && (
          <div className="space-y-4 mt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ключ *
                </label>
                <input
                  type="text"
                  value={newSetting.key}
                  onChange={(e) => setNewSetting(prev => ({ ...prev, key: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="setting_key"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Значення *
                </label>
                <input
                  type="text"
                  value={newSetting.value}
                  onChange={(e) => setNewSetting(prev => ({ ...prev, value: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="setting_value"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Опис
                </label>
                <input
                  type="text"
                  value={newSetting.description}
                  onChange={(e) => setNewSetting(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Опис налаштування"
                />
              </div>
            </div>

            <Button
              onClick={handleCreateSetting}
              disabled={isLoading || !newSetting.key || !newSetting.value}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isLoading ? 'Створення...' : 'Створити'}
            </Button>
          </div>
        )}
      </div>

      {/* Список всех настроек */}
      <div className="p-4 border rounded-lg bg-white">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Всі налаштування</h3>
        
        <div className="space-y-4">
          {settings.map((setting) => (
            <div key={setting.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-8 min-w-0">
                  <div className="flex-1 min-w-fit">
                    <p className="text-sm font-medium text-gray-900">{setting.key}</p>
                    {setting.description && (
                      <p className="text-sm text-gray-500">{setting.description}</p>
                    )}
                  </div>
                  
                  {editingKey === setting.key ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        className="px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <Button
                        onClick={() => handleUpdateSetting(setting.key)}
                        disabled={isLoading}
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        Зберегти
                      </Button>
                      <Button
                        onClick={cancelEditing}
                        variant="outline"
                        size="sm"
                      >
                        Скасувати
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex-1 min-w-0 break-words text-sm text-gray-900 font-mono bg-gray-100 px-2 py-1 mr-2 rounded">
                        {setting.value}
                      </span>
                      <Button
                        onClick={() => startEditing(setting)}
                        variant="outline"
                        size="sm"
                      >
                        Редагувати
                      </Button>
                      <Button
                        onClick={() => handleDeleteSetting(setting.key)}
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        Видалити
                      </Button>
                    </div>
                  )}
                </div>
                
                <div className="mt-2 text-xs text-gray-400">
                  Оновлено: {new Date(setting.updatedAt).toLocaleString('uk-UA')}
                </div>
              </div>
            </div>
          ))}
          
          {settings.length === 0 && (
            <p className="text-gray-500 text-center py-8">Налаштування не знайдено</p>
          )}
        </div>
      </div>
    </div>
  );
};
