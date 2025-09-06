import { PrismaClient } from '@prisma/client';

interface SyncSettings {
  autoSyncEnabled: boolean;
  cacheEnabled: boolean;
  cacheTtl: number;
  maxConcurrentSyncs: number;
  orders: {
    syncInterval: number;
    batchSize: number;
    retryAttempts: number;
    retryDelay: number;
    enabled: boolean;
    filterType: string;
  };
  products: {
    syncInterval: number;
    batchSize: number;
    retryAttempts: number;
    retryDelay: number;
    enabled: boolean;
  };
  stocks: {
    syncInterval: number;
    batchSize: number;
    retryAttempts: number;
    retryDelay: number;
    enabled: boolean;
  };
  dilovod: {
    enabled: boolean;
    cacheExpiryHours: number;
    setParentId: string;
    mainPriceType: string;
    categoriesMap: { [key: string]: number };
    cleanupDaysOld: number;
    syncInterval: number;
    batchSize: number;
    retryAttempts: number;
    retryDelay: number;
  };
}

export class SyncSettingsService {
  private static instance: SyncSettingsService;
  private prisma = new PrismaClient();

  private constructor() {}

  public static getInstance(): SyncSettingsService {
    if (!SyncSettingsService.instance) {
      SyncSettingsService.instance = new SyncSettingsService();
    }
    return SyncSettingsService.instance;
  }

  /**
   * Получить все настройки синхронизации из БД
   */
  async getSyncSettings(): Promise<SyncSettings> {
    try {
      const settings = await this.prisma.settingsBase.findMany({
        where: {
          category: 'orders_sync',
          isActive: true
        }
      });

      // Значения по умолчанию
      const defaultSettings: SyncSettings = {
        autoSyncEnabled: true,
        cacheEnabled: true,
        cacheTtl: 60,
        maxConcurrentSyncs: 2,

        orders: {
          syncInterval: 30,
          batchSize: 50,
          retryAttempts: 3,
          retryDelay: 60,
          enabled: true,
          filterType: 'updateAt' // 'orderTime' или 'updateAt' - фильтр по времени создания или изменения
        },

        // Документация для фильтров:
        // filterType: 'orderTime' - фильтр по времени создания заказа (все созданные заказы)
        // filterType: 'updateAt' - фильтр по времени изменения заказа (только измененные заказы, оптимизировано)

        products: {
          syncInterval: 6,
          batchSize: 100,
          retryAttempts: 2,
          retryDelay: 30,
          enabled: true
        },

        stocks: {
          syncInterval: 15,
          batchSize: 200,
          retryAttempts: 1,
          retryDelay: 15,
          enabled: true
        },

        dilovod: {
          enabled: true,
          cacheExpiryHours: 24,
          setParentId: "1100300000001315",
          mainPriceType: "1101300000001001",
          categoriesMap: {
            "Перші страви": 1,
            "Другі страви": 2,
            "Набори продукції": 3
          },
          cleanupDaysOld: 30,
          syncInterval: 60,
          batchSize: 100,
          retryAttempts: 3,
          retryDelay: 60
        }
      };

      // Применяем настройки из БД
      settings.forEach(setting => {
        switch (setting.key) {
          case 'auto_sync_enabled':
            defaultSettings.autoSyncEnabled = setting.value === 'true';
            break;
          case 'cache_enabled':
            defaultSettings.cacheEnabled = setting.value === 'true';
            break;
          case 'cache_ttl':
            defaultSettings.cacheTtl = parseInt(setting.value);
            break;
          case 'max_concurrent_syncs':
            defaultSettings.maxConcurrentSyncs = parseInt(setting.value);
            break;

          // Настройки заказов
          case 'orders_sync_interval':
            defaultSettings.orders.syncInterval = parseInt(setting.value);
            break;
          case 'orders_batch_size':
            defaultSettings.orders.batchSize = parseInt(setting.value);
            break;
          case 'orders_retry_attempts':
            defaultSettings.orders.retryAttempts = parseInt(setting.value);
            break;
          case 'orders_retry_delay':
            defaultSettings.orders.retryDelay = parseInt(setting.value);
            break;
          case 'orders_enabled':
            defaultSettings.orders.enabled = setting.value === 'true';
            break;

          // Настройки товаров
          case 'products_sync_interval':
            defaultSettings.products.syncInterval = parseInt(setting.value);
            break;
          case 'products_batch_size':
            defaultSettings.products.batchSize = parseInt(setting.value);
            break;
          case 'products_retry_attempts':
            defaultSettings.products.retryAttempts = parseInt(setting.value);
            break;
          case 'products_retry_delay':
            defaultSettings.products.retryDelay = parseInt(setting.value);
            break;
          case 'products_enabled':
            defaultSettings.products.enabled = setting.value === 'true';
            break;

          // Настройки остатков
          case 'stocks_sync_interval':
            defaultSettings.stocks.syncInterval = parseInt(setting.value);
            break;
          case 'stocks_batch_size':
            defaultSettings.stocks.batchSize = parseInt(setting.value);
            break;
          case 'stocks_retry_attempts':
            defaultSettings.stocks.retryAttempts = parseInt(setting.value);
            break;
          case 'stocks_retry_delay':
            defaultSettings.stocks.retryDelay = parseInt(setting.value);
            break;
          case 'stocks_enabled':
            defaultSettings.stocks.enabled = setting.value === 'true';
            break;

          // Настройки Dilovod
          case 'dilovod_enabled':
            defaultSettings.dilovod.enabled = setting.value === 'true';
            break;
          case 'dilovod_cache_expiry_hours':
            defaultSettings.dilovod.cacheExpiryHours = parseInt(setting.value);
            break;
          case 'dilovod_set_parent_id':
            defaultSettings.dilovod.setParentId = setting.value;
            break;
          case 'dilovod_main_price_type':
            defaultSettings.dilovod.mainPriceType = setting.value;
            break;
          case 'dilovod_categories_map':
            try {
              defaultSettings.dilovod.categoriesMap = JSON.parse(setting.value);
            } catch (e) {
              console.warn('Failed to parse dilovod_categories_map:', e);
            }
            break;
          case 'dilovod_cleanup_days_old':
            defaultSettings.dilovod.cleanupDaysOld = parseInt(setting.value);
            break;
          case 'dilovod_sync_interval':
            defaultSettings.dilovod.syncInterval = parseInt(setting.value);
            break;
          case 'dilovod_batch_size':
            defaultSettings.dilovod.batchSize = parseInt(setting.value);
            break;
          case 'dilovod_retry_attempts':
            defaultSettings.dilovod.retryAttempts = parseInt(setting.value);
            break;
          case 'dilovod_retry_delay':
            defaultSettings.dilovod.retryDelay = parseInt(setting.value);
            break;
        }
      });

      return defaultSettings;
    } catch (error) {
      console.error('Error getting sync settings:', error);
      throw error;
    }
  }

