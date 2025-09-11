import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button, ButtonGroup } from "@heroui/button";
import { Switch } from "@heroui/switch";
import { RadioGroup, Radio } from "@heroui/radio";
import { DynamicIcon } from "lucide-react/dynamic";
import { useEquipment } from "../hooks/useEquipment";
import { EquipmentConfig } from "../services/EquipmentService";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Checkbox } from "@heroui/checkbox";
import { ToastService } from "../services/ToastService";
import { addToast } from "@heroui/toast";
import ScaleService from "../services/ScaleService";


export const SettingsEquipment = () => {
  const [state, actions] = useEquipment();
  const [localConfig, setLocalConfig] = useState<EquipmentConfig | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isConnectingScale, setIsConnectingScale] = useState(false);


  // Состояние для теста сканера
  const [scannerTestResult, setScannerTestResult] = useState<string>('');
  const [scannerTestStatus, setScannerTestStatus] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const [scannerTestTimeout, setScannerTestTimeout] = useState<NodeJS.Timeout | null>(null);

  // Состояние для теста весов ВТА-60
  const [vta60TestResult, setVta60TestResult] = useState<string>('Очікування тесту...');
  const [vta60TestStatus, setVta60TestStatus] = useState<'idle' | 'connecting' | 'waiting' | 'success' | 'error'>('idle');
  const [vta60RawData, setVta60RawData] = useState<string>('');
  const [vta60ParsedData, setVta60ParsedData] = useState<{weight?: number, price?: number, total?: number}>({});
  const [keyboardEvents, setKeyboardEvents] = useState<string[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Web Serial API поддержка
  const [webSerialSupported, setWebSerialSupported] = useState<boolean | null>(null);



  // Инициализация локальной конфигурации при загрузке из БД
  useEffect(() => {
    if (state.config && !localConfig) {
      setLocalConfig(state.config);
    }
  }, [state.config, localConfig]);

  // Проверка поддержки Web Serial API
  const checkWebSerialSupport = useCallback(() => {
    const supported = 'serial' in navigator;
    setWebSerialSupported(supported);
  }, []);

  // Тест сканера
  const testScanner = useCallback(() => {
    if (scannerTestStatus === 'waiting') {
      // Отменяем тест
      if (scannerTestTimeout) {
        clearTimeout(scannerTestTimeout);
        setScannerTestTimeout(null);
      }
      setScannerTestStatus('idle');
      setScannerTestResult('');
      // Удаляем тестовый listener если он есть
      if ((window as any).testScannerListener) {
        document.removeEventListener('keydown', (window as any).testScannerListener);
        (window as any).testScannerListener = null;
      }
      return;
    }

    // Начинаем тест
    setScannerTestStatus('waiting');
    setScannerTestResult('Ожидание сканирования... (5 сек)');

    // Устанавливаем таймаут на 5 секунд
    const timeout = setTimeout(() => {
      setScannerTestStatus('error');
      setScannerTestResult('Тест не удался - сканер не обнаружен или не работает');
      setScannerTestTimeout(null);
      // Удаляем тестовый listener
      if ((window as any).testScannerListener) {
        document.removeEventListener('keydown', (window as any).testScannerListener);
        (window as any).testScannerListener = null;
      }
    }, 5000);

    setScannerTestTimeout(timeout);

    // Создаем прямой listener для тестирования
    let testBuffer = '';
    let lastTestTime = Date.now();

    const testScannerListener = (event: KeyboardEvent) => {
      // Проверяем, что событие еще не обработано основным сканером
      if ((event as any)._barcodeProcessed) {
        return; // Пропускаем, уже обработано
      }

      (event as any)._barcodeProcessed = true;
      const currentTime = Date.now();
      const timeDiff = currentTime - lastTestTime;


      // Если символы приходят быстро (сканер), собираем их
      if (timeDiff < 300) { // 300ms timeout для теста
        if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          testBuffer += event.key;
        }

        // Если буфер достаточно длинный и прошло время - считаем что сканирование завершено
        if (testBuffer.length >= 3) {
          setTimeout(() => {
            if (testBuffer.length > 0) {
              // Успешный тест!
              if (scannerTestTimeout) {
                clearTimeout(scannerTestTimeout);
                setScannerTestTimeout(null);
              }
              setScannerTestStatus('success');
              setScannerTestResult(`✅ Успех! Сканер работает.\nОбнаружено: ${testBuffer.length} символов\nПример: ${testBuffer.substring(0, 20)}${testBuffer.length > 20 ? '...' : ''}\nВремя: ${new Date().toLocaleTimeString()}`);

              // Убираем listener
              document.removeEventListener('keydown', testScannerListener);
              (window as any).testScannerListener = null;

              // Очищаем результат через 5 секунд
              setTimeout(() => {
                setScannerTestStatus('idle');
                setScannerTestResult('');
              }, 5000);
            }
          }, 200); // Ждем еще немного символов
        }
      } else {
        // Новый цикл сканирования
        testBuffer = '';
        if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          testBuffer += event.key;
        }
      }

      lastTestTime = currentTime;
    };

    // Добавляем listener
    document.addEventListener('keydown', testScannerListener);
    (window as any).testScannerListener = testScannerListener;

  }, [scannerTestStatus, scannerTestTimeout]);

  // Диагностика клавиатуры
  const startKeyboardDiagnostics = useCallback(() => {
    setShowDiagnostics(true);
    setKeyboardEvents([]);

    let eventCount = 0;
    const diagnosticsListener = (event: KeyboardEvent) => {
      const timestamp = Date.now();
      const eventInfo = `${new Date(timestamp).toLocaleTimeString()}: ${event.key} (code: ${event.code}, ctrl: ${event.ctrlKey}, alt: ${event.altKey})`;

      setKeyboardEvents(prev => {
        const newEvents = [...prev, eventInfo];
        // Ограничиваем до последних 20 событий
        return newEvents.slice(-20);
      });

      eventCount++;
    };

    document.addEventListener('keydown', diagnosticsListener);

    // Автоматически останавливаем через 10 секунд
    setTimeout(() => {
      document.removeEventListener('keydown', diagnosticsListener);
      setShowDiagnostics(false);
    }, 10000);

  }, []);

  // Проверка поддержки при загрузке
  useEffect(() => {
    checkWebSerialSupport();
  }, [checkWebSerialSupport]);

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


  // Обновление настроек сканера с сохранением в БД
  const updateScannerSetting = async (field: string, value: any) => {
    try {
      console.log('🔧 updateScannerSetting called:', { field, value, localConfig: !!localConfig });

      if (!localConfig) {
        console.error('❌ updateScannerSetting: localConfig is null/undefined');
        addToast({
          title: "Помилка",
          description: "Конфігурація не завантажена",
          color: "danger",
          timeout: 3000,
        });
        return;
      }

      // Обновляем конфигурацию
      const updatedConfig: EquipmentConfig = {
        ...localConfig,
        scanner: {
          ...localConfig.scanner,
          [field]: value,
        }
      };

      console.log('🔧 updateScannerSetting: saving config:', updatedConfig.scanner);

      setLocalConfig(updatedConfig);
      await actions.saveConfig(updatedConfig);

      console.log('✅ updateScannerSetting: config saved successfully');

      // Показываем уведомление об успешном сохранении
      addToast({
        title: "Налаштування збережено",
        description: `Налаштування сканера "${getScannerFieldDisplayName(field)}" оновлено`,
        color: "success",
        timeout: 2000,
      });
    } catch (error) {
      console.error('❌ Помилка збереження налаштувань сканера:', error);
      addToast({
        title: "Помилка",
        description: "Не вдалося зберегти налаштування сканера",
        color: "danger",
        timeout: 3000,
      });
    }
  };

  // Обновление настроек весов с сохранением в БД
  const updateScaleSetting = async (field: string, value: any) => {
    try {
      console.log('🔧 updateScaleSetting called:', { field, value, localConfig: !!localConfig });

      if (!localConfig) {
        console.error('❌ updateScaleSetting: localConfig is null/undefined');
        addToast({
          title: "Помилка",
          description: "Конфігурація не завантажена",
          color: "danger",
          timeout: 3000,
        });
        return;
      }

    // Обновляем конфигурацию
    const updatedConfig: EquipmentConfig = {
      ...localConfig,
        scale: {
          ...localConfig.scale,
          [field]: value,
        }
      };

      console.log('🔧 updateScaleSetting: saving config:', updatedConfig.scale);

    setLocalConfig(updatedConfig);
    await actions.saveConfig(updatedConfig);

      console.log('✅ updateScaleSetting: config saved successfully');

      // Показываем уведомление об успешном сохранении
      addToast({
        title: "Налаштування збережено",
        description: `Налаштування ваг "${getScaleFieldDisplayName(field)}" оновлено`,
        color: "success",
        timeout: 2000,
      });
    } catch (error) {
      console.error('❌ Помилка збереження налаштувань ваг:', error);
      addToast({
        title: "Помилка",
        description: "Не вдалося зберегти налаштування ваг",
        color: "danger",
        timeout: 3000,
      });
    }
  };

  // Обновление настроек Serial Terminal с сохранением в БД
  const updateSerialTerminalSetting = async (field: string, value: any) => {
    try {
      console.log('🔧 updateSerialTerminalSetting called:', { field, value, localConfig: !!localConfig });

      if (!localConfig) {
        console.error('❌ updateSerialTerminalSetting: localConfig is null/undefined');
        addToast({
          title: "Помилка",
          description: "Конфігурація не завантажена",
          color: "danger",
          timeout: 3000,
        });
        return;
      }

    // Обновляем конфигурацию
    const updatedConfig: EquipmentConfig = {
      ...localConfig,
        serialTerminal: {
          ...localConfig.serialTerminal,
        [field]: value,
      }
    };

      console.log('🔧 updateSerialTerminalSetting: saving config:', updatedConfig.serialTerminal);

    setLocalConfig(updatedConfig);
    await actions.saveConfig(updatedConfig);

      console.log('✅ updateSerialTerminalSetting: config saved successfully');

      // Показываем уведомление об успешном сохранении
      addToast({
        title: "Налаштування збережено",
        description: `Serial налаштування "${getSerialTerminalFieldDisplayName(field)}" оновлено`,
        color: "success",
        timeout: 2000,
      });
    } catch (error) {
      console.error('❌ Помилка збереження Serial налаштувань:', error);
      addToast({
        title: "Помилка",
        description: "Не вдалося зберегти Serial налаштування",
        color: "danger",
        timeout: 3000,
      });
    }
  };

  // Функция для получения отображаемых названий полей сканера
  const getScannerFieldDisplayName = (field: string): string => {
    const names: Record<string, string> = {
      timeout: 'Таймаут',
      scanTimeout: 'Таймаут сканування',
      autoConnect: 'Автопідключення'
    };
    return names[field] || field;
  };

  // Функция для получения отображаемых названий полей весов
  const getScaleFieldDisplayName = (field: string): string => {
    const names: Record<string, string> = {
      baudRate: 'Швидкість передачі',
      dataBits: 'Біти даних',
      stopBits: 'Стоп-біти',
      parity: 'Парність',
      autoConnect: 'Автопідключення'
    };
    return names[field] || field;
  };

  // Функция для получения отображаемых названий полей Serial Terminal
  const getSerialTerminalFieldDisplayName = (field: string): string => {
    const names: Record<string, string> = {
      bufferSize: 'Розмір буфера',
      flowControl: 'Управління потоком'
    };
    return names[field] || field;
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

  // Обработчик подключения весов
  const handleScaleConnect = async () => {
    setIsConnectingScale(true);
    try {
      const success = await actions.connectScale();
      if (success) {
        addToast({
          title: "Успіх",
          description: "Ваги успішно підключено!",
          color: "success",
        });
      } else {
        addToast({
          title: "Помилка",
          description: "Не вдалося підключити ваги!",
          color: "danger",
        });
      }
    } catch (error) {
      console.error("Error connecting scale:", error);
      addToast({
        title: "Помилка",
        description: "Помилка підключення ваг!",
        color: "danger",
      });
    } finally {
      setIsConnectingScale(false);
    }
  };

  // Обработчик отключения весов
  const handleScaleDisconnect = async () => {
    setIsConnectingScale(true);
    try {
      await actions.disconnectScale();
      addToast({
        title: "Успіх",
        description: "Ваги успішно відключено!",
        color: "success",
      });
    } catch (error) {
      console.error("Error disconnecting scale:", error);
      addToast({
        title: "Помилка",
        description: "Помилка відключення ваг!",
        color: "danger",
      });
    } finally {
      setIsConnectingScale(false);
    }
  };

  // Обработчик тестирования весов ВТА-60
  const handleVTA60Test = async () => {
    setVta60TestStatus('connecting');
    setVta60TestResult('Підключення до ВТА-60...');
    setVta60RawData('');
    setVta60ParsedData({});

    try {
      // Создаем экземпляр ScaleService для теста
      const scaleService = new ScaleService();

      // Подключаемся с настройками ВТА-60
      const connected = await scaleService.connect();
      if (!connected) {
        throw new Error('Не вдалося підключитися до ВТА-60');
      }

      setVta60TestStatus('waiting');
      setVta60TestResult('Відправка запиту 00 00 03...');

      // Отправляем запрос и получаем данные
      const scaleData = await scaleService.readScaleOnce(true);
      await scaleService.disconnect();

      if (scaleData && scaleData.rawData) {
        // Форматируем сырые данные в HEX
        const hexData = Array.from(scaleData.rawData)
          .map(b => b.toString(16).padStart(2, '0').toUpperCase())
          .join(' ');

        setVta60RawData(hexData);
        setVta60ParsedData({
          weight: scaleData.weight,
          price: scaleData.price,
          total: scaleData.total
        });

        setVta60TestStatus('success');
        setVta60TestResult('✅ Дані успішно отримані від ВТА-60');
      } else {
        throw new Error('Не отримано відповіді від вагів');
      }
    } catch (error) {
      console.error('VTA-60 test error:', error);
      setVta60TestStatus('error');
      setVta60TestResult(`❌ Помилка: ${error.message}`);
    }
  };

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
              <div className={`w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center ${state.isScannerConnected ? "bg-green-100" : "bg-red-100"}`}>
                <DynamicIcon name="scan" size={24} className={state.isScannerConnected ? "text-green-600" : "text-red-600"} />
              </div>
              <h3 className="font-medium text-gray-900">Сканер штрих-кодів</h3>
              <p className={`text-sm ${state.isScannerConnected ? "text-green-600" : "text-red-600"}`}>
                {state.isScannerConnected ? "Підключено" : "Не підключено"}
              </p>
            </div>
            {/* Ваги */}
            <div className="text-center">
              <div className={`w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center ${state.isScaleConnected ? "bg-green-100" : "bg-red-100"}`}>
                <DynamicIcon name="scale" size={24} className={state.isScaleConnected ? "text-green-600" : "text-red-600"} />
              </div>
              <h3 className="font-medium text-gray-900">Ваги ВТА-60</h3>
              <p className={`text-sm ${state.isScaleConnected ? "text-green-600" : "text-red-600"}`}>
                {state.isScaleConnected ? "Підключено" : "Не підключено"}
              </p>
              {state.currentWeight && (
                <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                  <p className="font-medium">Вага: {state.currentWeight.weight} кг</p>
                  <p className="text-gray-500">{state.currentWeight.isStable ? "Стабільно" : "Нестабільно"}</p>
                </div>
              )}
            </div>
            {/* Web Serial API */}
            <div className="text-center">
              <div className={`w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center ${webSerialSupported ? "bg-green-100" : "bg-red-100"}`}>
                <DynamicIcon name="usb" size={24} className={webSerialSupported ? "text-green-600" : "text-red-600"} />
              </div>
              <h3 className="font-medium text-gray-900">Web Serial API</h3>
              <p className={`text-sm ${webSerialSupported ? "text-green-600" : "text-red-600"}`}>
                {webSerialSupported ? "Підтримується" : "Не підтримується"}
              </p>
              {webSerialSupported && (
                <p className="text-xs text-gray-500 mt-1">Chrome/Edge 89+</p>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Блок помилок */}
      {state.status.error && (
        <Card className="bg-gradient-to-r from-red-50 to-pink-50 border border-red-200">
          <CardHeader className="border-b border-red-200">
            <DynamicIcon
              name="alert-triangle"
              size={20}
              className="text-red-600 mr-2"
            />
            <h2 className="text-lg font-semibold text-red-800">Помилки системи</h2>
          </CardHeader>
          <CardBody className="p-6">
            <div className="flex items-start">
              <DynamicIcon
                name="alert-circle"
                size={20}
                className="text-red-600 mr-3 mt-0.5 flex-shrink-0"
              />
              <div>
                <p className="text-red-800 font-medium mb-2">Виявлено помилку:</p>
                <p className="text-red-700 text-sm bg-red-100 p-3 rounded border-l-4 border-red-500">
                  {state.status.error}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Налаштування конфігурації */}
      <Card className="bg-gradient-to-r bg-neutral-50">
        <CardHeader className="border-b border-grey-200 flex justify-between items-center">
          <div className="flex items-center">
            <DynamicIcon
              name="settings"
              size={20}
              className="text-primary mr-2"
            />
            <h2 className="text-lg font-semibold text-primary">Конфігурація обладнання</h2>
          </div>
          <div className="flex gap-2 ml-auto">
            <Button
              onPress={() => {
                console.log('🔍 DEBUG: Current localConfig:', localConfig);
                console.log('🔍 DEBUG: Scanner state:', localConfig?.scanner);
                addToast({
                  title: "Дебаг",
                  description: "Перевірте консоль браузера (F12)",
                  color: "primary",
                  timeout: 3000,
                });
              }}
              color="primary"
              variant="ghost"
              size="sm"
            >
              <DynamicIcon name="bug" size={14} />
              Debug
            </Button>
            <Button
              onPress={async () => {
                try {
                  console.log('🧪 Testing save functionality...');
                  if (!localConfig) {
                    addToast({
                      title: "Тест",
                      description: "Конфігурація не завантажена",
                      color: "warning",
                      timeout: 3000,
                    });
                    return;
                  }

                  await actions.saveConfig(localConfig);
                  addToast({
                    title: "Тест успішний",
                    description: "Збереження працює нормально",
                    color: "success",
                    timeout: 3000,
                  });
                } catch (error) {
                  console.error('❌ Test save failed:', error);
                  addToast({
                    title: "Тест провалений",
                    description: "Збереження не працює",
                    color: "danger",
                    timeout: 3000,
                  });
                }
              }}
              color="success"
              variant="ghost"
              size="sm"
            >
              <DynamicIcon name="save" size={14} />
              Test Save
            </Button>
          <Button
            onPress={resetConfig}
            color="secondary"
            variant="bordered"
            size="sm"
            disabled={isSaving}
          >
            <DynamicIcon name="refresh-cw" size={14} />
            Скинути до замовчування
          </Button>
          </div>
        </CardHeader>
        <CardBody className="p-6">
          <div className="flex flex-col xl:flex-row gap-8">
            {/* Налаштування ваг */}
            <Card className="flex flex-1 flex-col gap-6 p-4">
              <h3 className="font-medium text-gray-400">Налаштування ваг</h3>
              <Select
                id="baudRate"
                label="Швидкість (біт/с)"
                labelPlacement="outside"
                selectedKeys={[localConfig.scale?.baudRate?.toString() || "4800"]}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as string;
                  updateScaleSetting("baudRate", parseInt(value));
                }}
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                <SelectItem key="4800">4800</SelectItem>
                <SelectItem key="9600">9600</SelectItem>
                <SelectItem key="19200">19200</SelectItem>
                <SelectItem key="38400">38400</SelectItem>
                <SelectItem key="57600">57600</SelectItem>
                <SelectItem key="115200">115200</SelectItem>
              </Select>
              <Select
                id="dataBits"
                label="Біти даних"
                labelPlacement="outside"
                selectedKeys={[localConfig.scale?.dataBits?.toString() || "8"]}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as string;
                  updateScaleSetting("dataBits", parseInt(value));
                }}
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                <SelectItem key="7">7</SelectItem>
                <SelectItem key="8">8</SelectItem>
              </Select>

              <Select
                id="stopBits"
                label="Стоп-біти"
                labelPlacement="outside"
                selectedKeys={[localConfig.scale?.stopBits?.toString() || "1"]}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as string;
                  updateScaleSetting("stopBits", parseInt(value));
                }}
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                <SelectItem key="1">1</SelectItem>
                <SelectItem key="2">2</SelectItem>
              </Select>

              <Select
                id="parity"
                label="Парність"
                labelPlacement="outside"
                selectedKeys={[localConfig.scale?.parity || "even"]}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as string;
                  updateScaleSetting("parity", value);
                }}
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                <SelectItem key="none">None</SelectItem>
                <SelectItem key="even">Even</SelectItem>
                <SelectItem key="odd">Odd</SelectItem>
              </Select>

              <Input
                id="bufferSize"
                type="number"
                label="Розмір буфера"
                labelPlacement="outside"
                value={localConfig.serialTerminal?.bufferSize?.toString() || "1024"}
                onValueChange={(value) =>
                  updateSerialTerminalSetting("bufferSize", parseInt(value) || 1024)
                }
                className="block text-sm font-medium text-gray-700 mb-1"
                min="256"
                max="16384"
              />

              <Select
                id="flowControl"
                label="Управління потоком"
                labelPlacement="outside"
                selectedKeys={[localConfig.serialTerminal?.flowControl || "none"]}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as string;
                  updateSerialTerminalSetting("flowControl", value);
                }}
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                <SelectItem key="none">None</SelectItem>
                <SelectItem key="hardware">Hardware</SelectItem>
              </Select>

              {/* Кнопки керування вагами */}
              <div className="flex gap-2 mt-4">
                <Button
                  onPress={handleScaleConnect}
                  disabled={state.isScaleConnected || isConnectingScale}
                  color="primary"
                  size="sm"
                  variant="solid"
                >
                  <DynamicIcon name="link" size={14} />
                  {isConnectingScale ? "Підключення..." : "Підключити ваги"}
                </Button>
                <Button
                  onPress={handleScaleDisconnect}
                  disabled={!state.isScaleConnected || isConnectingScale}
                  color="danger"
                  size="sm"
                  variant="solid"
                >
                  <DynamicIcon name="unlink" size={14} />
                  Відключити ваги
                </Button>
              </div>

              {/* Свитчер автопідключення ваг */}
              <Switch
                id="scaleAutoConnect"
                isSelected={localConfig.scale?.autoConnect || false}
                onValueChange={(value) => updateScaleSetting("autoConnect", value)}
                color="primary"
                size="sm"
                classNames={{
                  wrapper: "bg-secondary/50",
                  thumbIcon: "bg-white/50",
                }}
              >
                Авто. підключення ваг</Switch>
            </Card>

            <div className="flex flex-1 flex-col gap-8 h-fit">
              {/* Тест весов ВТА-60 */}
              <Card className="flex w-full flex-col gap-6 p-4 h-fit">
                <h3 className="font-medium text-gray-400">Тест вагів ВТА-60</h3>

                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <Button
                      color={vta60TestStatus === 'idle' ? 'primary' : 'default'}
                  size="sm"
                      onPress={handleVTA60Test}
                      isLoading={vta60TestStatus === 'connecting' || vta60TestStatus === 'waiting'}
                      disabled={vta60TestStatus === 'connecting' || vta60TestStatus === 'waiting'}
                    >
                      {vta60TestStatus === 'connecting' ? 'Підключення...' :
                      vta60TestStatus === 'waiting' ? 'Очікування відповіді...' :
                      'Тестувати ВТА-60'}
                    </Button>

                    <div className="flex-1">
                      <div className={`text-sm p-2 rounded ${
                        vta60TestStatus === 'success' ? 'bg-green-50 text-green-700' :
                        vta60TestStatus === 'error' ? 'bg-red-50 text-red-700' :
                        'bg-gray-50 text-gray-600'
                      }`}>
                        {vta60TestResult}
                      </div>
                    </div>
                  </div>

                  {vta60RawData && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-600">Сирі дані (HEX):</h4>
                      <div className="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm overflow-x-auto">
                        {vta60RawData}
                      </div>
                    </div>
                  )}

                  {(vta60ParsedData.weight !== undefined || vta60ParsedData.price !== undefined || vta60ParsedData.total !== undefined) && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-600">Оброблені дані:</h4>
                      <div className="grid grid-cols-3 gap-4">
                        {vta60ParsedData.weight !== undefined && (
                          <div className="bg-blue-50 p-3 rounded">
                            <div className="text-xs text-gray-500">Вага</div>
                            <div className="text-lg font-semibold text-blue-700">
                              {vta60ParsedData.weight.toFixed(3)} кг
                            </div>
                          </div>
                        )}

                        {vta60ParsedData.price !== undefined && (
                          <div className="bg-green-50 p-3 rounded">
                            <div className="text-xs text-gray-500">Ціна</div>
                            <div className="text-lg font-semibold text-green-700">
                              {vta60ParsedData.price.toFixed(2)} ₴/кг
                            </div>
                          </div>
                        )}

                        {vta60ParsedData.total !== undefined && (
                          <div className="bg-purple-50 p-3 rounded">
                            <div className="text-xs text-gray-500">Сума</div>
                            <div className="text-lg font-semibold text-purple-700">
                              {vta60ParsedData.total.toFixed(2)} ₴
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                    <strong>Протокол ВТА-60:</strong> 4800-8E1, запит 00 00 03, 18 байт відповіді з цифробайтами
                  </div>
                </div>
              </Card>

              {/* Тест сканера */}
              <Card className="flex w-full flex-col gap-4 h-fit p-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium text-gray-400">Тест сканера</h3>
                  {state.isScannerConnected && (
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      On
                    </span>
                  )}
                  {!state.isScannerConnected && !state.status.isSimulationMode && (
                    <span className="text-sm text-red-600 flex items-center gap-1">
                      <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                      Off
                    </span>
                  )}
                </div>
                <div className="flex gap-3 items-center flex-wrap">
                  <Button
                    color={scannerTestStatus === 'waiting' ? 'warning' : 'primary'}
                    size="sm"
                    onPress={testScanner}
                    isDisabled={!state.isScannerConnected && state.status.isSimulationMode === false}
                  >
                    {scannerTestStatus === 'waiting' ? 'Отменить тест' : 'Тест сканера'}
                  </Button>
                  <Button
                    color="secondary"
                    className="text-gray-600"
                    size="sm"
                    variant="flat"
                    onPress={startKeyboardDiagnostics}
                  >
                    Диагностика клавіатури
                  </Button>
                  <Button
                    color="danger"
                    size="sm"
                    variant="flat"
                    className="bg-red-100 text-red-600"
                    onPress={() => {
                      // Сбрасываем состояние сканера
                      actions.resetScanner();
                      // Показываем уведомление
                      addToast({
                        title: "Стан сканера скинуто",
                        color: "success",
                        timeout: 3000
                      });
                    }}
                  >
                    Скинути
                  </Button>
                </div>
                {scannerTestResult && (
                  <div className={`p-3 rounded-md text-sm whitespace-pre-line ${
                    scannerTestStatus === 'success'
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : scannerTestStatus === 'error'
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}>
                    {scannerTestResult}
                  </div>
                )}
                {showDiagnostics && (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <h4 className="font-medium text-blue-700 mb-2">Діагностика клавіатури (10 сек):</h4>
                    <div className="text-xs text-blue-600 max-h-32 overflow-y-auto bg-white p-2 rounded border">
                      {keyboardEvents.length === 0 ? (
                        <span>Очікування подій клавіатури...</span>
                      ) : (
                        keyboardEvents.map((event, index) => (
                          <div key={index} className="font-mono">{event}</div>
                        ))
                      )}
                    </div>
                  </div>
                )}
                {state.lastBarcode && (
                  <div className="mt-2 p-2 bg-green-100 border border-green-100 rounded text-xs">
                    <p className="font-medium">Останній код: {state.lastBarcode.code}</p>
                    <p className="text-gray-500">Тип: {state.lastBarcode.type}</p>
                  </div>
                )}
                <div className="text-xs text-gray-500 space-y-1">
                  <div><strong>Тест сканера:</strong> Відскануйте будь-який штрих-код протягом 5 секунд</div>
                  <div><strong>Порада:</strong> Якщо сканер не працює, перевірте налаштування scanTimeout (200-500ms)</div>
                </div>
              </Card>
            </div>
            {/* Налаштування сканера */}
            <Card className="flex flex-1 flex-col gap-6 p-4 h-fit">
              <h3 className="font-medium text-gray-400">Налаштування сканера</h3>
              <Input
                type="number"
                id="timeout"
                label="Таймаут (мс)"
                labelPlacement="outside"
                className="block text-sm font-medium text-gray-700 mb-1"
                value={localConfig.scanner?.timeout?.toString() || "5000"}
                onValueChange={(value) => updateScannerSetting("timeout", parseInt(value))}
              />
              <Input
                type="number"
                id="scanTimeout"
                label="Таймаут сканування (мс)"
                labelPlacement="outside"
                className="block text-sm font-medium text-gray-700 mb-1"
                value={localConfig?.scanner?.scanTimeout?.toString() || "300"}
                onValueChange={(value) => updateScannerSetting("scanTimeout", parseInt(value))}
              />
              <Switch
                id="autoConnect"
                isSelected={localConfig.scanner?.autoConnect || false}
                onValueChange={(value) => updateScannerSetting("autoConnect", value)}
                color="primary"
                size="sm"
                classNames={{
                  wrapper: "bg-secondary/50",
                  thumbIcon: "bg-white/50",
                }}
              >
                Авто. підключення</Switch>
            </Card>
            </div>

        </CardBody>
      </Card>
      

    </div>
  );
};

export default SettingsEquipment;
