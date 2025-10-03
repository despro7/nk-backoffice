import { prisma } from '../lib/utils.js';
import { EQUIPMENT_DEFAULTS } from '../../shared/constants/equipmentDefaults.js';

// Локальні типи для SettingsBase (тимчасове рішення до оновлення Prisma)
interface SettingsBase {
  id: number;
  key: string;
  value: string;
  description?: string;
  category?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Тимчасове рішення: використовуємо any для обходу проблем з типизацією Prisma
const settingsBase = prisma.settingsBase as any;

export type OrderSoundEvent = 'pending' | 'success' | 'done' | 'error';

export interface EquipmentSettings {
  scale: {
    baudRate: number;
    dataBits: number;
    stopBits: number;
    parity: string;
    autoConnect: boolean;
    activePollingInterval: number;
    reservePollingInterval: number;
    activePollingDuration: number;
    maxPollingErrors: number;
    weightCacheDuration: number;
    amplitudeSpikeThresholdKg: number;
    stableSound: string;
    unstableSound: string;
    errorSound: string;
    weightThresholdForActive: number;
    connectionStrategy: 'legacy' | 'reconnectOnError' | 'persistentStream';
  };
  orderSoundSettings: Record<OrderSoundEvent, string>;
  scanner: {
    autoConnect: boolean;
    timeout: number;
    scanTimeout?: number;
    minScanSpeed?: number;
    maxScanSpeed?: number;
    minBarcodeLength?: number;
  };
  printer?: {
    enabled: boolean;
    name: string;
    autoPrintOnComplete?: boolean;
    autoPrintDelayMs?: number;
  };
}

export class EquipmentSettingsService {
  private static instance: EquipmentSettingsService;
  private readonly SETTINGS_CATEGORY = 'equipment';

  private constructor() {}

  public static getInstance(): EquipmentSettingsService {
    if (!EquipmentSettingsService.instance) {
      EquipmentSettingsService.instance = new EquipmentSettingsService();
    }
    return EquipmentSettingsService.instance;
  }

  // Отримання налаштувань обладнання
  async getEquipmentSettings(): Promise<EquipmentSettings> {
    try {
      const settings = await settingsBase.findMany({
        where: {
          category: this.SETTINGS_CATEGORY,
          isActive: true
        }
      });

      // Використовуємо єдині налаштування за замовчуванням
      const defaultSettings: EquipmentSettings = EQUIPMENT_DEFAULTS;

      if (settings.length === 0) {
        // Якщо налаштувань немає, створюємо з значеннями за замовчуванням
        console.log('📋 Налаштувань не знайдено, створюємо за замовчуванням...');
        await this.saveEquipmentSettings(defaultSettings);
        return defaultSettings;
      }

      // Парсимо налаштування з БД
      const parsedSettings: Partial<EquipmentSettings> = {};
      for (const setting of settings) {
        try {
          const value = JSON.parse(setting.value);
          const key = setting.key.replace('equipment_', '');
          if (key.startsWith('orderSoundSettings')) {
            // orderSoundSettings.pending, orderSoundSettings.success и т.д.
            const [, event] = key.split('.');
            if (!parsedSettings.orderSoundSettings) {
              parsedSettings.orderSoundSettings = {
                pending: 'default',
                success: 'default',
                done: 'default',
                error: 'default',
              };
            }
            parsedSettings.orderSoundSettings[event] = value;
          } else if (key.includes('.')) {
            // Вкладені налаштування (наприклад, scale.comPort)
            const [section, field] = key.split('.');
            if (!parsedSettings[section]) {
              parsedSettings[section] = {};
            }
            parsedSettings[section][field] = value;
          } else {
            // Прості налаштування
            parsedSettings[key] = value;
          }
        } catch (error) {
          console.error(`Error parsing setting ${setting.key}:`, error);
        }
      }

      // Об'єднуємо з налаштуваннями за замовчуванням
      return this.mergeSettings(defaultSettings, parsedSettings);
    } catch (error) {
      console.error('Error getting equipment settings:', error);
      throw new Error('Failed to get equipment settings');
    }
  }