  /**
   * Сохранить настройки синхронизации в БД
   */
  async saveSyncSettings(settings: SyncSettings): Promise<void> {
    try {
      const settingPromises = [];

      // Общие настройки
      settingPromises.push(
        this.prisma.settingsBase.upsert({
          where: { key: 'auto_sync_enabled' },
          update: { value: settings.autoSyncEnabled.toString() },
          create: {
            key: 'auto_sync_enabled',
            value: settings.autoSyncEnabled.toString(),
            description: 'Автоматическая синхронизация включена',
            category: 'orders_sync',
            isActive: true
          }
        })
      );

      settingPromises.push(
        this.prisma.settingsBase.upsert({
          where: { key: 'cache_enabled' },
          update: { value: settings.cacheEnabled.toString() },
          create: {
            key: 'cache_enabled',
            value: settings.cacheEnabled.toString(),
            description: 'Кеширование включено',
            category: 'orders_sync',
            isActive: true
          }
        })
      );

      settingPromises.push(
        this.prisma.settingsBase.upsert({
          where: { key: 'cache_ttl' },
          update: { value: settings.cacheTtl.toString() },
          create: {
            key: 'cache_ttl',
            value: settings.cacheTtl.toString(),
            description: 'Время жизни кеша (минуты)',
            category: 'orders_sync',
            isActive: true
          }
        })
      );

      settingPromises.push(
        this.prisma.settingsBase.upsert({
          where: { key: 'max_concurrent_syncs' },
          update: { value: settings.maxConcurrentSyncs.toString() },
          create: {
            key: 'max_concurrent_syncs',
            value: settings.maxConcurrentSyncs.toString(),
            description: 'Максимальное количество одновременных синхронизаций',
            category: 'orders_sync',
            isActive: true
          }
        })
      );

      // Настройки заказов
      const ordersSettings = [
        { key: 'orders_sync_interval', value: settings.orders.syncInterval, desc: 'Интервал синхронизации заказов (минуты)' },
        { key: 'orders_batch_size', value: settings.orders.batchSize, desc: 'Размер пакета для заказов' },
        { key: 'orders_retry_attempts', value: settings.orders.retryAttempts, desc: 'Повторы для заказов' },
        { key: 'orders_retry_delay', value: settings.orders.retryDelay, desc: 'Задержка повторов для заказов (секунды)' },
        { key: 'orders_enabled', value: settings.orders.enabled, desc: 'Синхронизация заказов включена' }
      ];

      ordersSettings.forEach(({ key, value, desc }) => {
        settingPromises.push(
          this.prisma.settingsBase.upsert({
            where: { key },
            update: { value: value.toString() },
            create: {
              key,
              value: value.toString(),
              description: desc,
              category: 'orders_sync',
              isActive: true
            }
          })
        );
      });

      // Настройки товаров
      const productsSettings = [
        { key: 'products_sync_interval', value: settings.products.syncInterval, desc: 'Интервал синхронизации товаров (часы)' },
        { key: 'products_batch_size', value: settings.products.batchSize, desc: 'Размер пакета для товаров' },
        { key: 'products_retry_attempts', value: settings.products.retryAttempts, desc: 'Повторы для товаров' },
        { key: 'products_retry_delay', value: settings.products.retryDelay, desc: 'Задержка повторов для товаров (секунды)' },
        { key: 'products_enabled', value: settings.products.enabled, desc: 'Синхронизация товаров включена' }
      ];

      productsSettings.forEach(({ key, value, desc }) => {
        settingPromises.push(
          this.prisma.settingsBase.upsert({
            where: { key },
            update: { value: value.toString() },
            create: {
              key,
              value: value.toString(),
              description: desc,
              category: 'orders_sync',
              isActive: true
            }
          })
        );
      });

      // Настройки остатков
      const stocksSettings = [
        { key: 'stocks_sync_interval', value: settings.stocks.syncInterval, desc: 'Интервал синхронизации остатков (минуты)' },
        { key: 'stocks_batch_size', value: settings.stocks.batchSize, desc: 'Размер пакета для остатков' },
        { key: 'stocks_retry_attempts', value: settings.stocks.retryAttempts, desc: 'Повторы для остатков' },
        { key: 'stocks_retry_delay', value: settings.stocks.retryDelay, desc: 'Задержка повторов для остатков (секунды)' },
        { key: 'stocks_enabled', value: settings.stocks.enabled, desc: 'Синхронизация остатков включена' }
      ];

      stocksSettings.forEach(({ key, value, desc }) => {
        settingPromises.push(
          this.prisma.settingsBase.upsert({
            where: { key },
            update: { value: value.toString() },
            create: {
              key,
              value: value.toString(),
              description: desc,
              category: 'orders_sync',
              isActive: true
            }
          })
        );
      });

      // Настройки Dilovod
      const dilovodSettings = [
        { key: 'dilovod_enabled', value: settings.dilovod.enabled, desc: 'Синхронизация Dilovod включена' },
        { key: 'dilovod_cache_expiry_hours', value: settings.dilovod.cacheExpiryHours, desc: 'Время жизни кеша Dilovod (часы)' },
        { key: 'dilovod_set_parent_id', value: settings.dilovod.setParentId, desc: 'ID группы комплектов в Dilovod' },
        { key: 'dilovod_main_price_type', value: settings.dilovod.mainPriceType, desc: 'Основной тип цены в Dilovod' },
        { key: 'dilovod_categories_map', value: JSON.stringify(settings.dilovod.categoriesMap), desc: 'Маппинг категорий Dilovod' },
        { key: 'dilovod_cleanup_days_old', value: settings.dilovod.cleanupDaysOld, desc: 'Количество дней для очистки старых товаров' },
        { key: 'dilovod_sync_interval', value: settings.dilovod.syncInterval, desc: 'Интервал синхронизации Dilovod (минуты)' },
        { key: 'dilovod_batch_size', value: settings.dilovod.batchSize, desc: 'Размер пакета для Dilovod' },
        { key: 'dilovod_retry_attempts', value: settings.dilovod.retryAttempts, desc: 'Повторы для Dilovod' },
        { key: 'dilovod_retry_delay', value: settings.dilovod.retryDelay, desc: 'Задержка повторов для Dilovod (секунды)' }
      ];

      dilovodSettings.forEach(({ key, value, desc }) => {
        settingPromises.push(
          this.prisma.settingsBase.upsert({
            where: { key },
            update: { value: value.toString() },
            create: {
              key,
              value: value.toString(),
              description: desc,
              category: 'orders_sync',
              isActive: true
            }
          })
        );
      });

      await Promise.all(settingPromises);
    } catch (error) {
      console.error('Error saving sync settings:', error);
      throw error;
    }
  }

