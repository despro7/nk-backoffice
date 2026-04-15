import { useState, useEffect } from 'react';
import { Button, NumberInput, Select, SelectItem, Card, CardHeader, CardBody } from '@heroui/react';
import { useApi } from '../hooks/useApi';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from "@/services/ToastService";

interface OrderInterfaceSettingsType {
  defaultTab: "confirmed" | "readyToShip" | "shipped" | "all";
  pageSize: number;
}

const DEFAULT_SETTINGS: OrderInterfaceSettingsType = {
  defaultTab: "confirmed",
  pageSize: 8,
};

const TAB_OPTIONS = [
  { value: "confirmed", label: "Підтверджені" },
  { value: "readyToShip", label: "Готові до відправлення" },
  { value: "shipped", label: "Відправлені" },
  { value: "all", label: "Всі" }
] as const;


export const OrderInterfaceSettings: React.FC = () => {
  const { apiCall } = useApi();
  const [settings, setSettings] = useState<OrderInterfaceSettingsType | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Завантаження налаштувань
  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await apiCall('/api/settings');
      if (response.ok) {
        const allSettings = await response.json();

        // Шукаємо налаштування інтерфейсу замовлень
        const defaultTabSetting = allSettings.find((s: any) => s.key === 'orders_default_tab');
        const pageSizeSetting = allSettings.find((s: any) => s.key === 'orders_page_size');

        setSettings({
          defaultTab: (defaultTabSetting?.value as OrderInterfaceSettingsType['defaultTab']) || DEFAULT_SETTINGS.defaultTab,
          pageSize: parseInt(pageSizeSetting?.value) || DEFAULT_SETTINGS.pageSize,
        });
      }
    } catch (error) {
      console.error('Error loading order interface settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Збереження налаштування
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
        // Якщо налаштування вже існує, оновлюємо його
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

  // Збереження всіх налаштувань
  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      if (!settings) return;
      
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
        ),
      ];

      const results = await Promise.all(promises);

      if (results.every(result => result)) {
        ToastService.show({
          title: 'Налаштування збережено успішно!',
          hideIcon: false,
          color: 'success'
        });
        await loadSettings(); // Перезавантажуємо налаштування
      } else {
        ToastService.show({
          title: 'Помилка збереження деяких налаштувань',
          color: 'danger'
        });
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      ToastService.show({
        title: 'Помилка збереження налаштувань',
        color: 'danger'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Скидання до стандартних налаштувань (тимчасово вимкнено, щоб уникнути випадкових скидань)
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
    <>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Таб за замовчуванням */}
      <div className="space-y-2">
        
        <Select
          selectedKeys={settings ? [settings.defaultTab] : []}
          onSelectionChange={(keys) => {
            const selected = Array.from(keys)[0] as OrderInterfaceSettingsType['defaultTab'];
            setSettings(prev => prev ? { ...prev, defaultTab: selected } : null);
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
          value={settings?.pageSize || DEFAULT_SETTINGS.pageSize}
          onValueChange={(num) => {
            if (num > 0 && num <= 100) {
              setSettings(prev => prev ? { ...prev, pageSize: num } : DEFAULT_SETTINGS);
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

    {/* Кнопки дій */}
    <div className="flex space-x-3 mt-6">
      <Button
        onPress={handleSaveSettings}
        disabled={isSaving}
        variant="solid"
        color="primary"
        // className="bg-blue-600 hover:bg-blue-700 text-white"
      >
        <DynamicIcon name="save" size={14} /> {isSaving ? 'Збереження...' : 'Зберегти'}
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
  );
};