  // Збереження налаштувань обладнання (оптимізована версія)
  async saveEquipmentSettings(settings: EquipmentSettings): Promise<void> {
    try {
      console.log('💾 Збереження налаштувань обладнання...');

      // Групуємо налаштування по категоріях для паралельного збереження
      const savePromises = [
        this.saveScaleSettings(settings.scale),
        this.saveScannerSettings(settings.scanner),
        this.savePrinterSettings(settings.printer),
        this.saveOrderSoundSettings(settings.orderSoundSettings)
      ];

      // Виконуємо всі операції паралельно
      await Promise.all(savePromises);
      console.log('✅ Налаштування обладнання успішно збережено');
    } catch (error) {
      console.error('❌ Помилка збереження налаштувань обладнання:', error);
      throw new Error('Failed to save equipment settings');
    }
  }

  // Збереження налаштувань звуків для статусів замовлення
  private async saveOrderSoundSettings(orderSoundSettings: Record<string, string>): Promise<void> {
    if (!orderSoundSettings) return;
    const soundSettingsList = Object.entries(orderSoundSettings).map(([event, value]) => ({
      key: `equipment_orderSoundSettings.${event}`,
      value: JSON.stringify(value),
      description: `Звук для статусу замовлення ${event}`
    }));
    await this.batchUpsertSettings(soundSettingsList);
  }


  // Збереження налаштувань ваг
  private async saveScaleSettings(scaleSettings: EquipmentSettings['scale']): Promise<void> {
    if (!scaleSettings) return;

    // Валідація налаштувань перед збереженням
    this.validateScaleSettings(scaleSettings);

    const scaleSettingsList = [
      {
        key: 'equipment_scale.baudRate',
        value: JSON.stringify(scaleSettings.baudRate ?? 4800),
        description: 'Швидкість передачі даних ваг'
      },
      {
        key: 'equipment_scale.dataBits',
        value: JSON.stringify(scaleSettings.dataBits ?? 8),
        description: 'Біти даних ваг'
      },
      {
        key: 'equipment_scale.stopBits',
        value: JSON.stringify(scaleSettings.stopBits ?? 1),
        description: 'Стоп-біти ваг'
      },
      {
        key: 'equipment_scale.parity',
        value: JSON.stringify(scaleSettings.parity ?? 'even'),
        description: 'Парність ваг'
      },
      {
        key: 'equipment_scale.autoConnect',
        value: JSON.stringify(scaleSettings.autoConnect ?? false),
        description: 'Автоматичне підключення ваг'
      },
      {
        key: 'equipment_scale.activePollingInterval',
        value: JSON.stringify(scaleSettings.activePollingInterval ?? 1000),
        description: 'Активне опитування ваг (мс)'
      },
      {
        key: 'equipment_scale.reservePollingInterval',
        value: JSON.stringify(scaleSettings.reservePollingInterval ?? 5000),
        description: 'Резервне опитування ваг (мс)'
      },
      {
        key: 'equipment_scale.activePollingDuration',
        value: JSON.stringify(scaleSettings.activePollingDuration ?? 30000),
        description: 'Тривалість активного опитування ваг (мс)'
      },
      {
        key: 'equipment_scale.maxPollingErrors',
        value: JSON.stringify(scaleSettings.maxPollingErrors ?? 5),
        description: 'Максимальна кількість помилок перед зупинкою опитування'
      },
      {
        key: 'equipment_scale.weightCacheDuration',
        value: JSON.stringify(scaleSettings.weightCacheDuration ?? 500),
        description: 'Час кешування даних ваг (мс)'
      },
      {
        key: 'equipment_scale.amplitudeSpikeThresholdKg',
        value: JSON.stringify(scaleSettings.amplitudeSpikeThresholdKg ?? 5),
        description: 'Поріг сплеску ваги (кг)'
      },
      {
        key: 'equipment_scale.stableSound',
        value: JSON.stringify(scaleSettings.stableSound ?? 'default'),
        description: 'Звук стабільного кадру'
      },
      {
        key: 'equipment_scale.unstableSound',
        value: JSON.stringify(scaleSettings.unstableSound ?? 'default'),
        description: 'Звук нестабільного кадру'
      },
      {
        key: 'equipment_scale.errorSound',
        value: JSON.stringify(scaleSettings.errorSound ?? 'default'),
        description: 'Звук помилки'
      },
      {
        key: 'equipment_scale.weightThresholdForActive',
        value: JSON.stringify(scaleSettings.weightThresholdForActive ?? 0.010),
        description: 'Поріг ваги для переключення на активний polling (кг)'
      },
      {
        key: 'equipment_scale.connectionStrategy',
        value: JSON.stringify(scaleSettings.connectionStrategy ?? 'reconnectOnError'),
        description: 'Стратегія роботи з COM-портом ваг'
      }
    ];

    await this.batchUpsertSettings(scaleSettingsList);
  }

