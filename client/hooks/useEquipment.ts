import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import EquipmentService, { 
  EquipmentStatus, 
  ScaleData, 
  BarcodeData, 
  EquipmentConfig 
} from '../services/EquipmentService';
import ScaleService from '../services/ScaleService';
import BarcodeScannerService, { ScannerEvent } from '../services/BarcodeScannerService'; 


export interface EquipmentState {
  status: EquipmentStatus;
  currentWeight: ScaleData | null;
  lastBarcode: BarcodeData | null;
  isConnected: boolean;
  isScaleConnected: boolean;
  isScannerConnected: boolean;
  isSimulationMode: boolean;
  config: EquipmentConfig | null;
  isLoading: boolean;
}

export interface EquipmentActions {
  connectScale: () => Promise<boolean>;
  disconnectScale: () => Promise<void>;
  connectScanner: () => Promise<boolean>;
  disconnectScanner: () => Promise<void>;
  setConnectionType: (connectionType: 'local' | 'simulation') => void;
  getWeight: () => Promise<ScaleData>;


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

  const [currentWeight, setCurrentWeight] = useState<ScaleData | null>(null);
  const [lastBarcode, setLastBarcode] = useState<BarcodeData | null>(null);
  const [config, setConfig] = useState<EquipmentConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Отдельные состояния подключения
  const [isScaleConnected, setIsScaleConnected] = useState(false);
  const [isScannerConnected, setIsScannerConnected] = useState(false);
  
  const equipmentService = useRef(EquipmentService.getInstance());
  const scaleService = useRef(new ScaleService());
  const scannerService = useRef(new BarcodeScannerService());

  // Кеш для настроек оборудования (10 минут)
  const configCacheRef = useRef<{ data: EquipmentConfig | null; timestamp: number } | null>(null);
  const CONFIG_CACHE_DURATION = 10 * 60 * 1000; // 10 минут


  // Загрузка конфигурации из БД
  const loadConfig = useCallback(async () => {
    try {
      setIsLoading(true);

      // Проверяем кеш конфигурации
      const now = Date.now();
      if (configCacheRef.current &&
          (now - configCacheRef.current.timestamp) < CONFIG_CACHE_DURATION) {
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
        return false;
      }

      if (config.connectionType === 'simulation') {
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
        scaleService.current.onWeightData((weightData: ScaleData) => {
          setCurrentWeight(weightData);
          updateStatus({
            lastActivity: new Date(),
            error: null
          });
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
          baudRate: 9600,
          dataBits: 8,
          stopBits: 1,
          parity: 'none' as const,
          bufferSize: 1024,
          flowControl: 'none' as const
        },
        simulation: null
      };
      setConfig({ ...tempConfig } as EquipmentConfig); // Создаем новый объект
    }
  }, [updateStatus, config]);

  // Отримання ваги
  const getWeight = useCallback(async (): Promise<ScaleData> => {
    try {
      // Используем локальное состояние config вместо equipmentService
      if (config?.connectionType === 'simulation') {
        const weightData = await equipmentService.current.getWeight();
        setCurrentWeight(weightData);
        return weightData;
      }

      const weightData = await scaleService.current.getCurrentWeight();
      if (weightData) {
        setCurrentWeight(weightData);
        return weightData;
      } else {
        throw new Error('Failed to get weight from scale');
      }
    } catch (error) {
      console.error('Error getting weight:', error);
      throw error;
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
        }
      } catch (error) {
        console.error('Error initializing equipment:', error);
      }
    };

    initEquipment();
  }, [config, isInitialized]); // Зависит от config и isInitialized

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
    isLoading
  }), [status, currentWeight, lastBarcode, config, isLoading, isScaleConnected, isScannerConnected]);



  // Принудительное обновление конфигурации
  const refreshConfig = useCallback(async () => {
    await loadConfig();
  }, [loadConfig]);

  // Створюємо дії
  const actions: EquipmentActions = {
    connectScale,
    disconnectScale,
    connectScanner,
    disconnectScanner,
    setConnectionType,
    getWeight,


    updateConfig,
    loadConfig,
    saveConfig,
    resetConfig,
    refreshConfig
  };

  return [state, actions];
};
