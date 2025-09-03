import { useState, useEffect } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button, ButtonGroup } from "@heroui/button";
import { Switch } from "@heroui/switch";
import { RadioGroup, Radio } from "@heroui/radio";
import { DynamicIcon } from "lucide-react/dynamic";
import { useEquipment } from "../hooks/useEquipment";
import { EquipmentConfig } from "../services/EquipmentService";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { addToast } from "@heroui/toast";

export const SettingsEquipment = () => {
  const [state, actions] = useEquipment();
  const [localConfig, setLocalConfig] = useState<EquipmentConfig | null>(null);

  const [isSaving, setIsSaving] = useState(false);

  // Инициализация локальной конфигурации при загрузке из БД
  useEffect(() => {
    if (state.config && !localConfig) {
      setLocalConfig(state.config);
    }
  }, [state.config, localConfig]);

  // Оновлення локальної конфігурації
  const handleConfigChange = (
    section: keyof EquipmentConfig,
    field: string,
    value: any,
  ) => {
    if (!localConfig) return;

    setLocalConfig((prev) => {
      if (!prev) return prev;

      // Если поле содержит точку (например, "weightRange.min"), разбиваем его
      if (field.includes('.')) {
        const [nestedSection, nestedField] = field.split('.');
        return {
          ...prev,
          [section]: {
            ...(typeof prev[section] === "object" && prev[section] !== null
              ? prev[section]
              : {}),
            [nestedSection]: {
              ...(typeof prev[section]?.[nestedSection] === "object" && prev[section]?.[nestedSection] !== null
                ? prev[section][nestedSection]
                : {}),
              [nestedField]: value,
            },
          },
        };
      }

      // Обычное поле
      return {
        ...prev,
        [section]: {
          ...(typeof prev[section] === "object" && prev[section] !== null
            ? prev[section]
            : {}),
          [field]: value,
        },
      };
    });
  };

  // Застосування конфігурації
  const applyConfig = async (config?: EquipmentConfig) => {
    const configToSave = config || localConfig;
    if (!configToSave) return;

    console.log("📤 Отправляем конфиг на сервер:", JSON.stringify(configToSave, null, 2));

    try {
      setIsSaving(true);
      await actions.saveConfig(configToSave);
      // Показываем уведомление об успешном сохранении
      addToast({
        title: "Успіх",
        description: "Налаштування збережено успішно!",
        color: "success",
      });
    } catch (error) {
      console.error("Помилка збереження налаштувань:", error);
      // Показываем уведомление об ошибке
      addToast({
        title: "Помилка",
        description: "Помилка збереження налаштувань!",
        color: "danger",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Обертка для использования в onPress
  const handleApplyConfig = () => applyConfig();

  // Сброс настроек к значениям по умолчанию
  const resetConfig = async () => {
    if (
      !confirm(
        "Ви впевнені, що хочете скинути всі налаштування до значень за замовчуванням?",
      )
    ) {
      return;
    }

    try {
      setIsSaving(true);
      await actions.resetConfig();
      // Локальная конфигурация обновится автоматически через useEffect
      addToast({
        title: "Успіх",
        description: "Налаштування скинуті до значень за замовчуванням!",
        color: "success",
      });
    } catch (error) {
      console.error("Помилка скидання налаштувань:", error);
      addToast({
        title: "Помилка",
        description: "Помилка скидання налаштувань!",
        color: "danger",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Перемикання типу підключення
  const setConnectionType = (type: "local" | "simulation") => {
    actions.setConnectionType(type);
    // Не трогаем локальный стейт, чтобы не было рассинхрона
  };

  // Перемикання режиму симуляції
  const toggleSimulation = async (enabled: boolean) => {
    if (!localConfig) return;
    const newConnectionType: "local" | "simulation" = enabled ? "simulation" : "local";

    const updatedConfig: EquipmentConfig = localConfig ? {
      ...localConfig,
      connectionType: newConnectionType,
      simulation: {
        enabled: enabled,
        weightRange: {
          min: localConfig.simulation?.weightRange?.min ?? 0.1,
          max: localConfig.simulation?.weightRange?.max ?? 5.0
        },
        scanDelay: localConfig.simulation?.scanDelay ?? 800,
        weightDelay: localConfig.simulation?.weightDelay ?? 1200
      },
      websocket: localConfig.websocket || {
        url: 'ws://localhost:8080/equipment',
        autoReconnect: true,
        reconnectInterval: 5000,
        maxReconnectAttempts: 10,
        heartbeatInterval: 30000
      }
    } : localConfig;

    console.log("🔄 Обновляем конфиг в toggleSimulation:", JSON.stringify(updatedConfig, null, 2));

    setLocalConfig(updatedConfig);
    // Сохраняем изменение в БД
    await applyConfig(updatedConfig);
  };

  // Перемикання типу підключення (только когда не в режиме симуляции)
  const handleConnectionTypeChange = async (value: string) => {
    if (!localConfig) return;
    const newConnectionType: "local" | "simulation" = value as "local" | "simulation";
    const isSimulation = newConnectionType === "simulation";

    const updatedConfig: EquipmentConfig = localConfig ? {
      ...localConfig,
      connectionType: newConnectionType,
      simulation: {
        enabled: isSimulation,
        weightRange: {
          min: localConfig.simulation?.weightRange?.min ?? 0.1,
          max: localConfig.simulation?.weightRange?.max ?? 5.0
        },
        scanDelay: localConfig.simulation?.scanDelay ?? 800,
        weightDelay: localConfig.simulation?.weightDelay ?? 1200
      },
      websocket: localConfig.websocket || {
        url: 'ws://localhost:8080/equipment',
        autoReconnect: true,
        reconnectInterval: 5000,
        maxReconnectAttempts: 10,
        heartbeatInterval: 30000
      }
    } : localConfig;

    console.log("🔄 Обновляем конфиг в handleConnectionTypeChange:", JSON.stringify(updatedConfig, null, 2));

    setLocalConfig(updatedConfig);
    // Сохраняем изменение в БД
    await applyConfig(updatedConfig);
  };

  // Если конфигурация еще не загружена, показываем загрузку
  if (!localConfig) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Завантаження налаштувань...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6 ml-auto">
          {/* Свитчер режиму симуляції */}
          <div className="flex items-center gap-3 border-1 border-r-gray-400 pr-6">
            <Switch
              isSelected={localConfig.connectionType === "simulation"}
              onValueChange={toggleSimulation}
              color="success"
              size="sm"
              classNames={{
                wrapper: "bg-secondary/50",
                thumbIcon: "bg-white/50",
              }}
            >
              Режим симуляції</Switch>
          </div>

          {/* RadioGroup для типу підключення */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Тип підключення:</span>
            <div className="flex flex-row items-center gap-2 bg-primary text-white rounded-lg px-3 py-1 text-sm">
              <DynamicIcon name="usb" size={16} />
              <span>Serial Port</span>
            </div>
          </div>
        </div>
      </div>

      {/* Статус обладнання */}
      <Card className="bg-gradient-to-r bg-neutral-50">
        <CardHeader className="border-b border-grey-200">
          <DynamicIcon
            name="activity"
            size={20}
            className="text-primary mr-2"
          />
          <h2 className="text-lg font-semibold text-primary">Статус обладнання</h2>
        </CardHeader>
        <CardBody className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Сканер */}
            <div className="text-center">
              <div
                className={`w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center ${
                  state.isConnected ? "bg-green-100" : "bg-red-100"
                }`}
              >
                <DynamicIcon
                  name="scan"
                  size={24}
                  className={
                    state.isConnected ? "text-green-600" : "text-red-600"
                  }
                />
              </div>
              <h3 className="font-medium text-gray-900">Сканер штрих-кодів</h3>
              <p
                className={`text-sm ${
                  state.isConnected ? "text-green-600" : "text-red-600"
                }`}
              >
                {state.isConnected ? "Підключено" : "Не підключено"}
              </p>
              {state.lastBarcode && (
                <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                  <p className="font-medium">
                    Останній код: {state.lastBarcode.code}
                  </p>
                  <p className="text-gray-500">Тип: {state.lastBarcode.type}</p>
                </div>
              )}
            </div>

            {/* Ваги */}
            <div className="text-center">
              <div
                className={`w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center ${
                  state.isConnected ? "bg-green-100" : "bg-red-100"
                }`}
              >
                <DynamicIcon
                  name="scale"
                  size={24}
                  className={
                    state.isConnected ? "text-green-600" : "text-red-600"
                  }
                />
              </div>
              <h3 className="font-medium text-gray-900">Ваги ВТА-60</h3>
              <p
                className={`text-sm ${
                  state.isConnected ? "text-green-600" : "text-red-600"
                }`}
              >
                {state.isConnected ? "Підключено" : "Не підключено"}
              </p>
              {state.currentWeight && (
                <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                  <p className="font-medium">
                    Вага: {state.currentWeight.weight} кг
                  </p>
                  <p className="text-gray-500">
                    {state.currentWeight.isStable ? "Стабільно" : "Нестабільно"}
                  </p>
                </div>
              )}
            </div>

            {/* Загальний статус */}
            <div className="text-center">
              <div
                className={`w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center ${
                  state.status.isConnected ? "bg-green-100" : "bg-red-100"
                }`}
              >
                <DynamicIcon
                  name="wifi"
                  size={24}
                  className={
                    state.status.isConnected ? "text-green-600" : "text-red-600"
                  }
                />
              </div>
              <h3 className="font-medium text-gray-900">Загальний статус</h3>
              <p
                className={`text-sm ${
                  state.status.isConnected ? "text-green-600" : "text-red-600"
                }`}
              >
                {state.status.isConnected
                  ? "Система активна"
                  : "Система неактивна"}
              </p>
              {state.status.lastActivity && (
                <p className="text-xs text-gray-500 mt-1">
                  Остання активність:{" "}
                  {state.status.lastActivity.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>

          {/* Помилки */}
          {state.status.error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center">
                <DynamicIcon
                  name="alert-circle"
                  size={16}
                  className="text-red-600 mr-2"
                />
                <span className="text-red-800 text-sm">
                  Помилка: {state.status.error}
                </span>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Тестування обладнання */}
      <Card className="bg-gradient-to-r bg-neutral-50">
        <CardHeader className="border-b border-grey-200">
          <DynamicIcon
            name="test-tube"
            size={20}
            className="text-primary mr-2"
          />
          <h2 className="text-lg font-semibold text-primary">
            Тестування обладнання
          </h2>
        </CardHeader>
        <CardBody className="p-6">
          {/* Реальное тестирование оборудования */}
          <div className="grid grid-cols-4 gap-6">
            <Button
              onPress={() => {
                console.log("🧪 === ЗАПУСК РЕАЛЬНОГО ТЕСТУ ВАГ ===");
                console.log("Виконайте в консолі: runScaleRealTests()");
                console.log("Для тесту сканера: runScannerRealTests()");
                addToast({
                  title: "Інформація",
                  description: "Перевірте консоль браузера для інструкцій!",
                  color: "primary",
                });
              }}
              color="primary"
              variant="bordered"
              className="w-full"
            >
              <DynamicIcon name="terminal" size={16} />
              Інструкції тестування
            </Button>

            <Button
              onPress={() =>
                window.open("/client/test-serial-com.html", "_blank")
              }
              color="danger"
              variant="solid"
              className="w-full"
            >
              <DynamicIcon name="usb" size={16} />
              Тестування COM порту
            </Button>

            <Button
              onPress={() => {
                // Загружаем и запускаем тест ваг
                import("../test-scale-real.js")
                  .then(() => {
                    if (
                      typeof (window as any).runScaleRealTests ===
                      "function"
                    ) {
                      (window as any).runScaleRealTests();
                    } else {
                      addToast({
                        title: "Помилка",
                        description: "Тест ваг не завантажений. Перевірте консоль для помилок.",
                        color: "danger",
                      });
                    }
                  })
                  .catch((error) => {
                    console.error("Помилка завантаження тесту ваг:", error);
                    addToast({
                      title: "Помилка",
                      description: "Помилка завантаження тесту. Перевірте консоль.",
                      color: "danger",
                    });
                  });
              }}
              color="success"
              className="w-full text-white"
            >
              <DynamicIcon name="scale" size={16} />
              Запустити тест ваг
            </Button>

            <Button
              onPress={() => {
                // Загружаем и запускаем тест сканера
                import("../test-scanner-real.js")
                  .then(() => {
                    if (
                      typeof (window as any).runScannerRealTests ===
                      "function"
                    ) {
                      (window as any).runScannerRealTests();
                    } else {
                      addToast({
                        title: "Помилка",
                        description: "Тест сканера не завантажений. Перевірте консоль для помилок.",
                        color: "danger",
                      });
                    }
                  })
                  .catch((error) => {
                    console.error(
                      "Помилка завантаження тесту сканера:",
                      error,
                    );
                    addToast({
                      title: "Помилка",
                      description: "Помилка завантаження тесту. Перевірте консоль.",
                      color: "danger",
                    });
                  });
              }}
              color="primary"
              className="w-full"
            >
              <DynamicIcon name="scan" size={16} />
              Запустити тест сканера
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Налаштування конфігурації */}
      <Card className="bg-gradient-to-r bg-neutral-50">
        <CardHeader className="border-b border-grey-200">
          <DynamicIcon
            name="settings"
            size={20}
            className="text-primary mr-2"
          />
          <h2 className="text-lg font-semibold text-primary">Конфігурація обладнання</h2>
        </CardHeader>
        <CardBody className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Налаштування ваг */}
            <div className="flex flex-col gap-6">
              <h3 className="font-medium text-gray-400">Налаштування ваг</h3>
              <Input
                id="comPort"
                label="COM-порт"
                labelPlacement="outside"
                className="block text-sm font-medium text-gray-700 mb-1"
                value={localConfig.scale?.comPort || "COM4"}
                onChange={(e) =>
                  handleConfigChange("scale", "comPort", e.target.value)
                }
              />
              <Select
                id="baudRate"
                label="Швидкість (біт/с)"
                labelPlacement="outside"
                defaultSelectedKeys={[localConfig.scale?.baudRate?.toString() || "9600"]}
                onChange={(e) =>
                  handleConfigChange(
                    "scale",
                    "baudRate",
                    parseInt(e.target.value),
                  )
                }
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                <SelectItem key="9600">9600</SelectItem>
                <SelectItem key="19200">19200</SelectItem>
                <SelectItem key="38400">38400</SelectItem>
                <SelectItem key="57600">57600</SelectItem>
                <SelectItem key="115200">115200</SelectItem>
              </Select>
              <div>
                <Select
                  id="dataBits"
                  label="Біти даних"
                  labelPlacement="outside"
                  defaultSelectedKeys={[localConfig.scale?.dataBits?.toString() || "8"]}
                  onChange={(e) =>
                    handleConfigChange(
                      "scale",
                      "dataBits",
                      parseInt(e.target.value),
                    )
                  }
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  <SelectItem key="7">7</SelectItem>
                  <SelectItem key="8">8</SelectItem>
                </Select>
              </div>
            </div>

            {/* Налаштування сканера */}
            <div className="flex flex-col gap-6">
              <h3 className="font-medium text-gray-400">Налаштування сканера</h3>
              <Input
                type="number"
                id="timeout"
                label="Таймаут (мс)"
                labelPlacement="outside"
                className="block text-sm font-medium text-gray-700 mb-1"
                value={localConfig.scanner?.timeout?.toString() || "5000"}
                onChange={(e) =>
                  handleConfigChange(
                    "scanner",
                    "timeout",
                    parseInt(e.target.value),
                  )}
              />

              <Switch
                id="autoConnect"
                isSelected={localConfig.scanner?.autoConnect || false}
                onValueChange={(e) =>
                  handleConfigChange(
                    "scanner",
                    "autoConnect",
                    e,
                  )
                }
                color="primary"
                size="sm"
                classNames={{
                  wrapper: "bg-secondary/50",
                  thumbIcon: "bg-white/50",
                }}
              >
                Авто. підключення</Switch>
            </div>

            {/* Налаштування симуляції */}
            <div className="flex flex-col gap-6">
              <h3 className="font-medium text-gray-400">Налаштування симуляції</h3>
              <div className="flex flex-col gap-2">
                <label htmlFor="weightRangeMin" className="text-sm font-medium text-gray-700 -mt-1">Діапазон ваги (кг)</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    step="0.1"
                    id="weightRangeMin"
                    aria-label="Діапазон ваги (кг)"
                    labelPlacement="outside"
                    className="block text-sm font-medium text-gray-700 mb-1"
                    defaultValue={localConfig.simulation?.weightRange?.min?.toString() || "0.1"}
                    onChange={(e) =>
                      handleConfigChange("simulation", "weightRange.min", parseFloat(e.target.value))
                    }
                    placeholder="Мін"
                  />
                  <Input
                    type="number"
                    step="0.1"
                    id="weightRangeMax"
                    aria-label="Діапазон ваги"
                    labelPlacement="outside"
                    className="block text-sm font-medium text-gray-700 mb-1"
                    defaultValue={localConfig.simulation?.weightRange?.max?.toString() || "5.0"}
                    onChange={(e) =>
                      handleConfigChange("simulation", "weightRange.max", parseFloat(e.target.value))
                    }
                    placeholder="Макс"
                  />
                </div>
              </div>

              <Input
                type="number"
                id="scanDelay"
                label="Затримка сканування (мс)"
                labelPlacement="outside"
                className="block text-sm font-medium text-gray-700 mb-1"
                defaultValue={localConfig.simulation?.scanDelay?.toString() || "800"}
                onChange={(e) =>
                  handleConfigChange("simulation", "scanDelay", parseInt(e.target.value))
                }
              />
            </div>
          </div>

          {/* Кнопка застосування */}
          <div className="mt-10 flex justify-end gap-4">
            <Button
              onPress={resetConfig}
              color="secondary"
              variant="bordered"
              size="md"
              disabled={isSaving}
            >
              <DynamicIcon name="refresh-cw" size={16} />
              Скинути налаштування
            </Button>

            <Button
              onPress={handleApplyConfig}
              color="primary"
              size="md"
              disabled={isSaving}
            >
              <DynamicIcon name="save" size={16} />
              {isSaving ? "Зберігаються..." : "Застосувати налаштування"}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Інструкції по підключенню */}
      <Card className="bg-gradient-to-r from-orange-50 to-amber-50">
        <CardHeader className="border-b border-orange-200">
          <DynamicIcon
            name="help-circle"
            size={20}
            className="text-orange-800 mr-2"
          />
          <h2 className="text-lg font-semibold text-orange-800">
            Інструкції по підключенню
          </h2>
        </CardHeader>
        <CardBody className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Ваги ВТА-60</h3>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>• Підключіть ваги до комп'ютера через USB-COM конвертер</li>
                <li>• Переконайтеся, що драйвер CH340 встановлено</li>
                <li>• Відкрийте Диспетчер пристроїв та знайдіть COM-порт</li>
                <li>• Встановіть правильний COM-порт у налаштуваннях</li>
                <li>• Перевірте з'єднання кнопкою "Тестувати з'єднання"</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-3">
                Сканер MC-200PT
              </h3>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>• Підключіть сканер до USB-порту комп'ютера</li>
                <li>• Сканер автоматично визначиться як HID-пристрій</li>
                <li>• Переконайтеся, що сканер у режимі клавіатури</li>
                <li>• Протестуйте скануванням штрих-коду</li>
                <li>• При проблемах перезавантажте сканер</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-3">
                WebSocket підключення
              </h3>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>
                  • Запустіть WebSocket сервер на комп'ютері з обладнанням
                </li>
                <li>• Встановіть правильну URL адресу сервера</li>
                <li>• Переконайтеся, що порт не заблоковано файрволом</li>
                <li>• Налаштуйте автоматичне перепідключення</li>
                <li>• Перевірте з'єднання кнопкою "Тестувати з'єднання"</li>
              </ul>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default SettingsEquipment;
