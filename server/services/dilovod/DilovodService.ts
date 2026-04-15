// Основний сервіс Dilovod - координатор всіх модулів

import { PrismaClient } from '@prisma/client';
import {
  DilovodApiClient,
  DilovodCacheManager,
  DilovodDataProcessor,
  DilovodSyncManager,
  DilovodProduct,
  DilovodSyncResult,
  DilovodTestResult,
  DilovodStockBalance,
  WordPressProduct
} from './index.js';
import { syncSettingsService } from '../syncSettingsService.js';
import { dilovodCacheService } from './DilovodCacheService.js';
import { DilovodGoodsCacheManager } from './DilovodGoodsCacheManager.js';
import { pluralize } from '../../lib/utils.js';

const prisma = new PrismaClient();

export class DilovodService {
  // Глобальний AbortController для поточної синхронізації товарів
  static currentSyncAbortController: AbortController | null = null;

  /**
   * Реєструє зовнішній AbortController як поточний для синхронізації.
   * Викликати до запуску syncProductsWithDilovod, щоб cancelCurrentSync() міг його скасувати.
   */
  static registerSyncAbortController(controller: AbortController): void {
    DilovodService.currentSyncAbortController = controller;
  }

  // Статичний метод для скасування поточної синхронізації
  static cancelCurrentSync(): boolean {
    if (DilovodService.currentSyncAbortController) {
      console.log('🔻 Скасовуємо поточну синхронізацію через API запит');
      DilovodService.currentSyncAbortController.abort();
      DilovodService.currentSyncAbortController = null;
      return true;
    }
    return false;
  }

  // Goods cache manager
  public goodsCacheManager: DilovodGoodsCacheManager;

  async getGoodsCacheStatus() {
    return await this.goodsCacheManager.getStatus();
  }

  // Публичный метод для получения конфигурации API (для использования в контроллерах)
  getDilovodConfig() {
    return this.apiClient.getConfig();
  }

  async refreshGoodsCache(skuList?: string[]) {
    return await this.goodsCacheManager.refresh(skuList);
  }
  /**
   * Експортувати замовлення в Dilovod (створити документ saleOrder)
   */
  async exportToDilovod(payload: any): Promise<any> {
    // Гарантуємо, що конфіг (і apiKey) завантажено перед синхронним getApiKey()
    await this.apiClient.ensureReady();
    // Викликає API-клієнт для створення документа
    return this.apiClient.makeRequest({
      version: '0.25',
      key: this.apiClient.getApiKey(),
      action: 'saveObject',
      params: payload
    });
  }

  /**
   * Отримати документ переміщення з Діловода за його ID.
   * Використовується після першої відправки для отримання номера (header.number).
   */
  async getMovementDocument(dilovodDocId: string): Promise<any> {
    await this.apiClient.ensureReady();
    return this.apiClient.getObject(dilovodDocId);
  }
  private apiClient: DilovodApiClient;
  private cacheManager: DilovodCacheManager;
  private dataProcessor: DilovodDataProcessor;
  private syncManager: DilovodSyncManager;

  constructor() {
    this.apiClient = new DilovodApiClient();
    this.cacheManager = new DilovodCacheManager();
    this.dataProcessor = new DilovodDataProcessor(this.apiClient);
    this.syncManager = new DilovodSyncManager();
    this.goodsCacheManager = new DilovodGoodsCacheManager();
  }

  /**
   * Логування запиту/відповіді Dilovod API експорту замовлення
   * @param title Заголовок або опис логу
   * @param status success/error
   * @param message текстове повідомлення
   * @param data { payload, warnings }
   * @param metadata додаткові метадані
   */
  async logMetaDilovodExport({ title, status, message, data, initiatedBy }: {
    title: string,
    status: 'success' | 'error',
    message: string,
    data?: any,
    /** Ініціатор дії: userId як рядок для користувачів (напр. "42"),
     *  або системна константа: "cron:назва", "webhook:назва", "system:назва" */
    initiatedBy?: string
  }) {
    try {
      await prisma.meta_logs.create({
        data: {
          category: 'dilovod',
          title,
          status,
          message,
          data,
          // If the caller provides orderNumber in the payload - save it into a separate column
          // This allows DB-side filtering/counting without complex JSON queries
          // Accepts both "orderNumber" and legacy "orderNum" keys
          orderNumber: data && typeof data === 'object'
            ? ((data as any).orderNumber ?? (data as any).orderNum ?? undefined)
            : undefined,
          initiatedBy: initiatedBy ?? null
        }
      });
    } catch (err) {
      console.log('Помилка запису логу meta_logs:', err);
    }
  }

  /**
   * Отримує назви товарів з бази даних по SKU для кращих повідомлень про помилки
   */
  private async getProductNamesBySkus(skus: string[]): Promise<Record<string, string>> {
    try {
      const products = await prisma.product.findMany({
        where: {
          sku: { in: skus }
        },
        select: {
          sku: true,
          name: true
        }
      });

      const nameMap: Record<string, string> = {};
      products.forEach(product => {
        nameMap[product.sku] = product.name;
      });

      return nameMap;
    } catch (error) {
      console.log('Помилка отримання назв товарів:', error);
      return {};
    }
  }

  /**
   * Логування помилок синхронізації товарів
   * @param sku SKU товару (або рядок з кількома SKU через кому)
   * @param errorType тип помилки
   * @param message детальний опис помилки
   * @param productData додаткові дані про товар (опціонально)
   * @param initiatedBy ініціатор дії
   */
  async logSyncError({
    sku,
    errorType,
    message,
    productData,
    initiatedBy
  }: {
    sku: string;
    errorType: 'missing_price' | 'invalid_data' | 'db_error' | 'validation_error' | 'sync_failed';
    message: string;
    productData?: any;
    initiatedBy?: string;
  }) {
    try {
      const titleMap = {
        missing_price: 'Товар без ціни',
        invalid_data: 'Невірні дані товару',
        db_error: 'Помилка бази даних',
        validation_error: 'Помилка валідації',
        sync_failed: 'Помилка синхронізації'
      };

      // Формуємо повідомлення з назвами товарів
      let formattedMessage = message;

      if (sku && sku !== 'system') {
        const skusArray = sku.split(',').map(s => s.trim()).filter(s => s.length > 0);
        if (skusArray.length > 0) {
          const nameMap = await this.getProductNamesBySkus(skusArray);

          if (skusArray.length === 1) {
            const skuValue = skusArray[0];
            const productName = nameMap[skuValue];
            formattedMessage = productName
              ? `${productName} (SKU: ${skuValue}) - ${message}`
              : `SKU: ${skuValue} - ${message}`;
          } else {
            // Для кількох SKU показуємо список
            const productList = skusArray.map(skuValue => {
              const productName = nameMap[skuValue];
              return productName ? `${productName} (${skuValue})` : skuValue;
            }).join(', ');
            formattedMessage = `Товари: ${productList} - ${message}`;
          }
        }
      }

      await prisma.meta_logs.create({
        data: {
          category: 'product_sync',
          title: titleMap[errorType] || 'Помилка синхронізації товару',
          status: 'error',
          message: formattedMessage,
          data: {
            sku,
            errorType,
            productData
          },
          initiatedBy: initiatedBy ?? 'system'
        }
      });

      console.log(`📝 Записано помилку в meta_logs: ${titleMap[errorType] || 'Помилка синхронізації товару'} - ${formattedMessage}`);
    } catch (err) {
      console.log('❌ Помилка запису логу помилки синхронізації:', err);
    }
  }

  // ===== УПРАВЛІННЯ КОНФІГУРАЦІЄЮ =====

  /**
   * Оновлює конфігурацію API клієнта (після зміни налаштувань)
   */
  async reloadApiConfig(): Promise<void> {
    await this.apiClient.reloadConfig();
    // Також оновлюємо dataProcessor, щоб він використовував нову конфігурацію
    await this.dataProcessor.reloadConfig();
  }

  // ===== ОСНОВНІ ФУНКЦІЇ СИНХРОНІЗАЦІЇ =====

