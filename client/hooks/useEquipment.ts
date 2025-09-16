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
    isSimulationMode: false,
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
  const scaleService = useRef(ScaleService.getInstance());
  const scannerService = useRef(BarcodeScannerService.getInstance());

  // Состояние для активного polling
  const [isActivePolling, setIsActivePolling] = useState(false);
  const [isReservePolling, setIsReservePolling] = useState(false);
  const activePollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reservePollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activePollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isReservePollingRef = useRef<boolean>(false);
  const isActivePollingRef = useRef(false); // Ref для отслеживания состояния в интервалах
  const activePollingErrorCountRef = useRef(0); // Счетчик ошибок активного polling
  const isPollingRef = useRef(false); // Ref for preventing concurrent polling requests
  const [significantWeightDetected, setSignificantWeightDetected] = useState(false);

  // Кэш для данных весов
  const weightCacheRef = useRef<{ data: VTAScaleData; timestamp: number } | null>(null);
  
  // Счетчик попыток переподключения при ошибках
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 3;
  
  // Счетчик таймаутов подряд (для умной обработки)
  const timeoutCountRef = useRef(0);
  const maxTimeoutsBeforeReconnect = 3;

  // Кеш для настроек оборудования (15 минут)
  const configCacheRef = useRef<{ data: EquipmentConfig | null; timestamp: number } | null>(null);
  const CONFIG_CACHE_DURATION = 15 * 60 * 1000;


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
  const connectScale = useCallback(async (manual: boolean = false): Promise<boolean> => {
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



      // Локальне підключення: auto = true (ищем порт), manual = false (запрашиваем порт)
      const result = await scaleService.current.connect(!manual);
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
        simulation: null
      };
      setConfig({ ...tempConfig } as EquipmentConfig); // Создаем новый объект
    }
  }, [updateStatus, config]);

  // Попытка переподключения при ошибках
  const attemptReconnect = useCallback(async (): Promise<boolean> => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.log(`⚠️ useEquipment: Достигнуто максимальное количество попыток переподключения (${maxReconnectAttempts})`);
      return false;
    }

    reconnectAttemptsRef.current++;
    console.log(`🔄 useEquipment: Попытка переподключения ${reconnectAttemptsRef.current}/${maxReconnectAttempts}`);

    try {
      // Сначала отключаемся
      await disconnectScale();
      
      // Экспоненциальная задержка: 1s, 2s, 4s
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 4000);
      console.log(`⏳ useEquipment: Пауза ${delay}ms перед переподключением...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Пытаемся переподключиться
      const reconnected = await connectScale();
      
      if (reconnected) {
        console.log('✅ useEquipment: Успешно переподключились к весам');
        reconnectAttemptsRef.current = 0; // Сбрасываем счетчик при успехе
        return true;
      } else {
        console.log('❌ useEquipment: Не удалось переподключиться к весам');
        return false;
      }
    } catch (error) {
      console.error('❌ useEquipment: Ошибка при переподключении:', error);
      return false;
    }
  }, [connectScale, disconnectScale]);

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
        const cacheDuration = config?.scale?.weightCacheDuration || 2000; // Увеличиваем до 2 секунд
        if (age < cacheDuration) {
          console.log('🔧 useEquipment: Возвращаем кэшированный вес:', weightCacheRef.current.data);
          return weightCacheRef.current.data;
        }
      }

      console.log('🔧 useEquipment: Запрашиваем свежий вес от реальных весов');
      const weightData = await scaleService.current.getCurrentWeight();
      if (weightData) {
        console.log('✅ useEquipment: Вес получен:', weightData);
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
        console.log('⚠️ useEquipment: Не удалось получить свежий вес, пытаемся переподключиться...');
        
        const reconnected = await attemptReconnect();
        if (reconnected) {
          // После переподключения пытаемся получить вес еще раз
          console.log('🔄 useEquipment: Переподключились, повторная попытка получения веса...');
          const retryWeightData = await scaleService.current.getCurrentWeight();
          if (retryWeightData) {
            console.log('✅ useEquipment: Вес получен после переподключения:', retryWeightData);
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
          console.log('⚠️ useEquipment: Возвращаем кэшированный вес после неудачного переподключения:', weightCacheRef.current.data);
          return weightCacheRef.current.data;
        }
        console.log('⚠️ useEquipment: Не удалось получить вес от весов');
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
      
      console.log('❌ useEquipment: Детальная ошибка получения веса:', errorDetails);
      
      // Анализ типа ошибки и умная обработка
      let shouldReconnect = false;
      
      if (error instanceof Error) {
        if (error.message.includes('device has been lost')) {
          console.log('🔌 useEquipment: Устройство отключено (device lost)');
          shouldReconnect = true;
        } else if (error.message.includes('closed stream')) {
          console.log('🔌 useEquipment: Поток закрыт (stream closed)');
          shouldReconnect = true;
        } else if (error.message.includes('timeout') || error.message.includes('тайм-аут')) {
          console.log('⏱️ useEquipment: Таймаут при получении данных');
          timeoutCountRef.current++;
          
          // Переподключаемся только после нескольких таймаутов подряд
          if (timeoutCountRef.current >= maxTimeoutsBeforeReconnect) {
            console.log(`⏱️ useEquipment: ${timeoutCountRef.current} таймаутов подряд, пытаемся переподключиться...`);
            shouldReconnect = true;
            timeoutCountRef.current = 0; // Сбрасываем счетчик
          } else {
            console.log(`⏱️ useEquipment: Таймаут ${timeoutCountRef.current}/${maxTimeoutsBeforeReconnect}, используем кэш`);
            shouldReconnect = false;
          }
        } else if (error.message.includes('locked')) {
          console.log('🔒 useEquipment: Поток заблокирован (stream locked)');
          shouldReconnect = true;
        } else if (error.message.includes('not connected')) {
          console.log('🔌 useEquipment: Весы не подключены');
          shouldReconnect = true;
        } else {
          console.log('❓ useEquipment: Неизвестная ошибка:', error.message);
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
        console.log('⚠️ useEquipment: Ошибка требует переподключения...');
        reconnected = await attemptReconnect();
      } else {
        console.log('⚠️ useEquipment: Используем кэш без переподключения');
      }
      if (reconnected) {
        // После переподключения пытаемся получить вес еще раз
        console.log('🔄 useEquipment: Переподключились, повторная попытка получения веса...');
        try {
          const retryWeightData = await scaleService.current.getCurrentWeight();
          if (retryWeightData) {
            console.log('✅ useEquipment: Вес получен после переподключения:', retryWeightData);
            setCurrentWeight(retryWeightData);
            weightCacheRef.current = {
              data: retryWeightData,
              timestamp: Date.now()
            };
            return retryWeightData;
          }
        } catch (retryError) {
          console.error('❌ useEquipment: Ошибка при повторной попытке после переподключения:', retryError);
        }
      }
      
      // Если переподключение не помогло, возвращаем кэшированный вес
      if (weightCacheRef.current) {
        console.log('⚠️ useEquipment: Возвращаем кэшированный вес после неудачного переподключения:', weightCacheRef.current.data);
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
      
      console.log('🏥 useEquipment: Проверка здоровья весов:', healthInfo);
      
      // Если соединение есть, но потоки заблокированы - это проблема
      if (isConnected && (healthInfo.readableLocked || healthInfo.writableLocked)) {
        console.warn('⚠️ useEquipment: Обнаружены заблокированные потоки весов');
      }
      
      return healthInfo;
    } catch (error) {
      console.error('❌ useEquipment: Ошибка проверки здоровья весов:', error);
      return null;
    }
  }, [config?.scale]);

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
    // НЕ отключаемся при переходе между страницами - используем синглтон ScaleService
    // Соединение с весами должно сохраняться между страницами
    return () => {
      // Останавливаем polling, но НЕ отключаем весы - соединение должно сохраняться
      // Очищаем интервалы напрямую, без зависимости от stopScalePolling
      if (activePollingIntervalRef.current) {
        clearInterval(activePollingIntervalRef.current);
        activePollingIntervalRef.current = null;
      }
      if (reservePollingIntervalRef.current) {
        clearInterval(reservePollingIntervalRef.current);
        reservePollingIntervalRef.current = null;
      }
      if (activePollingTimeoutRef.current) {
        clearTimeout(activePollingTimeoutRef.current);
        activePollingTimeoutRef.current = null;
      }
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
          // Автоподключение весов, если включено в настройках
          if (config.scale?.autoConnect && !isScaleConnected) {
            try {
              console.log('🔧 useEquipment: Автоподключение весов в локальном режиме...');
              const scaleConnected = await scaleService.current.connect(true); // Только автоматический режим
              if (scaleConnected) {
                console.log('✅ useEquipment: Весы успешно подключены');
                setIsScaleConnected(true);
                // Сбрасываем счетчик попыток переподключения при успешном подключении
                reconnectAttemptsRef.current = 0;
              } else {
                console.log('⚠️ useEquipment: Автоподключение не удалось, порт не найден или не выбран ранее');
              }
            } catch (error) {
              console.log('⚠️ useEquipment: Ошибка автоподключения весов:', error);
            }
          }

          // Автоподключение сканера при локальном режиме, если включено
          if (config.scanner?.autoConnect && !isScannerConnected) {
            try {
              console.log('🔧 useEquipment: Автоподключение сканера...');
              const scannerConnected = await connectScanner();
              if (scannerConnected) {
                console.log('✅ useEquipment: Сканер успешно подключен');
              } else {
                console.log('⚠️ useEquipment: Не удалось подключить сканер');
              }
            } catch (error) {
              console.log('⚠️ useEquipment: Ошибка автоподключения сканера:', error);
              // Не показываем ошибку, так как это автоматическая попытка
            }
          }
        }
      } catch (error) {
        console.error('Error initializing equipment:', error);
      }
    };

    initEquipment();
  }, [config, isInitialized, connectScale, connectScanner]); // Зависит от config и isInitialized

  // useEffect для обработки изменений настройки автоподключения весов
  // --- УДАЛЕНО ---

  // Мониторинг соединения с весами
  // --- УДАЛЕНО ---

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

  // Функции для управления polling (объявляем заранее)
  const stopReservePolling = useCallback(() => {
    if (!isReservePollingRef.current) {
      return;
    }

    console.log('⏹️ useEquipment: Остановка резервного polling');
    setIsReservePolling(false);
    isReservePollingRef.current = false;
    isPollingRef.current = false;

    if (reservePollingIntervalRef.current) {
      clearInterval(reservePollingIntervalRef.current);
      reservePollingIntervalRef.current = null;
    }
  }, []);

  const startReservePolling = useCallback(() => {
    if (isReservePollingRef.current || !config) {
      return;
    }

    // Проверяем, что мы на странице заказа (OrderView)
    const isOnOrderPage = window.location.pathname.includes('/orders/');
    if (!isOnOrderPage) {
      console.log('⚠️ useEquipment: Резервный polling доступен только на странице заказа');
      return;
    }

    const reservePollingInterval = config?.scale?.reservePollingInterval || 5000;
    console.log(`🔄 useEquipment: Запуск резервного polling (${reservePollingInterval}ms)`);
    setIsReservePolling(true);
    isReservePollingRef.current = true;

    reservePollingIntervalRef.current = setInterval(async () => {
      if (isPollingRef.current) {
        if (process.env.NODE_ENV === 'development') {
          console.log('... Reserve polling request in progress, skipping this interval');
        }
        return;
      }
      try {
        isPollingRef.current = true;
        // Проверяем, что мы все еще на странице заказа
        const isOnOrderPage = window.location.pathname.includes('/orders/');
        if (!isOnOrderPage) {
          console.log('⚠️ useEquipment: Покинули страницу заказа, останавливаем резервный polling');
          stopReservePolling();
          return;
        }

        // Резервный polling только если не идет активный
        if (!isActivePollingRef.current) {
          // Проверяем подключение перед попыткой получения веса
          if (!status.isConnected || !isScaleConnected) {
            // Пытаемся переподключиться только если включен autoConnect
            if (config?.scale?.autoConnect) {
              console.log('🔄 useEquipment: Reserve polling - весы не подключены, пытаемся переподключиться...');
              try {
                // Сначала отключаемся для освобождения потоков
                await scaleService.current.disconnect();
                // Небольшая задержка для полного освобождения ресурсов
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Используем connect(true) для автоматического подключения без запроса
                const connected = await scaleService.current.connect(true);
                if (connected) {
                  console.log('✅ useEquipment: Reserve polling - весы переподключены');
                  setIsScaleConnected(true); // Обновляем состояние напрямую
                } else {
                  console.log('⚠️ useEquipment: Reserve polling - не удалось переподключить весы');
                }
              } catch (connectError) {
                console.log('⚠️ useEquipment: Reserve polling - ошибка переподключения:', connectError);
              }
            }
            return; // В любом случае выходим, т.к. весы не были подключены
          }

          const reserveWeight = await getWeight(false);

          if (reserveWeight && process.env.NODE_ENV === 'development') {
            console.log('📊 useEquipment: Reserve polling weight:', {
              weight: reserveWeight.weight,
              timestamp: reserveWeight.timestamp
            });
          } else if (!reserveWeight) {
            console.log('⚠️ useEquipment: Reserve polling - вес не получен, возможно потеряно подключение');
          }

          // Если обнаружен значительный вес, инициируем переключение на активный polling
          const weightThreshold = config?.scale?.weightThresholdForActive || 0.010; // 10 грамм
          if (reserveWeight && reserveWeight.weight > weightThreshold && !isActivePollingRef.current) {
            console.log(`⚖️ useEquipment: Обнаружен значительный вес (${reserveWeight.weight} кг) в резервном режиме.`);
            setSignificantWeightDetected(true);
          }
        }
      } catch (error) {
        console.log('⚠️ useEquipment: Ошибка резервного polling:', error);
      } finally {
        isPollingRef.current = false;
      }
    }, reservePollingInterval);
  }, [config, getWeight, status.isConnected, isScaleConnected, updateStatus, setSignificantWeightDetected]);

  // Активный polling для pending статусов (500ms) - только при подключенных весах
  const startActivePolling = useCallback(() => {
    if (isActivePollingRef.current || !config || config.connectionType === 'simulation') {
      return;
    }

    // Проверяем, что весы подключены
    if (!status.isConnected || !isScaleConnected) {
      console.log('⚠️ useEquipment: Активный polling недоступен - весы не подключены');
      // Запускаем резервный polling вместо активного
      startReservePolling();
      return;
    }

    // Проверяем, что мы на странице заказа (OrderView)
    const isOnOrderPage = window.location.pathname.includes('/orders/');
    if (!isOnOrderPage) {
      console.log('⚠️ useEquipment: Активный polling доступен только на странице заказа');
      return;
    }

    const activePollingInterval = config?.scale?.activePollingInterval || 1000;
    const timeout = config?.scale?.activePollingDuration || 30000;

    console.log(`🔄 useEquipment: Запуск активного polling (${activePollingInterval}ms) на ${timeout / 1000} секунд`);
    setIsActivePolling(true);
    isActivePollingRef.current = true;
    activePollingErrorCountRef.current = 0; // Сбрасываем счетчик ошибок

    // Останавливаем резервный polling если он был запущен
    if (isReservePolling) {
      stopReservePolling();
    }

    // Очищаем предыдущий таймаут, если он существует
    if (activePollingTimeoutRef.current) {
      clearTimeout(activePollingTimeoutRef.current);
      activePollingTimeoutRef.current = null;
    }

    activePollingIntervalRef.current = setInterval(async () => {
      if (isPollingRef.current) {
        if (process.env.NODE_ENV === 'development') {
          console.log('... Active polling request in progress, skipping this interval');
        }
        return;
      }
      try {
        isPollingRef.current = true;
        // Проверяем, не остановлен ли polling
        if (!isActivePollingRef.current) {
          console.log('⚠️ useEquipment: Активный polling остановлен');
          return;
        }

        // Проверяем, что мы все еще на странице заказа
        const isOnOrderPage = window.location.pathname.includes('/orders/');
        if (!isOnOrderPage) {
          console.log('⚠️ useEquipment: Покинули страницу заказа, останавливаем активный polling');
          stopActivePolling();
          return;
        }

        // Получаем свежий вес без кэша для активного polling
        const freshWeight = await getWeight(false);

        if (freshWeight && process.env.NODE_ENV === 'development') {
          console.log('⚖️ useEquipment: Active polling weight:', {
            weight: freshWeight.weight,
            isStable: freshWeight.isStable,
            timestamp: freshWeight.timestamp
          });
        } else if (!freshWeight) {
          activePollingErrorCountRef.current++;
          const maxErrors = config?.scale?.maxPollingErrors || 5;
          console.log(`⚠️ useEquipment: Активный polling - вес не получен (ошибка ${activePollingErrorCountRef.current}/${maxErrors})`);
          
          // Если слишком много ошибок, останавливаем активный polling
          if (activePollingErrorCountRef.current >= maxErrors) {
            console.log('❌ useEquipment: Слишком много ошибок активного polling, останавливаем и переходим к резервному');
            stopActivePolling();
            startReservePolling();
            return;
          }
          return;
        } else {
          // Сбрасываем счетчик ошибок при успешном получении веса
          activePollingErrorCountRef.current = 0;
        }
      } catch (error) {
        activePollingErrorCountRef.current++;
        const maxErrors = config?.scale?.maxPollingErrors || 5;
        console.log(`⚠️ useEquipment: Ошибка активного polling (ошибка ${activePollingErrorCountRef.current}/${maxErrors}):`, error);
        
        // Для ошибок ReadableStream сразу переходим к резервному polling
        if (error instanceof Error && error.message.includes('ReadableStream')) {
          console.log('❌ useEquipment: Ошибка ReadableStream, принудительно отключаемся и переходим к резервному polling');
          // Принудительно отключаемся для освобождения потоков
          try {
            await scaleService.current.disconnect();
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (disconnectError) {
            console.log('⚠️ useEquipment: Ошибка при принудительном отключении:', disconnectError);
          }
          
          stopActivePolling();
          startReservePolling();
          return;
        }
        
        // Если слишком много ошибок, останавливаем активный polling
        if (activePollingErrorCountRef.current >= maxErrors) {
          console.log('❌ useEquipment: Слишком много ошибок активного polling, останавливаем и переходим к резервному');
          stopActivePolling();
          startReservePolling();
          return;
        }
        return;
      } finally {
        isPollingRef.current = false;
      }
    }, activePollingInterval);

    // Устанавливаем таймаут 30 секунд для активного polling
    activePollingTimeoutRef.current = setTimeout(() => {
      console.log('⏰ useEquipment: Таймаут активного polling (' + String(timeout / 1000) + ' сек), переходим к резервному');
      console.log('⏰ useEquipment: isActivePolling:', isActivePollingRef.current, 'isReservePolling:', isReservePolling);
      stopActivePolling();
      // Всегда запускаем резервный polling после таймаута активного
      startReservePolling();
    }, timeout);

    console.log(`⏰ useEquipment: Установлен таймаут на ${timeout / 1000} секунд, ID:`, activePollingTimeoutRef.current);
  }, [config, getWeight, status.isConnected, isScaleConnected]);

  // Остановка активного polling
  const stopActivePolling = useCallback(() => {
    if (!isActivePollingRef.current) {
      return;
    }

    console.log('⏹️ useEquipment: Остановка активного polling');
    setIsActivePolling(false);
    isActivePollingRef.current = false;
    activePollingErrorCountRef.current = 0;
    isPollingRef.current = false;

    if (activePollingIntervalRef.current) {
      clearInterval(activePollingIntervalRef.current);
      activePollingIntervalRef.current = null;
    }

    if (activePollingTimeoutRef.current) {
      clearTimeout(activePollingTimeoutRef.current);
      activePollingTimeoutRef.current = null;
    }
  }, []);

  // Переключаемся с резервного на активный polling при обнаружении веса
  useEffect(() => {
    if (significantWeightDetected) {
      if (isReservePollingRef.current) {
        console.log('⚖️ useEquipment: Переключаемся с резервного на активный polling из-за обнаружения веса.');
        stopReservePolling();
        startActivePolling();
      }
      setSignificantWeightDetected(false); // Сбрасываем триггер
    }
  }, [significantWeightDetected, startActivePolling, stopReservePolling]);

  // Синхронизируем ref с состоянием isActivePolling
  useEffect(() => {
    isActivePollingRef.current = isActivePolling;
  }, [isActivePolling]);

  // Слушатель изменений URL для остановки polling при переходе между страницами
  useEffect(() => {
    let lastPath = window.location.pathname;
    
    const handleLocationChange = () => {
      const currentPath = window.location.pathname;
      if (currentPath !== lastPath) {
        lastPath = currentPath;
        const isOnOrderPage = currentPath.includes('/orders/');
        if (!isOnOrderPage) {
          console.log('🔄 useEquipment: Переход на другую страницу, останавливаем все polling');
          if (isActivePolling) {
            stopActivePolling();
          }
          if (isReservePolling) {
            stopReservePolling();
          }
        }
      }
    };

    // Слушаем изменения URL (для SPA)
    window.addEventListener('popstate', handleLocationChange);
    
    // Также проверяем при каждом рендере (для программной навигации)
    const interval = setInterval(handleLocationChange, 2000); // Увеличиваем интервал до 2 секунд

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      clearInterval(interval);
    };
  }, [isActivePolling, isReservePolling, stopActivePolling, stopReservePolling]);

  // Очистка интервалов и таймаутов при размонтировании
  useEffect(() => {
    return () => {
      if (activePollingIntervalRef.current) {
        clearInterval(activePollingIntervalRef.current);
      }
      if (reservePollingIntervalRef.current) {
        clearInterval(reservePollingIntervalRef.current);
      }
      if (activePollingTimeoutRef.current) {
        clearTimeout(activePollingTimeoutRef.current);
      }
    };
  }, []);

  // Створюємо дії с мемоизацией для предотвращения пересоздания
  const actions: EquipmentActions = useMemo(() => ({
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
  }), [
    connectScale,
    disconnectScale,
    connectScanner,
    disconnectScanner,
    resetScanner,
    setConnectionType,
    getWeight,
    checkScaleHealth,
    attemptReconnect,
    startActivePolling,
    stopActivePolling,
    startReservePolling,
    stopReservePolling,
    updateConfig,
    loadConfig,
    saveConfig,
    resetConfig,
    refreshConfig
  ]);

  return [state, actions];
};
