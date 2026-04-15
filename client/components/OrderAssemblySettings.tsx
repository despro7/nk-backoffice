import { useState, useEffect, useRef } from 'react';
import { Button, Select, SelectItem, Switch, NumberInput, Card, CardHeader, CardBody } from '@heroui/react';
import { useApi } from '../hooks/useApi';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';

type BoxInitialStatus = 'default' | 'pending' | 'awaiting_confirmation';

interface OrderAssemblySettingsType {
  boxInitialStatus: BoxInitialStatus;
  autoSelectNext: boolean;
  allowManualSelect: boolean;
  successIndicationMs: number;
  successToastMs: number;
  errorIndicationMs: number;
  errorToastMs: number;
}

const DEFAULT_SETTINGS: OrderAssemblySettingsType = {
  boxInitialStatus: 'default',
  autoSelectNext: true,
  allowManualSelect: false,
  successIndicationMs: 1500,
  successToastMs: 3000,
  errorIndicationMs: 1000,
  errorToastMs: 3000,
};

const BOX_STATUS_OPTIONS = [
  { value: 'default', label: 'Потребує сканування' },
  { value: 'pending', label: 'Вже відсканована' },
] as const;

export const OrderAssemblySettings: React.FC = () => {
  const { apiCall } = useApi();
  const [settings, setSettings] = useState<OrderAssemblySettingsType | null>(null);
  const initialSettingsRef = useRef<OrderAssemblySettingsType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Завантаження налаштувань
  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await apiCall('/api/settings');
      if (response.ok) {
        const allSettings = await response.json();
        const find = (key: string) => allSettings.find((s: any) => s.key === key);

        const loaded: OrderAssemblySettingsType = {
          boxInitialStatus: (find('assembly_box_initial_status')?.value as BoxInitialStatus) || DEFAULT_SETTINGS.boxInitialStatus,
          autoSelectNext: (find('assembly_auto_select_next')?.value ?? 'true') === 'true',
          allowManualSelect: (find('assembly_allow_manual_select')?.value ?? 'false') === 'true',
          successIndicationMs: parseInt(find('assembly_success_indication_ms')?.value) || DEFAULT_SETTINGS.successIndicationMs,
          successToastMs: parseInt(find('assembly_success_toast_ms')?.value) || DEFAULT_SETTINGS.successToastMs,
          errorIndicationMs: parseInt(find('assembly_error_indication_ms')?.value) || DEFAULT_SETTINGS.errorIndicationMs,
          errorToastMs: parseInt(find('assembly_error_toast_ms')?.value) || DEFAULT_SETTINGS.errorToastMs,
        };
        setSettings(loaded);
        initialSettingsRef.current = loaded;
      }
    } catch (error) {
      console.error('Error loading assembly settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Збереження одного налаштування через upsert (PUT завжди створить або оновить)
  const saveSetting = async (key: string, value: string, description: string): Promise<boolean> => {
    try {
      const response = await apiCall(`/api/settings/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value, description, category: 'orders_interface' }),
      });
      return response.ok;
    } catch (error) {
      console.error(`Error saving setting ${key}:`, error);
      return false;
    }
  };

  // Мапи ключів → опис для відправки на сервер
  const SETTING_META: Record<keyof OrderAssemblySettingsType, { key: string; description: string; serialize: (v: any) => string }> = {
    boxInitialStatus:     { key: 'assembly_box_initial_status',     description: 'Початковий статус коробки при відкритті замовлення', serialize: String },
    autoSelectNext:       { key: 'assembly_auto_select_next',       description: 'Автовибір наступного товару після успішного зважування', serialize: String },
    allowManualSelect:    { key: 'assembly_allow_manual_select',    description: 'Дозволити ручний вибір товару кліком',              serialize: String },
    successIndicationMs:  { key: 'assembly_success_indication_ms',  description: 'Час індикації success-статусу (мс)',                 serialize: String },
    successToastMs:       { key: 'assembly_success_toast_ms',       description: 'Час показу Toast при успіху (мс)',                   serialize: String },
    errorIndicationMs:    { key: 'assembly_error_indication_ms',    description: 'Час індикації error-статусу (мс)',                   serialize: String },
    errorToastMs:         { key: 'assembly_error_toast_ms',         description: 'Час показу Toast при помилці (мс)',                  serialize: String },
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      const initial = initialSettingsRef.current;

      // Збираємо тільки змінені поля
      const changedEntries = (Object.keys(SETTING_META) as Array<keyof OrderAssemblySettingsType>).filter(
        field => !initial || String(settings[field]) !== String(initial[field])
      );

      if (changedEntries.length === 0) {
        ToastService.show({ title: 'Немає змін для збереження', color: 'default', hideIcon: false });
        return;
      }

      const results = await Promise.all(
        changedEntries.map(field => {
          const meta = SETTING_META[field];
          return saveSetting(meta.key, meta.serialize(settings[field]), meta.description);
        })
      );

      if (results.every(Boolean)) {
        ToastService.show({ title: 'Налаштування збережено успішно!', color: 'success', hideIcon: false });
        await loadSettings();
      } else {
        ToastService.show({ title: 'Помилка збереження налаштувань', color: 'danger', hideIcon: false });
      }
    } catch (error) {
      console.error('Error saving assembly settings:', error);
      ToastService.show({ title: 'Помилка збереження налаштувань', color: 'danger', hideIcon: false });
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
        <h3 className="font-semibold text-gray-900">Налаштування збирання замовлень</h3>
      </CardHeader>
      <CardBody className="p-5">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-500 mt-2">Завантаження...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-6">
              {/* Початковий статус коробки */}
              <div className="space-y-2 col-span-2">
                <Select
                  selectedKeys={settings ? [settings.boxInitialStatus] : []}
                  onSelectionChange={(keys) => {
                    const selected = Array.from(keys)[0] as BoxInitialStatus;
                    setSettings(prev => prev ? { ...prev, boxInitialStatus: selected } : null);
                  }}
                  placeholder="Виберіть статус"
                  className="w-full"
                  label="Початковий статус коробки"
                  labelPlacement="outside"
                  description="В якому стані буде коробка при відкритті замовлення"
                >
                  {BOX_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </Select>
              </div>

              {/* Автовибір наступного товару */}
              <div className="col-span-2">
                <Switch
                  isSelected={settings?.autoSelectNext ?? DEFAULT_SETTINGS.autoSelectNext}
                  onValueChange={(val) => setSettings(prev => prev ? { ...prev, autoSelectNext: val } : null)}
                >
                  Автовибір наступного товару після успішного зважування
                </Switch>
              </div>

              {/* Ручний вибір товару */}
              <div className="col-span-2">
                <Switch
                  isSelected={settings?.allowManualSelect ?? DEFAULT_SETTINGS.allowManualSelect}
                  onValueChange={(val) => setSettings(prev => prev ? { ...prev, allowManualSelect: val } : null)}
                >
                  Дозволити ручний вибір товару кліком
                </Switch>
              </div>

              {/* Повідомлення про успіх */}
              <div className="col-span-2">
                <p className="flex items-center gap-2 text-md font-bold text-gray-700 mb-3"><DynamicIcon name="check-circle" size={16} className="text-success-500" /> Повідомлення про успіх</p>
                <div className="grid grid-cols-2 gap-4">
                  <NumberInput
                    value={settings?.successIndicationMs ?? DEFAULT_SETTINGS.successIndicationMs}
                    onValueChange={(num) => setSettings(prev => prev ? { ...prev, successIndicationMs: num } : null)}
                    min={0}
                    max={10000}
                    step={100}
                    label="Час індикації success-статусу"
                    labelPlacement="outside"
                    description="в мілісекундах"
                    className="w-full"
                  />
                  <NumberInput
                    value={settings?.successToastMs ?? DEFAULT_SETTINGS.successToastMs}
                    onValueChange={(num) => setSettings(prev => prev ? { ...prev, successToastMs: num } : null)}
                    min={0}
                    max={30000}
                    step={100}
                    label="Час показу Toast"
                    labelPlacement="outside"
                    description="в мілісекундах"
                    className="w-full"
                  />
                </div>
              </div>

              {/* Повідомлення про помилку */}
              <div className="col-span-2">
                <p className="flex items-center gap-2 text-md font-bold text-gray-700 mb-3"><DynamicIcon name="alert-triangle" size={16} className="text-danger-500" /> Повідомлення про помилку</p>
                <div className="grid grid-cols-2 gap-4">
                  <NumberInput
                    value={settings?.errorIndicationMs ?? DEFAULT_SETTINGS.errorIndicationMs}
                    onValueChange={(num) => setSettings(prev => prev ? { ...prev, errorIndicationMs: num } : null)}
                    min={0}
                    max={10000}
                    step={100}
                    label="Час індикації error-статусу"
                    labelPlacement="outside"
                    description="в мілісекундах"
                    className="w-full"
                  />
                  <NumberInput
                    value={settings?.errorToastMs ?? DEFAULT_SETTINGS.errorToastMs}
                    onValueChange={(num) => setSettings(prev => prev ? { ...prev, errorToastMs: num } : null)}
                    min={0}
                    max={30000}
                    step={100}
                    label="Час показу Toast"
                    labelPlacement="outside"
                    description="в мілісекундах"
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <Button
                onPress={handleSaveSettings}
                isDisabled={isSaving}
                variant="solid"
                color="primary"
              >
                <DynamicIcon name="save" size={14} /> {isSaving ? 'Збереження...' : 'Зберегти'}
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
};
