import React, { useState, useEffect } from 'react';
import { Button, NumberInput } from '@heroui/react';
import { Card, CardHeader, CardBody } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface WeightToleranceSettingsType {
  maxTolerance: number;
  minTolerance: number;
  maxPortions: number;
  minPortions: number;
  portionMultiplier: number;
  toleranceReductionPercent: number;
}

interface WeightToleranceSettingsProps {
  onSave?: (settings: WeightToleranceSettingsType) => void;
}

export const WeightToleranceSettings: React.FC<WeightToleranceSettingsProps> = ({ onSave }) => {
  const [settings, setSettings] = useState<WeightToleranceSettingsType>({
    maxTolerance: 30,
    minTolerance: 10,
    maxPortions: 12,
    minPortions: 1,
    portionMultiplier: 2,
    toleranceReductionPercent: 60
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
          maxTolerance: data.maxTolerance || 30,
          minTolerance: data.minTolerance || 10,
          maxPortions: data.maxPortions || 12,
          minPortions: data.minPortions || 1,
          portionMultiplier: data.portionMultiplier || 2,
          toleranceReductionPercent: data.toleranceReductionPercent || 60
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
          maxTolerance: settings.maxTolerance,
          minTolerance: settings.minTolerance,
          maxPortions: settings.maxPortions,
          minPortions: settings.minPortions,
          portionMultiplier: settings.portionMultiplier,
          toleranceReductionPercent: settings.toleranceReductionPercent
        })
      });

      if (response.ok) {
        const updatedSettings = await response.json();
        setSettings({
          maxTolerance: updatedSettings.maxTolerance || 30,
          minTolerance: updatedSettings.minTolerance || 10,
          maxPortions: updatedSettings.maxPortions || 12,
          minPortions: updatedSettings.minPortions || 1,
          portionMultiplier: updatedSettings.portionMultiplier || 2,
          toleranceReductionPercent: updatedSettings.toleranceReductionPercent || 60
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
              <p className="text-xs text-gray-500">Похибка для {settings.maxPortions}+ порцій (при x{settings.portionMultiplier} більше зменшується до {settings.toleranceReductionPercent}%)</p>
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

            {/* Коефіцієнт множення */}
            <div className="space-y-2">
              <NumberInput
                value={settings.portionMultiplier}
                onValueChange={(num) => {
                  if (num >= 1) {
                    setSettings(prev => ({ ...prev, portionMultiplier: num }));
                  }
                }}
                min={1}
                max={10}
                step={0.1}
                placeholder="2"
                labelPlacement="outside"
                label="Коефіцієнт множення порцій"
                className="w-full"
              />
              <p className="text-xs text-gray-500">При кількості порцій ≥ {settings.maxPortions} × {settings.portionMultiplier} = {(settings.maxPortions * settings.portionMultiplier).toFixed(0)}</p>
            </div>

            {/* Процент зменшення */}
            <div className="space-y-2">
              <NumberInput
                value={settings.toleranceReductionPercent}
                onValueChange={(num) => {
                  if (num >= 1 && num <= 100) {
                    setSettings(prev => ({ ...prev, toleranceReductionPercent: num }));
                  }
                }}
                min={1}
                max={100}
                step={1}
                placeholder="60"
                labelPlacement="outside"
                label="Процент зменшення похибки (%)"
                className="w-full"
              />
              <p className="text-xs text-gray-500">Похибка зменшиться до {((settings.minTolerance * settings.toleranceReductionPercent) / 100).toFixed(1)}г</p>
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
