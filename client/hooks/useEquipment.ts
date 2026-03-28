import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { EQUIPMENT_DEFAULTS } from '../../shared/constants/equipmentDefaults.js';
import { ToastService } from '@/services/ToastService';
import EquipmentService, { EquipmentStatus, BarcodeData, EquipmentConfig } from '../services/EquipmentService';
import ScaleService, { VTAScaleData } from '../services/ScaleService';
import BarcodeScannerService, { ScannerEvent } from '../services/BarcodeScannerService';
import { LoggingService } from '@/services/LoggingService';


export interface EquipmentState {
  status: EquipmentStatus;
  currentWeight: VTAScaleData | null;
  lastBarcode: BarcodeData | null;
  isConnected: boolean;
  isScaleConnected: boolean;
  isScannerConnected: boolean;
  config: EquipmentConfig | null;
  isLoading: boolean;
  lastRawScaleData: string | Uint8Array;
}

export interface EquipmentActions {
  connectScale: () => Promise<boolean>;
  disconnectScale: () => Promise<void>;
  connectScanner: () => Promise<boolean>;
  disconnectScanner: () => Promise<void>;
  getWeight: () => Promise<VTAScaleData | null>;
  resetScanner: () => void;

  updateConfig: (config: Partial<EquipmentConfig>) => void;
  loadConfig: () => Promise<void>;
  saveConfig: (config: EquipmentConfig) => Promise<void>;
  resetConfig: () => Promise<void>;
  refreshConfig: () => Promise<void>;
}