  // Синхронізація товарів з Dilovod
  async syncProductsWithDilovod(mode: 'full' | 'manual' = 'full', manualSkus?: string[], signal?: AbortSignal): Promise<DilovodSyncResult> {
    try {
      console.log(`\n🚀 === ПОЧАТОК ${mode === 'full' ? 'ПОВНОЇ' : 'РУЧНОЇ'} СИНХРОНІЗАЦІЇ ТОВАРІВ З DILOVOD ===`);

      // Перевіряємо, чи увімкнено синхронізацію Dilovod
      const isEnabled = await syncSettingsService.isSyncEnabled('dilovod');
      if (!isEnabled) {
        console.log('❌ Синхронізація Dilovod вимкнена в налаштуваннях');

        // Логуємо помилку в систему повідомлень
        await this.logSyncError({
          sku: 'system',
          errorType: 'sync_failed',
          message: 'Синхронізація Dilovod вимкнена в налаштуваннях системи',
          productData: { mode },
          initiatedBy: 'system'
        });

        return {
          success: false,
          message: 'Синхронізація Dilovod вимкнена в налаштуваннях',
          syncedProducts: 0,
          syncedSets: 0,
          errors: ['Синхронізація Dilovod вимкнена']
        };
      }

      let skus = [];

      if (mode === 'full') {
        // Отримання SKU товарів з WordPress
        console.log('📋 Крок 1: Отримання SKU товарів з WordPress...');
        skus = await this.fetchSkusDirectlyFromWordPress();
      } else {
        skus = manualSkus;
      }

      if (skus.length === 0) {
        console.log('❌ Не знайдено SKU товарів для синхронізації');

        // Логуємо помилку в систему повідомлень
        await this.logSyncError({
          sku: 'system',
          errorType: 'sync_failed',
          message: 'Не знайдено SKU товарів в WordPress для синхронізації',
          productData: { mode, manualSkus },
          initiatedBy: 'system'
        });

        return {
          success: false,
          message: 'Не знайдено SKU товарів для синхронізації',
          syncedProducts: 0,
          syncedSets: 0,
          errors: []
        };
      }

      // Підмішуємо SKU з Whitelist
      try {
        const whitelistRecord = await prisma.settingsWpSku.findFirst();
        if (whitelistRecord?.skus) {
          // Розділяємо рядок на масив SKU (припускаємо, що SKU розділені комами або новими рядками)
          const whitelistSkus = whitelistRecord.skus
            .split(/[\n,]/)
            .map(sku => sku.trim())
            .filter(sku => sku.length > 0);

          console.log(`📋 Завантажено ${whitelistSkus.length} SKU з whitelist:`, whitelistSkus);
          
          // Додаємо тільки унікальні SKU (через Set для уникнення дублів)
          const uniqueSkusSet = new Set(skus);
          whitelistSkus.forEach(sku => uniqueSkusSet.add(sku));
          skus = Array.from(uniqueSkusSet);
        }
      } catch (error) {
        console.warn('Не вдалося завантажити SKU whitelist з БД:', error);
      }

      console.log(`✅ Отримано ${skus.length} SKU для синхронізації`);

      // Крок 2: Отримання інформації про товари та комплекти з Dilovod
      console.log('\n📋 Крок 2: Отримання інформації про товари та комплекти з Dilovod...');

      let dilovodProducts: any[] = [];
      try {
        dilovodProducts = await this.getGoodsInfoWithSetsOptimized(skus, signal);
      } catch (error) {
        console.error('❌ Критична помилка при отриманні даних з Dilovod:', error);

        // Логуємо критичну помилку в систему повідомлень
        await this.logSyncError({
          sku: 'system',
          errorType: 'sync_failed',
          message: `Критична помилка синхронізації: ${error instanceof Error ? error.message : 'Невідома помилка'}`,
          productData: { requestedSkus: skus, error: error instanceof Error ? error.message : String(error) },
          initiatedBy: 'system'
        });

        // При критичній помилці (мережева проблема, API недоступне) - зупиняємо синхронізацію
        return {
          success: false,
          message: `Критична помилка при отриманні даних з Dilovod: ${error instanceof Error ? error.message : 'Невідома помилка'}`,
          syncedProducts: 0,
          syncedSets: 0,
          errors: [`Критична помилка: ${error instanceof Error ? error.message : String(error)}`]
        };
      }

      console.log(`✅ Отримано ${dilovodProducts.length} товарів з Dilovod`);

      // Аналізуємо отримані дані
      const productsWithSets = dilovodProducts.filter(p => p.set && p.set.length > 0);
      const regularProducts = dilovodProducts.filter(p => !p.set || p.set.length === 0);

      console.log(`📊 Аналіз отриманих даних:`);
      console.log(`  - Всього товарів: ${dilovodProducts.length}`);
      console.log(`  - Комплектів: ${productsWithSets.length}`);
      console.log(`  - Звичайних товарів: ${regularProducts.length}`);

      if (productsWithSets.length > 0) {
        console.log(`🎯 Знайдені комплекти:`);
        productsWithSets.forEach((product, index) => {
          console.log(`  ${index + 1}. ${product.sku} - ${product.name} (${product.set.length} компонентів)`);
        });
      }

      // Крок 3: Синхронізація з базою даних
      console.log('\n📋 Крок 3: Синхронізація з базою даних...');
      let syncResult: DilovodSyncResult;
      try {
        syncResult = await this.syncManager.syncProductsToDatabase(dilovodProducts, this.logSyncError.bind(this), signal);
      } catch (error) {
        console.error('❌ Помилка при синхронізації з базою даних:', error);

        // Логуємо помилку в систему повідомлень
        await this.logSyncError({
          sku: 'system',
          errorType: 'sync_failed',
          message: `Помилка синхронізації з базою даних: ${error instanceof Error ? error.message : 'Невідома помилка'}`,
          productData: { dilovodProductsCount: dilovodProducts.length, error: error instanceof Error ? error.message : String(error) },
          initiatedBy: 'system'
        });

        // Повертаємо результат з частковим успіхом замість повної невдачі
        console.warn('⚠️ Помилка при синхронізації з БД, продовжуємо з порожніми даними...');
        syncResult = {
          success: true, // Змінюємо на true, щоб процес не зупинявся
          message: `Виникла помилка при збереженні даних в БД: ${error instanceof Error ? error.message : 'Невідома помилка'}. Продовжуємо з порожніми даними.`,
          syncedProducts: 0,
          syncedSets: 0,
          errors: [`Помилка БД: ${error instanceof Error ? error.message : String(error)}`]
        };
      }

      // Крок 4: Позначення застарілих товарів
      console.log('\n📋 Крок 4: Позначення застарілих товарів...');
      try {
        if (mode === 'full') {
          // При full — skus вже є актуальним списком з WordPress, перевіряємо всі товари в БД
          await this.syncManager.markOutdatedProducts(skus, 'all');
        } else {
          // При manual — отримуємо актуальний список з WordPress для валідації,
          // але перевіряємо тільки передані manualSkus
          console.log('Отримуємо актуальний список SKU з WordPress для валідації...');
          let wpSkus: string[] = [];
          try {
            wpSkus = await this.fetchSkusDirectlyFromWordPress();
            console.log(`Отримано ${wpSkus.length} SKU з WordPress для валідації`);
          } catch (e) {
            console.log('⚠️ Не вдалося отримати SKU з WordPress, перевірка застарілості пропускається:', e);
          }
          if (wpSkus.length > 0) {
            await this.syncManager.markOutdatedProducts(wpSkus, 'scoped', manualSkus);
          }
        }
      } catch (error) {
        console.warn('⚠️ Помилка при позначенні застарілих товарів (не критична):', error);

        // Логуємо попередження, але не припиняємо процес
        await this.logSyncError({
          sku: 'system',
          errorType: 'sync_failed',
          message: `Попередження: не вдалося позначити застарілі товари: ${error instanceof Error ? error.message : 'Невідома помилка'}`,
          productData: { mode, skusCount: skus.length },
          initiatedBy: 'system'
        });
      }

      console.log('\n✅ === СИНХРОНІЗАЦІЯ ЗАВЕРШЕНА ===');
      console.log(`Результат: ${syncResult.message}`);
      console.log(`Успішно: ${syncResult.success ? 'ТАК' : 'НІ'}`);
      console.log(`Помилок: ${syncResult.errors?.length || 0}`);

      if (syncResult.errors && syncResult.errors.length > 0) {
        console.log('📋 Список помилок, що повертаються клієнту:');
        syncResult.errors.forEach((error, index) => {
          console.log(`  ${index + 1}. ${error}`);
        });
      }

      return syncResult;

    } catch (error) {
      console.log('\n❌ === ПОМИЛКА СИНХРОНІЗАЦІЇ ===');
      console.log('Помилка синхронізації з Dilovod:', error);

      const errorMessage = error instanceof Error ? error.message : 'Невідома помилка';

      // Логуємо помилку в систему повідомлень
      await this.logSyncError({
        sku: 'system',
        errorType: 'sync_failed',
        message: `Критична помилка синхронізації: ${errorMessage}`,
        productData: { mode, manualSkus, error: errorMessage },
        initiatedBy: 'system'
      });

      return {
        success: true, // Змінюємо на true, щоб cron процес не зупинявся
        message: `Критична помилка в процесі синхронізації: ${errorMessage}. Автоматичний процес продовжено.`,
        syncedProducts: 0,
        syncedSets: 0,
        errors: [errorMessage]
      };
    } finally {
      // Очищаємо глобальний AbortController після завершення синхронізації
      DilovodService.currentSyncAbortController = null;
    }
  }

  // ===== ФУНКЦІЇ ОТРИМАННЯ ДАНИХ =====

