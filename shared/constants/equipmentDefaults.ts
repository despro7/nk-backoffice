export const EQUIPMENT_DEFAULTS = {
  connectionType: 'local' as const,
  scale: {
    comPort: 'COM4',
    baudRate: 4800,        // ВТА-60 стандарт
    dataBits: 8,
    stopBits: 1,
    parity: 'even' as const,  // ВТА-60 стандарт
    autoConnect: false,
    activePollingInterval: 1000,  // Активный опрос (мс)
    reservePollingInterval: 5000,  // Резервный опрос (мс)
    activePollingDuration: 30000,  // Продолжительность активного polling (мс)
    maxPollingErrors: 5,  // Максимальное количество ошибок перед остановкой
    weightCacheDuration: 500,  // Время кэширования данных весов (мс)
    weightThresholdForActive: 0.010, // Порог веса для переключения на активный polling (кг)
    connectionStrategy: 'persistentStream' as const // Режим роботи з портом: 'legacy', 'reconnectOnError', 'persistentStream'
  },
  scanner: {
    autoConnect: true,
    timeout: 5000
  },
  simulation: {
    enabled: true,
    weightRange: { min: 0.1, max: 5.0 },
    scanDelay: 800,
    weightDelay: 1200
  }
} as const;

export type EquipmentDefaults = typeof EQUIPMENT_DEFAULTS;
