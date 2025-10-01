export const EQUIPMENT_DEFAULTS = {
  scale: {
    baudRate: 4800,        // ВТА-60 стандарт
    dataBits: 8,
    stopBits: 1,
    parity: 'even' as const,  // ВТА-60 стандарт
    autoConnect: false,
    activePollingInterval: 1000,  // Активний опрос (мс)
    reservePollingInterval: 5000,  // Резервний опрос (мс)
    activePollingDuration: 30000,  // Тривалість активного polling (мс)
    maxPollingErrors: 5,  // Максимальна кількість помилок перед зупинкою
    weightCacheDuration: 500,  // Час кешування даних ваг (мс)
    amplitudeSpikeThresholdKg: 5, // Порог сплеску ваги (кг)
    stableSound: 'default', // Звук стабільної ваги
    unstableSound: 'default', // Звук нестабільної ваги
    errorSound: 'default', // Звук помилки
    weightThresholdForActive: 0.010, // Поріг ваги для переключення на активний polling (кг)
    connectionStrategy: 'reconnectOnError' as const, // Режим роботи з портом: 'legacy', 'reconnectOnError', 'persistentStream'
  },
  orderSoundSettings: {
    pending: 'default',
    success: 'default',
    done: 'default',
    error: 'default',
  },
  scanner: {
    autoConnect: true,
    timeout: 5000
  },
  printer: {
    enabled: false,
    name: ''
  }
} as const;

export type EquipmentDefaults = typeof EQUIPMENT_DEFAULTS;