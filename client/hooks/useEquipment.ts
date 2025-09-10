import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import EquipmentService, {
  EquipmentStatus,
  ScaleData,
  BarcodeData,
  EquipmentConfig
} from '../services/EquipmentService';
import ScaleService, { VTAScaleData } from '../services/ScaleService';
import BarcodeScannerService, { ScannerEvent } from '../services/BarcodeScannerService'; 


export interface EquipmentState {
  status: EquipmentStatus;
  currentWeight: VTAScaleData | null;
  lastBarcode: BarcodeData | null;
  isConnected: boolean;
  isScaleConnected: boolean;
  isScannerConnected: boolean;
  isSimulationMode: boolean;
  config: EquipmentConfig | null;
  isLoading: boolean;
  lastRawScaleData: string | Uint8Array;
  // Новые поля для отслеживания состояния polling
  isActivePolling: boolean;
  isReservePolling: boolean;
}

export interface EquipmentActions {
  connectScale: () => Promise<boolean>;
  disconnectScale: () => Promise<void>;
  connectScanner: () => Promise<boolean>;
  disconnectScanner: () => Promise<void>;
  setConnectionType: (connectionType: 'local' | 'simulation') => void;
  getWeight: () => Promise<VTAScaleData | null>;
  resetScanner: () => void;

  // Новые методы для активного polling
  startActivePolling: () => void;
  stopActivePolling: () => void;
  startReservePolling: () => void;
  stopReservePolling: () => void;

  updateConfig: (config: Partial<EquipmentConfig>) => void;
  loadConfig: () => Promise<void>;
  saveConfig: (config: EquipmentConfig) => Promise<void>;
  resetConfig: () => Promise<void>;
  refreshConfig: () => Promise<void>;
}