  // Отримання інформації про товари з комплектами (оптимізована версія)
  async getGoodsInfoWithSetsOptimized(skuList: string[], signal?: AbortSignal): Promise<DilovodProduct[]> {
    try {
      console.log('Отримуємо інформацію про товари та комплекти з Dilovod...');
      console.log('📋 SKU для обробки:', skuList.slice(0, 10));
      console.log(`... і ще ${skuList.length - 10}`);
      

      // Перевіряємо, чи було скасування перед викликом зовнішнього API
      if (signal?.aborted) {
        const err: any = new Error('Запит скасовано');
        err.name = 'AbortError';
        throw err;
      }

      // Отримуємо товари з цінами
      const pricesResponse = await this.apiClient.getGoodsWithPrices(skuList, signal);
      console.log(`Отримано ${pricesResponse.length} товарів з цінами`);

      // ПЕРЕВІРКА: чи всі запитувані SKU повернулися в відповіді з цінами
      const pricesSkus = new Set(pricesResponse.map(p => p.sku));
      const missingPricesSkus = skuList.filter(sku => !pricesSkus.has(sku));

      if (missingPricesSkus.length > 0) {
        console.log(`⚠️ Dilovod не повернув ціни для ${missingPricesSkus.length} товарів:`, missingPricesSkus);

        // Отримуємо назви товарів для кращого повідомлення про помилку
        const productNames = await this.getProductNamesBySkus(missingPricesSkus);

        // Логуємо помилки для кожного відсутнього товару
        for (const sku of missingPricesSkus) {
          await this.logSyncError({
            sku,
            errorType: 'sync_failed',
            message: `Dіlovod не повернув дані про товар "${productNames[sku] || sku}" (відсутня ціна)`,
            productData: { requestedSkus: skuList, missingInPrices: true },
            initiatedBy: 'system'
          });
        }

        // НЕ кидаємо помилку - продовжуємо з наявними даними
        console.log(`✅ Продовжуємо синхронізацію з ${pricesResponse.length} товарами, для яких є ціни`);
      }

      // Перевірка на скасування перед наступним викликом
      if (signal?.aborted) {
        const err: any = new Error('Запит скасовано');
        err.name = 'AbortError';
        throw err;
      }

      // Отримуємо товари з каталогу для додаткової інформації
      const goodsResponse = await this.apiClient.getGoodsFromCatalog(skuList, signal);

      // const goodsResponse = [
      //   {
      //     id: '1100300000001561',
      //     id__pr: 'Курка з грибами, 180г',
      //     sku: '02010',
      //     parent: '1100300000001578',
      //     parent__pr: 'Основи для салатів',
      //     priceType: '1101300000001012',
      //     priceType__pr: 'Військові',
      //     price: '125.00000'
      //   },
      //   {
      //     id: '1100300000001575',
      //     id__pr: 'Вінегрет класичний, 850г',
      //     sku: '02011',
      //     parent: '1100300000001653',
      //     parent__pr: 'Салатні набори',
      //     priceType: '1101300000001005',
      //     priceType__pr: 'Роздріб (Розетка)',
      //     price: '268.00000'
      //   },
      //   {
      //     id: '1100300000001576',
      //     id__pr: 'Вінегрет з квасолею, 850г',
      //     sku: '02012',
      //     parent: '1100300000001653',
      //     parent__pr: 'Салатні набори',
      //     priceType: '1101300000001005',
      //     priceType__pr: 'Роздріб (Розетка)',
      //     price: '282.00000'
      //   }
      // ];

      console.log(`Отримано ${goodsResponse.length} товарів з каталогу`);

      // ПЕРЕВІРКА: чи всі запитувані SKU повернулися в відповіді з каталогу
      const catalogSkus = new Set(goodsResponse.map(g => g.sku));
      const missingCatalogSkus = skuList.filter(sku => !catalogSkus.has(sku));

      if (missingCatalogSkus.length > 0) {
        console.log(`⚠️ Dilovod не повернув дані з каталогу для ${missingCatalogSkus.length} товарів:`, missingCatalogSkus);

        // Отримуємо назви товарів для кращого повідомлення про помилку
        const productNames = await this.getProductNamesBySkus(missingCatalogSkus);

        // Логуємо помилки для кожного відсутнього товару
        for (const sku of missingCatalogSkus) {
          await this.logSyncError({
            sku,
            errorType: 'sync_failed',
            message: `Dіlovod не повернув дані про товар "${productNames[sku] || sku}" з каталогу`,
            productData: { requestedSkus: skuList, missingInCatalog: true },
            initiatedBy: 'system'
          });
        }

        // НЕ кидаємо помилку - продовжуємо з наявними даними
        console.log(`✅ Продовжуємо синхронізацію з ${goodsResponse.length} товарами, для яких є дані в каталозі`);
      }

      // Обробляємо дані через процесор
      const result = await this.dataProcessor.processGoodsWithSets(pricesResponse, goodsResponse);

      return result;

    } catch (error) {
      console.log('Помилка отримання інформації про товари з комплектами:', error);
      throw error;
    }
  }

  // Отримання залишків товарів за списком SKU
  async getBalanceBySkuList(): Promise<DilovodStockBalance[]> {
    try {
      console.log('Отримуємо залишки товарів за списком SKU...');

      // Отримуємо SKU всіх товарів з бази даних (включаючи застарілі)
      const products = await prisma.product.findMany({
        // where: {
        //   isOutdated: false  // Закоментовано: тепер залишки оновлюються і для застарілих товарів
        // },
        select: {
          sku: true
        }
      });

      const skus = products.map(p => p.sku);
      if (skus.length === 0) {
        console.log('Не знайдено товарів у базі даних');
        return [];
      }

      console.log(`Отримано ${skus.length} SKU товарів з БД (включаючи застарілі)`);

      const stockResponse = await this.apiClient.getStockBalance(skus, this.apiClient.getConfig().defaultFirmId);
      const processedStock = this.dataProcessor.processStockBalance(stockResponse);

      console.log(`Оброблено ${processedStock.length} товарів з залишками`);

      // Визначаємо SKU, для яких Dilovod API не повернув жодного рядка
      // (може статися коли qty = null або товар відсутній в реєстрі залишків)
      const returnedSkus = new Set(processedStock.map(item => item.sku));
      const missingSkus = skus.filter(sku => !returnedSkus.has(sku));

      if (missingSkus.length > 0) {
        console.log(`⚠️ Dilovod не повернув залишки для ${missingSkus.length} SKU — встановлюємо 0: ${missingSkus.slice(0, 10).join(', ')}${missingSkus.length > 10 ? ` ... і ще ${missingSkus.length - 10}` : ''}`);
      }

      const zeroBalances: DilovodStockBalance[] = missingSkus.map(sku => ({
        sku,
        name: sku,
        mainStorage: 0,
        smallStorage: 0,
        total: 0
      }));

      return [
        ...processedStock.map(item => ({
          sku: item.sku,
          name: item.name,
          mainStorage: item.mainStorage,
          smallStorage: item.smallStorage,
          total: item.total
        })),
        ...zeroBalances
      ];

    } catch (error) {
      console.log('Помилка отримання залишків за SKU:', error);
      throw error;
    }
  }

  // Отримання доступних партій (goodPart) по SKU з залишками по складах
  async getBatchNumbersBySku(sku: string, firmId?: string, asOfDate?: Date): Promise<Array<{
    batchId: string;
    batchNumber: string;
    storage: string;
    storageDisplayName: string;
    quantity: number;
    firm: string;
    firmDisplayName: string;
  }>> {
    try {
      console.log(`📦 [Dilovod] Запит партій для SKU: ${sku}${asOfDate ? ` на дату ${asOfDate.toLocaleString('uk-UA')}` : ''}${firmId ? ` (фірма: ${firmId})` : ''}`);
      const batches = await this.apiClient.getBatchNumbersBySku(sku, firmId, asOfDate);
      console.log(`✅ [Dilovod] Отримано ${batches.length} партій для SKU: ${sku}`);
      return batches;
    } catch (error) {
      console.error(`🚨 [Dilovod] Помилка отримання партій для SKU ${sku}:`, error);
      return [];
    }
  }