  /**
   * Проверить, включена ли синхронизация для определенного типа
   */
  async isSyncEnabled(syncType: 'orders' | 'products' | 'stocks' | 'dilovod'): Promise<boolean> {
    try {
      const settings = await this.getSyncSettings();
      return settings[syncType]?.enabled ?? true;
    } catch (error) {
      console.error(`Error checking if ${syncType} sync is enabled:`, error);
      return true; // По умолчанию включено
    }
  }

  /**
   * Получить настройки для определенного типа синхронизации
   */
  async getSyncTypeSettings(syncType: 'orders' | 'products' | 'stocks' | 'dilovod') {
    try {
      const settings = await this.getSyncSettings();
      return settings[syncType];
    } catch (error) {
      console.error(`Error getting ${syncType} sync settings:`, error);
      throw error;
    }
  }

  /**
   * Получить интервал синхронизации для определенного типа (в миллисекундах)
   */
  async getSyncInterval(syncType: 'orders' | 'products' | 'stocks' | 'dilovod'): Promise<number> {
    try {
      const settings = await this.getSyncSettings();
      const interval = settings[syncType].syncInterval;

      // Для товаров интервал в часах, для остальных в минутах
      return syncType === 'products' ? interval * 60 * 60 * 1000 : interval * 60 * 1000;
    } catch (error) {
      console.error(`Error getting ${syncType} sync interval:`, error);
      // Значения по умолчанию
      return syncType === 'products' ? 6 * 60 * 60 * 1000 : 30 * 60 * 1000;
    }
  }