  // Збереження налаштувань сканера
  private async saveScannerSettings(scannerSettings: EquipmentSettings['scanner']): Promise<void> {
    if (!scannerSettings) return;

    const scannerSettingsList = [
      {
        key: 'equipment_scanner.autoConnect',
        value: JSON.stringify(scannerSettings.autoConnect ?? true),
        description: 'Автоматичне підключення сканера'
      },
      {
        key: 'equipment_scanner.timeout',
        value: JSON.stringify(scannerSettings.timeout ?? 5000),
        description: 'Таймаут сканера'
      },
      {
        key: 'equipment_scanner.scanTimeout',
        value: JSON.stringify(scannerSettings.scanTimeout ?? 300),
        description: 'Таймаут сканування баркоду (мс)'
      },
      {
        key: 'equipment_scanner.minScanSpeed',
        value: JSON.stringify(scannerSettings.minScanSpeed ?? 50),
        description: 'Мінімальна швидкість сканування (мс)'
      },
      {
        key: 'equipment_scanner.maxScanSpeed',
        value: JSON.stringify(scannerSettings.maxScanSpeed ?? 200),
        description: 'Максимальна швидкість сканування (мс)'
      },
      {
        key: 'equipment_scanner.minBarcodeLength',
        value: JSON.stringify(scannerSettings.minBarcodeLength ?? 5),
        description: 'Мінімальна довжина баркоду'
      }
    ];

    await this.batchUpsertSettings(scannerSettingsList);
  }


  // Збереження налаштувань принтера
  private async savePrinterSettings(printerSettings: EquipmentSettings['printer']): Promise<void> {
    if (!printerSettings) return;

    const printerSettingsList = [
      {
        key: 'equipment_printer.enabled',
        value: JSON.stringify(printerSettings.enabled ?? false),
        description: 'Прямий друк через QZ Tray увімкнено'
      },
      {
        key: 'equipment_printer.name',
        value: JSON.stringify(printerSettings.name ?? ''),
        description: "Ім'я принтера для прямого друку"
      },
      {
        key: 'equipment_printer.autoPrintOnComplete',
        value: JSON.stringify(printerSettings.autoPrintOnComplete ?? false),
        description: 'Автоматичний друк при завершенні замовлення'
      },
      {
        key: 'equipment_printer.autoPrintDelayMs',
        value: JSON.stringify(printerSettings.autoPrintDelayMs ?? 3000),
        description: 'Затримка перед автоматичним друком (мс)'
      }
    ];

    await this.batchUpsertSettings(printerSettingsList);
  }