  // Нова функція: оновлення залишків товарів у БД
  async updateStockBalancesInDatabase(): Promise<{
    success: boolean;
    message: string;
    updatedProducts: number;
    errors: string[];
  }> {
    try {
      console.log('\n🔄 === ОНОВЛЕННЯ ЗАЛИШКІВ ТОВАРІВ У БД ===');

      // Отримуємо актуальні залишки з Dilovod
      const stockBalances = await this.getBalanceBySkuList();

      if (stockBalances.length === 0) {
        return {
          success: false,
          message: 'Не вдалося отримати залишки з Dilovod',
          updatedProducts: 0,
          errors: []
        };
      }

      console.log(`Отримано ${stockBalances.length} товарів з залишками для оновлення`);

      const errors: string[] = [];
      let updatedProducts = 0;

      // Оновлюємо залишки в базі даних
      for (const stockBalance of stockBalances) {
        try {
          const result = await this.syncManager.updateProductStockBalance(
            stockBalance.sku,
            stockBalance.mainStorage,
            stockBalance.smallStorage
          );

          if (result.success) {
            updatedProducts++;
            console.log(`✅ Залишки для ${stockBalance.sku} оновлено: Склад1=${stockBalance.mainStorage}, Склад2=${stockBalance.smallStorage}`);
          } else {
            errors.push(`Помилка оновлення ${stockBalance.sku}: ${result.message}`);
          }
        } catch (error) {
          const errorMessage = `Помилка оновлення залишків ${stockBalance.sku}: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
          console.log(errorMessage);
          errors.push(errorMessage);
        }
      }

      console.log(`\n=== РЕЗУЛЬТАТ ОНОВЛЕННЯ ЗАЛИШКІВ ===`);
      console.log(`Оновлено товарів: ${updatedProducts}`);
      console.log(`Помилок: ${errors.length}`);

      if (errors.length > 0) {
        console.log(`Список помилок:`);
        errors.forEach((error, index) => {
          console.log(`${index + 1}. ${error}`);
        });
      }

      return {
        success: errors.length === 0,
        message: `Оновлено ${updatedProducts} товарів з залишками`,
        updatedProducts,
        errors
      };

    } catch (error) {
      console.log('Помилка оновлення залишків у БД:', error);
      return {
        success: false,
        message: `Помилка оновлення залишків: ${error instanceof Error ? error.message : 'Невідома помилка'}`,
        updatedProducts: 0,
        errors: [error instanceof Error ? error.message : 'Невідома помилка']
      };
    }
  }

  // ===== ТЕСТОВІ ФУНКЦІЇ =====

  // Тест підключення до Dilovod
  async testConnection(): Promise<DilovodTestResult> {
    try {
      console.log('Тестуємо підключення до Dilovod...');

      const isConnected = await this.apiClient.testConnection();

      if (isConnected) {
        return {
          success: true,
          message: 'Підключення до Dilovod успішне'
        };
      } else {
        return {
          success: false,
          message: 'Не вдалося підключитися до Dilovod'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Помилка тестування підключення: ${error instanceof Error ? error.message : 'Невідома помилка'}`
      };
    }
  }

  // Тест отримання тільки комплектів
  async testSetsOnly(): Promise<DilovodTestResult> {
    try {
      console.log('\n🧪 === ТЕСТ ОТРИМАННЯ КОМПЛЕКТІВ ===');

      const skus = await this.fetchSkusDirectlyFromWordPress();
      if (skus.length === 0) {
        return {
          success: false,
          message: 'Немає SKU для тестування'
        };
      }

      console.log(`Отримано ${skus.length} SKU для тестування`);

      // Отримуємо товари з каталогу
      const response = await this.apiClient.getGoodsFromCatalog(skus);

      if (!Array.isArray(response)) {
        return {
          success: false,
          message: 'Несподіваний формат відповіді'
        };
      }

      // Аналізуємо відповідь — перевіряємо за всіма ID груп комплектів
      const setParentIds = ["1100300000001315"];
      const potentialSets = response.filter((item: any) => setParentIds.includes(item.parent));
      const regularGoods = response.filter((item: any) => !setParentIds.includes(item.parent));

      console.log(`\n📊 Аналіз відповіді:`);
      console.log(`  - Всього товарів: ${response.length}`);
      console.log(`  - Потенційних комплектів (parent in [${setParentIds.join(', ')}]): ${potentialSets.length}`);
      console.log(`  - Звичайних товарів: ${regularGoods.length}`);

      if (potentialSets.length > 0) {
        console.log(`\n🎯 Потенційні комплекти:`);
        potentialSets.forEach((item: any, index: number) => {
          console.log(`  ${index + 1}. ID: ${item.id}, SKU: ${item.sku}, Назва: ${item.id__pr || 'N/A'}`);
        });
      }

      return {
        success: true,
        message: `Тест завершено. Знайдено ${potentialSets.length} потенційних комплектів`,
        data: {
          totalGoods: response.length,
          potentialSets: potentialSets.length,
          regularGoods: regularGoods.length,
          response: response
        }
      };

    } catch (error) {
      console.log('Помилка тестування комплектів:', error);
      return {
        success: false,
        message: `Помилка: ${error instanceof Error ? error.message : 'Невідома помилка'}`
      };
    }
  }

  // ===== ФУНКЦІЇ КЕРУВАННЯ КЕШЕМ =====

  // Отримання SKU для тестування
  async getTestSkus(): Promise<string[]> {
    return this.fetchSkusDirectlyFromWordPress();
  }

  // Отримання статистики кеша
  async getCacheStats(): Promise<{
    hasCache: boolean;
    skuCount: number;
    lastUpdated: string | null;
    isExpired: boolean;
  }> {
    return this.cacheManager.getCacheStats();
  }

  // Примусове оновлення кеша
  async forceRefreshCache(): Promise<{ success: boolean; message: string; skuCount: number }> {
    return this.cacheManager.forceRefreshCache();
  }

  // ===== ФУНКЦІЇ СТАТИСТИКИ =====

  // Отримання статистики синхронізації
  async getSyncStats(): Promise<{
    totalProducts: number;
    productsWithSets: number;
    lastSync: string | null;
    categoriesCount: Array<{ name: string; count: number }>;
  }> {
    return this.syncManager.getSyncStats();
  }

  // Отримання товарів за фільтрами
  async getProducts(filters: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    hasSets?: boolean;
  }): Promise<{
    products: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> {
    return this.syncManager.getProducts(filters);
  }

  // ===== ФУНКЦІЇ ОЧИСТКИ =====

  // Очистка старих товарів
  async cleanupOldProducts(daysOld?: number): Promise<{
    success: boolean;
    message: string;
    deletedCount: number;
  }> {
    return this.syncManager.cleanupOldProducts(daysOld);
  }

  // ===== ПРИВАТНІ МЕТОДИ =====

  // Прямий запит SKU з WordPress (без кешу)
  private async fetchSkusDirectlyFromWordPress(): Promise<string[]> {
    try {
      if (!process.env.WORDPRESS_DATABASE_URL) {
        throw new Error('WORDPRESS_DATABASE_URL не налаштований у змінних оточення');
      }

      console.log('Підключаємося до бази даних WordPress...');
      console.log(`URL підключення: ${process.env.WORDPRESS_DATABASE_URL.replace(/\/\/.*@/, '//***@')}`);

      // Створюємо окреме підключення до бази даних WordPress
      const wordpressDb = new PrismaClient({
        datasources: {
          db: {
            url: process.env.WORDPRESS_DATABASE_URL
          }
        }
      });

      try {
        console.log('Виконуємо SQL запит до бази WordPress...');

        // Отримуємо SKU товарів
        const products = await wordpressDb.$queryRaw<WordPressProduct[]>`
          SELECT DISTINCT 
            pm.meta_value as sku,
            COALESCE(CAST(pm2.meta_value AS SIGNED), 1) as stock_quantity
          FROM wp_postmeta pm
          INNER JOIN wp_posts p ON pm.post_id = p.ID
          LEFT JOIN wp_postmeta pm2 ON pm.post_id = pm2.post_id AND pm2.meta_key = '_stock'
          WHERE pm.meta_key = '_sku'
            AND pm.meta_value IS NOT NULL
            AND pm.meta_value != ''
            AND p.post_type = 'product'
            AND p.post_status = 'publish'
          ORDER BY pm.meta_value
        `;

        console.log(`SQL запит виконано успішно. Отримано ${products.length} записів з WordPress`);

        if (products.length === 0) {
          console.log('Попередження: SQL запит повернув 0 записів.');
          return [];
        }

        // Фільтруємо тільки валідні SKU
        const validSkus = products
          .filter(product => product.sku && product.sku.trim() !== '')
          .map(product => product.sku.trim());

        console.log(`Після фільтрації залишилось ${validSkus.length} валідних SKU`);

        if (validSkus.length > 0) {
          console.log(`Приклади валідних SKU: ${validSkus.slice(0, 5).join(', ')}`);
        }

        return validSkus;

      } finally {
        // Завжди закриваємо з'єднання
        await wordpressDb.$disconnect();
        console.log('З\'єднання з базою WordPress закрито');
      }

    } catch (error) {
      console.log('Помилка отримання SKU з WordPress:', error);
      throw error;
    }
  }


  // ===== ФУНКЦІЇ ДЛЯ РОБОТИ З ЗАМОВЛЕННЯМИ =====

  // Пошук замовлення за номером
  async getOrderByNumber(orderNumbers: string[], withDetails = false): Promise<any[][]> {
    try {
      console.log(`Пошук замовлень за номерами: ${orderNumbers.join(', ')}`);
      const result = await this.apiClient.getOrderByNumber(orderNumbers, withDetails);
      console.log(`Знайдено ${result.length} замовлень`);
      return result;
    } catch (error) {
      const errorMessage = `Помилка пошуку замовлень: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      console.log(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Пошук documents.sale / documents.cashIn / documents.saleReturn
  async getDocuments(baseDoc: any[], documentType: 'sale' | 'cashIn' | 'saleReturn'): Promise<any[]> {
    try {
      console.log(`Пошук documents.${documentType} за базовим документом:`, baseDoc);
      const result = await this.apiClient.getDocuments(baseDoc, documentType);
      console.log(`Знайдено ${result.length} documents.${documentType}`);
      return result;
    } catch (error) {
      const errorMessage = `Помилка пошуку documents.${documentType}: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      console.log(errorMessage);
      throw new Error(errorMessage);
    }
  }


  // Отримання деталей замовлення
  async getOrderDetails(orderId: string): Promise<any> {
    try {
      console.log(`Отримання деталей замовлення ID: ${orderId}`);
      const result = await this.apiClient.getOrderDetails(orderId);
      console.log('Деталі замовлення отримані успішно');
      return result;
    } catch (error) {
      const errorMessage = `Помилка отримання деталей замовлення: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      console.log(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // ===== МЕТОДИ ДЛЯ НАЛАШТУВАНЬ =====

  // Отримання складів з Dilovod (з кешуванням)
  async getStorages(forceRefresh = false): Promise<any[]> {
    try {
      // Перевіряємо кеш, якщо не примусове оновлення
      if (!forceRefresh) {
        const cached = await dilovodCacheService.getFromCache('storages');
        if (cached) {
          console.log(`📦 [Dilovod] Склади завантажено з кешу: ${cached.length} записів`);
          return cached;
        }
      }

      console.log('🔄 [Dilovod] Отримання списку складів з Dilovod API');
      const result = await this.apiClient.getStorages();
      console.log(`📦 [Dilovod] Отримано ${result.length} складів з API`);

      // Оновлюємо кеш
      await dilovodCacheService.updateCache('storages', result);

      return result;
    } catch (error) {
      const errorMessage = `Помилка отримання складів: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      console.log(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Отримання рахунків з Dilovod (з кешуванням)
  async getCashAccounts(forceRefresh = false): Promise<any[]> {
    try {
      // Перевіряємо кеш, якщо не примусове оновлення
      if (!forceRefresh) {
        const cached = await dilovodCacheService.getFromCache('accounts');
        if (cached) {
          console.log(`💰 [Dilovod] Рахунки завантажено з кешу: ${cached.length} записів`);
          return cached;
        }
      }

      console.log('🔄 [Dilovod] Отримання списку рахунків з Dilovod API');
      const result = await this.apiClient.getCashAccounts();
      console.log(`💰 [Dilovod] Отримано ${result.length} рахунків з API`);

      // Оновлюємо кеш
      await dilovodCacheService.updateCache('accounts', result);

      return result;
    } catch (error) {
      const errorMessage = `Помилка отримання рахунків: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      console.log(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Отримання форм оплати з Dilovod (з кешуванням)
  async getPaymentForms(forceRefresh = false): Promise<any[]> {
    try {
      // Перевіряємо кеш, якщо не примусове оновлення
      if (!forceRefresh) {
        const cached = await dilovodCacheService.getFromCache('paymentForms');
        if (cached) {
          console.log(`💳 [Dilovod] Форми оплати завантажено з кешу: ${cached.length} записів`);
          return cached;
        }
      }

      console.log('🔄 [Dilovod] Отримання списку форм оплати з Dilovod API');
      const result = await this.apiClient.getPaymentForms();
      console.log(`💳 [Dilovod] Отримано ${result.length} форм оплати з API`);

      // Оновлюємо кеш
      await dilovodCacheService.updateCache('paymentForms', result);

      return result;
    } catch (error) {
      const errorMessage = `Помилка отримання форм оплати: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      console.log(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Отримання каналів продажів з Dilovod (з кешуванням)
  async getTradeChanels(forceRefresh = false): Promise<any[]> {
    try {
      // Перевіряємо кеш, якщо не примусове оновлення
      if (!forceRefresh) {
        const cached = await dilovodCacheService.getFromCache('tradeChanels');
        if (cached) {
          console.log(`📺 [Dilovod] Канали продажів завантажено з кешу: ${cached.length} записів`);
          return cached;
        }
      }

      console.log('🔄 [Dilovod] Отримання списку каналів продажів з Dilovod API');
      const result = await this.apiClient.getTradeChanels();
      console.log(`📺 [Dilovod] Отримано ${result.length} каналів продажів з API`);

      // Оновлюємо кеш
      await dilovodCacheService.updateCache('tradeChanels', result);

      return result;
    } catch (error) {
      const errorMessage = `Помилка отримання каналів продажів: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      console.log(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Отримання способів доставки з Dilovod (з кешуванням)
  async getDeliveryMethods(forceRefresh = false): Promise<any[]> {
    try {
      // Перевіряємо кеш, якщо не примусове оновлення
      if (!forceRefresh) {
        const cached = await dilovodCacheService.getFromCache('deliveryMethods');
        if (cached) {
          console.log(`🚚 [Dilovod] Способи доставки завантажено з кешу: ${cached.length} записів`);
          return cached;
        }
      }

      console.log('🔄 [Dilovod] Отримання списку способів доставки з Dilovod API');
      const result = await this.apiClient.getDeliveryMethods();
      console.log(`🚚 [Dilovod] Отримано ${result.length} способів доставки з API`);

      // Оновлюємо кеш
      await dilovodCacheService.updateCache('deliveryMethods', result);

      return result;
    } catch (error) {
      const errorMessage = `Помилка отримання способів доставки: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      console.log(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Отримання фірм (власників рахунків) з Dilovod (з кешуванням)
  async getFirms(forceRefresh = false): Promise<any[]> {
    try {
      // Перевіряємо кеш, якщо не примусове оновлення
      if (!forceRefresh) {
        const cached = await dilovodCacheService.getFromCache('firms');
        if (cached) {
          console.log(`🏢 [Dilovod] Фірми завантажено з кешу: ${cached.length} записів`);
          return cached;
        }
      }

      console.log('🔄 [Dilovod] Отримання списку фірм з Dilovod API');
      const result = await this.apiClient.getFirms();
      console.log(`🏢 [Dilovod] Отримано ${result.length} фірм з API`);

      // Оновлюємо кеш
      await dilovodCacheService.updateCache('firms', result);

      return result;
    } catch (error) {
      const errorMessage = `Помилка отримання фірм: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      console.log(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Оновити весь кеш довідників Dilovod (примусово)
   * ВАЖЛИВО: Dilovod API блокує паралельні запити, тому робимо послідовно
   */
  async refreshAllDirectoriesCache(): Promise<{
    firms: number;
    accounts: number;
    storages: number;
    paymentForms: number;
    tradeChanels: number;
    deliveryMethods: number;
  }> {
    console.log('🔄 Примусове оновлення всіх довідників Dilovod...');

    // Робимо запити ПОСЛІДОВНО через обмеження Dilovod API
    const firms = await this.getFirms(true);
    const accounts = await this.getCashAccounts(true);
    const storages = await this.getStorages(true);
    const paymentForms = await this.getPaymentForms(true);
    const tradeChanels = await this.getTradeChanels(true);
    const deliveryMethods = await this.getDeliveryMethods(true);

    const result = {
      firms: firms.length,
      accounts: accounts.length,
      storages: storages.length,
      paymentForms: paymentForms.length,
      tradeChanels: tradeChanels.length,
      deliveryMethods: deliveryMethods.length
    };

    console.log(`✅ [Dilovod] Кеш оновлено: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Знайти контрагента за номером телефону
   */
  async findPersonByPhone(phone: string): Promise<{ id: string; name: string; phone: string } | null> {
    try {
      console.log(`🔍 [Dilovod] Пошук контрагента за телефоном: ${phone}`);

      if (!phone) {
        return null;
      }

      const results = await this.apiClient.findPersonByPhone(phone);

      if (results.length > 0) {
        const person = results[0]; // Беремо перший знайдений
        console.log(`✅ [Dilovod] Контрагент знайдений: ${person.name} (ID: ${person.id})`);
        return person;
      } else {
        console.log(`❌ [Dilovod] Контрагент з телефоном ${phone} не знайдений`);
        return null;
      }

    } catch (error) {
      const errorMessage = `Помилка пошуку контрагента: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      console.log(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Створити нового контрагента
   */
  async createPerson(personData: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
  }): Promise<{ id: string; code: string }> {
    try {
      console.log(`🆕 [Dilovod] Створення контрагента: ${personData.name}, ${personData.phone}`);

      const result = await this.apiClient.createPerson(personData);

      console.log(`✅ [Dilovod] Контрагент створений: ID ${result.id}, код ${result.code}`);

      return result;

    } catch (error) {
      const errorMessage = `Помилка створення контрагента: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      console.log(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Знайти або створити контрагента за даними замовлення
   */
  async findOrCreatePersonFromOrder(orderData: {
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    deliveryAddress?: string;
  }, options?: { dryRun?: boolean }): Promise<{ id: string; code: string; name: string; phone?: string; personType: string; wasCreated: boolean }> {
    const { customerName, customerPhone, customerEmail, deliveryAddress } = orderData;

    const dryRun = !!options?.dryRun;

    // Спочатку спробуємо знайти за телефоном
    if (customerPhone) {
      const existingPerson = await this.findPersonByPhone(customerPhone);
      if (existingPerson) {
        console.log(`✅ [Dilovod] Використовується існуючий контрагент: ${existingPerson.name}`);
        return {
          id: existingPerson.id,
          code: existingPerson.id, // Використовуємо ID як код
          name: existingPerson.name,
          phone: existingPerson.phone,
          personType: '1004000000000035', // Фізична особа
          wasCreated: false
        };
      }
    } else {
      console.log(`⚠️ [Dilovod] Телефон не вказано, створюємо контрагента без пошуку`);
    }

    // Якщо не знайдено
    if (dryRun) {
      console.log(`👤 [Dilovod] Контрагент не знайдено, dry-run - пропускаємо створення.`);
      return {
        id: '',
        code: '',
        name: customerName || 'Невідомий клієнт',
        phone: customerPhone,
        personType: '1004000000000035',
        wasCreated: false
      };
    }

    // Якщо не знайдено - створюємо нового
    console.log(`👤 [Dilovod] Контрагент не знайдено, створюємо нового...`);

    const newPerson = await this.createPerson({
      name: customerName || 'Невідомий клієнт',
      phone: customerPhone,
      email: customerEmail,
      address: deliveryAddress
    });

    return {
      id: newPerson.id,
      code: newPerson.code,
      name: customerName || 'Невідомий клієнт',
      phone: customerPhone,
      personType: '1004000000000035', // Фізична особа
      wasCreated: true
    };
  }

  /**
   * Оптимізований пошук товарів за списком SKU
   * Повертає Map для швидкого доступу SKU → Dilovod ID
   * 
   * Примітка: Для експорту замовлень цей метод не потрібен, 
   * оскільки Dilovod приймає SKU безпосередньо в полі good
   */
  async findGoodsBySkuList(skuList: string[]): Promise<Map<string, string>> {
    try {
      console.log(`🔍 [Dilovod] Пошук товарів за ${skuList.length} SKU...`);

      if (skuList.length === 0) {
        return new Map();
      }

      // Запит до Dilovod API
      const results = await this.apiClient.findGoodsBySkuList(skuList);

      // Створюємо Map для швидкого доступу
      const skuToIdMap = new Map<string, string>();

      for (const item of results) {
        if (item.id && item.productNum) {
          skuToIdMap.set(item.productNum, item.id);
        }
      }

      console.log(`✅ [Dilovod] Знайдено ${skuToIdMap.size} з ${skuList.length} товарів`);

      // Логуємо які SKU не знайдено
      const notFoundSkus = skuList.filter(sku => !skuToIdMap.has(sku));
      if (notFoundSkus.length > 0) {
        console.log(`⚠️ [Dilovod] Не знайдено SKU: ${notFoundSkus.join(', ')}`);
      }

      return skuToIdMap;

    } catch (error) {
      const errorMessage = `Помилка пошуку товарів за SKU: ${error instanceof Error ? error.message : 'Невідома помилка'}`;
      console.log(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Отримати фіскальний чек за dilovodDocId
   * @param dilovodDocId ID документа в Dilovod
   * @param index Індекс чека в масиві (за замовчуванням 0 - перший чек)
   * @returns Розпарсені дані чека або null, якщо чек не знайдено
   */
  async getFiscalReceipt(dilovodDocId: string, index: number = 0): Promise<{
    header: any;
    goods: any[];
    totals: any;
    payments: any[];
    taxes: any[];
  } | null> {
    try {
      console.log(`🧾 [Dilovod] Запит фіскального чека для документа: ${dilovodDocId} (індекс: ${index})`);

      const response = await this.apiClient.makeRequest({
        version: '0.25',
        key: this.apiClient.getApiKey(),
        action: 'request',
        params: {
          from: 'informationRegisters.fiscalRefs',
          fields: {
            contract: 'contract',
            additionalData: 'additionalData'
          },
          filters: [
            {
              alias: 'contract',
              operator: '=',
              value: dilovodDocId
            }
          ]
        }
      });

      // Перевіряємо, чи є дані у відповіді
      if (!response || !Array.isArray(response) || response.length === 0) {
        console.log(`⚠️ [Dilovod] Фіскальний чек не знайдено для документа ${dilovodDocId}`);
        return null;
      }

      // Перевіряємо, чи існує запитаний індекс
      if (index < 0 || index >= response.length) {
        console.log(`⚠️ [Dilovod] Індекс ${index} виходить за межі масиву (знайдено ${response.length} чеків)`);
        return null;
      }

      const fiscalData = response[index];
      const additionalData = fiscalData?.additionalData;

      if (!additionalData) {
        console.log(`⚠️ [Dilovod] additionalData порожнє для документа ${dilovodDocId} (індекс ${index})`);
        return null;
      }

      // Розпарсюємо JSON з additionalData
      let receiptJson: any;
      try {
        receiptJson = JSON.parse(additionalData);
      } catch (parseError) {
        console.log(`❌ [Dilovod] Помилка парсингу additionalData:`, parseError);
        throw new Error('Невалідний JSON у полі additionalData');
      }

      // Dilovod може повертати дані в різних форматах, перевіряємо всі варіанти
      let totalsData = receiptJson.totals || receiptJson.Totals || receiptJson.total || {};
      
      // Якщо totals - це масив, беремо перший елемент
      if (Array.isArray(totalsData) && totalsData.length > 0) {
        totalsData = totalsData[0];
      }

      const receipt = {
        header: receiptJson.json.header,
        goods: receiptJson.json.goods || [],
        totals: receiptJson.json.totals[0] || [],
        payments: receiptJson.json.payments[0] || [],
        taxes: receiptJson.json.taxes[0] || []
      };

      // Якщо totals все ще порожній, спробуємо знайти суму в кореневому об'єкті
      if (!receipt.totals.SUM && !receipt.totals.sum) {
        const possibleSumFields = ['SUM', 'sum', 'TOTAL', 'total', 'amount', 'AMOUNT'];
        for (const field of possibleSumFields) {
          if (receiptJson[field] !== undefined) {
            receipt.totals = { SUM: receiptJson[field] };
            break;
          }
        }
      }

      // Якщо досі немає суми, підраховуємо з товарів
      if (!receipt.totals.SUM && receipt.goods.length > 0) {
        const calculatedSum = receipt.goods.reduce((sum: number, item: any) => {
          const cost = item.COST || item.cost || (item.AMOUNT || item.amount || 0) * (item.PRICE || item.price || 0);
          return sum + (parseFloat(cost) || 0);
        }, 0);
        receipt.totals = { ...receipt.totals, SUM: calculatedSum };
      }

      console.log(`✅ [Dilovod] Чек отримано (${index + 1} з ${response.length}). SUM: ${receipt.totals.SUM || 0}`);
      return receipt;

    } catch (error) {
      console.log(`❌ [Dilovod] Помилка отримання фіскального чека:`, error);
      throw error;
    }
  }

  /**
   * Отримати список всіх фіскальних чеків для документа
   * @param dilovodDocId ID документа в Dilovod
   * @returns Масив метаданих чеків (без повного контенту для економії пам'яті)
   */
  async getFiscalReceiptsList(dilovodDocId: string): Promise<{
    total: number;
    receipts: Array<{
      index: number;
      fiscalNumber?: string;
      date?: string;
      sum?: number;
      type?: 'sale' | 'return' | 'unknown';
      summary: string;
    }>;
  }> {
    try {
      console.log(`📋 [Dilovod] Запит списку чеків для документа: ${dilovodDocId}`);

      const response = await this.apiClient.makeRequest({
        version: '0.25',
        key: this.apiClient.getApiKey(),
        action: 'request',
        params: {
          from: 'informationRegisters.fiscalRefs',
          fields: {
            contract: 'contract',
            additionalData: 'additionalData'
          },
          filters: [
            {
              alias: 'contract',
              operator: '=',
              value: dilovodDocId
            }
          ]
        }
      });

      if (!response || !Array.isArray(response) || response.length === 0) {
        console.log(`⚠️ [Dilovod] Чеки не знайдено для документа ${dilovodDocId}`);
        return { total: 0, receipts: [] };
      }

      console.log(`✅ [Dilovod] Знайдено ${response.length} чек(ів) для документа ${dilovodDocId}`);

      // Обробляємо кожен чек для отримання метаданих
      const receipts = response
        .map((fiscalData: any, index: number) => {
          try {
            const additionalData = fiscalData?.additionalData;
            
            if (!additionalData) {
              return null; // Пропускаємо чеки без даних
            }

            const receiptJson = JSON.parse(additionalData);
            const header = receiptJson?.json?.header || {};
            const totals = receiptJson?.json?.totals?.[0] || {};
            
            // Визначаємо тип чека (продаж, повернення)
            let type: 'sale' | 'return' | 'unknown' = 'unknown';
            if (header.ORDERRETNUM || header.orderretnum) {
              type = 'return';
              return null; // Пропускаємо чеки повернення
            } else if (header.ORDERNUM || header.ordernum) {
              type = 'sale';
            }

            const sum = totals.SUM || totals.sum || 0;
            const fiscalNumber = header.ORDERNUM || header.ordernum;
            const date = header.DATE || header.date;

            // Формуємо людино-читабельний опис
            let summary = `Чек №${index + 1}`;
            if (sum) {
              summary += ` (${sum.toFixed(2)} грн)`;
            }
            if (date) {
              summary += ` від ${new Date(date).toLocaleDateString('uk-UA')}`;
            }

            return {
              index,
              fiscalNumber,
              date,
              sum,
              type,
              summary
            };

          } catch (parseError) {
            console.log(`⚠️ [Dilovod] Помилка парсингу чека ${index}:`, parseError);
            return null; // Пропускаємо чеки з помилками парсингу
          }
        })
        .filter((receipt): receipt is NonNullable<typeof receipt> => receipt !== null); // Видаляємо null значення

      console.log(`📊 [Dilovod] Після фільтрації залишилось ${receipts.length} чек(ів) продажу`);

      return {
        total: response.length,
        receipts
      };

    } catch (error) {
      console.log(`❌ [Dilovod] Помилка отримання списку чеків:`, error);
      throw error;
    }
  }


  /**
   * AUTO MODE: Автоматична перевірка замовлень з неповними даними
   * Використання: Cron job + API endpoint з auto: true
   * @param forceAll - якщо true, перевіряє всі активні замовлення (навіть з повними даними)
   */
  async checkOrderStatuses(limit: number = 100, offset: number = 0, forceAll: boolean = false): Promise<{
    success: boolean;
    message: string;
    updatedCount: number;
    errors?: any[];
    data: any[];
  }> {
    const orderNumbers = forceAll
      ? await this.fetchAllOrderNumbers(limit, offset)
      : await this.fetchIncompleteOrderNumbers(limit, offset);
    return this.processOrderCheck(orderNumbers);
  }

  /**
   * MANUAL MODE: Перевірка конкретних номерів замовлень
   * Використання: UI з масивом orderNumbers
   */
  async checkOrdersByNumbers(orderNumbers: string[]): Promise<{
    success: boolean;
    message: string;
    updatedCount: number;
    errors?: any[];
    data: any[];
  }> {
    return this.processOrderCheck(orderNumbers);
  }

  /**
   * ПРИВАТНИЙ: Вибірка замовлень з неповними даними в Dilovod
   */
  private async fetchIncompleteOrderNumbers(limit: number, offset: number = 0): Promise<string[]> {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
      // Дата межі для повторної перевірки cashIn (24 години тому)
      const cashInCheckThreshold = new Date();
      cashInCheckThreshold.setHours(cashInCheckThreshold.getHours() - 24);

      // Знаходимо замовлення з неповними даними
      const orders = await prisma.order.findMany({
        where: {
          AND: [
            {
              OR: [
                // Базові поля для всіх статусів >= '1'
                { dilovodDocId: null },
                { dilovodExportDate: null },
                // CashIn: перевіряємо тільки якщо немає дати АБО остання перевірка була >24 год тому
                {
                  AND: [
                    { dilovodCashInDate: null },
                    {
                      OR: [
                        { dilovodCashInLastChecked: null },
                        { dilovodCashInLastChecked: { lt: cashInCheckThreshold } }
                      ]
                    }
                  ]
                },
                { // Для status >= '3': перевіряємо кількість документів відвантаження
                  // null = ще жодного разу не перевіряли; > 1 = виявлено дублікат, треба повторно перевірити, чи не зникли документи;
                  AND: [
                    { status: { gte: '3' } },
                    {
                      OR: [
                        { dilovodSaleExportDate: null },
                        { dilovodSaleDocsCount: null },
                        { dilovodSaleDocsCount: { gt: 1 } }
                      ]
                    }
                  ]
                },
                { // Для статусів 6/7 (відмова/повернення): перевіряємо наявність документу повернення (saleReturn)
                  // Тільки якщо є dilovodDocId (продаж був зафіксований) і ще не отримано документ повернення
                  AND: [
                    { status: { in: ['6', '7'] } },
                    { dilovodDocId: { not: null } },
                    { dilovodReturnDate: null }
                  ]
                }
              ]
            },
            // Виключаємо статус 8 (видалено) — у них ніколи не буває повернень
            { status: { not: '8' } }
          ]
        },
        orderBy: { orderDate: 'desc' },
        take: limit,
        skip: offset,
        select: {
          orderNumber: true,
          sajt: true,
          status: true
        }
      });

      await prisma.$disconnect();

      if (orders.length === 0) {
        console.log('Немає замовлень з неповними даними для перевірки');
        return [];
      }

      console.log(`Знайдено ${orders.length} замовлень з неповними даними`);

      // Повертаємо номери як є (вони вже у правильному форматі в БД)
      return orders.map(o => o.orderNumber);
    } catch (error) {
      await prisma.$disconnect();
      throw error;
    }
  }

  /**
   * ПРИВАТНИЙ: Вибірка ВСІХ активних замовлень (незалежно від повноти даних)
   * Використовується при forceAll: true
   */
  private async fetchAllOrderNumbers(limit: number, offset: number = 0): Promise<string[]> {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    try {
      const orders = await prisma.order.findMany({
        where: {
          AND: [
            // Виключаємо статус 8 (видалено) — всі інші статуси, включно з 6/7
            { status: { not: '8' } }
          ]
        },
        orderBy: { orderDate: 'desc' },
        take: limit,
        skip: offset,
        select: {
          orderNumber: true,
          status: true
        }
      });

      await prisma.$disconnect();

      if (orders.length === 0) {
        console.log('Немає активних замовлень для примусової перевірки');
        return [];
      }

      console.log(`[forceAll] Знайдено ${orders.length} активних замовлень для перевірки`);
      return orders.map(o => o.orderNumber);
    } catch (error) {
      await prisma.$disconnect();
      throw error;
    }
  }

  /**
   * ПРИВАТНИЙ: Спільна логіка перевірки замовлень в Dilovod
   */
  private async processOrderCheck(orderNumbers: string[]): Promise<{
    success: boolean;
    message: string;
    updatedCount: number;
    errors?: any[];
    data: any[];
  }> {
    const { PrismaClient } = await import('@prisma/client');
    const { orderDatabaseService } = await import('../orderDatabaseService.js');
    const prisma = new PrismaClient();

    try {
      if (orderNumbers.length === 0) {
        return {
          success: true,
          message: 'No orders to check',
          data: [],
          updatedCount: 0
        };
      }

      console.log(`=== Перевірка ${orderNumbers.length} замовлень в Dilovod ===`);

      const results = [];
      const contractIds: string[] = [];
      const orderMap = new Map<string, { orderNumber: string; dilovodId: string; dilovodExportDate: string | Date; status?: string }>();

      // Перевіряємо в локальній базі, які дані вже є (шукаємо за повним номером як є)
      const checks = await Promise.all(
        orderNumbers
          .filter(num => num)
          .map(async num => {
            const existing = await orderDatabaseService.getOrderByExternalId(num);

            return {
              num,
              contractId: existing?.dilovodDocId || null,
              dilovodExportDate: existing?.dilovodExportDate || null,
              dilovodSaleExportDate: existing?.dilovodSaleExportDate || null,
              dilovodCashInDate: existing?.dilovodCashInDate || null,
              status: existing?.status || '0'
            };
          })
      );

      const validOrders = checks.filter(item => !item.contractId).map(item => item.num);
      const passedOrders = checks.filter(item => item.contractId);

      // Обробляємо замовлення, які вже мають contractId
      for (const item of passedOrders) {
        console.log(`Замовлення ${item.num} вже має dilovodDocId — буде оновлено додаткові поля`);

        contractIds.push(item.contractId);
        orderMap.set(item.contractId, {
          orderNumber: item.num,
          dilovodId: item.contractId,
          dilovodExportDate: item.dilovodExportDate,
          status: item.status
        });

        results.push({
          orderNumber: item.num,
          dilovodId: item.contractId,
          dilovodExportDate: item.dilovodExportDate,
          dilovodSaleExportDate: item.dilovodSaleExportDate,
          dilovodCashInDate: item.dilovodCashInDate,
          updatedCount: 0,
          success: true,
          warnings: ['Замовлення вже має dilovodDocId — буде оновлено додаткові поля']
        });
      }

      // Шукаємо нові замовлення в Dilovod API
      const dilovodOrders = validOrders.length > 0 ? (await this.getOrderByNumber(validOrders)).flat() : [];

      // Оновлюємо базову інформацію (dilovodDocId, dilovodExportDate)
      for (const dilovodOrder of dilovodOrders) {
        if (!dilovodOrder.number) {
          results.push({
            orderNumber: dilovodOrder.number || 'unknown',
            error: 'Missing number or id in Dilovod order',
            success: false
          });
          continue;
        }

        const orderNumber = String(dilovodOrder.number);
        const contractId = dilovodOrder.id;

        try {
          const updateData: any = {
            dilovodExportDate: new Date(dilovodOrder.date).toISOString(),
            dilovodDocId: contractId
          };

          const updatedOrder = await prisma.order.updateMany({
            where: { orderNumber: orderNumber },
            data: updateData
          });

          if (updatedOrder.count > 0) {
            contractIds.push(contractId);
            orderMap.set(contractId, {
              orderNumber,
              dilovodId: dilovodOrder.id,
              dilovodExportDate: dilovodOrder.date
            });

            results.push({
              orderNumber: orderNumber,
              dilovodId: dilovodOrder.id,
              dilovodExportDate: dilovodOrder.date,
              updatedCount: updatedOrder.count,
              success: true
            });
          } else {
            results.push({
              orderNumber: orderNumber,
              dilovodId: dilovodOrder.id,
              error: 'Order not found in local database',
              success: false
            });
          }
        } catch (err) {
          results.push({
            orderNumber: orderNumber,
            dilovodId: dilovodOrder.id,
            error: err instanceof Error ? err.message : String(err),
            success: false
          });
        }
      }

      // Батч-запит для sale/cashIn документів (через contract!)
      if (contractIds.length > 0) {
        try {
          // Отримуємо тільки ті замовлення, що відповідають нашим orderNumbers
          const orderNumbersFromMap = Array.from(orderMap.values()).map(o => o.orderNumber);
          
          const existingOrders = await prisma.order.findMany({
            where: {
              AND: [
                { dilovodDocId: { in: contractIds } },
                { orderNumber: { in: orderNumbersFromMap } }
              ]
            },
            select: {
              orderNumber: true,
              dilovodDocId: true,
              dilovodSaleExportDate: true,
              dilovodSaleDocsCount: true,
              dilovodCashInDate: true,
              dilovodReturnDate: true,
              dilovodReturnDocsCount: true,
              status: true
            }
          });

          // Sale потрібен для status >= '3' завжди (для підрахунку дублікатів навіть якщо дата вже є)
          const needSaleRequest = contractIds.filter(id => {
            const order = existingOrders.find(o => o.dilovodDocId === id);
            const orderStatus = parseInt(order?.status || '0');
            // Запитуємо для всіх зі статусом >= 3 — щоб виявляти дублікати при кожній перевірці
            return order && orderStatus >= 3;
          });
          
          // CashIn потрібен для всіх
          const needCashInRequest = contractIds.filter(id => {
            const order = existingOrders.find(o => o.dilovodDocId === id);
            return !order || !order.dilovodCashInDate;
          });

          // SaleReturn потрібен для статусів 6/7 (відмова/повернення)
          // Тільки якщо ще немає дати повернення (або кількість дублікатів > 1 — перевіряємо повторно)
          const needReturnRequest = contractIds.filter(id => {
            const order = existingOrders.find(o => o.dilovodDocId === id);
            if (!order) return false;
            const orderStatus = parseInt(order.status || '0');
            const isReturnStatus = orderStatus === 6 || orderStatus === 7;
            if (!isReturnStatus) return false;
            // Перевіряємо якщо ще не отримали дату або якщо є дублікати
            return !order.dilovodReturnDate || (order.dilovodReturnDocsCount != null && order.dilovodReturnDocsCount > 1);
          });

          let saleDocuments: any[] = [];
          let cashInDocuments: any[] = [];
          let returnDocuments: any[] = [];

          if (needSaleRequest.length > 0) {
            console.log(`Виконуємо запит getDocuments() для ${needSaleRequest.length} contract (sale)...`);
            saleDocuments = await this.getDocuments(needSaleRequest, 'sale');
          }
          if (needCashInRequest.length > 0) {
            console.log(`Виконуємо запит getDocuments() для ${needCashInRequest.length} contract (cashIn)...`);
            cashInDocuments = await this.getDocuments(needCashInRequest, 'cashIn');
          }
          if (needReturnRequest.length > 0) {
            console.log(`Виконуємо запит getDocuments() для ${needReturnRequest.length} contract (saleReturn)...`);
            returnDocuments = await this.getDocuments(needReturnRequest, 'saleReturn');
          }

          // Групуємо за contract (або baseDoc - вони ідентичні), беремо перший документ
          const groupByContract = (docs: any[]) => {
            const map = new Map<string, any>();
            for (const d of docs) {
              // Використовуємо contract або baseDoc як ключ
              const contractKey = d?.contract || d?.baseDoc;
              if (!contractKey) continue;
              if (!map.has(contractKey)) {
                map.set(contractKey, d);
              }
            }
            return map;
          };

          // Підраховуємо кількість документів на один contractId
          const countByContract = (docs: any[]) => {
            const map = new Map<string, number>();
            for (const d of docs) {
              const contractKey = d?.contract || d?.baseDoc;
              if (!contractKey) continue;
              map.set(contractKey, (map.get(contractKey) ?? 0) + 1);
            }
            return map;
          };

          const saleByContract = groupByContract(saleDocuments);
          const saleCountByContract = countByContract(saleDocuments);
          const cashInByContract = groupByContract(cashInDocuments);
          const returnByContract = groupByContract(returnDocuments);
          const returnCountByContract = countByContract(returnDocuments);

          // Оновлюємо дати документів
          for (const contractId of contractIds) {
            const orderInfo = orderMap.get(contractId);
            if (!orderInfo) continue;

            const localOrder = existingOrders.find(o => o.dilovodDocId === contractId);
            const updateData: any = {};

            // Sale тільки для status >= '3'
            const orderStatus = parseInt(localOrder?.status || '0');
            if (orderStatus >= 3 && saleByContract.has(contractId)) {
              // Записуємо дату відвантаження, якщо ще немає
              if (!localOrder?.dilovodSaleExportDate) {
                updateData.dilovodSaleExportDate = new Date(saleByContract.get(contractId).date).toISOString();
              }
              // Завжди оновлюємо кількість документів відвантаження (щоб виявити дублікати)
              const saleCount = saleCountByContract.get(contractId) ?? 1;
              if (localOrder?.dilovodSaleDocsCount !== saleCount) {
                updateData.dilovodSaleDocsCount = saleCount;
                if (saleCount > 1) {
                  console.log(`⚠️ Замовлення ${orderInfo.orderNumber}: знайдено ${saleCount} документів відвантаження (має бути 1)!`);
                }
              }
            } else if (orderStatus >= 3 && !saleByContract.has(contractId) && needSaleRequest.includes(contractId)) {
              // Запит виконували, але документів не знайдено — скидаємо лічильник
              if (localOrder?.dilovodSaleDocsCount !== 0) {
                updateData.dilovodSaleDocsCount = 0;
              }
            }
            
            // CashIn для всіх + оновлюємо дату останньої перевірки
            if (!localOrder?.dilovodCashInDate) {
              if (cashInByContract.get(contractId)?.date) {
                // Знайдено документ cashIn - зберігаємо дату
                updateData.dilovodCashInDate = new Date(cashInByContract.get(contractId).date).toISOString();
              }
              // Завжди оновлюємо дату останньої перевірки (навіть якщо документ не знайдено)
              updateData.dilovodCashInLastChecked = new Date().toISOString();
            }

            // SaleReturn для статусів 6/7
            if (needReturnRequest.includes(contractId)) {
              if (returnByContract.has(contractId)) {
                // Зберігаємо дату повернення, якщо ще не збережена
                if (!localOrder?.dilovodReturnDate) {
                  updateData.dilovodReturnDate = new Date(returnByContract.get(contractId).date).toISOString();
                }
                // Завжди оновлюємо кількість документів повернення (для виявлення дублікатів)
                const returnCount = returnCountByContract.get(contractId) ?? 1;
                if (localOrder?.dilovodReturnDocsCount !== returnCount) {
                  updateData.dilovodReturnDocsCount = returnCount;
                  if (returnCount > 1) {
                    console.log(`⚠️ Замовлення ${orderInfo.orderNumber}: знайдено ${returnCount} документів повернення (має бути 1)!`);
                  }
                }
              } else {
                // Запит виконували, але документів повернення не знайдено — скидаємо лічильник
                if (localOrder?.dilovodReturnDocsCount !== 0) {
                  updateData.dilovodReturnDocsCount = 0;
                }
              }
            }

            if (Object.keys(updateData).length > 0) {
              await prisma.order.updateMany({
                where: { orderNumber: orderInfo.orderNumber },
                data: updateData
              });

              const resultIndex = results.findIndex(r => r.orderNumber === orderInfo.orderNumber);
              if (resultIndex !== -1) {
                results[resultIndex] = {
                  ...results[resultIndex],
                  dilovodSaleExportDate: updateData.dilovodSaleExportDate || localOrder?.dilovodSaleExportDate,
                  dilovodSaleDocsCount: updateData.dilovodSaleDocsCount ?? localOrder?.dilovodSaleDocsCount,
                  updatedCountSale: updateData.dilovodSaleExportDate ? 1 : 0,
                  dilovodCashInDate: updateData.dilovodCashInDate || localOrder?.dilovodCashInDate,
                  updatedCountCashIn: updateData.dilovodCashInDate ? 1 : 0,
                  dilovodReturnDate: updateData.dilovodReturnDate || localOrder?.dilovodReturnDate,
                  dilovodReturnDocsCount: updateData.dilovodReturnDocsCount ?? localOrder?.dilovodReturnDocsCount,
                  updatedCountReturn: updateData.dilovodReturnDate ? 1 : 0
                };
              } else {
                results.push({
                  orderNumber: orderInfo.orderNumber,
                  updatedCount: updateData.dilovodSaleExportDate || updateData.dilovodCashInDate ? 1 : 0,
                  success: true
                });
              }
            }
          }
          console.log('Оновлення документів Sale/CashIn/SaleReturn завершено (запити лише для відсутніх)');
        } catch (err) {
          console.log('Помилка під час оновлення Sale/CashIn:', err);
        }
      }

      // Підсумовуємо результати
      const errorCount = results.filter(r => !r.success).length;
      const hasError = errorCount > 0;
      
      // Підраховуємо загальну кількість оновлень (включаючи Sale і CashIn)
      const updatedCount = results.reduce((acc, r) => {
        const baseUpdates = r.updatedCount || 0;
        const saleUpdates = r.updatedCountSale || 0;
        const cashInUpdates = r.updatedCountCashIn || 0;
        const returnUpdates = r.updatedCountReturn || 0;
        return acc + baseUpdates + saleUpdates + cashInUpdates + returnUpdates;
      }, 0);

      // Кількість замовлень, в яких реально щось змінилось (хоча б одне поле оновлено)
      const updatedOrdersCount = results.filter(r => {
        const baseUpdates = r.updatedCount || 0;
        const saleUpdates = r.updatedCountSale || 0;
        const cashInUpdates = r.updatedCountCashIn || 0;
        const returnUpdates = r.updatedCountReturn || 0;
        return baseUpdates + saleUpdates + cashInUpdates + returnUpdates > 0;
      }).length;

      const errorDetails = hasError
        ? results.filter(r => !r.success).map(r => ({
          orderNumber: r.orderNumber,
          dilovodId: r.dilovodId,
          error: r.error
        }))
        : undefined;

      let message = '';
      if (hasError) {
        message = `Перевірка завершена з помилками (оновлено ${updatedOrdersCount} замовлень, ${errorCount} з помилками)`;
      } else if (updatedCount === 0) {
        message = 'Перевірка завершена: жодних нових даних не було оновлено.';
      } else {
        message = `Перевірка завершена (оновлено ${updatedOrdersCount} ${pluralize(updatedOrdersCount, 'замовлення', 'замовлення', 'замовлень')}, всього ${updatedCount} ${pluralize(updatedCount, 'зміна', 'зміни', 'змін')}).`;
      }

      return {
        success: !hasError,
        message,
        updatedCount: updatedCount,
        errors: errorDetails,
        data: results,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during order status check';
      console.log('CRON: Помилка перевірки замовлення в Dilovod:', errorMessage);
      return {
        success: false,
        message: `Dilovod API error: ${errorMessage}`,
        updatedCount: 0,
        data: [],
        errors: [{ error: errorMessage }]
      };
    }
  }


  async disconnect(): Promise<void> {
    console.log('Закриваємо з\'єднання DilovodService...');

    await Promise.all([
      this.cacheManager.disconnect(),
      this.syncManager.disconnect()
    ]);

    console.log('З\'єднання DilovodService закриті');
  }
}

export const dilovodService = new DilovodService();
