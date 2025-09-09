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
import { ToastService } from "../services/ToastService";
import { addToast } from "@heroui/toast";

// Интерфейсы для Serial терминала
interface TerminalLog {
  timestamp: string;
  direction: 'in' | 'out';
  hex: string;
  ascii: string;
}

export const SettingsEquipment = () => {
  const [state, actions] = useEquipment();
  const [localConfig, setLocalConfig] = useState<EquipmentConfig | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isConnectingScale, setIsConnectingScale] = useState(false);

  // Состояния для Serial терминала
  const [serialConnected, setSerialConnected] = useState(false);
  const [serialResult, setSerialResult] = useState('');
  const [serialResultClass, setSerialResultClass] = useState<'info' | 'success' | 'error'>('info');
  const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTime, setShowTime] = useState(true);
  const [logType, setLogType] = useState<'ascii' | 'hex' | 'both'>('both');

  // Настройки подключения
  const [serialBaudRate, setSerialBaudRate] = useState(9600);
  const [serialDataBits, setSerialDataBits] = useState(8);
  const [serialStopBits, setSerialStopBits] = useState(1);
  const [serialParity, setSerialParity] = useState<'none' | 'even' | 'odd'>('none');
  const [serialBufferSize, setSerialBufferSize] = useState(1024);
  const [serialFlowControl, setSerialFlowControl] = useState<'none' | 'hardware'>('none');

  // Состояние для теста сканера
  const [scannerTestResult, setScannerTestResult] = useState<string>('');
  const [scannerTestStatus, setScannerTestStatus] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const [scannerTestTimeout, setScannerTestTimeout] = useState<NodeJS.Timeout | null>(null);
  const [keyboardEvents, setKeyboardEvents] = useState<string[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Web Serial API поддержка
  const [webSerialSupported, setWebSerialSupported] = useState<boolean | null>(null);

  // Авто-подключение
  const [autoConnectEnabled, setAutoConnectEnabled] = useState(false);

  // Refs для работы с Serial API
  const portRef = useRef<SerialPort | null>(null);
  const generalReaderRef = useRef<ReadableStreamDefaultReader | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Инициализация локальной конфигурации при загрузке из БД
  useEffect(() => {
    if (state.config && !localConfig) {
      setLocalConfig(state.config);
      // Инициализируем auto connect из конфигурации
      setAutoConnectEnabled(state.config.serialTerminal?.autoConnect || false);
      // Инициализируем настройки Serial из конфигурации
      if (state.config.serialTerminal) {
        setSerialBaudRate(state.config.serialTerminal.baudRate || 9600);
        setSerialDataBits(state.config.serialTerminal.dataBits || 8);
        setSerialStopBits(state.config.serialTerminal.stopBits || 1);
        setSerialParity(state.config.serialTerminal.parity || 'none');
        setSerialBufferSize(state.config.serialTerminal.bufferSize || 1024);
        setSerialFlowControl(state.config.serialTerminal.flowControl || 'none');
      }
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
    loadAutoConnectSettings();
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

  // Функции для Serial терминала
  const connectToSerialPort = async () => {
    setSerialResult('🔄 Підключення до Serial порту...');
    setSerialResultClass('info');

    try {
      if (!('serial' in navigator)) {
        throw new Error('Web Serial API не підтримується');
      }

      const port = await (navigator as any).serial.requestPort();
      portRef.current = port;

      // Відкриваємо порт з налаштуваннями
      await port.open({
        baudRate: serialBaudRate,
        dataBits: serialDataBits,
        stopBits: serialStopBits,
        parity: serialParity,
        bufferSize: serialBufferSize,
        flowControl: serialFlowControl
      });

      setSerialResult(`✅ Успішно підключено до Serial порту!\n\nНалаштування:\n- Швидкість: ${serialBaudRate} бод\n- Біти даних: ${serialDataBits}\n- Стоп біти: ${serialStopBits}\n- Парність: ${serialParity}\n- Буфер: ${serialBufferSize} байт\n- Flow Control: ${serialFlowControl}`);
      setSerialResultClass('success');
      setSerialConnected(true);

      // Сохраняем настройки в конфигурацию если autoConnect включен
      if (autoConnectEnabled && localConfig) {
        const updatedConfig: EquipmentConfig = {
          ...localConfig,
          serialTerminal: {
            autoConnect: true,
            baudRate: serialBaudRate,
            dataBits: serialDataBits,
            stopBits: serialStopBits,
            parity: serialParity,
            bufferSize: serialBufferSize,
            flowControl: serialFlowControl
          }
        };
        setLocalConfig(updatedConfig);
        await actions.saveConfig(updatedConfig);
      }

      // Запускаємо читання даних
      startReadingSerialData();

    } catch (error: any) {
      setSerialResult(`❌ Помилка підключення: ${error.message}`);
      setSerialResultClass('error');
    }
  };

  const disconnectFromSerialPort = async () => {
    try {
      if (generalReaderRef.current) {
        await generalReaderRef.current.cancel();
        generalReaderRef.current = null;
      }

      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }

      setSerialResult('🔌 Відключено від Serial порту');
      setSerialResultClass('info');
      setSerialConnected(false);

    } catch (error) {
      console.error('Помилка відключення:', error);
    }
  };

  const startReadingSerialData = async () => {
    if (!portRef.current?.readable) return;

    try {
      const textDecoder = new TextDecoder();
      generalReaderRef.current = portRef.current.readable.getReader();

      while (portRef.current.readable) {
        try {
          const { value, done } = await generalReaderRef.current.read();

          if (done) break;

          if (value) {
            const ascii = textDecoder.decode(value, { stream: true });
            const hex = Array.from(value)
              .map((byte: number) => ('0' + byte.toString(16).toUpperCase()).slice(-2))
              .join(' ');

            addTerminalLog('in', hex, ascii);
          }
        } catch (error) {
          console.error('Помилка читання:', error);
          break;
        }
      }
    } catch (error) {
      console.error('Помилка запуску читання:', error);
    }
  };

  const addTerminalLog = (direction: 'in' | 'out', hex: string, ascii: string) => {
    const timestamp = showTime ? formatTimestamp(new Date()) : '';

    const newLog: TerminalLog = {
      timestamp,
      direction,
      hex,
      ascii
    };

    setTerminalLogs(prev => [...prev.slice(-49), newLog]); // Зберігаємо останні 50 записів
  };

  const formatTimestamp = (date: Date): string => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
  };

  const clearTerminal = () => {
    setTerminalLogs([]);
  };

  // Авто-скролл терміналу
  useEffect(() => {
    if (terminalRef.current && autoScroll && terminalLogs.length > 0) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLogs, autoScroll]);

  // Загрузка настроек авто-подключения
  const loadAutoConnectSettings = () => {
    const saved = localStorage.getItem('serialAutoConnect');
    if (saved) {
      const settings = JSON.parse(saved);
      setAutoConnectEnabled(settings.enabled || false);
      if (settings.serialConfig) {
        setSerialBaudRate(settings.serialConfig.baudRate || 9600);
        setSerialDataBits(settings.serialConfig.dataBits || 8);
        setSerialStopBits(settings.serialConfig.stopBits || 1);
        setSerialParity(settings.serialConfig.parity || 'none');
        setSerialBufferSize(settings.serialConfig.bufferSize || 1024);
        setSerialFlowControl(settings.serialConfig.flowControl || 'none');
      }
    }
  };

  // Сохранение настроек авто-подключения
  const saveAutoConnectSettings = () => {
    const settings = {
      enabled: autoConnectEnabled,
      serialConfig: {
        baudRate: serialBaudRate,
        dataBits: serialDataBits,
        stopBits: serialStopBits,
        parity: serialParity,
        bufferSize: serialBufferSize,
        flowControl: serialFlowControl
      }
    };
    localStorage.setItem('serialAutoConnect', JSON.stringify(settings));
  };

  // Переключение авто-подключения
  const toggleAutoConnect = async (enabled: boolean) => {
    setAutoConnectEnabled(enabled);

    if (!localConfig) return;

    const updatedConfig: EquipmentConfig = {
      ...localConfig,
      serialTerminal: {
        autoConnect: enabled,
        baudRate: serialBaudRate,
        dataBits: serialDataBits,
        stopBits: serialStopBits,
        parity: serialParity,
        bufferSize: serialBufferSize,
        flowControl: serialFlowControl
      }
    };

    setLocalConfig(updatedConfig);
    await actions.saveConfig(updatedConfig);

    if (enabled) {
      addToast({
        title: "Авто-підключення увімкнено",
        description: "Налаштування Serial порту збережено в системі",
        color: "success",
      });
    } else {
      addToast({
        title: "Авто-підключення вимкнено",
        description: "Налаштування Serial порту видалено з системи",
        color: "primary",
      });
    }
  };

  // Попытка авто-подключения при загрузке
  useEffect(() => {
    const shouldAutoConnect = localConfig?.serialTerminal?.autoConnect;
    if (shouldAutoConnect && webSerialSupported && !serialConnected) {
      const timer = setTimeout(() => {
        attemptAutoConnect();
      }, 2000); // Задержка 2 секунды после загрузки страницы

      return () => clearTimeout(timer);
    }
  }, [localConfig?.serialTerminal?.autoConnect, webSerialSupported, serialConnected]);

  // Функция попытки авто-подключения
  const attemptAutoConnect = async () => {
    if (!webSerialSupported || serialConnected) return;

    try {
      // Проверяем доступные порты
      const ports = await (navigator as any).serial.getPorts();

      if (ports.length > 0) {
        // Если есть сохраненные порты, пытаемся подключиться к первому
        setSerialResult('🔄 Спроба авто-підключення до Serial порту...');
        setSerialResultClass('info');

        portRef.current = ports[0];

        await ports[0].open({
          baudRate: serialBaudRate,
          dataBits: serialDataBits,
          stopBits: serialStopBits,
          parity: serialParity,
          bufferSize: serialBufferSize,
          flowControl: serialFlowControl
        });

        setSerialResult('✅ Авто-підключення успішне!');
        setSerialResultClass('success');
        setSerialConnected(true);
        startReadingSerialData();

        addToast({
          title: "Авто-підключення",
          description: "Serial порт успішно підключено автоматично",
          color: "success",
        });
      }
    } catch (error: any) {
      console.log('Авто-підключення не вдалося:', error.message);
      // Не показываем ошибку, так как это автоматическая попытка
    }
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
              {state.lastBarcode && (
                <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                  <p className="font-medium">Останній код: {state.lastBarcode.code}</p>
                  <p className="text-gray-500">Тип: {state.lastBarcode.type}</p>
                </div>
              )}
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
                value={localConfig.scale?.comPort || "COM5"}
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
                onValueChange={(e) =>
                  handleConfigChange(
                    "scale",
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
                Авто. підключення ваг</Switch>
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

              <Input
                type="number"
                id="scanTimeout"
                label="Таймаут сканування (мс)"
                labelPlacement="outside"
                className="block text-sm font-medium text-gray-700 mb-1"
                value={localConfig?.scanner?.scanTimeout?.toString() || "300"}
                onChange={(e) =>
                  handleConfigChange(
                    "scanner",
                    "scanTimeout",
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

            {/* Тест сканера */}
            <div className="flex flex-col gap-4 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-gray-700">Тест сканера</h3>

              <div className="flex gap-2 items-center flex-wrap">
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
                  size="sm"
                  variant="bordered"
                  onPress={startKeyboardDiagnostics}
                >
                  Диагностика клавиатуры
                </Button>

                <Button
                  color="danger"
                  size="sm"
                  variant="bordered"
                  onPress={() => {
                    // Сбрасываем состояние сканера
                    actions.resetScanner();
                    // Показываем уведомление
                    addToast({
                      title: "Состояние сканера сброшено",
                      color: "success",
                      timeout: 3000
                    });
                  }}
                >
                  Сброс сканера
                </Button>

                {state.isScannerConnected && (
                  <span className="text-sm text-green-600 flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    Сканер подключен
                  </span>
                )}

                {!state.isScannerConnected && !state.status.isSimulationMode && (
                  <span className="text-sm text-orange-600 flex items-center gap-1">
                    <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                    Сканер не подключен
                  </span>
                )}
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
                  <h4 className="font-medium text-blue-700 mb-2">Диагностика клавиатуры (10 сек):</h4>
                  <div className="text-xs text-blue-600 max-h-32 overflow-y-auto bg-white p-2 rounded border">
                    {keyboardEvents.length === 0 ? (
                      <span>Ожидание событий клавиатуры...</span>
                    ) : (
                      keyboardEvents.map((event, index) => (
                        <div key={index} className="font-mono">{event}</div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="text-xs text-gray-500 space-y-1">
                <div><strong>Тест сканера:</strong> Отсканируйте любой штрих-код в течение 5 секунд</div>
                <div><strong>Диагностика:</strong> Показывает все события клавиатуры для 10 секунд</div>
                <div><strong>Совет:</strong> Если сканер не работает, проверьте настройки scanTimeout (200-500ms)</div>
              </div>
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
      
      {/* Тестування обладнання (Serial Terminal) */}
      <Card className="bg-gradient-to-r bg-neutral-50">
        <CardHeader className="border-b border-grey-200">
          <DynamicIcon
            name="terminal"
            size={20}
            className="text-primary mr-2"
          />
          <h2 className="text-lg font-semibold text-primary">
            Тестування обладнання (Serial Port)
          </h2>
        </CardHeader>
        <CardBody className="p-6">
          {/* Налаштування підключення */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block font-medium mb-2 text-sm">Baud Rate:</label>
              <select
                value={serialBaudRate}
                onChange={(e) => setSerialBaudRate(Number(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded text-sm"
              >
                <option value={9600}>9600</option>
                <option value={19200}>19200</option>
                <option value={38400}>38400</option>
                <option value={57600}>57600</option>
                <option value={115200}>115200</option>
              </select>
            </div>

            <div>
              <label className="block font-medium mb-2 text-sm">Data Bits:</label>
              <select
                value={serialDataBits}
                onChange={(e) => setSerialDataBits(Number(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded text-sm"
              >
                <option value={7}>7</option>
                <option value={8}>8</option>
              </select>
            </div>

            <div>
              <label className="block font-medium mb-2 text-sm">Stop Bits:</label>
              <select
                value={serialStopBits}
                onChange={(e) => setSerialStopBits(Number(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded text-sm"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </div>

            <div>
              <label className="block font-medium mb-2 text-sm">Parity:</label>
              <select
                value={serialParity}
                onChange={(e) => setSerialParity(e.target.value as 'none' | 'even' | 'odd')}
                className="w-full p-2 border border-gray-300 rounded text-sm"
              >
                <option value="none">None</option>
                <option value="even">Even</option>
                <option value="odd">Odd</option>
              </select>
            </div>

            <div>
              <label className="block font-medium mb-2 text-sm">Buffer Size:</label>
              <input
                type="number"
                value={serialBufferSize}
                onChange={(e) => setSerialBufferSize(Number(e.target.value))}
                className="w-full p-2 border border-gray-300 rounded text-sm"
                min="256"
                max="16384"
              />
            </div>

            <div>
              <label className="block font-medium mb-2 text-sm">Flow Control:</label>
              <select
                value={serialFlowControl}
                onChange={(e) => setSerialFlowControl(e.target.value as 'none' | 'hardware')}
                className="w-full p-2 border border-gray-300 rounded text-sm"
              >
                <option value="none">None</option>
                <option value="hardware">Hardware</option>
              </select>
            </div>
          </div>

          {/* Кнопки керування */}
          <div className="border border-gray-200 rounded p-4 mb-4">
            <div className="flex flex-wrap gap-2 mb-4">
              <Button
                onPress={connectToSerialPort}
                disabled={serialConnected}
                color="primary"
                variant="solid"
                size="sm"
              >
                <DynamicIcon name="usb" size={16} />
                Підключитися до Serial Port
              </Button>
              <Button
                onPress={disconnectFromSerialPort}
                disabled={!serialConnected}
                color="danger"
                variant="solid"
                size="sm"
              >
                <DynamicIcon name="power-off" size={16} />
                Відключитися
              </Button>
              <Button
                onPress={clearTerminal}
                color="secondary"
                variant="bordered"
                size="sm"
              >
                <DynamicIcon name="trash-2" size={16} />
                Очистити термінал
              </Button>
            </div>

            {/* Налаштування терміналу */}
            <div className="flex flex-wrap gap-4 mb-4">
              <label className="flex items-center text-sm">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="mr-2"
                />
                Auto Scroll
              </label>
              <label className="flex items-center text-sm">
                <input
                  type="checkbox"
                  checked={showTime}
                  onChange={(e) => setShowTime(e.target.checked)}
                  className="mr-2"
                />
                Show Time
              </label>
              <label className="flex items-center text-sm">
                <input
                  type="checkbox"
                  checked={autoConnectEnabled}
                  onChange={(e) => toggleAutoConnect(e.target.checked)}
                  className="mr-2"
                />
                Auto Connect
              </label>
              <select
                value={logType}
                onChange={(e) => setLogType(e.target.value as 'ascii' | 'hex' | 'both')}
                className="p-1 border border-gray-300 rounded text-sm"
              >
                <option value="ascii">ASCII</option>
                <option value="hex">HEX</option>
                <option value="both">Both</option>
              </select>
            </div>

            {/* Результат підключення */}
            {serialResult && (
              <div className={`mb-4 p-3 rounded font-mono whitespace-pre-wrap max-h-32 overflow-y-auto text-sm ${
                serialResultClass === 'success' ? 'bg-green-50 border border-green-200 text-green-800' :
                serialResultClass === 'error' ? 'bg-red-50 border border-red-200 text-red-800' :
                'bg-blue-50 border border-blue-200 text-blue-800'
              }`}>
                {serialResult}
              </div>
            )}
          </div>

          {/* Посилання на повний тест обладнання */}
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-blue-800 text-sm">Потрібен повний тест обладнання?</h3>
                <p className="text-blue-600 text-xs mt-1">
                  Перейдіть до спеціальної сторінки для комплексного тестування ваги та сканера
                </p>
              </div>
              <Button
                as="a"
                href="/test-serial-com"
                target="_blank"
                rel="noopener noreferrer"
                color="primary"
                variant="solid"
                size="sm"
                className="ml-4"
              >
                <DynamicIcon name="external-link" size={14} className="mr-1" />
                Відкрити тест
              </Button>
            </div>
          </div>

          {/* Міні-термінал */}
          <div className="border border-gray-200 rounded">
            <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
              <span className="font-medium text-sm">Serial Terminal</span>
              <span className="text-xs text-gray-600">Logs: {terminalLogs.length}</span>
            </div>
            <div
              ref={terminalRef}
              className="h-64 overflow-y-auto p-3 bg-black text-green-400 font-mono text-sm"
            >
              {terminalLogs.map((log, index) => (
                <div key={index} className="mb-1">
                  <span className="text-blue-400">
                    {log.timestamp && `[${log.timestamp}] `}
                    {log.direction === 'in' ? '←' : '→'}
                  </span>
                  {logType === 'ascii' && (
                    <span className="ml-2">{log.ascii}</span>
                  )}
                  {logType === 'hex' && (
                    <span className="ml-2">{log.hex}</span>
                  )}
                  {logType === 'both' && (
                    <span className="ml-2">
                      <span className="text-yellow-400">HEX:</span> {log.hex} |
                      <span className="text-green-400">ASCII:</span> {log.ascii}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

    </div>
  );
};

export default SettingsEquipment;
