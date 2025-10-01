import React, { useState, useEffect } from 'react';
import { Button, NumberInput, Select, SelectItem } from '@heroui/react';
import { Card, CardHeader, CardBody } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

interface WeightToleranceSettingsType {
  type: 'percentage' | 'absolute' | 'combined';
  percentage: number;
  absolute: number;
}

interface WeightToleranceSettingsProps {
  onSave?: (settings: WeightToleranceSettingsType) => void;
}

const TOLERANCE_TYPES = [
  { value: 'combined', label: 'Комбінована', description: 'Використовує обидва типи похибок' },
  { value: 'percentage', label: 'Тільки відсоткова', description: 'Використовує тільки відсоткову похибку' },
  { value: 'absolute', label: 'Тільки абсолютна', description: 'Використовує тільки абсолютну похибку' }
] as const;

export const WeightToleranceSettings: React.FC<WeightToleranceSettingsProps> = ({ onSave }) => {
  const [settings, setSettings] = useState<WeightToleranceSettingsType>({
    type: 'combined',
    percentage: 5,
    absolute: 20
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
          absolute: data.absolute || 20
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
          type: settings.type,
          percentage: settings.percentage,
          absolute: settings.absolute
        })
      });

      if (response.ok) {
        const updatedSettings = await response.json();
        setSettings({
          type: updatedSettings.type || 'combined',
          percentage: updatedSettings.percentage || 5,
          absolute: updatedSettings.absolute || 20
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
          {/* Тип погрешности */}
          <div className="space-y-2">
            <Select
              selectedKeys={[settings.type]}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as WeightToleranceSettingsType['type'];
                setSettings(prev => ({ ...prev, type: selected }));
              }}
              placeholder="Виберіть тип похибки"
              label="Тип похибки"
              labelPlacement="outside"
              className="w-full"
            >
                              {TOLERANCE_TYPES.map((option) => (
                  <SelectItem key={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
            </Select>
            <p className="text-xs text-gray-500">
              {TOLERANCE_TYPES.find(t => t.value === settings.type)?.description}
            </p>
          </div>

          {/* Погрешности */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Похибка у відсотках */}
            {(settings.type === 'combined' || settings.type === 'percentage') && (
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
                />
              </div>
            )}

            {/* Абсолютне значення */}
            {(settings.type === 'combined' || settings.type === 'absolute') && (
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
                />
              </div>
            )}
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
