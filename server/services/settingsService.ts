import { prisma } from '../lib/utils.js';
import { EQUIPMENT_DEFAULTS } from '../../shared/constants/equipmentDefaults.js';

// Локальные типы для SettingsBase (временное решение до обновления Prisma)
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

// Временное решение: используем any для обхода проблем с типизацией Prisma
const settingsBase = prisma.settingsBase as any;

export interface EquipmentSettings {
  connectionType: 'local' | 'simulation';
  scale: {
    comPort: string;
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
    weightThresholdForActive: number;
    connectionStrategy: 'legacy' | 'reconnectOnError' | 'persistentStream';
  };
  scanner: {
    autoConnect: boolean;
    timeout: number;
  };
  simulation: {
    enabled: boolean;
    weightRange: { min: number; max: number };
    scanDelay: number;
    weightDelay: number;
  };
  printer?: {
    enabled: boolean;
    name: string;
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

  // Получение настроек оборудования
  async getEquipmentSettings(): Promise<EquipmentSettings> {
    try {
      const settings = await settingsBase.findMany({
        where: {
          category: this.SETTINGS_CATEGORY,
          isActive: true
        }
      });

      // Используем единые настройки по умолчанию
      const defaultSettings: EquipmentSettings = EQUIPMENT_DEFAULTS;

      if (settings.length === 0) {
        // Если настроек нет, создаем с значениями по умолчанию
        console.log('📋 Налаштувань не знайдено, створюємо за замовчуванням...');
        await this.saveEquipmentSettings(defaultSettings);
        return defaultSettings;
      }

      // Парсим настройки из БД
      const parsedSettings: Partial<EquipmentSettings> = {};
      
      for (const setting of settings) {
        try {
          const value = JSON.parse(setting.value);
          const key = setting.key.replace('equipment_', '');
          
          if (key.includes('.')) {
            // Вложенные настройки (например, scale.comPort)
            const [section, field] = key.split('.');
            if (!parsedSettings[section]) {
              parsedSettings[section] = {};
            }
            parsedSettings[section][field] = value;
          } else {
            // Простые настройки
            parsedSettings[key] = value;
          }
        } catch (error) {
          console.error(`Error parsing setting ${setting.key}:`, error);
        }
      }

      // Объединяем с настройками по умолчанию
      return this.mergeSettings(defaultSettings, parsedSettings);
    } catch (error) {
      console.error('Error getting equipment settings:', error);
      throw new Error('Failed to get equipment settings');
    }
  }

  // Сохранение настроек оборудования
  async saveEquipmentSettings(settings: EquipmentSettings): Promise<void> {
    try {
      // Создаем новые настройки используя upsert для избежания дубликатов
      const settingsToSave = [
        {
          key: 'equipment_connectionType',
          value: JSON.stringify(settings.connectionType ?? 'simulation'),
          description: 'Тип підключення обладнання'
        },
        {
          key: 'equipment_scale.comPort',
          value: JSON.stringify(settings.scale?.comPort ?? 'COM4'),
          description: 'COM-порт ваг'
        },
        {
          key: 'equipment_scale.baudRate',
          value: JSON.stringify(settings.scale?.baudRate ?? 9600),
          description: 'Швидкість передачі даних ваг'
        },
        {
          key: 'equipment_scale.dataBits',
          value: JSON.stringify(settings.scale?.dataBits ?? 8),
          description: 'Біти даних ваг'
        },
        {
          key: 'equipment_scale.stopBits',
          value: JSON.stringify(settings.scale?.stopBits ?? 1),
          description: 'Стоп-біти ваг'
        },
        {
          key: 'equipment_scale.parity',
          value: JSON.stringify(settings.scale?.parity ?? 'none'),
          description: 'Парність ваг'
        },
        {
          key: 'equipment_scale.autoConnect',
          value: JSON.stringify(settings.scale?.autoConnect ?? false),
          description: 'Автоматичне підключення ваг'
        },
        {
          key: 'equipment_scale.activePollingInterval',
          value: JSON.stringify(settings.scale?.activePollingInterval ?? 1000),
          description: 'Активне опитування ваг (мс)'
        },
        {
          key: 'equipment_scale.reservePollingInterval',
          value: JSON.stringify(settings.scale?.reservePollingInterval ?? 5000),
          description: 'Резервне опитування ваг (мс)'
        },
        {
          key: 'equipment_scale.activePollingDuration',
          value: JSON.stringify(settings.scale?.activePollingDuration ?? 30000),
          description: 'Тривалість активного опитування ваг (мс)'
        },
        {
          key: 'equipment_scale.maxPollingErrors',
          value: JSON.stringify(settings.scale?.maxPollingErrors ?? 5),
          description: 'Максимальна кількість помилок перед зупинкою опитування'
        },
        {
          key: 'equipment_scale.weightCacheDuration',
          value: JSON.stringify(settings.scale?.weightCacheDuration ?? 500),
          description: 'Час кешування даних ваг (мс)'
        },
        {
          key: 'equipment_scale.weightThresholdForActive',
          value: JSON.stringify(settings.scale?.weightThresholdForActive ?? 0.010),
          description: 'Поріг ваги для переключення на активний polling (кг)'
        },
        {
          key: 'equipment_scale.connectionStrategy',
          value: JSON.stringify(settings.scale?.connectionStrategy ?? 'legacy'),
          description: 'Стратегія роботи з COM-портом ваг'
        },
        {
          key: 'equipment_scanner.autoConnect',
          value: JSON.stringify(settings.scanner?.autoConnect ?? true),
          description: 'Автоматичне підключення сканера'
        },
        {
          key: 'equipment_scanner.timeout',
          value: JSON.stringify(settings.scanner?.timeout ?? 5000),
          description: 'Таймаут сканера'
        },
        {
          key: 'equipment_simulation.enabled',
          value: JSON.stringify(settings.simulation?.enabled ?? true),
          description: 'Режим симуляції ввімкнено'
        },
        {
          key: 'equipment_simulation.weightRange.min',
          value: JSON.stringify(settings.simulation.weightRange?.min ?? 0.1),
          description: 'Мінімальна вага для симуляції'
        },
        {
          key: 'equipment_simulation.weightRange.max',
          value: JSON.stringify(settings.simulation.weightRange?.max ?? 5.0),
          description: 'Максимальна вага для симуляції'
        },
        {
          key: 'equipment_simulation.scanDelay',
          value: JSON.stringify(settings.simulation.scanDelay ?? 800),
          description: 'Затримка сканування для симуляції'
        },
        {
          key: 'equipment_simulation.weightDelay',
          value: JSON.stringify(settings.simulation.weightDelay ?? 1200),
          description: 'Затримка ваги для симуляції'
        },
        {
          key: 'equipment_printer.enabled',
          value: JSON.stringify(settings.printer?.enabled ?? false),
          description: 'Прямий друк через QZ Tray увімкнено'
        },
        {
          key: 'equipment_printer.name',
          value: JSON.stringify(settings.printer?.name ?? ''),
          description: "Ім'я принтера для прямого друку"
        }
      ];

      for (const setting of settingsToSave) {
        await settingsBase.upsert({
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
        });
      }
    } catch (error) {
      console.error('Error saving equipment settings:', error);
      throw new Error('Failed to save equipment settings');
    }
  }

  // Обновление конкретной настройки
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

  // Сброс настроек к значениям по умолчанию
  async resetEquipmentSettings(): Promise<EquipmentSettings> {
    try {
      // Деактивируем все текущие настройки
      await settingsBase.updateMany({
        where: {
          category: this.SETTINGS_CATEGORY,
          isActive: true
        },
        data: {
          isActive: false
        }
      });

      // Возвращаем настройки по умолчанию
      const defaultSettings = await this.getEquipmentSettings();
      return defaultSettings;
    } catch (error) {
      console.error('Error resetting equipment settings:', error);
      throw new Error('Failed to reset equipment settings');
    }
  }

  // Получение истории изменений настроек
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

  // Приватные методы для работы с настройками

  private flattenSettings(settings: any, prefix: string = ''): Record<string, any> {
    const flattened: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(settings)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        Object.assign(flattened, this.flattenSettings(value, fullKey));
      } else {
        // Убеждаемся, что все значения корректно обрабатываются
        if (typeof value === 'string' && (value === 'simulation' || value === 'local')) {
          // Для строковых значений типа подключения сохраняем как есть
          flattened[fullKey] = value;
        } else {
          // Для остальных значений сохраняем как есть
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