  // Batch операція для upsert налаштувань
  private async batchUpsertSettings(settingsList: Array<{
    key: string;
    value: string;
    description: string;
  }>): Promise<void> {
    try {
      // Використовуємо Promise.all для паралельного виконання upsert операцій
      const upsertPromises = settingsList.map(setting => 
        settingsBase.upsert({
          where: { key: setting.key },
          update: {
            value: setting.value,
            category: this.SETTINGS_CATEGORY,
            description: setting.description,
            isActive: true,
            updatedAt: new Date()
          },
          create: {
            key: setting.key,
            value: setting.value,
            category: this.SETTINGS_CATEGORY,
            description: setting.description,
            isActive: true
          }
        })
      );

      await Promise.all(upsertPromises);
    } catch (error) {
      console.error('Error in batch upsert settings:', error);
      throw error;
    }
  }

  // Оновлення конкретного налаштування
  async updateEquipmentSetting(key: string, value: any): Promise<void> {
    try {
      const dbKey = `equipment_${key}`;
      const dbValue = JSON.stringify(value);
      
      await settingsBase.upsert({
        where: { key: dbKey },
        update: {
          value: dbValue,
          updatedAt: new Date()
        },
        create: {
          key: dbKey,
          value: dbValue,
          category: this.SETTINGS_CATEGORY,
          description: `Equipment setting: ${key}`,
          isActive: true
        }
      });
    } catch (error) {
      console.error(`Error updating equipment setting ${key}:`, error);
      throw new Error(`Failed to update equipment setting: ${key}`);
    }
  }

  // Часткове оновлення налаштувань по групам
  async updateScaleSettings(scaleSettings: Partial<EquipmentSettings['scale']>): Promise<void> {
    try {
      console.log('⚖️ Оновлення налаштувань ваг...');
      await this.saveScaleSettings(scaleSettings as EquipmentSettings['scale']);
      console.log('✅ Налаштування ваг оновлено');
    } catch (error) {
      console.error('❌ Помилка оновлення налаштувань ваг:', error);
      throw new Error('Failed to update scale settings');
    }
  }

  async updateScannerSettings(scannerSettings: Partial<EquipmentSettings['scanner']>): Promise<void> {
    try {
      console.log('📷 Оновлення налаштувань сканера...');
      await this.saveScannerSettings(scannerSettings as EquipmentSettings['scanner']);
      console.log('✅ Налаштування сканера оновлено');
    } catch (error) {
      console.error('❌ Помилка оновлення налаштувань сканера:', error);
      throw new Error('Failed to update scanner settings');
    }
  }


  async updatePrinterSettings(printerSettings: Partial<EquipmentSettings['printer']>): Promise<void> {
    try {
      console.log('🖨️ Оновлення налаштувань принтера...');
      await this.savePrinterSettings(printerSettings as EquipmentSettings['printer']);
      console.log('✅ Налаштування принтера оновлено');
    } catch (error) {
      console.error('❌ Помилка оновлення налаштувань принтера:', error);
      throw new Error('Failed to update printer settings');
    }
  }

  // Валідація налаштувань перед збереженням
  private validateScaleSettings(scaleSettings: EquipmentSettings['scale']): void {
    if (!scaleSettings) return;

    const errors: string[] = [];

    if (scaleSettings.baudRate && (scaleSettings.baudRate < 300 || scaleSettings.baudRate > 115200)) {
      errors.push('Швидкість передачі даних повинна бути від 300 до 115200');
    }

    if (scaleSettings.dataBits && (scaleSettings.dataBits < 5 || scaleSettings.dataBits > 8)) {
      errors.push('Біти даних повинні бути від 5 до 8');
    }

    if (scaleSettings.stopBits && (scaleSettings.stopBits < 1 || scaleSettings.stopBits > 2)) {
      errors.push('Стоп-біти повинні бути 1 або 2');
    }

    if (scaleSettings.parity && !['none', 'even', 'odd'].includes(scaleSettings.parity)) {
      errors.push('Парність повинна бути none, even або odd');
    }

    if (scaleSettings.activePollingInterval && scaleSettings.activePollingInterval < 100) {
      errors.push('Активне опитування не може бути менше 100мс');
    }

    if (scaleSettings.reservePollingInterval && scaleSettings.reservePollingInterval < 1000) {
      errors.push('Резервне опитування не може бути менше 1000мс');
    }

    if (errors.length > 0) {
      throw new Error(`Помилки валідації налаштувань ваг: ${errors.join(', ')}`);
    }
  }