  /**
   * Получить размер пакета для определенного типа синхронизации
   */
  async getBatchSize(syncType: 'orders' | 'products' | 'stocks' | 'dilovod'): Promise<number> {
    try {
      const settings = await this.getSyncSettings();
      return settings[syncType].batchSize;
    } catch (error) {
      console.error(`Error getting ${syncType} batch size:`, error);
      // Значения по умолчанию
      const defaults = { orders: 50, products: 100, stocks: 200, dilovod: 100 };
      return defaults[syncType];
    }
  }

  /**
   * Получить количество попыток повторения для определенного типа синхронизации
   */
  async getRetryAttempts(syncType: 'orders' | 'products' | 'stocks' | 'dilovod'): Promise<number> {
    try {
      const settings = await this.getSyncSettings();
      return settings[syncType].retryAttempts;
    } catch (error) {
      console.error(`Error getting ${syncType} retry attempts:`, error);
      // Значения по умолчанию
      const defaults = { orders: 3, products: 2, stocks: 1, dilovod: 3 };
      return defaults[syncType];
    }
  }

  /**
   * Получить задержку между повторениями для определенного типа синхронизации
   */
  async getRetryDelay(syncType: 'orders' | 'products' | 'stocks' | 'dilovod'): Promise<number> {
    try {
      const settings = await this.getSyncSettings();
      return settings[syncType].retryDelay;
    } catch (error) {
      console.error(`Error getting ${syncType} retry delay:`, error);
      // Значения по умолчанию
      const defaults = { orders: 60, products: 30, stocks: 15, dilovod: 60 };
      return defaults[syncType];
    }
  }
}

export const syncSettingsService = SyncSettingsService.getInstance();
