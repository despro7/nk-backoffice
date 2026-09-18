import React, { useState, useEffect } from 'react';
import { Card, CardBody, CardHeader, Input, Button, Select, SelectItem, RadioGroup, Radio, Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useWarehouseMovementSettings } from '../hooks/useWarehouseMovementSettings';
import { useDilovodSettings } from '../hooks/useDilovodSettings';
import type { WarehouseMovementSettings } from '@shared/types/movement';
import { WAREHOUSE_MOVEMENT_SETTING_DEFAULTS } from '@shared/types/movement';
import { DurationMinutesField } from '@/components/ui/DurationMinutesField';

// ---------------------------------------------------------------------------
// SettingsWarehouseMovement — налаштування переміщень між складами
// ---------------------------------------------------------------------------

const SettingsWarehouseMovement: React.FC = () => {
  const {
    settings,
    loading,
    saving,
    error,
    saveSettings,
    refreshSettings,
  } = useWarehouseMovementSettings();

  // Довідники фірм та складів з Dilovod-кешу
  const { directories, loadingDirectories, refreshDirectories } = useDilovodSettings({ loadDirectories: true });

  const [formData, setFormData] = useState<Partial<WarehouseMovementSettings>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Синхронізуємо форму з завантаженими налаштуваннями
  useEffect(() => {
    if (settings) {
      setFormData(settings);
      setHasChanges(false);
    }
  }, [settings]);

  const handleChange = <K extends keyof WarehouseMovementSettings>(
    key: K,
    value: WarehouseMovementSettings[K]
  ) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setJustSaved(false);
  };

  const handleSave = async () => {
    const { firmId: _firmId, ...toSave } = formData;
    const ok = await saveSettings(toSave);
    if (ok) {
      setHasChanges(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    }
  };

  const firms = directories?.firms ?? [];
  const storages = directories?.storages ?? [];

  // Назви для select-опцій
  const getFirmName = (id: string) => firms.find(f => f.id === id)?.name ?? id;
  const getStorageName = (id: string) => storages.find(s => s.id === id)?.name ?? id;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <DynamicIcon name="loader-2" className="w-6 h-6 animate-spin text-gray-400 mr-2" />
        <span className="text-gray-500">Завантаження налаштувань...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* Помилка */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
          <DynamicIcon name="alert-circle" size={16} />
          {error}
        </div>
      )}

			<div className="grid grid-cols-2 gap-4">
				{/* Генерування номера документа */}
				<Card>
					<CardHeader className="border-b border-gray-200">
						<DynamicIcon name="hash" size={18} className="text-gray-600 mr-2" />
						<h2 className="text-base font-semibold text-gray-900">Генерування номера документа</h2>
					</CardHeader>
					<CardBody className="p-6 space-y-4">
						<RadioGroup
							value={formData.numberGeneration ?? WAREHOUSE_MOVEMENT_SETTING_DEFAULTS.numberGeneration}
							onValueChange={(val) => handleChange('numberGeneration', val as 'server' | 'dilovod')}
							aria-label="Спосіб генерування номера"
						>
							<Radio value="dilovod" description="Діловод сам призначить номер при створенні документа" classNames={{ base: "items-baseline", labelWrapper: "pl-1.5", label: "text-sm font-semibold", description: "text-xs" }}>
								На стороні Діловода
							</Radio>
							<Radio value="server" description="Сервер генерує номер за шаблоном перед відправкою" classNames={{ base: "items-baseline", labelWrapper: "pl-1.5", label: "text-sm font-semibold", description: "text-xs" }}>
								На стороні сервера
							</Radio>
						</RadioGroup>

						{formData.numberGeneration === 'server' && (
							<Input
								label="Шаблон номера"
								placeholder={WAREHOUSE_MOVEMENT_SETTING_DEFAULTS.numberTemplate}
								value={formData.numberTemplate ?? WAREHOUSE_MOVEMENT_SETTING_DEFAULTS.numberTemplate}
								onChange={(e) => handleChange('numberTemplate', e.target.value)}
								description="Доступні змінні: {YYYY}, {MM}, {DD}, {HH}, {mm}, {###} (3 цифри), {#####} (5 цифр)"
							/>
						)}
					</CardBody>
				</Card>

				{/* Склади */}
				<Card>
					<CardHeader className="border-b border-gray-200">
						<DynamicIcon name="warehouse" size={18} className="text-gray-600 mr-2" />
						<h2 className="text-base font-semibold text-gray-900">Склади</h2>
						<p className="text-sm text-gray-400 ml-1">– вибір складів для переміщень за замовчуванням</p>
					</CardHeader>
					<CardBody className="p-6 space-y-5">
						{loadingDirectories ? (
							<div className="flex items-center gap-2 text-sm text-gray-500">
								<DynamicIcon name="loader-2" size={14} className="animate-spin" />
								Завантаження довідника складів...
							</div>
						) : (
							<>
								{storages.length > 0 ? (
									<>
										<Select
											label="Склад-донор (звідки)"
											labelPlacement="outside"
											classNames={{
												label: "font-semibold"
											}}
											selectedKeys={formData.storageFrom ? [formData.storageFrom] : []}
											onSelectionChange={(keys) => {
												const val = Array.from(keys)[0] as string;
												handleChange('storageFrom', val ?? '');
											}}
											description="Основний склад, з якого переміщуються товари"
										>
											{storages.map((s) => (
												<SelectItem key={s.id} textValue={s.name}>
													<div className="flex flex-col">
														<span className="text-sm">{s.name}</span>
														<span className="text-xs text-gray-400 font-mono">{s.id}</span>
													</div>
												</SelectItem>
											))}
										</Select>

										<Select
											label="Склад-реципієнт (куди)"
											labelPlacement="outside"
											classNames={{
												label: "font-semibold"
											}}
											selectedKeys={formData.storageTo ? [formData.storageTo] : []}
											onSelectionChange={(keys) => {
												const val = Array.from(keys)[0] as string;
												handleChange('storageTo', val ?? '');
											}}
											description="Малий склад або склад призначення"
										>
											{storages.map((s) => (
												<SelectItem key={s.id} textValue={s.name}>
													<div className="flex flex-col">
														<span className="text-sm">{s.name}</span>
														<span className="text-xs text-gray-400 font-mono">{s.id}</span>
													</div>
												</SelectItem>
											))}
										</Select>
									</>
								) : (
									<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
										<Input
											label="Склад-донор (ID)"
											placeholder="ID основного складу"
											value={formData.storageFrom ?? ''}
											onChange={(e) => handleChange('storageFrom', e.target.value)}
											description="Довідник складів не завантажений"
										/>
										<Input
											label="Склад-реципієнт (ID)"
											placeholder="ID малого складу"
											value={formData.storageTo ?? ''}
											onChange={(e) => handleChange('storageTo', e.target.value)}
											description="Довідник складів не завантажений"
										/>
									</div>
								)}
							</>
						)}
					</CardBody>
				</Card>

        {/* Вікно редагування після відправки / прийому */}
        <Card>
          <CardHeader className="border-b border-gray-200">
            <DynamicIcon name="clock" size={18} className="text-gray-600 mr-2" />
            <h2 className="text-base font-semibold text-gray-900">Редагування після відправки та прийому</h2>
          </CardHeader>
          <CardBody className="p-6 space-y-6">
            <p className="text-sm text-gray-500">
              Дозволяє відправнику та отримувачу окремо редагувати свої кількості протягом заданого часу.
              Адміністратори з правом «Редагувати переміщення» не обмежені цими налаштуваннями.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4 rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900">Відправник</h3>
                <DurationMinutesField
                  label="Вікно редагування"
                  minutes={formData.senderEditWindowMinutes ?? WAREHOUSE_MOVEMENT_SETTING_DEFAULTS.senderEditWindowMinutes}
                  onMinutesChange={(value) => handleChange('senderEditWindowMinutes', value)}
                  description="Після «Відправити» автор може змінювати відправлені кількості"
                />
              </div>
              <div className="space-y-4 rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900">Отримувач</h3>
                <DurationMinutesField
                  label="Вікно редагування"
                  minutes={formData.receiverEditWindowMinutes ?? WAREHOUSE_MOVEMENT_SETTING_DEFAULTS.receiverEditWindowMinutes}
                  onMinutesChange={(value) => handleChange('receiverEditWindowMinutes', value)}
                  description="Після підтвердження отримання — правка отриманих кількостей"
                />
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Сканування — мобільний інтерфейс */}
        <Card>
          <CardHeader className="border-b border-gray-200">
            <DynamicIcon name="scan-barcode" size={18} className="text-gray-600 mr-2" />
            <h2 className="text-base font-semibold text-gray-900">Сканування (мобільний інтерфейс)</h2>
          </CardHeader>
          <CardBody className="p-6 space-y-4">
            <p className="text-sm text-gray-500">
              Поведінка drawer після сканування штрих-коду порції або коробки у мобільному редакторі переміщень.
            </p>
            <RadioGroup
              value={formData.mobScanStepperMode ?? WAREHOUSE_MOVEMENT_SETTING_DEFAULTS.mobScanStepperMode}
              onValueChange={(val) => handleChange(
                'mobScanStepperMode',
                val as typeof WAREHOUSE_MOVEMENT_SETTING_DEFAULTS.mobScanStepperMode,
              )}
              aria-label="Поведінка stepper при скануванні"
            >
              <Radio
                value="increment"
                description="При скануванні одразу додає 1 у stepper «Порцій» або «Коробок»"
                classNames={{ base: 'items-baseline', labelWrapper: 'pl-1.5', label: 'text-sm font-semibold', description: 'text-xs' }}
              >
                Додавати 1 у stepper
              </Radio>
              <Radio
                value="increment_box"
                description="ШК коробки — +1 у «Коробок»; ШК порції — drawer без зміни stepper"
                classNames={{ base: 'items-baseline', labelWrapper: 'pl-1.5', label: 'text-sm font-semibold', description: 'text-xs' }}
              >
                Додавати 1 коробку
              </Radio>
              <Radio
                value="open_only"
                description="Drawer відкривається з поточною кількістю рядка — користувач вводить значення сам"
                classNames={{ base: 'items-baseline', labelWrapper: 'pl-1.5', label: 'text-sm font-semibold', description: 'text-xs' }}
              >
                Лише відкрити drawer
              </Radio>
            </RadioGroup>
          </CardBody>
        </Card>
      </div>
      
      {/* Кнопка збереження */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          {justSaved && (
            <Chip color="success" variant="flat" size="sm" startContent={<DynamicIcon name="check" size={12} />}>
              Збережено
            </Chip>
          )}
          {hasChanges && !justSaved && (
            <Chip color="warning" variant="flat" size="sm" startContent={<DynamicIcon name="circle-dot" size={12} />}>
              Є незбережені зміни
            </Chip>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button
            color="default"
            variant="light"
            size="md"
            isDisabled={!hasChanges || saving}
            onPress={() => {
              if (settings) {
                setFormData(settings);
                setHasChanges(false);
								refreshSettings();
              }
            }}
          >
            Скасувати
          </Button>
          <Button
            color="primary"
            size="md"
            isLoading={saving}
            isDisabled={!hasChanges || saving}
            onPress={handleSave}
            startContent={!saving && <DynamicIcon name="save" size={16} />}
          >
            Зберегти налаштування
          </Button>
        </div>
      </div>

    </div>
  );
};

export default SettingsWarehouseMovement;
