import React, { useState, useEffect } from 'react';
import { Button, NumberInput } from '@heroui/react';
import { Select, SelectItem } from '@heroui/react';
import { useApi } from '../hooks/useApi';
import { Card, CardHeader, CardBody } from '@heroui/react';

interface OrderInterfaceSettings {
  defaultTab: "confirmed" | "readyToShip" | "shipped" | "all";
  pageSize: number;
}

const DEFAULT_SETTINGS: OrderInterfaceSettings = {
  defaultTab: "confirmed",
  pageSize: 10
};

const TAB_OPTIONS = [
  { value: "confirmed", label: "Підтверджені" },
  { value: "readyToShip", label: "Готові до відправлення" },
  { value: "shipped", label: "Відправлені" },
  { value: "all", label: "Всі" }
] as const;

const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 25, 50] as const;

export const OrderInterfaceSettings: React.FC = () => {
  const { apiCall } = useApi();
  const [settings, setSettings] = useState<OrderInterfaceSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Загрузка настроек
  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await apiCall('/api/settings');
      if (response.ok) {
        const allSettings = await response.json();

        // Ищем настройки интерфейса заказов
        const defaultTabSetting = allSettings.find((s: any) => s.key === 'orders_default_tab');
        const pageSizeSetting = allSettings.find((s: any) => s.key === 'orders_page_size');

        setSettings({
          defaultTab: (defaultTabSetting?.value as OrderInterfaceSettings['defaultTab']) || DEFAULT_SETTINGS.defaultTab,
          pageSize: parseInt(pageSizeSetting?.value) || DEFAULT_SETTINGS.pageSize
        });
      }
    } catch (error) {
      console.error('Error loading order interface settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Сохранение настройки
  const saveSetting = async (key: string, value: string, description: string) => {
    try {
      const response = await apiCall('/api/settings', {
        method: 'POST',
        body: JSON.stringify({
          key,
          value,
          description,
          category: 'orders_interface'
        })
      });

      if (!response.ok) {
        // Если настройка уже существует, обновляем её
        const updateResponse = await apiCall(`/api/settings/${key}`, {
          method: 'PUT',
          body: JSON.stringify({ value })
        });
        return updateResponse.ok;
      }

      return response.ok;
    } catch (error) {
      console.error(`Error saving setting ${key}:`, error);
      return false;
    }
  };

  // Сохранение всех настроек
  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const promises = [
        saveSetting(
          'orders_default_tab',
          settings.defaultTab,
          'Таб по умолчанию на странице заказов'
        ),
        saveSetting(
          'orders_page_size',
          settings.pageSize.toString(),
          'Количество заказов на странице'
        )
      ];

      const results = await Promise.all(promises);

      if (results.every(result => result)) {
        alert('Налаштування збережено успішно!');
        await loadSettings(); // Перезагружаем настройки
      } else {
        alert('Помилка збереження деяких налаштувань');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Помилка збереження налаштувань');
    } finally {
      setIsSaving(false);
    }
  };

  // Сброс к настройкам по умолчанию
  const handleResetToDefaults = async () => {
    if (!confirm('Ви впевнені, що хочете скинути налаштування до значень за замовчуванням?')) {
      return;
    }

    setIsSaving(true);
    try {
      setSettings(DEFAULT_SETTINGS);
      await handleSaveSettings();
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="border-b px-5">
        <h3 className="font-semibold text-gray-900">Інтерфейс сторінки замовлень</h3>
      </CardHeader>
      <CardBody className="p-5">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-500 mt-2">Завантаження...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Таб за замовчуванням */}
              <div className="space-y-2">
                
                <Select
                  selectedKeys={[settings.defaultTab]}
                  onSelectionChange={(keys) => {
                    const selected = Array.from(keys)[0] as OrderInterfaceSettings['defaultTab'];
                    setSettings(prev => ({ ...prev, defaultTab: selected }));
                  }}
                  placeholder="Виберіть таб"
                  className="w-full"
                  label="Таб за замовчуванням"
                  labelPlacement="outside"
                >
                  {TAB_OPTIONS.map((option) => (
                    <SelectItem key={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </Select>
              </div>

              {/* Кількість замовлень на сторінку */}
              <div className="space-y-2">
                <NumberInput
                  value={settings.pageSize}
                  onValueChange={(num) => {
                    if (num > 0 && num <= 100) {
                      setSettings(prev => ({ ...prev, pageSize: num }));
                    }
                  }}
                  min={1}
                  max={100}
                  step={1}
                  placeholder="10"
                  labelPlacement="outside"
                  label="Кількість замовлень на сторінку"
                  className="w-full"
                />
              </div>
            </div>

            {/* Кнопки действий */}
            <div className="flex space-x-3 mt-6">
              <Button
                onPress={handleSaveSettings}
                disabled={isSaving}
                variant="solid"
                color="primary"
                // className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isSaving ? 'Збереження...' : 'Зберегти'}
              </Button>
              {/* <Button
                onPress={handleResetToDefaults}
                variant="flat"
                disabled={isSaving}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                Скинути до замовчувань
              </Button> */}
              
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
};
