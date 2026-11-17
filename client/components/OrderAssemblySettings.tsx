import { useState, useEffect, useRef } from 'react';
import { Button, Select, SelectItem, Switch, NumberInput, Card, CardHeader, CardBody } from '@heroui/react';
import { useApi } from '../hooks/useApi';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';

type BoxInitialStatus = 'default' | 'pending' | 'awaiting_confirmation';
type AssemblyMode = 'standard' | 'no_scales';
type ProductScanMode = 'single_per_item' | 'by_quantity';

interface OrderAssemblySettingsType {
  mode: AssemblyMode;
  boxInitialStatus: BoxInitialStatus;
  productScanMode: ProductScanMode;
  autoSelectNext: boolean;
  allowManualSelect: boolean;
  economyMode: boolean;
  successIndicationMs: number;
  successToastMs: number;
  errorIndicationMs: number;
  errorToastMs: number;
}

const DEFAULT_SETTINGS: OrderAssemblySettingsType = {
  mode: 'standard',
  boxInitialStatus: 'default',
  productScanMode: 'single_per_item',
  autoSelectNext: true,
  allowManualSelect: false,
  economyMode: false,
  successIndicationMs: 1500,
  successToastMs: 3000,
  errorIndicationMs: 1000,
  errorToastMs: 3000,
};

const BOX_STATUS_OPTIONS = [
  { value: 'default', label: 'Потребує сканування' },
  { value: 'pending', label: 'Вже відсканована' },
] as const;

const PRODUCT_SCAN_MODE_OPTIONS = [
  { value: 'single_per_item', label: 'Одне сканування на позицію' },
  { value: 'by_quantity', label: 'Відповідно до кількості товарів' },
] as const;

const SettingsGroup: React.FC<{ icon: string; title: string; description?: string; children: React.ReactNode }> = ({ icon, title, description, children }) => (
  <section className="space-y-3">
    <div>
      <p className="flex items-center gap-2 text-sm font-semibold text-default-900">
        <DynamicIcon name={icon as any} size={16} className="text-default-500" /> {title}
      </p>
      {description && <p className="text-xs text-default-500 mt-0.5 ml-6">{description}</p>}
    </div>
    <div className="space-y-8 pt-3">{children}</div>
  </section>
);

const SwitchRow: React.FC<{
  title: string;
  description?: string;
  isSelected: boolean;
  onValueChange: (val: boolean) => void;
  highlighted?: boolean;
}> = ({ title, description, isSelected, onValueChange, highlighted }) => (
  <div
    className={`flex items-start justify-between gap-4 rounded-lg border p-3 ${
      highlighted ? 'border-default-300 bg-default-100' : 'border-default-200 bg-default-50'
    }`}
  >
    <div className="min-w-0">
      <p className="text-sm font-medium text-default-900">{title}</p>
      {description && <p className="text-xs text-default-500 mt-1">{description}</p>}
    </div>
    <Switch size="sm" isSelected={isSelected} onValueChange={onValueChange} aria-label={title} />
  </div>
);