export const useEquipment = (): [EquipmentState, EquipmentActions] => {

  const [status, setStatus] = useState<EquipmentStatus>({
    isConnected: false,
    isSimulationMode: true,
    lastActivity: null,
    error: null
  });

  const [currentWeight, setCurrentWeight] = useState<VTAScaleData | null>(null);
  const [lastBarcode, setLastBarcode] = useState<BarcodeData | null>(null);
  const [config, setConfig] = useState<EquipmentConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRawScaleData, setLastRawScaleData] = useState<string | Uint8Array>('');

  // Отдельные состояния подключения
  const [isScaleConnected, setIsScaleConnected] = useState(false);
  const [isScannerConnected, setIsScannerConnected] = useState(false);

  // Для фильтрации дубликатов сканов
  const lastProcessedCodeRef = useRef<string>('');
  const lastProcessedTimeRef = useRef<number>(0);
  
  const equipmentService = useRef(EquipmentService.getInstance());
  const scaleService = useRef(new ScaleService());
  const scannerService = useRef(BarcodeScannerService.getInstance());

  // Состояние для активного polling
  const [isActivePolling, setIsActivePolling] = useState(false);
  const [isReservePolling, setIsReservePolling] = useState(false);
  const activePollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reservePollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Кэш для данных весов
  const weightCacheRef = useRef<{ data: VTAScaleData; timestamp: number } | null>(null);
  const WEIGHT_CACHE_DURATION = 500; // 500ms кэш для активного polling

  // Кеш для настроек оборудования (10 минут)
  const configCacheRef = useRef<{ data: EquipmentConfig | null; timestamp: number } | null>(null);
  const CONFIG_CACHE_DURATION = 15 * 60 * 1000; // 15 минут


  // Загрузка конфигурации из БД
  const loadConfig = useCallback(async () => {
    try {
      setIsLoading(true);

      // Проверяем кеш конфигурации
      const now = Date.now();
      if (configCacheRef.current && (now - configCacheRef.current.timestamp) < CONFIG_CACHE_DURATION) {
        if (process.env.NODE_ENV === 'development') {
          console.log('🔧 Using cached equipment config');
        }
        setConfig({ ...configCacheRef.current.data });
        updateStatus({
          isSimulationMode: configCacheRef.current.data?.connectionType === 'simulation',
          isConnected: configCacheRef.current.data?.connectionType === 'simulation'
        });
        setIsLoading(false);
        return;
      }

      const response = await fetch('/api/settings/equipment', {
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Сохраняем в кеш
          configCacheRef.current = {
            data: result.data,
            timestamp: now
          };

          setConfig({ ...result.data }); // Создаем новый объект
          // Обновляем статус симуляции
          updateStatus({
            isSimulationMode: result.data.connectionType === 'simulation',
            isConnected: result.data.connectionType === 'simulation'
          });
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error loading equipment config:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Сохранение конфигурации в БД
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
          // Обновляем кеш
          configCacheRef.current = {
            data: newConfig,
            timestamp: Date.now()
          };

          setConfig({ ...newConfig }); // Создаем новый объект
          // Обновляем статус симуляции
          updateStatus({
            isSimulationMode: newConfig.connectionType === 'simulation',
            isConnected: newConfig.connectionType === 'simulation'
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

  // Сброс конфигурации к значениям по умолчанию
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
          setConfig({ ...result.data }); // Создаем новый объект
          // Обновляем статус симуляции
          updateStatus({
            isSimulationMode: result.data.connectionType === 'simulation',
            isConnected: result.data.connectionType === 'simulation'
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

  // Загружаем конфигурацию при инициализации
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Оновлення статусу
  const updateStatus = useCallback((updates: Partial<EquipmentStatus>) => {
    setStatus(prev => ({ ...prev, ...updates }));
  }, []);

  // Підключення до ваг
  const connectScale = useCallback(async (): Promise<boolean> => {
    try {
      // Используем локальное состояние config
      if (!config) {
        console.log('⚠️ useEquipment: Конфигурация не загружена, пропускаем подключение');
        return false;
      }

      if (config.connectionType === 'simulation') {
        console.log('🔧 useEquipment: Режим симуляции - подключаем виртуальные весы');
        updateStatus({
          isConnected: true,
          lastActivity: new Date(),
          error: null
        });
        setIsScaleConnected(true);
        return true;
      }



      // Локальне підключення
      const result = await scaleService.current.connect();
      if (result) {
        // Встановлюємо callback для отримання даних з ваг
        scaleService.current.onWeightData((weightData: VTAScaleData) => {
          console.log('🔧 useEquipment: Weight data received from scale:', weightData);
          setCurrentWeight(weightData);
          console.log('🔧 useEquipment: currentWeight updated');
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
          console.log('🔧 useEquipment: Raw scale data received:', hexString);
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

  // Відключення від ваг
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
      
      if (config.connectionType === 'simulation') {
        updateStatus({
          isConnected: true,
          lastActivity: new Date(),
          error: null
        });
        setIsScannerConnected(true);
        return true;
      }



      // Локальне підключення
      const result = await scannerService.current.connect();
      if (result) {
        // Встановлюємо callback для отримання даних з сканера
        scannerService.current.addEventListener((event: ScannerEvent) => {
          if (event.type === 'data' && event.data) {
            const currentTime = Date.now();
            const code = event.data.code;

            // Фильтруем дубликаты: если тот же код в течение последних 2 секунд
            if (code === lastProcessedCodeRef.current &&
                currentTime - lastProcessedTimeRef.current < 2000) {
              if (process.env.NODE_ENV === 'development') {
                console.log('🔄 [useEquipment] Duplicate barcode ignored:', code);
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

  // Встановлення режиму підключення
  const setConnectionType = useCallback((connectionType: 'local' | 'simulation') => {

    // Всегда обновляем статус, независимо от config
    updateStatus({
      isSimulationMode: connectionType === 'simulation',
      isConnected: connectionType === 'simulation',
      lastActivity: new Date()
    });

    // Обновляем config если он существует
    if (config) {
      const newConfig = { ...config, connectionType };
      setConfig({ ...newConfig }); // Создаем новый объект
    } else {
      // Если config еще не загружен, создаем временный config с connectionType
      const tempConfig = {
        connectionType,
        scale: null,
        scanner: null,
        serialTerminal: {
          autoConnect: false,
          baudRate: 4800,
          dataBits: 8,
          parity: 'even' as const,
          stopBits: 1,
          bufferSize: 1024,
          flowControl: 'none' as const
        },
        simulation: null
      };
      setConfig({ ...tempConfig } as EquipmentConfig); // Создаем новый объект
    }
  }, [updateStatus, config]);

  // Отримання ваги с улучшенным кэшированием
  const getWeight = useCallback(async (useCache: boolean = true): Promise<VTAScaleData | null> => {
    try {
      // Используем локальное состояние config вместо equipmentService
      if (config?.connectionType === 'simulation') {
        console.log('🔧 useEquipment: Режим симуляции - генерируем вес');
        const weightData = await equipmentService.current.getWeight();
        setCurrentWeight(weightData);
        // Обновляем кэш
        weightCacheRef.current = {
          data: weightData,
          timestamp: Date.now()
        };
        return weightData;
      }

      // Проверяем кэш если useCache = true
      if (useCache && weightCacheRef.current) {
        const age = Date.now() - weightCacheRef.current.timestamp;
        if (age < WEIGHT_CACHE_DURATION) {
          console.log('🔧 useEquipment: Возвращаем кэшированный вес:', weightCacheRef.current.data);
          return weightCacheRef.current.data;
        }
      }

      console.log('🔧 useEquipment: Запрашиваем свежий вес от реальных весов');
      const weightData = await scaleService.current.getCurrentWeight();
      if (weightData) {
        console.log('✅ useEquipment: Вес получен:', weightData);
        setCurrentWeight(weightData);
        // Обновляем кэш
        weightCacheRef.current = {
          data: weightData,
          timestamp: Date.now()
        };
        return weightData;
      } else {
        // Если не удалось получить свежий вес, но есть кэш - возвращаем его
        if (weightCacheRef.current) {
          console.log('⚠️ useEquipment: Возвращаем кэшированный вес из-за ошибки:', weightCacheRef.current.data);
          return weightCacheRef.current.data;
        }
        console.log('⚠️ useEquipment: Не удалось получить вес от весов');
        return null;
      }
    } catch (error) {
      console.log('❌ useEquipment: Помилка отримання ваги:', error);
      // В случае ошибки возвращаем кэшированный вес
      if (weightCacheRef.current) {
        console.log('⚠️ useEquipment: Возвращаем кэшированный вес из-за ошибки:', weightCacheRef.current.data);
        return weightCacheRef.current.data;
      }
      return null;
    }
  }, [config]);


  // Оновлення конфігурації
  const updateConfig = useCallback((newConfig: Partial<EquipmentConfig>) => {
    if (config) {
      const updatedConfig = { ...config, ...newConfig };
      setConfig({ ...updatedConfig }); // Создаем новый объект

      // ОБЯЗАТЕЛЬНО обновляем isSimulationMode если изменился connectionType
      if (newConfig.connectionType !== undefined) {
        updateStatus({
          isSimulationMode: newConfig.connectionType === 'simulation',
          isConnected: newConfig.connectionType === 'simulation',
          lastActivity: new Date()
        });
      } else {
        updateStatus({ lastActivity: new Date() });
      }

      // Сервисы...
      if (newConfig.scale) {
        scaleService.current.updateConfig(newConfig.scale);
      }
      if (newConfig.scanner) {
        scannerService.current.updateConfig(newConfig.scanner);
      }
    } else {
      console.log('🔧 useEquipment: Config not loaded yet, cannot update');
    }
  }, [updateStatus, config]);

  // Флаг для отслеживания инициализации
  const [isInitialized, setIsInitialized] = useState(false);

  // Ініціалізація при монтуванні - только один раз
  useEffect(() => {
    // Очищення при розмонтуванні
    return () => {
      disconnectScale();
      disconnectScanner();
    };
  }, []); // Пустой массив зависимостей - запускается только при монтировании

  // Отдельный useEffect для инициализации оборудования при загрузке config
  useEffect(() => {
    const initEquipment = async () => {
      try {
        // Ждем загрузки конфигурации и проверяем, что еще не инициализированы
        if (!config || isInitialized) {
          return;
        }

        setIsInitialized(true);

        // Перевіряємо початковий статус
        updateStatus({
          isSimulationMode: config.connectionType === 'simulation',
          isConnected: config.connectionType === 'simulation',
          lastActivity: new Date(),
          error: null
        });

        // Автоматично підключаємося в режимі симуляції
        if (config.connectionType === 'simulation') {
          await connectScale();
          await connectScanner();
        } else {
          // Автоподключение весов при локальном режиме - ВСЕГДА!
          if (!isScaleConnected) {
            try {
              console.log('🔧 useEquipment: Автоподключение весов в локальном режиме...');
              // Сначала пытаемся подключиться автоматически к сохраненному порту
              let scaleConnected = await scaleService.current.connect(true);
              if (!scaleConnected) {
                console.log('⚠️ useEquipment: Автоподключение не удалось, пробуем ручной выбор...');
                // Если автоматическое подключение не удалось, пробуем ручной выбор
                scaleConnected = await scaleService.current.connect(false);
              }

              if (scaleConnected) {
                console.log('✅ useEquipment: Ваги успішно підключені');
              } else {
                console.log('❌ useEquipment: Не вдалося підключити ваги');
              }
            } catch (error) {
              console.log('⚠️ useEquipment: Помилка автопідключення ваг:', error);
              // Не показываем ошибку, так как это автоматическая попытка
            }
          }

          // Автоподключение сканера при локальном режиме, если включено
          if (config.scanner?.autoConnect && !isScannerConnected) {
            try {
              console.log('🔧 useEquipment: Автоподключение сканера...');
              const scannerConnected = await connectScanner();
              if (scannerConnected) {
                console.log('✅ useEquipment: Сканер успішно підключений');
              } else {
                console.log('❌ useEquipment: Не вдалося підключити сканер');
              }
            } catch (error) {
              console.log('⚠️ useEquipment: Помилка автопідключення сканера:', error);
              // Не показываем ошибку, так как это автоматическая попытка
            }
          }
        }
      } catch (error) {
        console.error('Error initializing equipment:', error);
      }
    };

    initEquipment();
  }, [config, isInitialized]); // Зависит от config и isInitialized

  // useEffect для обработки изменений настройки автоподключения весов
  useEffect(() => {
    const handleAutoConnectChange = async () => {
      if (!config || config.connectionType === 'simulation') {
        return;
      }

      const shouldAutoConnect = config.scale?.autoConnect;

      if (shouldAutoConnect && !isScaleConnected) {
        // Включаем автоподключение - пытаемся подключить весы
        try {
          await connectScale();
        } catch (error) {
          console.log('Автоподключение весов не удалось:', error);
        }
      } else if (!shouldAutoConnect && isScaleConnected) {
        // Выключаем автоподключение - отключаем весы
        try {
          await disconnectScale();
        } catch (error) {
          console.log('Ошибка отключения весов:', error);
        }
      }
    };

    handleAutoConnectChange();
  }, [config?.scale?.autoConnect, config?.connectionType, isScaleConnected]); // Зависит от настройки автоподключения и статуса подключения

  // Мониторинг соединения с весами
  useEffect(() => {
    if (!config || config.connectionType === 'simulation') {
      return;
    }

    const monitorConnection = async () => {
      try {
        // Проверяем подключение весов каждые 30 секунд
        if (!isScaleConnected) {
          console.log('🔄 useEquipment: Проверка подключения весов...');
          const scaleConnected = await connectScale();
          if (scaleConnected) {
            console.log('✅ useEquipment: Ваги переподключені');
          }
        }

        // Проверяем подключение сканера каждые 30 секунд
        if (config.scanner?.autoConnect && !isScannerConnected) {
          console.log('🔄 useEquipment: Проверка подключения сканера...');
          const scannerConnected = await connectScanner();
          if (scannerConnected) {
            console.log('✅ useEquipment: Сканер переподключений');
          }
        }
      } catch (error) {
        console.log('⚠️ useEquipment: Ошибка при проверке подключения:', error);
      }
    };

    // Запускаем проверку каждые 30 секунд
    const intervalId = setInterval(monitorConnection, 30000);

    // Очистка интервала при размонтировании
    return () => clearInterval(intervalId);
  }, [config, isScaleConnected, isScannerConnected, connectScale, connectScanner]);

  // Створюємо стан - ГЛУБОКОЕ КЛОНИРОВАНИЕ для React
  const state: EquipmentState = useMemo(() => ({
    status: { ...status }, // Клонируем status объект
    currentWeight: currentWeight ? { ...currentWeight } : null, // Клонируем currentWeight
    lastBarcode: lastBarcode ? { ...lastBarcode } : null, // Клонируем lastBarcode
    isConnected: status.isConnected,
    isScaleConnected,
    isScannerConnected,
    isSimulationMode: status.isSimulationMode,
    config: config ? { ...config } : null, // Клонируем config объект
    isLoading,
    lastRawScaleData: typeof lastRawScaleData === 'string' ? lastRawScaleData : Array.from(lastRawScaleData).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '),
    // Добавляем новые поля состояния polling
    isActivePolling,
    isReservePolling
  }), [status, currentWeight, lastBarcode, config, isLoading, isScaleConnected, isScannerConnected, lastRawScaleData, isActivePolling, isReservePolling]);



  // Принудительное обновление конфигурации
  const refreshConfig = useCallback(async () => {
    await loadConfig();
  }, [loadConfig]);

  // Активный polling для pending статусов (500ms)
  const startActivePolling = useCallback(() => {
    if (isActivePolling || !config || config.connectionType === 'simulation') {
      return;
    }

    console.log('🔄 useEquipment: Запуск активного polling (500ms)');
    setIsActivePolling(true);

    activePollingIntervalRef.current = setInterval(async () => {
      try {
        // Получаем свежий вес без кэша для активного polling
        const freshWeight = await getWeight(false);
        
        if (freshWeight && process.env.NODE_ENV === 'development') {
          console.log('⚖️ useEquipment: Active polling weight:', {
            weight: freshWeight.weight,
            isStable: freshWeight.isStable,
            timestamp: freshWeight.timestamp
          });
        }
      } catch (error) {
        console.log('⚠️ useEquipment: Ошибка активного polling:', error);
      }
    }, 500);
  }, [isActivePolling, config, getWeight]);

  // Остановка активного polling
  const stopActivePolling = useCallback(() => {
    if (!isActivePolling) {
      return;
    }

    console.log('⏹️ useEquipment: Остановка активного polling');
    setIsActivePolling(false);

    if (activePollingIntervalRef.current) {
      clearInterval(activePollingIntervalRef.current);
      activePollingIntervalRef.current = null;
    }
  }, [isActivePolling]);

  // Резервный polling каждые 5 секунд
  const startReservePolling = useCallback(() => {
    if (isReservePolling || !config) {
      return;
    }

    console.log('🔄 useEquipment: Запуск резервного polling (5s)');
    setIsReservePolling(true);

    reservePollingIntervalRef.current = setInterval(async () => {
      try {
        // Резервный polling только если не идет активный
        if (!isActivePolling) {
          const reserveWeight = await getWeight(false);
          
          if (reserveWeight && process.env.NODE_ENV === 'development') {
            console.log('📊 useEquipment: Reserve polling weight:', {
              weight: reserveWeight.weight,
              timestamp: reserveWeight.timestamp
            });
          }
        }
      } catch (error) {
        console.log('⚠️ useEquipment: Ошибка резервного polling:', error);
      }
    }, 5000);
  }, [isReservePolling, config, getWeight, isActivePolling]);

  // Остановка резервного polling
  const stopReservePolling = useCallback(() => {
    if (!isReservePolling) {
      return;
    }

    console.log('⏹️ useEquipment: Остановка резервного polling');
    setIsReservePolling(false);

    if (reservePollingIntervalRef.current) {
      clearInterval(reservePollingIntervalRef.current);
      reservePollingIntervalRef.current = null;
    }
  }, [isReservePolling]);

  // Очистка интервалов при размонтировании
  useEffect(() => {
    return () => {
      if (activePollingIntervalRef.current) {
        clearInterval(activePollingIntervalRef.current);
      }
      if (reservePollingIntervalRef.current) {
        clearInterval(reservePollingIntervalRef.current);
      }
    };
  }, []);

  // Створюємо дії
  const actions: EquipmentActions = {
    connectScale,
    disconnectScale,
    connectScanner,
    disconnectScanner,
    resetScanner,
    setConnectionType,
    getWeight,

    // Новые методы для активного polling
    startActivePolling,
    stopActivePolling,
    startReservePolling,
    stopReservePolling,

    updateConfig,
    loadConfig,
    saveConfig,
    resetConfig,
    refreshConfig
  };

  return [state, actions];
};
