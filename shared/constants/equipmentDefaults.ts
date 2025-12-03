export const EQUIPMENT_DEFAULTS = {
  scale: {
    baudRate: 4800,        // ВТА-60 стандарт
    dataBits: 8,
    stopBits: 1,
    parity: 'even' as const,  // ВТА-60 стандарт
    autoConnect: true,
    activePollingInterval: 250,  // Активний опрос (мс)
    reservePollingInterval: 1000,  // Резервний опрос (мс)
    activePollingDuration: 30000,  // Тривалість активного polling (мс)
    maxPollingErrors: 5,  // Максимальна кількість помилок перед зупинкою
    weightCacheDuration: 500,  // Час кешування даних ваг (мс)
    amplitudeSpikeThresholdKg: 5, // Порог сплеску ваги (кг)
    stableSound: 'default', // Звук стабільної ваги
    unstableSound: 'default', // Звук нестабільної ваги
    errorSound: 'default', // Звук помилки
    weightThresholdForActive: 0.01, // Поріг ваги для переключення на активний polling (кг)
    connectionStrategy: 'reconnectOnError' as const, // Режим роботи з портом: 'legacy', 'reconnectOnError', 'persistentStream'
  },
  orderSoundSettings: {
    pending: 'click',
    success: 'uplift',
    done: 'melody',
    error: 'low',
  },
  scanner: {
    autoConnect: true,
    timeout: 10000,
    scanTimeout: 300,
    minScanSpeed: 5,     // Мінімальна швидкість між символами (мс)
    maxScanSpeed: 100,    // Максимальна швидкість між символами (мс)
    minBarcodeLength: 5   // Мінімальна довжина баркоду
  },
  printer: {
    enabled: true,
    name: 'ZDesigner ZD220-203dpi ZPL',
    autoPrintOnComplete: true,
    autoPrintDelayMs: 3000
  }
} as const;

export type EquipmentDefaults = typeof EQUIPMENT_DEFAULTS;