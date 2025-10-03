import React, { useState, useEffect } from 'react';
import { Button, NumberInput, Select, SelectItem } from '@heroui/react';
import { Card, CardHeader, CardBody } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface WeightToleranceSettingsType {
  type: 'percentage' | 'absolute' | 'combined';
  percentage: number;
  absolute: number;
  maxTolerance: number;
  minTolerance: number;
  maxPortions: number;
  minPortions: number;
}

interface WeightToleranceSettingsProps {
  onSave?: (settings: WeightToleranceSettingsType) => void;
}

// Убираем старые типы tolerance - теперь используем только динамическую логику
// const TOLERANCE_TYPES = [
//   { value: 'combined', label: 'Комбінована', description: 'Використовує обидва типи похибок' },
//   { value: 'percentage', label: 'Тільки відсоткова', description: 'Використовує тільки відсоткову похибку' },
//   { value: 'absolute', label: 'Тільки абсолютна', description: 'Використовує тільки абсолютну похибку' }
// ] as const;

export const WeightToleranceSettings: React.FC<WeightToleranceSettingsProps> = ({ onSave }) => {
  const [settings, setSettings] = useState<WeightToleranceSettingsType>({
    type: 'combined',
    percentage: 5,
    absolute: 20,
    maxTolerance: 30,
    minTolerance: 10,
    maxPortions: 12,
    minPortions: 1
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings/weight-tolerance/values', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setSettings({
          type: data.type || 'combined',
          percentage: data.percentage || 5,
          absolute: data.absolute || 20,
          maxTolerance: data.maxTolerance || 30,
          minTolerance: data.minTolerance || 10,
          maxPortions: data.maxPortions || 12,
          minPortions: data.minPortions || 1
        });
      }
    } catch (error) {
      console.error('Error fetching weight tolerance settings:', error);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/settings/weight-tolerance/values', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          // Старые настройки убираем - они не используются в новой логике
          // type: settings.type,
          // percentage: settings.percentage,
          // absolute: settings.absolute,
          maxTolerance: settings.maxTolerance,
          minTolerance: settings.minTolerance,
          maxPortions: settings.maxPortions,
          minPortions: settings.minPortions
        })
      });

      if (response.ok) {
        const updatedSettings = await response.json();
        setSettings({
          type: updatedSettings.type || 'combined',
          percentage: updatedSettings.percentage || 5,
          absolute: updatedSettings.absolute || 20,
          maxTolerance: updatedSettings.maxTolerance || 30,
          minTolerance: updatedSettings.minTolerance || 10,
          maxPortions: updatedSettings.maxPortions || 12,
          minPortions: updatedSettings.minPortions || 1
        });
        onSave?.(updatedSettings);
      } else {
        throw new Error('Failed to update settings');
      }
    } catch (error) {
      console.error('Error updating weight tolerance settings:', error);
      alert('Помилка оновлення налаштувань');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="border-b px-5">
        <h3 className="font-semibold text-gray-900">Налаштування похибки вимірювання ваги</h3>
      </CardHeader>
      <CardBody className="p-5">
        <div className="space-y-6">
          {/* Динамическая настройка похибки */}
          <div className="space-y-4">
            <div className="border-b pb-2">
              <h4 className="font-medium text-gray-900">Налаштування динамічної похибки ваги</h4>
              <p className="text-xs text-gray-500 mt-1">
                Похибка розраховується залежно від кількості порцій у товарі
              </p>
            </div>

          {/* Динамические настройки похибки */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Максимальная похибка */}
            <div className="space-y-2">
              <NumberInput
                value={settings.maxTolerance}
                onValueChange={(num) => {
                  if (num >= 0) {
                    setSettings(prev => ({ ...prev, maxTolerance: num }));
                  }
                }}
                min={0}
                max={100}
                step={0.1}
                placeholder="30"
                labelPlacement="outside"
                label="Максимальна похибка (г)"
                className="w-full"
              />
              <p className="text-xs text-gray-500">Похибка для 1 порції товару</p>
            </div>

            {/* Минимальная похибка */}
            <div className="space-y-2">
              <NumberInput
                value={settings.minTolerance}
                onValueChange={(num) => {
                  if (num >= 0) {
                    setSettings(prev => ({ ...prev, minTolerance: num }));
                  }
                }}
                min={0}
                max={100}
                step={0.1}
                placeholder="10"
                labelPlacement="outside"
                label="Мінімальна похибка (г)"
                className="w-full"
              />
              <p className="text-xs text-gray-500">Похибка для 12+ порцій товару</p>
            </div>

            {/* Максимальное количество порций */}
            <div className="space-y-2">
              <NumberInput
                value={settings.maxPortions}
                onValueChange={(num) => {
                  if (num >= 1) {
                    setSettings(prev => ({ ...prev, maxPortions: num }));
                  }
                }}
                min={1}
                max={50}
                step={1}
                placeholder="12"
                labelPlacement="outside"
                label="Максимум порцій"
                className="w-full"
              />
              <p className="text-xs text-gray-500">Кількість порцій для мінімальної похибки</p>
            </div>

            {/* Минимальное количество порций */}
            <div className="space-y-2">
              <NumberInput
                value={settings.minPortions}
                onValueChange={(num) => {
                  if (num >= 1) {
                    setSettings(prev => ({ ...prev, minPortions: num }));
                  }
                }}
                min={1}
                max={10}
                step={1}
                placeholder="1"
                labelPlacement="outside"
                label="Мінімум порцій"
                className="w-full"
              />
              <p className="text-xs text-gray-500">Кількість порцій для максимальної похибки</p>
            </div>
          </div>

            {/* Старые настройки (для обратной совместимости) */}
            <div className="border-t pt-4">
              <h4 className="font-medium text-gray-900 mb-3">Застарілі налаштування (не використовуються)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 opacity-50">
                {/* Похибка у відсотках */}
                <div className="space-y-2">
                  <NumberInput
                    value={settings.percentage}
                    onValueChange={(num) => {
                      if (num >= 0) {
                        setSettings(prev => ({ ...prev, percentage: num }));
                      }
                    }}
                    min={0}
                    max={100}
                    step={0.1}
                    placeholder="5"
                    labelPlacement="outside"
                    label="Похибка у відсотках (%)"
                    className="w-full"
                    disabled
                  />
                </div>

                {/* Абсолютне значення */}
                <div className="space-y-2">
                  <NumberInput
                    value={settings.absolute}
                    onValueChange={(num) => {
                      if (num >= 0) {
                        setSettings(prev => ({ ...prev, absolute: num }));
                      }
                    }}
                    min={0}
                    max={1000}
                    step={1}
                    placeholder="20"
                    labelPlacement="outside"
                    label="Абсолютне значення (гр.)"
                    className="w-full"
                    disabled
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Кнопки действий */}
          <div className="flex space-x-3 mt-6">
            <Button
              onPress={handleSave}
              disabled={isLoading}
              variant="solid"
              color="primary"
            >
             <DynamicIcon name="save" size={14} /> {isLoading ? 'Збереження...' : 'Зберегти'}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