export const useEquipment = (isAuthenticated: boolean = false): [EquipmentState, EquipmentActions] => {

  const [status, setStatus] = useState<EquipmentStatus>({
    isConnected: false,
    lastActivity: null,
    error: null
  });

  const [currentWeight, setCurrentWeight] = useState<VTAScaleData | null>(null);
  const [lastBarcode, setLastBarcode] = useState<BarcodeData | null>(null);
  const [config, setConfig] = useState<EquipmentConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRawScaleData, setLastRawScaleData] = useState<string | Uint8Array>('');

  // Окремі стани підключення
  const [isScaleConnected, setIsScaleConnected] = useState(false);
  const [isScannerConnected, setIsScannerConnected] = useState(false);

  // Для фільтрації дублікатів сканів
  const lastProcessedCodeRef = useRef<string>('');
  const lastProcessedTimeRef = useRef<number>(0);

  const equipmentService = useRef(EquipmentService.getInstance());
  const scaleService = useRef(ScaleService.getInstance());
  const scannerService = useRef(BarcodeScannerService.getInstance());


  // Кеш для даних ваг
  const weightCacheRef = useRef<{ data: VTAScaleData; timestamp: number } | null>(null);

  // Лічильник спроб перепідключення при помилках
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 3;

  // Лічильник таймаутів підряд (для розумної обробки)
  const timeoutCountRef = useRef(0);
  const maxTimeoutsBeforeReconnect = 3;

  // Кеш для налаштувань обладнання (15 хвилин)
  const configCacheRef = useRef<{ data: EquipmentConfig | null; timestamp: number } | null>(null);
  const CONFIG_CACHE_DURATION = 15 * 60 * 1000;


  // Завантаження конфігурації з БД
  const loadConfig = useCallback(async () => {
    let appliedFallback = false;
    try {
      setIsLoading(true);

      // Перевіряємо кеш конфігурації
      const now = Date.now();
      if (configCacheRef.current && (now - configCacheRef.current.timestamp) < CONFIG_CACHE_DURATION) {
        LoggingService.equipmentLog('🔧 Using cached equipment config');
        setConfig({ ...configCacheRef.current.data });
        updateStatus({
          isConnected: false
        });
        return;
      }

      // Жорсткий таймаут на мережевий запит, щоб не зависати нескінченно
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 10000);

      const response = await fetch('/api/settings/equipment', {
        credentials: 'include',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          // Зберігаємо в кеш
          configCacheRef.current = {
            data: result.data,
            timestamp: now
          };

          setConfig({ ...result.data }); // Створюємо новий об'єкт
          updateStatus({
            isConnected: false
          });
          return;
        }
      }

      // Fallback: якщо відповідь неуспішна – застосовуємо значення за замовчуванням
      appliedFallback = true;
      LoggingService.equipmentLog('⚠️ Using EQUIPMENT_DEFAULTS fallback for equipment config');
      
      configCacheRef.current = { data: EQUIPMENT_DEFAULTS, timestamp: Date.now() };
      setConfig({ ...EQUIPMENT_DEFAULTS });

      ToastService.show({
        title: 'Застосовано конфігурацію за замовчуванням',
        description: 'Не вдалося завантажити налаштування обладнання. Використано дефолтні значення.',
        color: 'warning',
        variant: 'flat',
        timeout: 6000
      });
    } catch (error) {
      LoggingService.equipmentLog('⚠️ Error loading equipment config:', error);

      // Fallback якщо отримали error/abort
      if (!appliedFallback) {
        LoggingService.equipmentLog('⚠️ Using EQUIPMENT_DEFAULTS fallback after fetch error/abort');

        configCacheRef.current = { data: EQUIPMENT_DEFAULTS, timestamp: Date.now() };
        setConfig({ ...EQUIPMENT_DEFAULTS });

        ToastService.show({
          title: 'Застосовано конфігурацію за замовчуванням',
          description: 'Не вдалося завантажити налаштування обладнання. Використано дефолтні значення.',
          color: 'warning',
          variant: 'flat',
          timeout: 6000
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Збереження конфігурації в БД
  const saveConfig = useCallback(async (newConfig: EquipmentConfig) => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/settings/equipment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(newConfig)
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Оновлюємо кеш
          configCacheRef.current = {
            data: newConfig,
            timestamp: Date.now()
          };

          setConfig({ ...newConfig }); // Створюємо новий об'єкт
          updateStatus({
            isConnected: false
          });
        }
      }
    } catch (error) {
      console.error('Error saving equipment config:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Скидання конфігурації до значень за замовчуванням
  const resetConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/settings/equipment/reset', {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setConfig({ ...result.data }); // Створюємо новий об'єкт
          updateStatus({
            isConnected: false
          });
        }
      }
    } catch (error) {
      console.error('Error resetting equipment config:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Завантажуємо конфігурацію тільки після авторизації
  useEffect(() => {
    if (isAuthenticated) {
      loadConfig();
    } else {
      // Поки не авторизовано — застосовуємо дефолти без мережевого запиту
      setConfig({ ...EQUIPMENT_DEFAULTS });
    }
  }, [isAuthenticated, loadConfig]);

  // Оновлення статусу
  const updateStatus = useCallback((updates: Partial<EquipmentStatus>) => {
    setStatus(prev => ({ ...prev, ...updates }));
  }, []);

  // Підключення до ваг
  const connectScale = useCallback(async (manual: boolean = false): Promise<boolean> => {
    try {
      // Використовуємо локальний стан config
      if (!config) {
        LoggingService.equipmentLog('⚠️ [useEquipment]: Конфігурація не завантажена, пропускаємо підключення');
        return false;
      }




      // Локальне підключення: auto = true (ищем порт), manual = false (запрашиваем порт)
      const result = await scaleService.current.connect(!manual);
      if (result) {
        // Встановлюємо callback для отримання даних з ваг
        scaleService.current.onWeightData((weightData: VTAScaleData) => {
          LoggingService.equipmentLog('🔧 [useEquipment]: Weight data received from scale:', weightData);
          setCurrentWeight(weightData);
          LoggingService.equipmentLog('🔧 [useEquipment]: currentWeight updated');
          updateStatus({
            lastActivity: new Date(),
            error: null
          });
        });

        // Встановлюємо callback для сирих даних з ваг
        scaleService.current.onRawDataReceived((rawData: Uint8Array) => {
          // Конвертируем Uint8Array в HEX строку для отображения
          const hexString = Array.from(rawData)
            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
            .join(' ');
          setLastRawScaleData(hexString);
          LoggingService.equipmentLog('🔧 [useEquipment]: Raw scale data received:', hexString);
        });

        updateStatus({
          isConnected: true,
          lastActivity: new Date(),
          error: null
        });
        setIsScaleConnected(true);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      updateStatus({
        isConnected: false,
        error: errorMessage,
        lastActivity: new Date()
      });
      return false;
    }
  }, [updateStatus, config]);


  // Полное отключение от ваг (для принудительного отключения)
  const disconnectScale = useCallback(async (): Promise<void> => {
    try {
      await scaleService.current.disconnect();
      setCurrentWeight(null);
      updateStatus({
        isConnected: false,
        lastActivity: new Date()
      });
      setIsScaleConnected(false);
    } catch (error) {
      console.error('Error disconnecting scale:', error);
    }
  }, [updateStatus]);

  // Підключення до сканера
  const connectScanner = useCallback(async (): Promise<boolean> => {
    try {
      // Используем локальное состояние config
      if (!config) {
        return false;
      }




      // Локальне підключення
      const result = await scannerService.current.connect();
      if (result) {
        // Встановлюємо callback для отримання даних з сканера
        scannerService.current.addEventListener((event: ScannerEvent) => {
          if (event.type === 'data' && event.data) {
            const currentTime = Date.now();
            const code = event.data.code;

            // Фильтруем дубликаты: если тот же код в течение последних scanTimeout * 2
            const duplicateTimeout = config?.scanner?.scanTimeout ? config.scanner.scanTimeout * 2 : 600;
            if (code === lastProcessedCodeRef.current &&
              currentTime - lastProcessedTimeRef.current < duplicateTimeout) {
              if (process.env.NODE_ENV === 'development') {
                LoggingService.equipmentLog('🔄 [useEquipment] Duplicate barcode ignored:', code);
              }
              return;
            }

            // Обновляем референсы для фильтрации дубликатов
            lastProcessedCodeRef.current = code;
            lastProcessedTimeRef.current = currentTime;

            setLastBarcode(event.data);
            updateStatus({
              lastActivity: new Date(),
              error: null
            });
          }
        });

        updateStatus({
          isConnected: true,
          lastActivity: new Date(),
          error: null
        });
        setIsScannerConnected(true);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      updateStatus({
        isConnected: false,
        error: errorMessage,
        lastActivity: new Date()
      });
      return false;
    }
  }, [updateStatus, config]);

  // Відключення від сканера
  const disconnectScanner = useCallback(async (): Promise<void> => {
    try {
      await scannerService.current.disconnect();
      setLastBarcode(null);
      updateStatus({
        isConnected: false,
        lastActivity: new Date()
      });
      setIsScannerConnected(false);
    } catch (error) {
      console.error('Error disconnecting scanner:', error);
    }
  }, [updateStatus]);

  // Сброс состояния сканера
  const resetScanner = useCallback(() => {
    try {
      scannerService.current.resetScannerState();
      setLastBarcode(null);
      updateStatus({
        lastActivity: new Date()
      });
    } catch (error) {
      console.error('Error resetting scanner:', error);
    }
  }, [updateStatus]);


  // Попытка переподключения при ошибках
  const attemptReconnect = useCallback(async (): Promise<boolean> => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      LoggingService.equipmentLog(`⚠️ [useEquipment]: Достигнуто максимальное количество попыток переподключения (${maxReconnectAttempts})`);
      return false;
    }

    reconnectAttemptsRef.current++;
    LoggingService.equipmentLog(`🔄 [useEquipment]: Попытка переподключения ${reconnectAttemptsRef.current}/${maxReconnectAttempts}`);

    try {
      // Сначала отключаемся
      await disconnectScale();

      // Экспоненциальная задержка: 1s, 2s, 4s
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 4000);
      LoggingService.equipmentLog(`⏳ [useEquipment]: Пауза ${delay}ms перед повторным подключением...`);
      await new Promise(resolve => window.setTimeout(resolve, delay));

      // Пытаемся переподключиться
      const reconnected = await connectScale();

      if (reconnected) {
        LoggingService.equipmentLog('✅ [useEquipment]: Успешно переподключились к весам');
        reconnectAttemptsRef.current = 0; // Сбрасываем счетчик при успехе
        return true;
      } else {
        LoggingService.equipmentLog('❌ [useEquipment]: Не удалось переподключиться к весам');
        return false;
      }
    } catch (error) {
      console.error('❌ [useEquipment]: Ошибка при повторном подключении:', error);
      return false;
    }
  }, [connectScale, disconnectScale]);

  // Отримання ваги с улучшенным кэшированием
  const getWeight = useCallback(async (useCache: boolean = true): Promise<VTAScaleData | null> => {
    try {

      // Проверяем кэш если useCache = true
      if (useCache && weightCacheRef.current) {
        const age = Date.now() - weightCacheRef.current.timestamp;
        const cacheDuration = config?.scale?.weightCacheDuration || 2000; // Увеличиваем до 2 секунд
        if (age < cacheDuration) {
          LoggingService.equipmentLog('🔧 [useEquipment]: Возвращаем кэшированный вес:', weightCacheRef.current.data);
          return weightCacheRef.current.data;
        }
      }

      LoggingService.equipmentLog('🔧 [useEquipment]: Запрашиваем свежий вес от реальных весов');
      const weightData = await scaleService.current.getCurrentWeight();
      if (weightData) {
        LoggingService.equipmentLog('✅ [useEquipment]: Вес получен:', weightData);
        setCurrentWeight(weightData);
        // Сбрасываем счетчик таймаутов при успешном получении
        timeoutCountRef.current = 0;
        // Обновляем кэш
        weightCacheRef.current = {
          data: weightData,
          timestamp: Date.now()
        };
        return weightData;
      } else {
        // Если не удалось получить свежий вес, пытаемся переподключиться
        LoggingService.equipmentLog('⚠️ [useEquipment]: Не удалось получить свежий вес, пытаемся переподключиться...');

        const reconnected = await attemptReconnect();
        if (reconnected) {
          // После переподключения пытаемся получить вес еще раз
          LoggingService.equipmentLog('🔄 [useEquipment]: Переподключились, повторная попытка получения веса...');
          const retryWeightData = await scaleService.current.getCurrentWeight();
          if (retryWeightData) {
            LoggingService.equipmentLog('✅ [useEquipment]: Вес получен после переподключения:', retryWeightData);
            setCurrentWeight(retryWeightData);
            weightCacheRef.current = {
              data: retryWeightData,
              timestamp: Date.now()
            };
            return retryWeightData;
          }
        }

        // Если переподключение не помогло, возвращаем кэш
        if (weightCacheRef.current) {
          LoggingService.equipmentLog('⚠️ [useEquipment]: Возвращаем кэшированный вес после неудачного переподключения:', weightCacheRef.current.data);
          return weightCacheRef.current.data;
        }
        LoggingService.equipmentLog('⚠️ [useEquipment]: Не удалось получить вес от весов');
        return null;
      }
    } catch (error) {
      // Детальное логирование ошибки
      const errorDetails = {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        connectionStatus: scaleService.current?.isScaleConnected() || false,
        config: config?.scale
      };

      LoggingService.equipmentLog('❌ [useEquipment]: Детальная ошибка получения веса:', errorDetails);

      // Анализ типа ошибки и умная обработка
      let shouldReconnect = false;

      if (error instanceof Error) {
        if (error.message.includes('device has been lost')) {
          LoggingService.equipmentLog('🔌 [useEquipment]: Устройство отключено (device lost)');
          shouldReconnect = true;
        } else if (error.message.includes('closed stream')) {
          LoggingService.equipmentLog('🔌 [useEquipment]: Поток закрыт (stream closed)');
          shouldReconnect = true;
        } else if (error.message.includes('timeout') || error.message.includes('тайм-аут')) {
          LoggingService.equipmentLog('⏱️ [useEquipment]: Таймаут при получении данных');
          timeoutCountRef.current++;

          // Переподключаемся только после нескольких таймаутов подряд
          if (timeoutCountRef.current >= maxTimeoutsBeforeReconnect) {
            LoggingService.equipmentLog(`⏱️ [useEquipment]: ${timeoutCountRef.current} таймаутов подряд, пытаемся переподключиться...`);
            shouldReconnect = true;
            timeoutCountRef.current = 0; // Сбрасываем счетчик
          } else {
            LoggingService.equipmentLog(`⏱️ [useEquipment]: Таймаут ${timeoutCountRef.current}/${maxTimeoutsBeforeReconnect}, используем кэш`);
            shouldReconnect = false;
          }
        } else if (error.message.includes('locked')) {
          LoggingService.equipmentLog('🔒 [useEquipment]: Поток заблокирован (stream locked)');
          shouldReconnect = true;
        } else if (error.message.includes('not connected')) {
          LoggingService.equipmentLog('🔌 [useEquipment]: Весы не подключены');
          shouldReconnect = true;
        } else {
          LoggingService.equipmentLog('❓ [useEquipment]: Неизвестная ошибка:', error.message);
          shouldReconnect = true;
        }
      }

      // Сбрасываем счетчик таймаутов при успешном получении веса
      if (error instanceof Error && !error.message.includes('timeout') && !error.message.includes('тайм-аут')) {
        timeoutCountRef.current = 0;
      }

      // Переподключаемся только если нужно
      let reconnected = false;
      if (shouldReconnect) {
        LoggingService.equipmentLog('⚠️ [useEquipment]: Ошибка требует переподключения...');
        reconnected = await attemptReconnect();
      } else {
        LoggingService.equipmentLog('⚠️ [useEquipment]: Используем кэш без переподключения');
      }
      if (reconnected) {
        // После переподключения пытаемся получить вес еще раз
        LoggingService.equipmentLog('🔄 [useEquipment]: Переподключились, повторная попытка получения веса...');
        try {
          const retryWeightData = await scaleService.current.getCurrentWeight();
          if (retryWeightData) {
            LoggingService.equipmentLog('✅ [useEquipment]: Вес получен после переподключения:', retryWeightData);
            setCurrentWeight(retryWeightData);
            weightCacheRef.current = {
              data: retryWeightData,
              timestamp: Date.now()
            };
            return retryWeightData;
          }
        } catch (retryError) {
          LoggingService.equipmentLog('❌ [useEquipment]: Ошибка при повторной попытке после переподключения:', retryError);
        }
      }

      // Если переподключение не помогло, возвращаем кэшированный вес
      if (weightCacheRef.current) {
        LoggingService.equipmentLog('⚠️ [useEquipment]: Возвращаем кэшированный вес после неудачного переподключения:', weightCacheRef.current.data);
        return weightCacheRef.current.data;
      }
      return null;
    }
  }, [config, attemptReconnect]);

  // Мониторинг здоровья соединения с весами
  const checkScaleHealth = useCallback(async () => {
    if (!scaleService.current || !config?.scale) return;

    try {
      const isConnected = scaleService.current.isScaleConnected();
      const port = (scaleService.current as any).port;

      const healthInfo = {
        isConnected,
        portExists: !!port,
        readableLocked: port?.readable?.locked || false,
        writableLocked: port?.writable?.locked || false,
        timestamp: new Date().toISOString()
      };

      LoggingService.equipmentLog('🏥 [useEquipment]: Проверка здоровья весов:', healthInfo);

      // Если соединение есть, но потоки заблокированы - это проблема
      if (isConnected && (healthInfo.readableLocked || healthInfo.writableLocked)) {
        LoggingService.equipmentLog('⚠️ [useEquipment]: Обнаружены заблокированные потоки весов');
      }

      return healthInfo;
    } catch (error) {
      LoggingService.equipmentLog('❌ [useEquipment]: Ошибка проверки здоровья весов:', error);
      return null;
    }
  }, [config?.scale]);

  // Оновлення конфігурації
  const updateConfig = useCallback((newConfig: Partial<EquipmentConfig>) => {
    if (config) {
      const updatedConfig = { ...config, ...newConfig };
      setConfig({ ...updatedConfig }); // Создаем новый объект

      updateStatus({ lastActivity: new Date() });

      // Сервисы...
      if (newConfig.scale) {
        scaleService.current.updateConfig(newConfig.scale);
      }
      if (newConfig.scanner) {
        scannerService.current.updateConfig(newConfig.scanner);
      }
    } else {
      LoggingService.equipmentLog('🔧 [useEquipment]: Конфигурация еще не загружена, невозможно обновить');
    }
  }, [updateStatus, config]);

  // Флаг для отслеживания инициализации
  const [isInitialized, setIsInitialized] = useState(false);

  // Ініціалізація при монтуванні - только один раз
  useEffect(() => {
    // НЕ отключаемся при переходе между страницами - используем синглтон ScaleService
    // Соединение с весами должно сохраняться между страницами
    return () => {
      setCurrentWeight(null);
      setIsScaleConnected(false);
    };
  }, []); // Пустой массив зависимостей

  // Отдельный useEffect для инициализации оборудования при загрузке config
  useEffect(() => {
    const initEquipment = async () => {
      try {
        // Ждем загрузки конфигурации и проверяем, что еще не инициализированы
        if (!config || isInitialized) {
          return;
        }

        setIsInitialized(true);

        // Застосовуємо конфігурацію до сервісів
        if (config.scale) {
          scaleService.current.updateConfig(config.scale);
        }
        if (config.scanner) {
          scannerService.current.updateConfig(config.scanner);
        }

        // Перевіряємо початковий статус
        updateStatus({
          isConnected: false,
          lastActivity: new Date(),
          error: null
        });

        // Автоподключение весов, если включено в настройках
        if (config.scale?.autoConnect && !isScaleConnected) {
            try {
              LoggingService.equipmentLog('🔧 [useEquipment]: Автоподключение весов в локальном режиме...');
              const scaleConnected = await scaleService.current.connect(true); // Только автоматический режим
              if (scaleConnected) {
                LoggingService.equipmentLog('✅ [useEquipment]: Весы успешно подключены');
                setIsScaleConnected(true);
                // Сбрасываем счетчик попыток переподключения при успешном подключении
                reconnectAttemptsRef.current = 0;
              } else {
                LoggingService.equipmentLog('⚠️ [useEquipment]: Автоподключение не удалось, порт не найден или не выбран ранее');
              }
            } catch (error) {
              LoggingService.equipmentLog('⚠️ [useEquipment]: Ошибка автоподключения весов:', error);
            }
          }

        // Автоподключение сканера, если включено
        if (config.scanner?.autoConnect && !isScannerConnected) {
            try {
              // LoggingService.equipmentLog('🔧 [useEquipment]: Автоподключение сканера...');
              const scannerConnected = await connectScanner();
              if (scannerConnected) {
                LoggingService.equipmentLog('✅ [useEquipment]: Сканер успешно подключен');
              } else {
                LoggingService.equipmentLog('⚠️ [useEquipment]: Не удалось подключить сканер');
              }
            } catch (error) {
              LoggingService.equipmentLog('⚠️ [useEquipment]: Ошибка автоподключения сканера:', error);
              // Не показываем ошибку, так как это автоматическая попытка
            }
        }
      } catch (error) {
        console.error('Error initializing equipment:', error);
      }
    };

    initEquipment();
  }, [config, isInitialized, connectScale, connectScanner]); // Зависит от config и isInitialized

  // Створюємо стан - ГЛУБОКОЕ КЛОНИРОВАНИЕ для React
  const state: EquipmentState = useMemo(() => ({
    status: { ...status }, // Клонируем status объект
    currentWeight: currentWeight ? { ...currentWeight } : null, // Клонируем currentWeight
    lastBarcode: lastBarcode ? { ...lastBarcode } : null, // Клонируем lastBarcode
    isConnected: status.isConnected,
    isScaleConnected,
    isScannerConnected,
    config: config ? { ...config } : null, // Клонируем config объект
    isLoading,
    lastRawScaleData: typeof lastRawScaleData === 'string' ? lastRawScaleData : Array.from(lastRawScaleData).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
  }), [status, currentWeight, lastBarcode, config, isLoading, isScaleConnected, isScannerConnected, lastRawScaleData]);



  // Принудительное обновление конфигурации
  const refreshConfig = useCallback(async () => {
    // Інвалідуємо кеш перед завантаженням
    configCacheRef.current = null;
    await loadConfig();
  }, [loadConfig]);




  // Створюємо дії с мемоизацией для предотвращения пересоздания
  const actions: EquipmentActions = useMemo(() => ({
    connectScale,
    disconnectScale,
    connectScanner,
    disconnectScanner,
    resetScanner,
    getWeight,

    updateConfig,
    loadConfig,
    saveConfig,
    resetConfig,
    refreshConfig
  }), [
    connectScale,
    disconnectScale,
    connectScanner,
    disconnectScanner,
    resetScanner,
    getWeight,
    checkScaleHealth,
    attemptReconnect,
    updateConfig,
    loadConfig,
    saveConfig,
    resetConfig,
    refreshConfig
  ]);

  return [state, actions];
};