  // Скидання налаштувань до значень за замовчуванням
  async resetEquipmentSettings(): Promise<EquipmentSettings> {
    try {
      // Деактивуємо всі поточні налаштування
      await settingsBase.updateMany({
        where: {
          category: this.SETTINGS_CATEGORY,
          isActive: true
        },
        data: {
          isActive: false
        }
      });

      // Повертаємо налаштування за замовчуванням
      const defaultSettings = await this.getEquipmentSettings();
      return defaultSettings;
    } catch (error) {
      console.error('Error resetting equipment settings:', error);
      throw new Error('Failed to reset equipment settings');
    }
  }

  // Отримання історії змін налаштувань
  async getSettingsHistory(limit: number = 50): Promise<any[]> {
    try {
      const history = await settingsBase.findMany({
        where: {
          category: this.SETTINGS_CATEGORY
        },
        orderBy: {
          updatedAt: 'desc'
        },
        take: limit
      });

      return history.map(item => ({
        key: item.key,
        value: item.value,
        description: item.description,
        isActive: item.isActive,
        updatedAt: item.updatedAt
      }));
    } catch (error) {
      console.error('Error getting settings history:', error);
      throw new Error('Failed to get settings history');
    }
  }

  // Отримання статистики налаштувань
  async getSettingsStats(): Promise<{
    totalSettings: number;
    activeSettings: number;
    settingsByCategory: Record<string, number>;
    lastUpdated: Date | null;
  }> {
    try {
      const [totalCount, activeCount, categoryStats, lastUpdated] = await Promise.all([
        settingsBase.count({
          where: { category: this.SETTINGS_CATEGORY }
        }),
        settingsBase.count({
          where: { 
            category: this.SETTINGS_CATEGORY,
            isActive: true 
          }
        }),
        settingsBase.groupBy({
          by: ['key'],
          where: { category: this.SETTINGS_CATEGORY },
          _count: { key: true }
        }),
        settingsBase.findFirst({
          where: { category: this.SETTINGS_CATEGORY },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true }
        })
      ]);

      const settingsByCategory = categoryStats.reduce((acc, item) => {
        const category = item.key.split('_')[1] || 'other';
        acc[category] = (acc[category] || 0) + item._count.key;
        return acc;
      }, {} as Record<string, number>);

      return {
        totalSettings: totalCount,
        activeSettings: activeCount,
        settingsByCategory,
        lastUpdated: lastUpdated?.updatedAt || null
      };
    } catch (error) {
      console.error('Error getting settings stats:', error);
      throw new Error('Failed to get settings stats');
    }
  }

  // Приватні методи для роботи з налаштуваннями
  private flattenSettings(settings: any, prefix: string = ''): Record<string, any> {
    const flattened: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(settings)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        Object.assign(flattened, this.flattenSettings(value, fullKey));
      } else {
        // Переконуємося, що всі значення коректно обробляються
        if (typeof value === 'string') {
          // Для строкових значень зберігаємо як є
          flattened[fullKey] = value;
        } else {
          // Для інших значень зберігаємо як є
          flattened[fullKey] = value;
        }
      }
    }
    
    return flattened;
  }

  private mergeSettings(defaultSettings: EquipmentSettings, userSettings: Partial<EquipmentSettings>): EquipmentSettings {
    const merged = { ...defaultSettings };
    
    for (const [section, sectionSettings] of Object.entries(userSettings)) {
      if (typeof sectionSettings === 'object' && sectionSettings !== null) {
        if (section in merged) {
          merged[section] = { ...merged[section], ...sectionSettings };
        }
      } else {
        merged[section] = sectionSettings;
      }
    }
    
    return merged;
  }
}

export default EquipmentSettingsService;
