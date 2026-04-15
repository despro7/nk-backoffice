import { playNotificationSound, playSoundChoice } from '../lib/soundUtils';
import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Switch } from "@heroui/switch";
import { DynamicIcon } from "lucide-react/dynamic";
import { useEquipmentFromAuth } from "../contexts/AuthContext";
import { EquipmentConfig } from "../services/EquipmentService";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { addToast } from "@heroui/toast";
import ScaleService from "../services/ScaleService";
import PrinterService from "../services/printerService";
import { EQUIPMENT_DEFAULTS } from "../../shared/constants/equipmentDefaults.js";
import { Spinner } from "@heroui/react";
import { useRoleAccess } from '@/hooks/useRoleAccess';


export const SettingsEquipment = () => {
  const { isAdmin } = useRoleAccess();
  const [state, actions] = useEquipmentFromAuth();
  const [localConfig, setLocalConfig] = useState<EquipmentConfig | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isConnectingScale, setIsConnectingScale] = useState(false);

  // Debounce для налаштувань сканера
  const scannerDebounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [scannerPendingChanges, setScannerPendingChanges] = useState<{[key: string]: any}>({});

  // Функция для получения отображаемых названий полей сканера
  const getScannerFieldDisplayName = (field: string): string => {
    const names: Record<string, string> = {
      timeout: 'Таймаут',
      scanTimeout: 'Таймаут сканування',
      autoConnect: 'Автопідключення'
    };
    return names[field] || field;
  };


  // Состояние для теста сканера
  const [scannerTestResult, setScannerTestResult] = useState<string>('');
  const [scannerTestStatus, setScannerTestStatus] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const [scannerTestTimeout, setScannerTestTimeout] = useState<number | null>(null);

  // Состояние для теста весов ВТА-60
  const [vta60TestResult, setVta60TestResult] = useState<string>('Очікування тесту...');
  const [vta60TestStatus, setVta60TestStatus] = useState<'idle' | 'connecting' | 'waiting' | 'success' | 'error'>('idle');
  const [vta60RawData, setVta60RawData] = useState<string>('');
  const [vta60ParsedData, setVta60ParsedData] = useState<{weight?: number, price?: number, total?: number}>({});

  // Состояние для режима тестирования в реальном времени
  const [realtimeTestStatus, setRealtimeTestStatus] = useState<'idle' | 'running' | 'paused' | 'stopping'>('idle');
  const [realtimeTestResults, setRealtimeTestResults] = useState<Array<{
    timestamp: Date;
    rawData: string;
    parsedData: {weight?: number, price?: number, total?: number};
    success: boolean;
    error?: string;
    isStable?: boolean;
    isUnstable?: boolean;
    warning?: boolean;
  }>>([]);
  const [realtimeTestInterval, setRealtimeTestInterval] = useState<NodeJS.Timeout | null>(null);
  const [realtimeTestTimeout, setRealtimeTestTimeout] = useState<NodeJS.Timeout | null>(null);
  const realtimeTestStatusRef = useRef<'idle' | 'running' | 'paused' | 'stopping'>('idle');
  const realtimeResultsRef = useRef<HTMLDivElement>(null);
  const [isLogsExpanded, setIsLogsExpanded] = useState(false);


  // Хелпер для выбора интервала опроса из настроек
  const getActivePollingMs = (): number => {
    const fallback = EQUIPMENT_DEFAULTS.scale.activePollingInterval;
    const cfg = localConfig?.scale?.activePollingInterval;
    return typeof cfg === 'number' && cfg > 0 ? cfg : fallback;
  };
  const lastStableWeightRef = useRef<number | null>(null);

  // Функция для автоматической прокрутки к новым записям (вниз)
  const scrollToLatestResult = () => {
    if (realtimeResultsRef.current) {
      realtimeResultsRef.current.scrollTop = realtimeResultsRef.current.scrollHeight;
    }
  };

  // Звук событий взвешивания с учетом настроек
  const playEventSound = (event: 'stable' | 'unstable' | 'error') => {
    const soundKey = event === 'stable' ? (localConfig as any)?.scale?.stableSound
                  : event === 'unstable' ? (localConfig as any)?.scale?.unstableSound
                  : (localConfig as any)?.scale?.errorSound;
    const choice = (soundKey as string) || 'default';
    playSoundChoice(choice, event);
  };
  const [keyboardEvents, setKeyboardEvents] = useState<string[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [printers, setPrinters] = useState<string[]>([]);

  // Web Serial API поддержка
  const [webSerialSupported, setWebSerialSupported] = useState<boolean | null>(null);

  const handleFindPrinters = async () => {
    const foundPrinters = await PrinterService.findPrinters();
    const printerNames = foundPrinters.map((p) => p.name);
    setPrinters(printerNames);
    if (printerNames.length > 0) {
      handleConfigChange("printer", "name", printerNames[0]);
      addToast({
        title: 'Принтери знайдено',
        description: `Знайдено ${printerNames.length} принтерів. Вибрано перший.`,
        color: 'success',
      });
    } else {
      addToast({
        title: 'Принтери не знайдено',
        description: 'Перевірте підключення та роботу QZ Tray.',
        color: 'warning',
      });
    }
  };

  const handleTestPrint = async () => {
    if (!localConfig?.printer?.name) {
      addToast({
        title: 'Помилка',
        description: 'Ім\'я принтера не вказано в налаштуваннях.',
        color: 'danger',
      });
      return;
    }
    const testZpl = `
    ^XA
    ^FO50,50^A0N,50,50^FDTest Print OK^FS
    ^XZ
    `;
    await PrinterService.printZpl(localConfig.printer.name, testZpl);
  };


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

    // Устанавливаем таймаут на 10 секунд
    const timeout = window.setTimeout(() => {
      setScannerTestStatus('error');
      setScannerTestResult('Тест не удался - сканер не обнаружен или не работает');
      setScannerTestTimeout(null);
      // Удаляем тестовый listener
      if ((window as any).testScannerListener) {
        document.removeEventListener('keydown', (window as any).testScannerListener);
        (window as any).testScannerListener = null;
      }
    }, 10000);

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
          window.setTimeout(() => {
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
              window.setTimeout(() => {
                setScannerTestStatus('idle');
                setScannerTestResult('');
              }, 10000);
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
    window.setTimeout(() => {
      document.removeEventListener('keydown', diagnosticsListener);
      setShowDiagnostics(false);
    }, 10000);

  }, []);

  // Проверка поддержки при загрузке
  useEffect(() => {
    checkWebSerialSupport();
  }, [checkWebSerialSupport]);

  // Очистка интервалов при размонтировании компонента
  useEffect(() => {
    return () => {
      if (realtimeTestInterval) {
        clearInterval(realtimeTestInterval);
      }
      if (realtimeTestTimeout) {
        clearTimeout(realtimeTestTimeout);
      }
      // Очищаем debounce таймаут для сканера
      if (scannerDebounceTimeoutRef.current) {
        clearTimeout(scannerDebounceTimeoutRef.current);
      }
    };
  }, [realtimeTestInterval, realtimeTestTimeout]);

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
  // Debounced збереження налаштувань сканера
  const debouncedSaveScannerSettings = useCallback(async (pendingChanges: {[key: string]: any}) => {
    if (!localConfig || Object.keys(pendingChanges).length === 0) {
      return;
    }

    try {
      // Обновляем конфигурацию
      const updatedConfig: EquipmentConfig = {
        ...localConfig,
        scanner: {
          ...localConfig.scanner,
          ...pendingChanges,
        }
      };

      setLocalConfig(updatedConfig);
      await actions.saveConfig(updatedConfig);

      // Показываем уведомление об успешном сохранении
      const changedFields = Object.keys(pendingChanges);
      addToast({
        title: "Налаштування збережено",
        description: `Налаштування сканера оновлено: ${changedFields.map(field => getScannerFieldDisplayName(field)).join(', ')}`,
        color: "success",
        timeout: 2000,
      });

      // Очищаем pending changes
      setScannerPendingChanges({});
    } catch (error) {
      console.error('❌ Помилка збереження налаштувань сканера:', error);
      addToast({
        title: "Помилка збереження",
        description: "Не вдалося зберегти налаштування сканера",
        color: "danger",
        timeout: 3000,
      });
    }
  }, [localConfig, actions, getScannerFieldDisplayName]);

  // Обновление настроек сканера с debounce
  const updateScannerSetting = useCallback((field: string, value: any) => {

    if (!localConfig) {
      addToast({
        title: "Помилка",
        description: "Конфігурація не завантажена",
        color: "danger",
        timeout: 3000,
      });
      return;
    }

    // Обновляем локальную конфигурацию сразу для UI
    const updatedConfig: EquipmentConfig = {
      ...localConfig,
      scanner: {
        ...localConfig.scanner,
        [field]: value,
      }
    };
    setLocalConfig(updatedConfig);

    // Добавляем изменение в pending changes
    const newPendingChanges = {
      ...scannerPendingChanges,
      [field]: value,
    };
    setScannerPendingChanges(newPendingChanges);

    // Очищаем предыдущий таймаут
    if (scannerDebounceTimeoutRef.current) {
      clearTimeout(scannerDebounceTimeoutRef.current);
    }

    // Устанавливаем новый таймаут на 1 секунду
    scannerDebounceTimeoutRef.current = setTimeout(() => {
      debouncedSaveScannerSettings(newPendingChanges);
    }, 1000);
  }, [localConfig, scannerPendingChanges, debouncedSaveScannerSettings]);

  // Обновление настроек весов только в локальном состоянии (без автосохранения)
  const updateScaleSetting = (field: string, value: any) => {
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

    // Обновляем конфигурацию только в локальном состоянии
    const updatedConfig: EquipmentConfig = {
      ...localConfig,
      scale: {
        ...localConfig.scale,
        [field]: value,
      }
    };

    setLocalConfig(updatedConfig);
  };

  // Ручное сохранение настроек весов
  const [isScaleSaving, setIsScaleSaving] = useState(false);

  const saveScaleSettings = async () => {
    try {
      if (!localConfig) {
        addToast({
          title: "Помилка",
          description: "Конфігурація не завантажена",
          color: "danger",
          timeout: 3000,
        });
        return;
      }

      setIsScaleSaving(true);

      await actions.saveConfig(localConfig);

      addToast({
        title: "Налаштування збережено",
        description: "Налаштування ваг збережено успішно",
        color: "success",
        timeout: 2000,
      });
    } catch (error) {
      console.error('❌ saveScaleSettings error:', error);
      addToast({
        title: "Помилка збереження",
        description: "Не вдалося зберегти налаштування ваг",
        color: "danger",
        timeout: 3000,
      });
    } finally {
      setIsScaleSaving(false);
    }
  };

  // Обновление настроек принтера с сохранением в БД
  const updatePrinterSetting = async (field: string, value: any) => {
    try {
      if (!localConfig) {
        addToast({
          title: "Помилка",
          description: "Конфігурація не завантажена",
          color: "danger",
          timeout: 3000,
        });
        return;
      }

      const updatedConfig: EquipmentConfig = {
        ...localConfig,
        printer: {
          ...(localConfig.printer || { enabled: false, name: '' }),
          [field]: value,
        },
      };

      setLocalConfig(updatedConfig);
      await actions.saveConfig(updatedConfig);

      addToast({
        title: "Налаштування збережено",
        description: `Налаштування принтера "${getPrinterFieldDisplayName(
          field
        )}" оновлено`,
        color: "success",
        timeout: 2000,
      });
    } catch (error) {
      console.error('❌ Помилка збереження налаштувань принтера:', error);
      addToast({
        title: "Помилка",
        description: "Не вдалося зберегти налаштування принтера",
        color: "danger",
        timeout: 3000,
      });
    }
  };

  // Оновлення налаштувань принтера чеків з збереженням у БД
  const updateReceiptPrinterSetting = async (field: string, value: any) => {
    try {
      if (!localConfig) {
        addToast({
          title: "Помилка",
          description: "Конфігурація не завантажена",
          color: "danger",
          timeout: 3000,
        });
        return;
      }

      const updatedConfig: EquipmentConfig = {
        ...localConfig,
        receiptPrinter: {
          ...(localConfig.receiptPrinter || { enabled: false, name: '', defaultReceiptType: 'fiscal', autoPrintOnComplete: false, autoPrintDelayMs: 1000 }),
          [field]: value,
        },
      };

      setLocalConfig(updatedConfig);
      await actions.saveConfig(updatedConfig);

      addToast({
        title: "Налаштування збережено",
        description: `Налаштування принтера чеків оновлено`,
        color: "success",
        timeout: 2000,
      });
    } catch (error) {
      console.error('❌ Помилка збереження налаштувань принтера чеків:', error);
      addToast({
        title: "Помилка",
        description: "Не вдалося зберегти налаштування принтера чеків",
        color: "danger",
        timeout: 3000,
      });
    }
  };

  // Тестовий друк ESC/POS для принтера чеків
  const handleTestReceiptPrint = async () => {
    if (!localConfig?.receiptPrinter?.name) {
      addToast({
        title: "Помилка",
        description: "Вкажіть ім'я принтера чеків",
        color: "danger",
        timeout: 3000,
      });
      return;
    }
    try {
      // ESC/POS: reset + center + bold + text + cut
      const testData =
        '\x1B@' +
        '\x1Ba\x01' +
        '\x1BE\x01' +
        'NK Food Shop\n' +
        '\x1BE\x00' +
        '\x1Ba\x00' +
        '--------------------------------\n' +
        'Тест принтера чеків\n' +
        '--------------------------------\n' +
        '\n\n\n' +
        '\x1DV\x41\x00';
      await PrinterService.printRaw(localConfig.receiptPrinter.name, testData);
      addToast({
        title: "Тест надіслано",
        description: `Тестовий чек відправлено на "${localConfig.receiptPrinter.name}"`,
        color: "success",
        timeout: 3000,
      });
    } catch (error) {
      console.error('❌ Помилка тестового друку чека:', error);
      addToast({
        title: "Помилка друку",
        description: "Не вдалося надіслати тестовий чек",
        color: "danger",
        timeout: 3000,
      });
    }
  };

  // 🧪 Діагностичний друк — 4 тести різних форматів QZ Tray
  const handleDebugPrint = async (testNumber: number) => {
    const printerName = localConfig?.receiptPrinter?.name;

    try {
      // Підключення до QZ Tray
      const qz = (await import('qz-tray')).default;
      if (!qz.websocket.isActive()) {
        const { initializeQzTray } = await import('../lib/qzConfig');
        initializeQzTray();
        await qz.websocket.connect();
      }

      let config: any;
      let data: any[];
      let description: string;

      switch (testNumber) {
        case 1: {
          // Тест 1: Plain string до реального принтера
          if (!printerName) { addToast({ title: "Помилка", description: "Вкажіть ім'я принтера", color: "danger", timeout: 3000 }); return; }
          description = `Plain string → "${printerName}"`;
          config = qz.configs.create(printerName);
          data = ['Hello from QZ Tray!\n\n\n'];
          break;
        }
        case 2: {
          // Тест 2: raw/plain до реального принтера
          if (!printerName) { addToast({ title: "Помилка", description: "Вкажіть ім'я принтера", color: "danger", timeout: 3000 }); return; }
          description = `raw/plain → "${printerName}"`;
          config = qz.configs.create(printerName);
          data = [{ type: 'raw', format: 'plain', data: 'Test 2: raw/plain object\n\n\n' }];
          break;
        }
        case 3: {
          // Тест 3: raw/base64 до реального принтера
          if (!printerName) { addToast({ title: "Помилка", description: "Вкажіть ім'я принтера", color: "danger", timeout: 3000 }); return; }
          description = `raw/base64 → "${printerName}"`;
          config = qz.configs.create(printerName);
          data = [{ type: 'raw', format: 'base64', data: btoa('Test 3: base64 data\n\n\n') }];
          break;
        }
        case 4: {
          // Тест 4: raw/hex до реального принтера
          if (!printerName) { addToast({ title: "Помилка", description: "Вкажіть ім'я принтера", color: "danger", timeout: 3000 }); return; }
          description = `raw/hex → "${printerName}"`;
          config = qz.configs.create(printerName);
          const text = 'Test 4: hex data\n\n\n';
          const hex = Array.from(text).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
          data = [{ type: 'raw', format: 'hex', data: hex }];
          break;
        }
        case 5: {
          // Тест 5: Зберегти ESC/POS у файл (не потрібен фізичний принтер!)
          // QZ Tray вміє писати прямо у файл — вказуємо тип 'file'
          description = 'ESC/POS → файл C:\\escpos_test.bin';
          config = qz.configs.create(null);
          data = [{
            type: 'raw',
            format: 'base64',
            data: btoa('\x1B@\x1Ba\x01\x1BE\x01NK Food Shop\n\x1BE\x00\x1Ba\x00--------------------------------\nTest 5: save to file\n--------------------------------\n\n\n\x1DV\x41\x00'),
            options: { language: 'ESCPOS', destination: 'file', path: 'C:\\escpos_test.bin' },
          }];
          break;
        }
        case 6: {
          // Тест 6: format:'hex' через TCP — байти мають бути точно CP866 (92 a5 e1 e2 для "Тест")
          description = 'ESC/POS hex → TCP 127.0.0.1:9100';
          config = qz.configs.create({ host: '127.0.0.1', port: 9100 } as any);
          // Ручна CP866 конвертація: "Тест кирилиця" → CP866 байти → hex
          // Т=0x92, е=0xa5, с=0xe1, т=0xe2 (CP866)
          const escPosText =
            '\x1B@' +            // RESET
            '\x1Bt\x11' +        // CP866
            '\x1Ba\x01' +        // center
            '\x1BE\x01' +        // bold on
            'NK Food Shop\n' +
            '\x1BE\x00' +        // bold off
            '\x1Ba\x00' +        // left
            '--------------------------------\n' +
            'Тест hex: СКЛАД ЧЕК-ЛІСТ\n' +
            '--------------------------------\n' +
            '\n\n\n' +
            '\x1DV\x41\x00';     // CUT
          // CP866 таблиця (спрощена — тільки для тесту)
          const cp866Map: Record<number, number> = {
            0x0410:0x80,0x0411:0x81,0x0412:0x82,0x0413:0x83,0x0414:0x84,0x0415:0x85,0x0416:0x86,0x0417:0x87,
            0x0418:0x88,0x0419:0x89,0x041A:0x8A,0x041B:0x8B,0x041C:0x8C,0x041D:0x8D,0x041E:0x8E,0x041F:0x8F,
            0x0420:0x90,0x0421:0x91,0x0422:0x92,0x0423:0x93,0x0424:0x94,0x0425:0x95,0x0426:0x96,0x0427:0x97,
            0x0428:0x98,0x0429:0x99,0x042A:0x9A,0x042B:0x9B,0x042C:0x9C,0x042D:0x9D,0x042E:0x9E,0x042F:0x9F,
            0x0430:0xA0,0x0431:0xA1,0x0432:0xA2,0x0433:0xA3,0x0434:0xA4,0x0435:0xA5,0x0436:0xA6,0x0437:0xA7,
            0x0438:0xA8,0x0439:0xA9,0x043A:0xAA,0x043B:0xAB,0x043C:0xAC,0x043D:0xAD,0x043E:0xAE,0x043F:0xAF,
            0x0440:0xE0,0x0441:0xE1,0x0442:0xE2,0x0443:0xE3,0x0444:0xE4,0x0445:0xE5,0x0446:0xE6,0x0447:0xE7,
            0x0448:0xE8,0x0449:0xE9,0x044A:0xEA,0x044B:0xEB,0x044C:0xEC,0x044D:0xED,0x044E:0xEE,0x044F:0xEF,
            0x0406:0x49,0x0456:0x69,0x0407:0x9F,0x0457:0xEF,0x0404:0x85,0x0454:0xA5,0x0490:0x83,0x0491:0xA3,
          };
          const hexBytes: string[] = [];
          for (let ci = 0; ci < escPosText.length; ci++) {
            const code = escPosText.charCodeAt(ci);
            if (code < 0x80) hexBytes.push(code.toString(16).padStart(2, '0'));
            else hexBytes.push((cp866Map[code] ?? 0x3F).toString(16).padStart(2, '0'));
          }
          data = [{ type: 'raw', format: 'hex', data: hexBytes.join('') }];
          break;
        }
        default:
          return;
      }

      console.log(`🧪 Тест ${testNumber} (${description}):`, JSON.stringify(data));
      await qz.print(config, data);

      addToast({
        title: `✅ Тест ${testNumber} відправлено`,
        description: description,
        color: "success",
        timeout: 5000,
      });
    } catch (error: any) {
      console.error(`❌ Тест ${testNumber} помилка:`, error);
      addToast({
        title: `❌ Тест ${testNumber} помилка`,
        description: error?.message || String(error),
        color: "danger",
        timeout: 5000,
      });
    }
  };

  // Функция для получения отображаемых названий полей принтера
  const getPrinterFieldDisplayName = (field: string): string => {
    const names: Record<string, string> = {
      enabled: 'Прямий друк',
      name: "Ім'я принтера",
      autoPrintOnComplete: 'Автоматичний друк при завершенні замовлення',
      autoPrintDelayMs: 'Затримка перед автоматичним друком',
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
      autoConnect: 'Автопідключення',
      amplitudeSpikeThresholdKg: 'Поріг сплеску ваги (кг)'
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
      
      let errorDescription = "Помилка підключення ваг!";
      
      if (error.name === 'SecurityError' && error.message.includes('user gesture')) {
        errorDescription = "Натисніть кнопку підключення ще раз для надання дозволу на доступ до COM-порту";
      } else if (error.name === 'NotFoundError') {
        errorDescription = "COM-порт не знайдено. Перевірте підключення весов";
      } else if (error.name === 'NetworkError') {
        errorDescription = "Помилка з'єднання з COM-портом. Перевірте налаштування";
      } else if (error.message.includes('already open')) {
        errorDescription = "COM-порт вже відкритий. Закрийте інші програми або перезавантажте сторінку";
      }
      
      addToast({
        title: "Помилка",
        description: errorDescription,
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
      // Используем синглтон ScaleService для теста
      const scaleService = ScaleService.getInstance();

      // Проверяем состояние весов перед подключением
      const status = await scaleService.checkScaleStatus();
      console.log('🔧 Scale status before connection:', status);
      
      if (status.readableLocked || status.writableLocked) {
        setVta60TestResult('⚠️ Потік даних заблокований. Спробуйте скинути з\'єднання.');
        setVta60TestStatus('error');
        return;
      }

      // Подключаемся с настройками ВТА-60
      const connected = await scaleService.connect();
      if (!connected) {
        throw new Error('Не вдалося підключитися до ВТА-60');
      }

      setVta60TestStatus('waiting');
      setVta60TestResult('Відправка запиту 00 00 03...');

      // Отправляем запрос и получаем данные с таймаутом
      const readPromise = scaleService.readScaleOnce(true);
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => {
          console.log('⏱️ Test timeout reached, cancelling operation');
          scaleService.cancelCurrentReadOperation();
          resolve(null);
        }, 10000); // Таймаут 10 секунд для теста
      });

      const scaleData = await Promise.race([readPromise, timeoutPromise]);
      
      // НЕ отключаемся после теста - оставляем соединение активным для дальнейшего использования
      // await scaleService.disconnect(); // ← УБРАНО: не отключаемся после теста

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
        setVta60TestResult(`✅ Дані успішно отримані від ВТА-60\nВага: ${scaleData.weight.toFixed(3)} кг`);
      } else {
        // Проверяем, была ли операция отменена
        const status = await scaleService.checkScaleStatus();
        if (!status.connected) {
          throw new Error('З\'єднання було втрачено під час тесту');
        } else {
          throw new Error('Не отримано відповіді від вагів (можливо нестабільна вага)');
        }
      }
    } catch (error) {
      console.error('VTA-60 test error:', error);
      setVta60TestStatus('error');
      
      // Более явная обработка специфических ошибок Web Serial API
      let errorMessage = error.message;
      
      if (error.name === 'SecurityError' && error.message.includes('user gesture')) {
        errorMessage = '⚠️ Потрібно дозвіл користувача\n\nНатисніть кнопку "Тестувати ВТА-60" ще раз, щоб надати дозвіл на доступ до COM-порту.\n\nЦе потрібно для безпеки браузера.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = '❌ COM-порт не знайдено\n\nПеревірте, що:\n• Веси підключені до комп\'ютера\n• Драйвери встановлені\n• COM-порт доступний в системі';
      } else if (error.name === 'NetworkError') {
        errorMessage = '❌ Помилка мережі\n\nПеревірте з\'єднання з COM-портом:\n• Кабель підключений\n• Порт не використовується іншою програмою\n• Налаштування COM-порту правильні';
      } else if (error.message.includes('already open')) {
        errorMessage = '⚠️ COM-порт вже відкритий\n\nПорт вже використовується:\n• Закрийте інші програми, що використовують COM-порт\n• Перезавантажте сторінку для скидання з\'єднань\n• Спробуйте відключити та підключити знову';
      } else if (error.message.includes('Web Serial API')) {
        errorMessage = '❌ Web Serial API не підтримується\n\nВикористовуйте Chrome або Edge браузер для роботи з COM-портами.';
      } else if (error.message.includes('ReadableStream is locked')) {
        errorMessage = '🔒 Потік даних заблокований\n\nСпробуйте:\n• Відключити та знову підключити ваги\n• Перезавантажити сторінку\n• Закрити інші вкладки, що використовують ваги';
      } else if (error.message.includes('timeout') || error.message.includes('тайм-аут') || error.message.includes('нестабильна') || error.message.includes('немає відповіді')) {
        errorMessage = '⏱️ Таймаут очікування відповіді\n\nМожливі причини:\n• Ваги показують нестабільну вагу (покладіть або приберіть предмет)\n• Ваги не готові до роботи\n• Кабель підключений неправильно\n• Налаштування порту неправильні (4800-8E1)';
      } else if (error.message.includes('некоректні')) {
        errorMessage = '⚠️ Отримано некоректні дані від вагів\n\nПеревірте:\n• Ваги працюють правильно\n• Немає електромагнітних перешкод\n• Кабель підключений надійно';
      } else if (error.message.includes('втрачено')) {
        errorMessage = '🔌 З\'єднання було втрачено\n\nСпробуйте:\n• Скинути з\'єднання\n• Перевірити підключення кабелю\n• Перезавантажити сторінку';
      }
      
      setVta60TestResult(errorMessage);
    }
  };

  // Обработчик для режима тестирования в реальном времени
  const handleRealtimeTest = async () => {
    if (realtimeTestStatus === 'idle') {
      // Запуск тестирования
      setRealtimeTestStatus('running');
      realtimeTestStatusRef.current = 'running';
      setRealtimeTestResults([]);
      
      // Звуковой сигнал при запуске тестирования
  playNotificationSound('success');
      
      try {
        const scaleService = ScaleService.getInstance();
        
        // Проверяем состояние весов
        const status = await scaleService.checkScaleStatus();
        if (status.readableLocked || status.writableLocked) {
          setRealtimeTestStatus('idle');
          setRealtimeTestResults([{
            timestamp: new Date(),
            rawData: '',
            parsedData: {},
            success: false,
            error: 'Потік даних заблокований. Спробуйте скинути з\'єднання.'
          }]);
          setTimeout(scrollToLatestResult, 10);
          return;
        }

        // Подключаемся к весам
        const connected = await scaleService.connect();
        if (!connected) {
          setRealtimeTestStatus('idle');
          setRealtimeTestResults([{
            timestamp: new Date(),
            rawData: '',
            parsedData: {},
            success: false,
            error: 'Не вдалося підключитися до ВТА-60'
          }]);
          setTimeout(scrollToLatestResult, 10);
          // Звуковой сигнал при ошибке подключения
          playNotificationSound('error');
          return;
        }

        // Запускаем интервал для непрерывного опроса (из настроек)
        const interval = setInterval(async () => {
          // Проверяем состояние через ref
          if (realtimeTestStatusRef.current !== 'running') {
            clearInterval(interval);
            return;
          }

          try {
            const scaleData = await scaleService.readScaleOnce(true);
            
            if (scaleData && scaleData.rawData) {
              const hexData = Array.from(scaleData.rawData)
                .map(b => b.toString(16).padStart(2, '0').toUpperCase())
                .join(' ');

              const parsedData = {
                weight: scaleData.weight,
                price: scaleData.price,
                total: scaleData.total
              };

              // Разбор байтов и расширенная диагностика нестабильности/ошибок кадра
              const bytes = hexData.split(' ').filter(Boolean).map(h => parseInt(h, 16));
              const lastByte = bytes[bytes.length - 1];
              const suffix2 = bytes.slice(-2).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

              const serviceStable = suffix2 === '00 00';
              const serviceUnstableKnown = suffix2 === '00 04';
              // Любой иной суффикс, отличный от 00 00 и 00 04, считаем нестабильным
              const serviceUnstableOther = !serviceStable && !serviceUnstableKnown;

              // Амплитудный порог сплеска (кг) из настроек, по умолчанию 5кг
              const spikeThresholdKg = (localConfig?.scale as any)?.amplitudeSpikeThresholdKg ?? 5;
              const lastStable = lastStableWeightRef.current;
              const weight = typeof parsedData.weight === 'number' ? parsedData.weight : null;
              const jumpedTooMuch = lastStable !== null && weight !== null && Math.abs(weight - lastStable) >= spikeThresholdKg;

              // Итоговая классификация: суффикс задаёт стабильность; всплеск по амплитуде помечает warning
              // Fake zero: кадр стабилен, но внутри есть ненулевые «цифробайты», а weight==0
              const hasInnerDigitsOnZero = serviceStable && weight === 0 && bytes.slice(0, -2).some(b => b !== 0);

              const isUnstable = serviceUnstableKnown || serviceUnstableOther || hasInnerDigitsOnZero;
              const isStable = serviceStable && !isUnstable;
              

              // Логирование только критических ошибок
              if (parsedData.weight && (parsedData.weight < 0 || parsedData.weight > 1000)) {
                console.warn('⚠️ Realtime test: Invalid weight detected:', parsedData.weight);
              }
              
              setRealtimeTestResults(prev => {
                // Проверяем, не дублируется ли последняя запись
                const lastResult = prev[prev.length - 1];
                const isDuplicate = lastResult && 
                  lastResult.success && 
                  lastResult.parsedData.weight === parsedData.weight &&
                  lastResult.parsedData.price === parsedData.price &&
                  lastResult.parsedData.total === parsedData.total;
                
                if (isDuplicate) {
                  return prev; // Не добавляем дубликат
                }
                
                // Фильтрация «плохих» кадров: лишние служебные байты (06/08) на конце или всплески 00 09 00 02
                if (isUnstable && !isStable) {
                  // Звук под нестабільність
                  playEventSound('unstable');
                  let reason = '';
                  if (serviceUnstableOther) {
                    reason = `Нестабільний кадр: невідомий суфікс ${suffix2}`;
                  } else if (hasInnerDigitsOnZero) {
                    reason = 'Нестабільний кадр: нульова вага з внутрішніми ненульовими байтами';
                  } else {
                    reason = 'Нестабільний кадр';
                  }

                  const warnResults = [...prev, {
                    timestamp: new Date(),
                    rawData: hexData,
                    parsedData: parsedData,
                    success: false,
                    error: reason,
                    isStable: false,
                    isUnstable: true,
                    warning: true
                  }];
                  return warnResults.slice(-50);
                }

                // Звук при каждой стабилизации
                if (isStable) {
                  playEventSound('stable');
                }

                // Обновляем последний стабильный вес
                if (isStable && typeof parsedData.weight === 'number') {
                  lastStableWeightRef.current = parsedData.weight;
                }

                // Если кадр стабильный, но рывок по амплитуде — помечаем предупреждением
                if (isStable && jumpedTooMuch) {
                  const warnResults = [...prev, {
                    timestamp: new Date(),
                    rawData: hexData,
                    parsedData: parsedData,
                    success: false,
                    error: `Стрибок ваги ≥ ${spikeThresholdKg}кг`,
                    isStable: false,
                    isUnstable: true,
                    warning: true
                  }];
                  return warnResults.slice(-50);
                }

                const newResults = [...prev, {
                  timestamp: new Date(),
                  rawData: hexData,
                  parsedData: parsedData,
                  success: true,
                  isStable: isStable,
                  isUnstable: isUnstable,
                  warning: false
                }];
                // Ограничиваем количество записей до 50 для производительности
                return newResults.slice(-50);
              });
              // Автоматическая прокрутка к новой записи
              setTimeout(scrollToLatestResult, 10);
            } else {
              setRealtimeTestResults(prev => {
                const newResults = [...prev, {
                  timestamp: new Date(),
                  rawData: '',
                  parsedData: {},
                  success: false,
                  error: 'Немає даних від вагів (нормально при зміні грузу)'
                }];
                return newResults.slice(-50);
              });
              // Автоматическая прокрутка к новой записи
              setTimeout(scrollToLatestResult, 10);
            }
          } catch (error) {
            setRealtimeTestResults(prev => {
              const newResults = [...prev, {
                timestamp: new Date(),
                rawData: '',
                parsedData: {},
                success: false,
                error: error.message
              }];
              return newResults.slice(-50);
            });
            // Автоматическая прокрутка к новой записи
            setTimeout(scrollToLatestResult, 10);
          }
        }, getActivePollingMs());

        setRealtimeTestInterval(interval);

        // Устанавливаем таймаут на 5 минут
        const timeout = setTimeout(() => {
          handleStopRealtimeTest();
        }, 5 * 60 * 1000); // 5 минут

        setRealtimeTestTimeout(timeout);

      } catch (error) {
        console.error('Realtime test start error:', error);
        setRealtimeTestStatus('idle');
        setRealtimeTestResults([{
          timestamp: new Date(),
          rawData: '',
          parsedData: {},
          success: false,
          error: error.message
        }]);
        setTimeout(scrollToLatestResult, 10);
        // Звуковой сигнал при ошибке
        playNotificationSound('error');
      }
    } else {
      // Остановка тестирования
      handleStopRealtimeTest();
    }
  };

  // Пауза/возобновление режима тестирования в реальном времени
  const handlePauseResumeRealtimeTest = () => {
    if (realtimeTestStatus === 'running') {
      // Пауза
      setRealtimeTestStatus('paused');
      realtimeTestStatusRef.current = 'paused';
      
      // Звуковой сигнал при паузе
  playNotificationSound('unstable');
      
      // Очищаем интервал, но оставляем таймаут для продолжения отсчета
      if (realtimeTestInterval) {
        clearInterval(realtimeTestInterval);
        setRealtimeTestInterval(null);
      }
      // Таймаут остается активным - тест автоматически остановится через 5 минут

      // Добавляем запись о паузе
      setRealtimeTestResults(prev => [{
        timestamp: new Date(),
        rawData: '',
        parsedData: {},
        success: true,
        error: 'Тестування призупинено'
      }, ...prev]);
      setTimeout(scrollToLatestResult, 10);
    } else if (realtimeTestStatus === 'paused') {
      // Возобновление
      setRealtimeTestStatus('running');
      realtimeTestStatusRef.current = 'running';
      
      // Звуковой сигнал при возобновлении тестирования
  playNotificationSound('success');
      
      // Запускаем интервал заново (та же логика, что и при старте)
      const interval = setInterval(async () => {
        if (realtimeTestStatusRef.current !== 'running') {
          clearInterval(interval);
          return;
        }

        try {
          const scaleService = ScaleService.getInstance();
          const scaleData = await scaleService.readScaleOnce(true);
          
          if (scaleData && scaleData.rawData) {
            const hexData = Array.from(scaleData.rawData)
              .map(b => b.toString(16).padStart(2, '0').toUpperCase())
              .join(' ');

            const parsedData = {
              weight: scaleData.weight,
              price: scaleData.price,
              total: scaleData.total
            };
            
            // Полная логика стабильности/нестабильности и фильтров
            const bytes = hexData.split(' ').filter(Boolean).map(h => parseInt(h, 16));
            const lastByte = bytes[bytes.length - 1];
            const suffix2 = bytes.slice(-2).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
            const serviceStable = suffix2 === '00 00';
            const serviceUnstable = suffix2 === '00 04';
            const hasErrTail = lastByte === 0x08 || lastByte === 0x06;
            const hasSpikeSignature = hexData.includes('00 09 00 02');
            const spikeThresholdKg = (localConfig?.scale as any)?.amplitudeSpikeThresholdKg ?? 5;
            const lastStable = lastStableWeightRef.current;
            const weight = typeof parsedData.weight === 'number' ? parsedData.weight : null;
            const jumpedTooMuch = lastStable !== null && weight !== null && Math.abs(weight - lastStable) >= spikeThresholdKg;
            const isUnstable = serviceUnstable || hasErrTail || (hasSpikeSignature && jumpedTooMuch);
            const isStable = serviceStable && !hasErrTail && !(hasSpikeSignature && jumpedTooMuch);

            setRealtimeTestResults(prev => {
              const lastResult = prev[prev.length - 1];
              const isDuplicate = lastResult && lastResult.success &&
                lastResult.parsedData.weight === parsedData.weight &&
                lastResult.parsedData.price === parsedData.price &&
                lastResult.parsedData.total === parsedData.total;
              if (isDuplicate) return prev;

              if (hasErrTail || (hasSpikeSignature && jumpedTooMuch)) {
                const reason = hasErrTail
                  ? `Нестабільний кадр: службовий байт ${lastByte?.toString(16).toUpperCase()} в кінці`
                  : `Нестабільний кадр: підпис 00 09 00 02 + сплеск ≥ ${spikeThresholdKg}кг`;
                const warnResults = [...prev, {
                  timestamp: new Date(), rawData: hexData, parsedData, success: false,
                  error: reason, isStable: false, isUnstable: true, warning: true
                }];
                return warnResults.slice(-50);
              }

              if (isStable) {
                playEventSound('stable');
              }
              if (isStable && typeof parsedData.weight === 'number') {
                lastStableWeightRef.current = parsedData.weight;
              }
              const newResults = [...prev, {
                timestamp: new Date(), rawData: hexData, parsedData,
                success: true, isStable, isUnstable, warning: false
              }];
              return newResults.slice(-50);
            });
            setTimeout(scrollToLatestResult, 10);
          } else {
            setRealtimeTestResults(prev => {
              const newResults = [...prev, {
                timestamp: new Date(),
                rawData: '',
                parsedData: {},
                success: false,
                error: 'Немає даних від вагів'
              }];
              return newResults.slice(-50);
            });
            setTimeout(scrollToLatestResult, 10);
          }
        } catch (error) {
          setRealtimeTestResults(prev => {
            const newResults = [...prev, {
              timestamp: new Date(),
              rawData: '',
              parsedData: {},
              success: false,
              error: error.message
            }];
            return newResults.slice(-50);
          });
          setTimeout(scrollToLatestResult, 10);
        }
      }, getActivePollingMs());

      setRealtimeTestInterval(interval);

      // Добавляем запись о возобновлении
      setRealtimeTestResults(prev => [{
        timestamp: new Date(),
        rawData: '',
        parsedData: {},
        success: true,
        error: 'Тестування відновлено'
      }, ...prev]);
      setTimeout(scrollToLatestResult, 10);
    }
  };

  // Остановка режима тестирования в реальном времени
  const handleStopRealtimeTest = async () => {
    setRealtimeTestStatus('stopping');
    realtimeTestStatusRef.current = 'stopping';
    
    // Очищаем интервал и таймаут
    if (realtimeTestInterval) {
      clearInterval(realtimeTestInterval);
      setRealtimeTestInterval(null);
    }
    
    if (realtimeTestTimeout) {
      clearTimeout(realtimeTestTimeout);
      setRealtimeTestTimeout(null);
    }

    // Добавляем запись о остановке
    setRealtimeTestResults(prev => [{
      timestamp: new Date(),
      rawData: '',
      parsedData: {},
      success: true,
      error: 'Тестування зупинено'
    }, ...prev]);
    setTimeout(scrollToLatestResult, 10);

    setRealtimeTestStatus('idle');
    realtimeTestStatusRef.current = 'idle';
    
    // Звуковой сигнал при остановке тестирования
  playNotificationSound('success');
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




  // Если конфигурация еще не загружена, показываем загрузку
  if (!localConfig) {
    return (
      <div className="flex items-center justify-center min-h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Завантаження налаштувань...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

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
          {isAdmin() && (
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
          )}
        </CardHeader>
        <CardBody className="p-6">
          <div className="flex flex-col xl:flex-row gap-8">
            {/* Налаштування ваг */}
            <Card className={`flex-1 grid grid-cols-2 gap-6 p-4 h-fit ${isScaleSaving ? "opacity-60 pointer-events-none" : ""}`}>
              <h3 className="font-medium text-gray-400 col-span-2">Налаштування ваг</h3>
              <Select
                id="baudRate"
                label="Швидкість (біт/с)"
                labelPlacement="outside"
                selectedKeys={[localConfig.scale?.baudRate?.toString() || "4800"]}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as string;
                  updateScaleSetting("baudRate", parseInt(value));
                }}
                classNames={{
                  label: "block text-xs font-medium text-gray-700 mb-1",
                }}
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
                classNames={{
                  label: "block text-xs font-medium text-gray-700 mb-1",
                }}
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
                classNames={{
                  label: "block text-xs font-medium text-gray-700 mb-1",
                }}
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
                classNames={{
                  label: "block text-xs font-medium text-gray-700 mb-1",
                }}
              >
                <SelectItem key="none">None</SelectItem>
                <SelectItem key="even">Even</SelectItem>
                <SelectItem key="odd">Odd</SelectItem>
              </Select>


              <Input
                id="activePollingInterval"
                type="number"
                label="Інтервал активного опитування (мс)"
                labelPlacement="outside"
                value={localConfig.scale?.activePollingInterval?.toString() || EQUIPMENT_DEFAULTS.scale.activePollingInterval.toString()}
                onValueChange={(value) =>
                  updateScaleSetting("activePollingInterval", parseInt(value) || EQUIPMENT_DEFAULTS.scale.activePollingInterval)
                }
                classNames={{
                  label: "block text-xs font-medium text-gray-700 mb-1",
                }}
                min="100"
                max="5000"
              />

              <Input
                id="weightThresholdForActive"
                type="number"
                label="Поріг ваги для Active Polling (кг)"
                labelPlacement="outside"
                value={localConfig.scale?.weightThresholdForActive?.toString() || EQUIPMENT_DEFAULTS.scale.weightThresholdForActive.toString()}
                onValueChange={(value) =>
                  updateScaleSetting("weightThresholdForActive", parseFloat(value) || EQUIPMENT_DEFAULTS.scale.weightThresholdForActive)
                }
                classNames={{
                  label: "block text-xs font-medium text-gray-700 mb-1",
                }}
                min="0.001"
                max="1.0"
                step="0.001"
              />

              <Input
                id="reservePollingInterval"
                type="number"
                label="Інтервал резервного опитування (мс)"
                labelPlacement="outside"
                value={localConfig.scale?.reservePollingInterval?.toString() || EQUIPMENT_DEFAULTS.scale.reservePollingInterval.toString()}
                onValueChange={(value) =>
                  updateScaleSetting("reservePollingInterval", parseInt(value) || EQUIPMENT_DEFAULTS.scale.reservePollingInterval)
                }
                classNames={{
                  label: "block text-xs font-medium text-gray-700 mb-1",
                }}
                min="1000"
                max="30000"
              />

              <Input
                id="activePollingDuration"
                type="number"
                label="Тривалість активного опитування (мс)"
                labelPlacement="outside"
                value={localConfig.scale?.activePollingDuration?.toString() || EQUIPMENT_DEFAULTS.scale.activePollingDuration.toString()}
                onValueChange={(value) =>
                  updateScaleSetting("activePollingDuration", parseInt(value) || EQUIPMENT_DEFAULTS.scale.activePollingDuration)
                }
                classNames={{
                  label: "block text-xs font-medium text-gray-700 mb-1",
                }}
                min="5000"
                max="300000"
              />

              <Input
                id="maxPollingErrors"
                type="number"
                label="Максимальна кількість помилок"
                labelPlacement="outside"
                value={localConfig.scale?.maxPollingErrors?.toString() || EQUIPMENT_DEFAULTS.scale.maxPollingErrors.toString()}
                onValueChange={(value) =>
                  updateScaleSetting("maxPollingErrors", parseInt(value) || EQUIPMENT_DEFAULTS.scale.maxPollingErrors)
                }
                classNames={{
                  label: "block text-xs font-medium text-gray-700 mb-1",
                }}
                min="1"
                max="20"
              />

              <Input
                id="weightCacheDuration"
                type="number"
                label="Час кешування даних ваг (мс)"
                labelPlacement="outside"
                value={localConfig.scale?.weightCacheDuration?.toString() || EQUIPMENT_DEFAULTS.scale.weightCacheDuration.toString()}
                onValueChange={(value) =>
                  updateScaleSetting("weightCacheDuration", parseInt(value) || EQUIPMENT_DEFAULTS.scale.weightCacheDuration)
                }
                classNames={{
                  label: "block text-xs font-medium text-gray-700 mb-1",
                }}
                min="100"
                max="5000"
              />

              <Input
                id="amplitudeSpikeThresholdKg"
                type="number"
                label="Поріг сплеску ваги (кг)"
                labelPlacement="outside"
                value={(localConfig.scale as any)?.amplitudeSpikeThresholdKg?.toString() || "5"}
                onValueChange={(value) =>
                  updateScaleSetting("amplitudeSpikeThresholdKg", parseFloat(value) || 5)
                }
                classNames={{
                  label: "block text-xs font-medium text-gray-700 mb-1",
                }}
                min="0.5"
                step="0.5"
                max="200"
              />

              {/* Звуки подій зважування */}
              <Select
                id="stableSound"
                label="Звук стабільного кадру"
                labelPlacement="outside"
                selectedKeys={[((localConfig as any)?.scale?.stableSound || 'default')]}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as string;
                  updateScaleSetting('stableSound', value);
                  // Предпрослушка
                  playSoundChoice(value, 'stable');
                }}
                classNames={{ label: "block text-xs font-medium text-gray-700 mb-1" }}
              >
                <SelectItem key="default">Default</SelectItem>
                <SelectItem key="soft">Soft</SelectItem>
                <SelectItem key="sharp">Sharp</SelectItem>
                <SelectItem key="double">Double</SelectItem>
                <SelectItem key="beep3">Beep x3</SelectItem>
                <SelectItem key="chime">Chime</SelectItem>
                <SelectItem key="low">Low</SelectItem>
                <SelectItem key="off">Off</SelectItem>
              </Select>

              <Select
                id="unstableSound"
                label="Звук нестабільного кадру"
                labelPlacement="outside"
                selectedKeys={[((localConfig as any)?.scale?.unstableSound || 'default')]}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as string;
                  updateScaleSetting('unstableSound', value);
                  // Предпрослушка
                  playSoundChoice(value, 'unstable');
                }}
                classNames={{ label: "block text-xs font-medium text-gray-700 mb-1" }}
              >
                <SelectItem key="default">Default</SelectItem>
                <SelectItem key="soft">Soft</SelectItem>
                <SelectItem key="sharp">Sharp</SelectItem>
                <SelectItem key="double">Double</SelectItem>
                <SelectItem key="beep3">Beep x3</SelectItem>
                <SelectItem key="chime">Chime</SelectItem>
                <SelectItem key="low">Low</SelectItem>
                <SelectItem key="off">Off</SelectItem>
              </Select>

              <Select
                id="errorSound"
                label="Звук помилки"
                labelPlacement="outside"
                selectedKeys={[((localConfig as any)?.scale?.errorSound || 'default')]}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as string;
                  updateScaleSetting('errorSound', value);
                  // Предпрослушка
                  playSoundChoice(value, 'error');
                }}
                classNames={{ label: "block text-xs font-medium text-gray-700 mb-1" }}
              >
                <SelectItem key="default">Default</SelectItem>
                <SelectItem key="soft">Soft</SelectItem>
                <SelectItem key="sharp">Sharp</SelectItem>
                <SelectItem key="double">Double</SelectItem>
                <SelectItem key="beep3">Beep x3</SelectItem>
                <SelectItem key="chime">Chime</SelectItem>
                <SelectItem key="low">Low</SelectItem>
                <SelectItem key="off">Off</SelectItem>
              </Select>

              {/* Стратегія підключення */}
              <Select
                id="connectionStrategy"
                label="Стратегія роботи з портом"
                labelPlacement="outside"
                selectedKeys={[localConfig.scale?.connectionStrategy || "legacy"]}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as string;
                  updateScaleSetting("connectionStrategy", value);
                }}
                classNames={{
                  base: "col-span-2",
                  label: "block text-xs font-medium text-gray-700 mb-1",
                }}
                >
                <SelectItem key="legacy">Стандартна (Legacy)</SelectItem>
                <SelectItem key="reconnectOnError">Перепідключення при помилці</SelectItem>
                <SelectItem key="persistentStream">Постійний потік</SelectItem>
              </Select>

              {/* Свитчер автопідключення ваг */}
              <Switch
                id="scaleAutoConnect"
                isSelected={localConfig.scale?.autoConnect || false}
                onValueChange={(value) => updateScaleSetting("autoConnect", value)}
                color="primary"
                size="sm"
                classNames={{
                  base: "col-span-2",
                  wrapper: "bg-secondary/50",
                  thumbIcon: "bg-white/50",
                }}
              >
                Авто. підключення ваг</Switch>

              {/* Кнопка сохранения настроек весов */}
              <div className="flex col-span-2 mt-4">
                <Button
                  isLoading={isScaleSaving}
                  onPress={saveScaleSettings}
                  color="primary"
                  size="sm"
                  variant="solid"
                >
                  <DynamicIcon name="save" size={14} />
                  Зберегти налаштування ваг
                </Button>
              </div>
              {isScaleSaving && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70 z-20">
                  <Spinner size="lg" color="primary" />
                  <span className="mt-2 text-gray-700 font-medium">Налаштування зберігаються...</span>
                </div>
              )}
            </Card>

            <div className="flex flex-1 flex-col gap-8 h-fit">
              
              {/* Тест ваг ВТА-60 */}
              <Card className="flex w-full flex-col gap-6 p-4 h-fit">
                <h3 className="font-medium text-gray-400">Тест ваг ВТА-60</h3>

                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Button
                        color={vta60TestStatus === 'idle' ? 'primary' : 'default'}
                        size="sm"
                        onPress={handleVTA60Test}
                        isLoading={vta60TestStatus === 'connecting' || vta60TestStatus === 'waiting'}
                        disabled={vta60TestStatus === 'connecting' || vta60TestStatus === 'waiting' || realtimeTestStatus === 'running'}
                      >
                        {vta60TestStatus === 'connecting' ? 'Підключення...' :
                        vta60TestStatus === 'waiting' ? 'Очікування відповіді...' :
                        'Тестувати'}
                      </Button>
                      
                      <Button
                        color={realtimeTestStatus === 'running' ? 'danger' : 'primary'}
                        size="sm"
                        onPress={handleRealtimeTest}
                        isLoading={realtimeTestStatus === 'stopping'}
                        disabled={vta60TestStatus === 'connecting' || vta60TestStatus === 'waiting'}
                        className="flex-1"
                      >
                        {realtimeTestStatus === 'running' ? 'Зупинити тест' :
                        realtimeTestStatus === 'stopping' ? 'Зупинення...' :
                        'Зважування в реальному часі'}
                      </Button>
                      
                      {(realtimeTestStatus === 'running' || realtimeTestStatus === 'paused') && (
                        <Button
                          // color={realtimeTestStatus === 'paused' ? 'success' : 'warning'}
                          size="sm"
                          variant="bordered"
                          onPress={handlePauseResumeRealtimeTest}
                          disabled={vta60TestStatus === 'connecting' || vta60TestStatus === 'waiting'}
                        >
                          {realtimeTestStatus === 'paused' ? '▶️' : '⏸️'}
                        </Button>
                      )}
                    </div>


                    {/* Результаты тестирования в реальном времени */}
                    {(realtimeTestStatus !== 'idle' || realtimeTestResults.length > 0) && (
                      <div className="mb-0">
                        <div className="flex items-center gap-2 justify-between">
                          {/* Кнопка отмены текущей операции */}
                          <Button
                            color="danger"
                            size="sm"
                            onPress={async () => {
                              try {
                                setVta60TestResult('Скасування поточної операції...');
                                const scaleService = ScaleService.getInstance();
                                scaleService.cancelCurrentReadOperation();
                                setVta60TestStatus('idle');
                                setVta60TestResult('Операцію скасовано. Спробуйте тест ще раз.');
                              } catch (error) {
                                console.error('Error cancelling operation:', error);
                                setVta60TestResult(`❌ Помилка скасування: ${error.message}`);
                              }
                            }}
                            disabled={vta60TestStatus !== 'waiting'}
                            className="flex-1"
                          >
                            Скасувати операцію
                          </Button>
                          {/* Кнопка сброса соединения с весами */}
                          <Button
                            color="warning"
                            size="sm"
                            onPress={async () => {
                              try {
                                setVta60TestResult('Скидання з\'єднання з вагами...');
                                const scaleService = ScaleService.getInstance();
                                const resetSuccess = await scaleService.forceReset();
                                if (resetSuccess) {
                                  setVta60TestResult('✅ З\'єднання успішно скинуто. Тепер спробуйте тест ще раз.');
                                } else {
                                  setVta60TestResult('❌ Не вдалося скинути з\'єднання. Перевірте підключення ваг.');
                                }
                              } catch (error) {
                                console.error('Error resetting scale connection:', error);
                                setVta60TestResult(`❌ Помилка скидання: ${error.message}`);
                              }
                            }}
                            disabled={vta60TestStatus === 'connecting' || vta60TestStatus === 'waiting'}
                            className="flex-1"
                          >
                            Скинути з'єднання
                          </Button>
                          {realtimeTestResults.length > 0 && (
                            <Button
                              size="sm"
                              color="danger"
                              variant="light"
                              onPress={() => setRealtimeTestResults([])}
                              disabled={realtimeTestStatus === 'running'}
                            >
                              Очистити
                            </Button>
                          )}
                        </div>
                    
                        <div className="flex items-center justify-between mt-4 mb-2">
                          <h4 className="text-sm font-medium text-gray-600">
                            Тестування в реальному часі
                            {realtimeTestStatus === 'running' && (
                              <span className="ml-2 text-xs text-green-600">● Активний</span>
                            )}
                            {realtimeTestStatus === 'paused' && (
                              <span className="ml-2 text-xs text-yellow-600">⏸️ Призупинено</span>
                            )}
                          </h4>
                          <Button
                            size="sm"
                            variant="light"
                            color={isLogsExpanded ? 'secondary' : 'primary'}
                            onPress={() => setIsLogsExpanded(v => !v)}
                          >
                            {isLogsExpanded ? 'Зменшити логи' : 'Розгорнути логи'}
                          </Button>
                        </div>
                        
                        <div className={`overflow-y-auto border rounded ${isLogsExpanded ? 'max-h-[60vh]' : 'max-h-80'}`} ref={realtimeResultsRef}>
                          {realtimeTestResults.length === 0 ? (
                            <div className="p-3 text-sm text-gray-500 text-center">
                              {realtimeTestStatus === 'running' ? 'Очікування даних...' : 'Немає результатів'}
                            </div>
                          ) : (
                            <div className="space-y-1 p-2">
                              {realtimeTestResults.map((result, index) => (
                                <div
                                  key={index}
                                  className={`p-2 rounded text-xs ${
                                    result.success
                                      ? 'bg-green-50 border-l-2 border-green-400'
                                      : result.warning
                                        ? 'bg-yellow-50 border-l-2 border-yellow-400'
                                        : 'bg-red-50 border-l-2 border-red-400'
                                  } ${index < 3 ? 'ring-1 ring-blue-200 bg-blue-50/30' : ''}`}
                                >
                                  <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 text-gray-600 font-mono">
                                        <span>{result.timestamp.toLocaleTimeString()}</span>
                                        {index >= realtimeTestResults.length - 3 && (
                                          <span className="text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded">
                                            СВІЖЕ
                                          </span>
                                        )}
                                        {result.isUnstable && (
                                          <span className="text-xs bg-yellow-500 text-white px-1.5 py-0.5 rounded">
                                            НЕСТАБІЛЬНО
                                          </span>
                                        )}
                                        {result.isStable && (
                                          <span className="text-xs bg-green-500 text-white px-1.5 py-0.5 rounded">
                                            СТАБІЛЬНО
                                          </span>
                                        )}
                                      </div>
                                      {result.success ? (
                                        <div className="mt-1">
                                          {result.parsedData.weight !== undefined && (
                                            <div className="text-green-700">
                                              <strong>Вага:</strong> {result.parsedData.weight} кг
                                            </div>
                                          )}
                                          {/* {result.parsedData.price !== undefined && (
                                            <div className="text-green-700">
                                              <strong>Ціна:</strong> {result.parsedData.price} грн
                                            </div>
                                          )}
                                          {result.parsedData.total !== undefined && (
                                            <div className="text-green-700">
                                              <strong>Сума:</strong> {result.parsedData.total} грн
                                            </div>
                                          )} */}
                                          {result.rawData && (
                                            <div className="text-gray-500 mt-1 font-mono text-xs">
                                              HEX: {result.rawData}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="text-red-700 mt-1">
                                          <strong>Помилка:</strong> {result.error}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        {realtimeTestStatus === 'running' && (
                          <div className="mt-2 text-xs text-gray-500">
                            Автоматичне зупинення через 5 хвилин
                          </div>
                        )}
                        {realtimeTestStatus === 'paused' && (
                          <div className="mt-2 text-xs text-yellow-600">
                            Тестування призупинено. Логи збережені. Натисніть "Відновити" для продовження.
                          </div>
                        )}
                        
                        <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded mt-4">
                          <p className="mb-2"><strong>Статуси:</strong> 🟢 СТАБІЛЬНО - ваги стабільні, 🟡 НЕСТАБІЛЬНО - ваги нестабільні (при постановці/знятті грузу)</p>
                          <p className="mb-2"><strong>Звукові сигнали:</strong> 🔊 Запуск/зупинка тесту, 🎵 Стабілізація вагів, ⚠️ Помилки підключення</p>
                          <p><strong>Примітка:</strong> Повідомлення "Немає даних від вагів" - це нормально при зміні грузу на вагах</p>
                        </div>
                      </div>
                    )}
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

                </div>
              </Card>

              {/* Налаштування принтера QZ Tray */}
              <Card className="flex w-full flex-col gap-6 p-4 h-fit">
                <h3 className="font-medium text-gray-400">Налаштування принтера (QZ Tray)</h3>

                <Switch
                  id="autoPrintOnComplete"
                  size="sm"
                  isSelected={localConfig.printer?.autoPrintOnComplete || false}
                  onValueChange={(value) => updatePrinterSetting("autoPrintOnComplete", value)}
                  color="primary"
                  classNames={{
                    wrapper: "bg-secondary/50",
                    thumbIcon: "bg-white/50",
                  }}
                >
                  Автоматичний друк при завершенні замовлення
                </Switch>
                
                <Input
                  id="autoPrintDelayMs"
                  type="number"
                  label="Затримка перед автом. друком (мс)"
                  labelPlacement="outside"
                  value={localConfig.printer?.autoPrintDelayMs?.toString() || "3000"}
                  onValueChange={(value) => updatePrinterSetting("autoPrintDelayMs", parseInt(value) || 3000)}
                  placeholder="3000"
                  isDisabled={!localConfig.printer?.enabled || !localConfig.printer?.autoPrintOnComplete}
                  min="1000"
                  max="10000"
                  step="500"
                  description="Мінімум 1 секунда, максимум 10 секунд"
                />
                
                <Switch
                  id="printerEnabled"
                  size="sm"
                  isSelected={localConfig.printer?.enabled || false}
                  onValueChange={(value) => updatePrinterSetting("enabled", value)}
                  color="primary"
                >
                  Увімкнути прямий друк
                </Switch>

                <Input
                  id="printerName"
                  label="Ім'я принтера"
                  labelPlacement="outside"
                  value={localConfig.printer?.name || ""}
                  onValueChange={(value) => updatePrinterSetting("name", value)}
                  placeholder="Наприклад, Zebra ZD410"
                  disabled={!localConfig.printer?.enabled}
                />

                {printers.length > 0 && (
                  <Select
                    label="Виберіть принтер"
                    labelPlacement="outside"
                    selectedKeys={[localConfig.printer?.name || ""]}
                    onSelectionChange={(keys) => {
                      const value = Array.from(keys)[0] as string;
                      updatePrinterSetting("name", value);
                    }}
                  >
                    {printers.map((printer) => (
                      <SelectItem key={printer}>
                        {printer}
                      </SelectItem>
                    ))}
                  </Select>
                )}

                <div className="flex gap-2">
                  <Button
                    color="primary"
                    size="sm"
                    onPress={handleTestPrint}
                    disabled={!localConfig.printer?.enabled}
                  >
                    <DynamicIcon name="printer" size={14} />
                    Тест друку
                  </Button>
                  <Button
                    color="secondary"
                    variant="flat"
                    size="sm"
                    onPress={handleFindPrinters}
                    disabled={!localConfig.printer?.enabled}
                    className="text-gray-600"
                  >
                    <DynamicIcon name="search" size={14} />
                    Знайти принтери
                  </Button>
                </div>
                <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded space-y-1">
                  <p><strong>QZ Tray:</strong> Дозволяє друкувати ZPL/EPL етикетки напряму на термопринтер.</p>
                  <p><strong>Автоматичний друк:</strong> Друкувати ТТН автоматично при завершенні замовлення, показі ТТН або в режимі налагодження.</p>
                  <p><strong>Затримка:</strong> Час очікування перед автоматичним друком (1-10 секунд). Дозволяє користувачу побачити завершення замовлення.</p>
                </div>
              </Card>

              {/* Налаштування принтера чеків (QZ Tray / Xprinter X58) */}
              <Card className="flex w-full flex-col gap-6 p-4 h-fit">
                <h3 className="font-medium text-gray-400">Принтер чеків (QZ Tray)</h3>

                <Switch
                  id="receiptPrinterEnabled"
                  size="sm"
                  isSelected={localConfig.receiptPrinter?.enabled || false}
                  onValueChange={(value) => updateReceiptPrinterSetting("enabled", value)}
                  color="primary"
                >
                  Увімкнути принтер чеків
                </Switch>

                <Input
                  id="receiptPrinterName"
                  label="Ім'я принтера чеків"
                  labelPlacement="outside"
                  placeholder="Наприклад: Xprinter XP-58"
                  value={localConfig.receiptPrinter?.name || ""}
                  onValueChange={(value) => updateReceiptPrinterSetting("name", value)}
                  isDisabled={!localConfig.receiptPrinter?.enabled}
                />

                {printers.length > 0 && (
                  <Select
                    label="Оберіть зі знайдених принтерів"
                    labelPlacement="outside"
                    placeholder="Виберіть принтер зі списку"
                    isDisabled={!localConfig.receiptPrinter?.enabled}
                    selectedKeys={localConfig.receiptPrinter?.name ? [localConfig.receiptPrinter.name] : []}
                    onSelectionChange={(keys) => {
                      const value = Array.from(keys)[0] as string;
                      updateReceiptPrinterSetting("name", value);
                    }}
                  >
                    {printers.map((printer) => (
                      <SelectItem key={printer}>
                        {printer}
                      </SelectItem>
                    ))}
                  </Select>
                )}

                <Select
                  label="Тип чека за замовчуванням"
                  labelPlacement="outside"
                  isDisabled={!localConfig.receiptPrinter?.enabled}
                  selectedKeys={[localConfig.receiptPrinter?.defaultReceiptType || "fiscal"]}
                  onSelectionChange={(keys) => {
                    const value = Array.from(keys)[0] as string;
                    updateReceiptPrinterSetting("defaultReceiptType", value);
                  }}
                >
                  <SelectItem key="fiscal">Фіскальний чек</SelectItem>
                  <SelectItem key="warehouse">Складський чек-ліст</SelectItem>
                  <SelectItem key="both">Обидва типи</SelectItem>
                </Select>

                <Switch
                  id="receiptAutoPrintOnComplete"
                  size="sm"
                  isSelected={localConfig.receiptPrinter?.autoPrintOnComplete || false}
                  onValueChange={(value) => updateReceiptPrinterSetting("autoPrintOnComplete", value)}
                  color="primary"
                  isDisabled={!localConfig.receiptPrinter?.enabled}
                >
                  Автоматичний друк при зборі замовлення
                </Switch>

                <Input
                  type="number"
                  id="receiptAutoPrintDelayMs"
                  label="Затримка перед автодруком (мс)"
                  labelPlacement="outside"
                  value={localConfig.receiptPrinter?.autoPrintDelayMs?.toString() || "1000"}
                  onValueChange={(value) => updateReceiptPrinterSetting("autoPrintDelayMs", parseInt(value) || 1000)}
                  isDisabled={!localConfig.receiptPrinter?.enabled || !localConfig.receiptPrinter?.autoPrintOnComplete}
                  description="Час очікування після завершення збору замовлення (1000 = 1 секунда)"
                />

                <div className="flex gap-2">
                  <Button
                    color="primary"
                    size="sm"
                    onPress={handleTestReceiptPrint}
                    isDisabled={!localConfig.receiptPrinter?.enabled}
                  >
                    <DynamicIcon name="receipt" size={14} />
                    Тест чека
                  </Button>
                  <Button
                    color="secondary"
                    variant="flat"
                    size="sm"
                    onPress={handleFindPrinters}
                    isDisabled={!localConfig.receiptPrinter?.enabled}
                    className="text-gray-600"
                  >
                    <DynamicIcon name="search" size={14} />
                    Знайти принтери
                  </Button>
                </div>

                {/* 🧪 Діагностика друку — тимчасова секція */}
                <div className="border border-warning-200 bg-warning-50 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-warning-700">🧪 Діагностика QZ Tray (тимчасово)</p>
                  <p className="text-xs text-warning-600">Тести 1–4: до вибраного принтера. Тест 5: зберегти у файл (без принтера). Тест 6: TCP socket.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="flat" color="warning" onPress={() => handleDebugPrint(1)}
                      isDisabled={!localConfig.receiptPrinter?.enabled}>
                      1: Plain string
                    </Button>
                    <Button size="sm" variant="flat" color="warning" onPress={() => handleDebugPrint(2)}
                      isDisabled={!localConfig.receiptPrinter?.enabled}>
                      2: raw/plain
                    </Button>
                    <Button size="sm" variant="flat" color="warning" onPress={() => handleDebugPrint(3)}
                      isDisabled={!localConfig.receiptPrinter?.enabled}>
                      3: raw/base64
                    </Button>
                    <Button size="sm" variant="flat" color="warning" onPress={() => handleDebugPrint(4)}
                      isDisabled={!localConfig.receiptPrinter?.enabled}>
                      4: raw/hex
                    </Button>
                    <Button size="sm" variant="flat" color="danger" onPress={() => handleDebugPrint(5)}>
                      5: → файл
                    </Button>
                    <Button size="sm" variant="flat" color="danger" onPress={() => handleDebugPrint(6)}>
                      6: TCP socket
                    </Button>
                  </div>
                  <p className="text-xs text-warning-500">Тест 5 не потребує принтера — перевір файл <code>C:\escpos_test.bin</code></p>
                </div>
                <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded space-y-1">
                  <p><strong>Термопринтер:</strong> Підтримує 58мм термопринтери Xprinter X58 та сумісні (ESC/POS).</p>
                  <p><strong>Фіскальний чек:</strong> Дані з WordPress PDF або Dilovod JSON.</p>
                  <p><strong>Складський чек-ліст:</strong> Список товарів із кількостями для складу.</p>
                  <p><strong>Обидва типи:</strong> Буде надруковано обидва чеки послідовно.</p>
                </div>
              </Card>
            </div>

            <div className="flex flex-1 flex-col gap-8 h-fit">
              {/* Налаштування сканера */}
              <Card className="flex w-full flex-col gap-6 p-4 h-fit">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-400">Налаштування сканера</h3>
                </div>
                <Input
                  type="number"
                  id="timeout"
                  label="Таймаут підключення сканера (мс)"
                  labelPlacement="outside"
                  className="block text-sm font-medium text-gray-700 mb-1"
                  value={localConfig.scanner?.timeout?.toString() || "5000"}
                  onValueChange={(value) => updateScannerSetting("timeout", parseInt(value))}
                />
                <Input
                  type="number"
                  id="scanTimeout"
                  label="Таймаут сканування баркоду (мс)"
                  labelPlacement="outside"
                  className="block text-sm font-medium text-gray-700 mb-1"
                  value={localConfig?.scanner?.scanTimeout?.toString() || "300"}
                  onValueChange={(value) => updateScannerSetting("scanTimeout", parseInt(value))}
                />
                <Input
                  type="number"
                  id="minScanSpeed"
                  label="Мінімальна швидкість сканування (мс)"
                  labelPlacement="outside"
                  className="block text-sm font-medium text-gray-700 mb-1"
                  value={localConfig?.scanner?.minScanSpeed?.toString() || "50"}
                  onValueChange={(value) => updateScannerSetting("minScanSpeed", parseInt(value))}
                  description="Мінімальний інтервал між символами для розпізнавання як сканер"
                />
                <Input
                  type="number"
                  id="maxScanSpeed"
                  label="Максимальна швидкість сканування (мс)"
                  labelPlacement="outside"
                  className="block text-sm font-medium text-gray-700 mb-1"
                  value={localConfig?.scanner?.maxScanSpeed?.toString() || "200"}
                  onValueChange={(value) => updateScannerSetting("maxScanSpeed", parseInt(value))}
                  description="Максимальний інтервал між символами для розпізнавання як сканер"
                />
                <Input
                  type="number"
                  id="minBarcodeLength"
                  label="Мінімальна довжина баркоду"
                  labelPlacement="outside"
                  className="block text-sm font-medium text-gray-700 mb-1"
                  value={localConfig?.scanner?.minBarcodeLength?.toString() || "5"}
                  min={0}
                  onValueChange={(value) => updateScannerSetting("minBarcodeLength", parseInt(value))}
                  description="Мінімальна кількість символів для обробки як баркод"
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
                  {!state.isScannerConnected && (
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
                    isDisabled={!state.isScannerConnected}
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
                  <div><strong>Розпізнавання:</strong> Сканер розрізняє реальне сканування від вводу з клавіатури за швидкістю та довжиною</div>
                </div>
              </Card>
            </div>
          </div>
        </CardBody>
      </Card>
      

    </div>
  );
};

export default SettingsEquipment;