const NotifyPanel: React.FC<{ icon: string; iconClass: string; title: string; children: React.ReactNode }> = ({ icon, iconClass, title, children }) => (
  <div className="rounded-lg border border-default-200 bg-default-50 p-4">
    <p className="flex items-center gap-2 text-sm font-semibold text-default-900 mb-3">
      <DynamicIcon name={icon as any} size={16} className={iconClass} /> {title}
    </p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
  </div>
);

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
          mode: (find('assembly_mode')?.value as AssemblyMode) || DEFAULT_SETTINGS.mode,
          boxInitialStatus: (find('assembly_box_initial_status')?.value as BoxInitialStatus) || DEFAULT_SETTINGS.boxInitialStatus,
          productScanMode: (find('assembly_product_scan_mode')?.value as ProductScanMode) || DEFAULT_SETTINGS.productScanMode,
          autoSelectNext: (find('assembly_auto_select_next')?.value ?? 'true') === 'true',
          allowManualSelect: (find('assembly_allow_manual_select')?.value ?? 'false') === 'true',
          economyMode: (find('assembly_economy_mode')?.value ?? 'false') === 'true',
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
    mode:                { key: 'assembly_mode',                     description: 'Режим комплектації (standard | no_scales)',         serialize: String },
    boxInitialStatus:     { key: 'assembly_box_initial_status',     description: 'Початковий статус коробки при відкритті замовлення', serialize: String },
    productScanMode:      { key: 'assembly_product_scan_mode',      description: 'Режим сканування товарів (single_per_item | by_quantity)', serialize: String },
    autoSelectNext:       { key: 'assembly_auto_select_next',       description: 'Автовибір наступного товару після успішного зважування', serialize: String },
    allowManualSelect:    { key: 'assembly_allow_manual_select',    description: 'Дозволити ручний вибір товару кліком',              serialize: String },
    economyMode:          { key: 'assembly_economy_mode',           description: 'Режим економії: підбір коробок за обсягом з урахуванням коефіцієнтів порцій', serialize: String },
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
    <Card>
      <CardHeader className="border-b px-5 flex-col items-start">
        <h3 className="font-semibold text-gray-900">Налаштування збирання замовлень</h3>
        <p className="text-xs text-default-500 mt-0.5">Режим комплектації, сканування, коробки та сповіщення</p>
      </CardHeader>
      <CardBody className="p-5">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-500 mt-2">Завантаження...</p>
          </div>
        ) : (
          <>
            <div className="space-y-8">
              {/* Основне */}
              <SettingsGroup icon="sliders-horizontal" title="Режим і сканування">
                <Select
                  selectedKeys={settings ? [settings.mode] : []}
                  onSelectionChange={(keys) => {
                    const selected = Array.from(keys)[0] as AssemblyMode;
                    setSettings(prev => prev ? { ...prev, mode: selected } : null);
                  }}
                  placeholder="Виберіть режим"
                  className="w-full"
                  label="Режим комплектації"
                  labelPlacement="outside"
                  description="Виберіть режим: стандартний або Без вагів"
                >
                  <SelectItem key="standard">Стандартний</SelectItem>
                  <SelectItem key="no_scales">Без вагів</SelectItem>
                </Select>

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
                    <SelectItem key={option.value}>{option.label}</SelectItem>
                  ))}
                </Select>

                <Select
                  selectedKeys={settings ? [settings.productScanMode] : []}
                  onSelectionChange={(keys) => {
                    const selected = Array.from(keys)[0] as ProductScanMode;
                    setSettings(prev => prev ? { ...prev, productScanMode: selected } : null);
                  }}
                  placeholder="Виберіть режим сканування"
                  className="w-full"
                  label="Режим сканування товарів"
                  labelPlacement="outside"
                  description="Визначає, скільки разів потрібно сканувати товар"
                >
                  {PRODUCT_SCAN_MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value}>{option.label}</SelectItem>
                  ))}
                </Select>
              </SettingsGroup>

              {/* Вибір товару */}
              <SettingsGroup icon="mouse-pointer-click" title="Вибір товару">
                {settings?.mode !== 'no_scales' && (
                  <SwitchRow
                    title="Автовибір наступного товару"
                    description="Після успішного зважування вибирається наступна позиція"
                    isSelected={settings?.autoSelectNext ?? DEFAULT_SETTINGS.autoSelectNext}
                    onValueChange={(val) => setSettings(prev => prev ? { ...prev, autoSelectNext: val } : null)}
                  />
                )}
                <SwitchRow
                  title="Ручний вибір товару кліком"
                  description="Комірник може вибрати позицію вручну, не чекаючи сканування"
                  isSelected={settings?.allowManualSelect ?? DEFAULT_SETTINGS.allowManualSelect}
                  onValueChange={(val) => setSettings(prev => prev ? { ...prev, allowManualSelect: val } : null)}
                />
              </SettingsGroup>

              {/* Коробки */}
              <SettingsGroup icon="package" title="Коробки" description="Підбір коробки та розподіл порцій">
                <SwitchRow
                  highlighted
                  title="Режим економії коробок"
                  description="Обсяг замовлення = порції × коефіцієнт (unitRatio, weightRatio комплекту). Якщо він вміщується в одну коробку, береться вона, а комплект не розрізається, навіть коли сирих порцій більше за місткість."
                  isSelected={settings?.economyMode ?? DEFAULT_SETTINGS.economyMode}
                  onValueChange={(val) => setSettings(prev => prev ? { ...prev, economyMode: val } : null)}
                />
              </SettingsGroup>

              {/* Сповіщення */}
              <SettingsGroup icon="bell" title="Сповіщення" description="Час індикації статусу та показу Toast, у мілісекундах">
                <NotifyPanel icon="check-circle" iconClass="text-success-500" title="Успіх">
                  <NumberInput
                    value={settings?.successIndicationMs ?? DEFAULT_SETTINGS.successIndicationMs}
                    onValueChange={(num) => setSettings(prev => prev ? { ...prev, successIndicationMs: num } : null)}
                    min={0}
                    max={10000}
                    step={100}
                    label="Індикація статусу"
                    labelPlacement="outside"
                    className="w-full"
                  />
                  <NumberInput
                    value={settings?.successToastMs ?? DEFAULT_SETTINGS.successToastMs}
                    onValueChange={(num) => setSettings(prev => prev ? { ...prev, successToastMs: num } : null)}
                    min={0}
                    max={30000}
                    step={100}
                    label="Показ Toast"
                    labelPlacement="outside"
                    className="w-full"
                  />
                </NotifyPanel>
                <NotifyPanel icon="alert-triangle" iconClass="text-danger-500" title="Помилка">
                  <NumberInput
                    value={settings?.errorIndicationMs ?? DEFAULT_SETTINGS.errorIndicationMs}
                    onValueChange={(num) => setSettings(prev => prev ? { ...prev, errorIndicationMs: num } : null)}
                    min={0}
                    max={10000}
                    step={100}
                    label="Індикація статусу"
                    labelPlacement="outside"
                    className="w-full"
                  />
                  <NumberInput
                    value={settings?.errorToastMs ?? DEFAULT_SETTINGS.errorToastMs}
                    onValueChange={(num) => setSettings(prev => prev ? { ...prev, errorToastMs: num } : null)}
                    min={0}
                    max={30000}
                    step={100}
                    label="Показ Toast"
                    labelPlacement="outside"
                    className="w-full"
                  />
                </NotifyPanel>
              </SettingsGroup>
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
