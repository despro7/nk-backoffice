/**
 * DilovodExportBuilder - Клас для формування payload експорту замовлень в Dilovod
 * 
 * Відповідальність:
 * - Формування заголовка документа (header)
 * - Мапінг товарів в табличну частину (tableParts.tpGoods)
 * - Пошук/створення контрагентів
 * - Отримання маппінгу каналів продажів та форм оплати
 * - Валідація даних перед експортом
 */

import { PrismaClient } from '@prisma/client';
import type {
  DilovodExportPayload,
  DilovodExportHeader,
  DilovodExportTableParts,
  DilovodTablePartGood,
  DilovodPerson,
  DilovodSettings,
  DilovodChannelMapping
} from '../../../shared/types/dilovod.js';
import { getDilovodConfigFromDB } from './DilovodUtils.js';
import { logWithTimestamp, DilovodService } from './index.js';
import { orderDatabaseService } from '../orderDatabaseService.js';
import { dilovodService } from './DilovodService.js';


const prisma = new PrismaClient();

// Константи Dilovod
const DILOVOD_CONSTANTS = {
  CURRENCY_UAH: '1101200000001001',              // ID валюти UAH
  UNIT_PIECE: '1103600000000001',                // ID одиниці "шт"
  PERSON_TYPE_INDIVIDUAL: '1004000000000035',    // Тип "Фізична особа"
  STATE_COD: '1111500000001005',                 // Статус замовлення "Післяплата"
  STATE_POSTED: '1111500000000006',              // Статус замовлення "Виконано"
  BUSINESS_PROCESS: '1115000000000001',          // ID виду бізнесу
  DOC_MODE_WHOLESALE: '1004000000000350',        // Операція "Відвантаження покупцеві"
} as const;

export interface ExportBuildContext {
  order: any;                                    // Замовлення з БД (з rawData та items)
  settings: DilovodSettings;                     // Налаштування Dilovod
  directories?: {                                // Довідники з Dilovod
    cashAccounts?: Array<{ id: string; owner?: string; name: string }>;
    firms?: Array<{ id: string; name: string }>;
    tradeChanels?: Array<{ id: string; id__pr: string; code: string }>;
    paymentForms?: Array<{ id: string; name: string }>;
  };
  warnings: string[];                            // Попередження під час побудови
}

export class DilovodExportBuilder {
  /**
   * Побудувати payload для документа експорту замовлення (documents.saleOrder)
   */
  async buildExportPayload(orderId: string, options?: { dryRun?: boolean; allowCreatePerson?: boolean }): Promise<{
    payload: DilovodExportPayload;
    warnings: string[]
  }> {
    logWithTimestamp(`📦 Початок формування payload для замовлення ${orderId}`);

    // Контекст побудови
    const context: ExportBuildContext = {
      order: null,
      settings: {} as DilovodSettings,
      warnings: []
    };

    try {
      // 1. Завантажити замовлення з БД
      context.order = await this.loadOrder(orderId);
      if (!context.order) {
        throw new Error(`Замовлення з ID ${orderId} не знайдено`);
      }

      // 2. Завантажити налаштування Dilovod
      context.settings = await this.loadSettings();

      // 2.1. ПЕРЕВІРКА: Чи налаштований канал для експорту?
      const channelId = context.order.sajt;
      const isChannelConfigured = context.settings.channelPaymentMapping && context.settings.channelPaymentMapping[channelId];
      
      if (!isChannelConfigured) {
        const channelName = this.getChannelDisplayName(channelId);
        const errorMessage = `Експорт заблоковано: канал "${channelName}" (ID: ${channelId}) не налаштований для експорту через Dilovod. Цей канал не потребує ручного експорту або вивантажується автоматично іншим способом.`;
        logWithTimestamp(`❌ ${errorMessage}`);
        throw new Error(errorMessage);
      }

      // 3. Завантажити довідники (рахунки та фірми)
      context.directories = await this.loadDirectories();

      // 4. Валідувати налаштування
      this.validateSettings(context);

      // 5. Побудувати заголовок з мапінгом
      const { header, channelMapping } = await this.buildHeaderWithMapping(context, options);

      // 6. КРИТИЧНА ВАЛІДАЦІЯ - блокує експорт у разі помилок
      const validation = await this.validateCriticalData(context, header, channelMapping, options);
      if (!validation.isValid) {
        const errorMessage = `Експорт заблоковано через критичні помилки:\n${validation.criticalErrors.join('\n')}`;
        logWithTimestamp(`❌ ЕКСПОРТ ЗАБЛОКОВАНО: ${validation.criticalErrors.length} критичних помилок`);
        throw new Error(errorMessage);
      }

      // 8. Побудувати табличні частини (товари)
      const tableParts = await this.buildTableParts(context);
      const orderNumber = await orderDatabaseService.getOrderNumberFromId(Number(orderId));

      // 9. Додаткова перевірка товарів
      if (tableParts.tpGoods.length === 0) {
        await dilovodService.logMetaDilovodExport({
          title: 'Експорт замовлення заблоковано - немає товарів для відправки',
          message: 'Експорт заблоковано: немає товарів для відправки в Dilovod. Перевірте SKU товарів у замовленні.',
          status: 'error',
          initiatedBy: 'system:exportBuilder',
          data: {
            orderId,
            orderNumber,
            payload: tableParts,
            exportResult: null,
            warnings: context.warnings.length > 0 ? context.warnings : undefined
          }
        });

        throw new Error('Експорт заблоковано: немає товарів для відправки в Dilovod. Перевірте SKU товарів у замовленні.');
      }

      // 10. Сформувати фінальний payload
      const payload: DilovodExportPayload = {
        saveType: 0,
        header,
        tableParts
      };

      logWithTimestamp(`✅ Payload успішно сформовано. Попереджень: ${context.warnings.length}`);

      return { payload, warnings: context.warnings };

    } catch (error) {
      logWithTimestamp(`❌ Помилка формування payload: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Побудувати payload для документа відвантаження (documents.sale) на основі baseDoc
   */
  async buildSalePayload(orderId: string, baseDocId: string, options?: { personId?: string }): Promise<{
    payload: DilovodExportPayload;
    warnings: string[];
  }> {
    logWithTimestamp(`📦 Початок формування payload відвантаження для замовлення ${orderId} (baseDoc: ${baseDocId})`);

    const context: ExportBuildContext = {
      order: null,
      settings: {} as DilovodSettings,
      warnings: []
    };

    try {
      // 1. Завантажити замовлення з БД
      context.order = await this.loadOrder(orderId);
      if (!context.order) {
        throw new Error(`Замовлення з ID ${orderId} не знайдено`);
      }

      // 2. Завантажити налаштування Dilovod
      context.settings = await this.loadSettings();

      // 3. Завантажити довідники
      context.directories = await this.loadDirectories();

      // 4. Валідувати налаштування
      this.validateSettings(context);

      // 5. Побудувати заголовок для документа відвантаження
      const { header: baseHeader, channelMapping } = await this.buildHeaderWithMapping(context, { personId: options?.personId });

      // NOTE: Для documents.sale деякі поля можуть бути недопустимі в Dilovod API.
      // Видаляємо перелічені поля у компактний спосіб перед відправкою.
      const baseHeaderForSale = { ...baseHeader } as any;
      const FIELDS_TO_REMOVE_FOR_SALE = ['tradeChanel', 'paymentForm', 'cashAccount', 'remarkFromPerson', 'deliveryRemark_forDel', 'number'];

      for (const field of FIELDS_TO_REMOVE_FOR_SALE) {
        if (Object.prototype.hasOwnProperty.call(baseHeaderForSale, field)) {
          logWithTimestamp(`  ⚠️  Видаляємо поле ${field} з header для documents.sale (не підтримується)`);
          delete baseHeaderForSale[field];
        }
      }
      
      // Модифікуємо заголовок для documents.sale
      // Використовуємо readyToShipAt як дату відвантаження, якщо вона є
      let saleDate: string;
      if (context.order.readyToShipAt) {
        // Конвертуємо readyToShipAt в формат Dilovod (YYYY-MM-DD HH:MM:SS) з UTC в локальний час (Київ UTC+2/+3)
        const utcReadyDate = new Date(context.order.readyToShipAt);
        const readyDate = new Date(utcReadyDate.getTime() - utcReadyDate.getTimezoneOffset() * 60000);
        saleDate = readyDate.toISOString().replace('T', ' ').substring(0, 19);
        logWithTimestamp(`  📅 Використовуємо дату готовності до відправки: ${saleDate}`);
      } else {
        // Fallback на поточну дату, якщо readyToShipAt не встановлено
        const utcNow = new Date();
        const localNow = new Date(utcNow.getTime() - utcNow.getTimezoneOffset() * 60000);
        saleDate = localNow.toISOString().replace('T', ' ').substring(0, 19);
        context.warnings.push('Дата готовності до відправки (readyToShipAt) не встановлена, використовується поточна дата');
        logWithTimestamp(`  ⚠️  readyToShipAt не встановлено, використовуємо поточну дату: ${saleDate}`);
      }

      const header: DilovodExportHeader = {
        ...baseHeaderForSale,
        id: 'documents.sale',                           // Тип документа - відвантаження
        date: saleDate,                                 // Дата готовності до відправки або поточна
        docMode: DILOVOD_CONSTANTS.DOC_MODE_WHOLESALE,  // Режим документа
        baseDoc: baseDocId,                             // Посилання на documents.saleOrder
        contract: baseDocId,                            // Договір (такий самий як baseDoc)
      };

      // 6. Побудувати табличні частини (товари) - такі самі як у замовленні
      const tableParts = await this.buildTableParts(context);

      // 7. Додаткова перевірка товарів
      if (tableParts.tpGoods.length === 0) {
        throw new Error('Експорт заблоковано: немає товарів для відвантаження.');
      }

      // 8. Сформувати фінальний payload
      const payload: DilovodExportPayload = {
        saveType: 1,
        header,
        tableParts
      };

      logWithTimestamp(`✅ Payload відвантаження успішно сформовано. Попереджень: ${context.warnings.length}`);

      return { payload, warnings: context.warnings };

    } catch (error) {
      logWithTimestamp(`❌ Помилка формування payload відвантаження: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Побудувати заголовок документа з мапінгом каналу
   */
  private async buildHeaderWithMapping(context: ExportBuildContext, options?: { dryRun?: boolean; personId?: string; allowCreatePerson?: boolean }): Promise<{
    header: DilovodExportHeader;
    channelMapping: DilovodChannelMapping | null;
  }> {
    logWithTimestamp(`  📋 Формування заголовка документа...`);

    const { order, settings } = context;

    // Отримуємо інформацію про контрагента
    // Якщо передано personId у options => використовуємо його як override
    const person = await this.findOrCreatePerson(context, options);

    // Отримуємо мапінг каналу продажів
    const channelMapping = await this.getChannelMapping(context);

    // Визначаємо фірму (за рахунком або за замовчуванням)
    const firmId = await this.determineFirmId(context, channelMapping);

    // Визначаємо канал продажів
    const tradeChanel = this.determineTradeChanel(context);

    // Визначаємо спосіб доставки через мапінг
    const deliveryMethodId = this.getDeliveryMethodMapping(context);

    // Визначаємо адресу доставки
    let deliveryAddress = '';
    if (order.rawData?.shipping_address) {
      deliveryAddress = order.rawData.shipping_address;
    } else if (order.rawData?.ord_delivery_data) {
      // ord_delivery_data може бути масивом, беремо перший елемент
      const deliveryDataArray = order.rawData.ord_delivery_data;
      const deliveryData = Array.isArray(deliveryDataArray) ? deliveryDataArray[0] : deliveryDataArray;

      if (deliveryData) {
        const cityName = deliveryData.cityName || '';
        const address = deliveryData.address || '';

        // Для Nova Poshta використовуємо cityName + address (номер відділення)
        if (cityName && address) {
          deliveryAddress = `${cityName}, ${address}`;
        } else if (cityName) {
          deliveryAddress = cityName;
        } else if (address) {
          deliveryAddress = address;
        }
      }
    }

    // Якщо адреса все ще пуста, спробуємо використати deliveryAddress з order
    if (!deliveryAddress && order.deliveryAddress) {
      deliveryAddress = order.deliveryAddress;
    }

    // Формуємо дату документа - конвертуємо з UTC в локальний час (Київ UTC+2/+3)
    let documentDate: string;
    if (order.orderDate) {
      const utcDate = new Date(order.orderDate);
      // Конвертуємо UTC в локальний час (Київ UTC+2/+3)
      const localDate = new Date(utcDate.getTime() - utcDate.getTimezoneOffset() * 60000);
      documentDate = localDate.toISOString().replace('T', ' ').substring(0, 19);
    } else {
      const utcNow = new Date();
      const localNow = new Date(utcNow.getTime() - utcNow.getTimezoneOffset() * 60000);
      documentDate = localNow.toISOString().replace('T', ' ').substring(0, 19);
    }

    const orderNumber = await orderDatabaseService.getOrderNumberFromId(Number(order.id));

    const header: DilovodExportHeader = {
      id: 'documents.saleOrder',                            // Тип документа "Замовлення на продаж"
      storage: settings.storageId!,                         // Склад
      date: documentDate,                                   // Дата документа
      person,                                               // Контрагент
      firm: firmId,                                         // Фірма
      currency: DILOVOD_CONSTANTS.CURRENCY_UAH,             // Валюта UAH
      posted: 1,                                            // Провести документ
      state: { id: DILOVOD_CONSTANTS.STATE_POSTED },        // Статус "Виконано"
      taxAccount: 1,                                        // Податковий облік
      tradeChanel: tradeChanel,                             // Канал продажів
      paymentForm: channelMapping?.paymentForm || '',       // Форма оплати
      cashAccount: channelMapping?.cashAccount || '',       // Рахунок
      number: orderNumber,                                  // Номер замовлення (з суфіксом/префіксом)
      remarkFromPerson: order.rawData?.comment || '',       // Коментар від клієнта
      business: DILOVOD_CONSTANTS.BUSINESS_PROCESS,         // Вид бізнесу
      deliveryMethod_forDel: deliveryMethodId,              // Спосіб доставки
      deliveryRemark_forDel: deliveryAddress                // Адреса доставки
    };

    logWithTimestamp(`  ✅ Заголовок сформовано для замовлення ${header.number}`);

    return { header, channelMapping };
  }

  /**
   * Знайти або створити контрагента в Dilovod
   */
  private async findOrCreatePerson(context: ExportBuildContext, options?: { dryRun?: boolean; personId?: string; allowCreatePerson?: boolean }): Promise<DilovodPerson> {
    const { order, settings, warnings } = context;

    try {
      // Збираємо дані про клієнта з замовлення
      const customerData = {
        customerName: order.customerName || 'Невідомий клієнт',
        customerPhone: order.customerPhone || '',
        customerEmail: order.customerEmail || order.rawData?.email || '',
        deliveryAddress: this.extractDeliveryAddress(order)
      };

      logWithTimestamp(`  👤 Пошук/створення контрагента: ${customerData.customerName}, ${customerData.customerPhone}`);

      // Якщо передано personId у options — використовуємо його напряму
      if (options?.personId) {
        logWithTimestamp(`  🔁 Використовуємо переданий personId override: ${options.personId}`);
        return {
          id: options.personId,
          code: options.personId,
          name: customerData.customerName || 'Невідомий клієнт',
          phone: customerData.customerPhone || '',
          personType: '1004000000000035',
          wasCreated: false
        };
      }

      // Використовуємо DilovodService для пошуку/створення
      const dilovodService = new DilovodService();
      const createIfNeeded = !!options?.allowCreatePerson || !options?.dryRun;
      const person = await dilovodService.findOrCreatePersonFromOrder(customerData, { dryRun: !createIfNeeded });

      const dilovodPerson: DilovodPerson = {
        id: person.id,
        code: person.code,
        name: person.name,
        phone: person.phone || '',
        personType: person.personType,
        wasCreated: person.wasCreated
      };

      // Визначаємо результат операції (створено або знайдено)
      if (dilovodPerson.wasCreated) {
        if (customerData.customerPhone) {
          warnings.push(`Контрагент створено: ${dilovodPerson.name} (${customerData.customerPhone})`);
        } else {
          warnings.push(`Контрагент створено: ${dilovodPerson.name} (без телефону)`);
        }
        logWithTimestamp(`  ✅ Контрагент створено: ${dilovodPerson.name} (ID: ${dilovodPerson.id})`);
      } else if (!dilovodPerson.id && options?.dryRun) {
        // dry-run mode: person not found, but we intentionally skipped creation
        if (customerData.customerPhone) {
          warnings.push(`Контрагент не знайдено (dry-run): ${dilovodPerson.name} (${customerData.customerPhone})`);
        } else {
          warnings.push(`Контрагент не знайдено (dry-run): ${dilovodPerson.name} (без телефону)`);
        }
        logWithTimestamp(`  ⚠️  Контрагент не знайдено в dry-run: ${dilovodPerson.name}`);
      } else {
        if (customerData.customerPhone) {
          warnings.push(`Контрагент знайдено: ${dilovodPerson.name} (${customerData.customerPhone})`);
        } else {
          warnings.push(`Контрагент знайдено: ${dilovodPerson.name} (без телефону)`);
        }
        logWithTimestamp(`  ✅ Контрагент знайдено: ${dilovodPerson.name} (ID: ${dilovodPerson.id})`);
      }


      return dilovodPerson;

    } catch (error) {
      const errorMessage = `Помилка роботи з контрагентом: ${error instanceof Error ? error.message : String(error)}`;
      logWithTimestamp(`  ❌ ${errorMessage}`);
      warnings.push(errorMessage);

      // У разі помилки використовуємо fallback з мок-даними
      const fallbackPerson: DilovodPerson = {
        id: '',  // Fallback ID
        code: '',
        name: order.customerName || 'Невідомий клієнт',
        phone: order.customerPhone || '',
        personType: DILOVOD_CONSTANTS.PERSON_TYPE_INDIVIDUAL
      };

      logWithTimestamp(`  ⚠️ Використовуємо fallback контрагента: ${fallbackPerson.name}`);
      warnings.push('Використано резервного контрагента (без id/code) через помилку API');

      return fallbackPerson;
    }
  }

  /**
  * Побудувати табличні частини (товари) - використовуємо прив'язку до Dilovod (products.dilovodId)
   */
  private async buildTableParts(context: ExportBuildContext): Promise<DilovodExportTableParts> {
    logWithTimestamp(`  📦 Формування табличних частин (товари)...`);

    const { order, warnings } = context;
    const tpGoods: DilovodTablePartGood[] = [];

    if (!order.items || order.items.length === 0) {
      warnings.push('Замовлення не містить товарів');
      return { tpGoods };
    }

    let rowNum = 1;
    for (const item of order.items) {
      try {
        const sku = item.sku;
        if (!sku) {
          warnings.push(`Товар "${item.productName || 'Невідомий товар'}" не має SKU`);
          continue;
        }

        // Шукаємо прив'язку Dilovod good в таблиці products за SKU
        const product = await prisma.product.findFirst({
          where: { sku: sku }
        });

        if (!product || !(product as any).dilovodId) {
          warnings.push(`Товар "${item.productName || sku}" (SKU: ${sku}) не знайдено у відповідності Dilovod (products.dilovodId не встановлено). Синхронізуйте товари з Dilovod.`);
          continue;
        }

        const qty = item.quantity || 1;
        const price = item.price || 0;
        const amount = qty * price;

        // Використовуємо good для передачі ID товару з products.dilovodId
        tpGoods.push({
          rowNum,
          good: (product as any).dilovodId, // ID товару в Dilovod для SKU
          unit: DILOVOD_CONSTANTS.UNIT_PIECE,
          qty,
          baseQty: qty,
          priceAmount: amount,
          price,
          amountCur: amount
        });

        logWithTimestamp(`    ✅ Товар #${rowNum}: SKU "${sku}" → good_id "${(product as any).dilovodId}", к-ть: ${qty}, ціна: ${price}`);
        rowNum++;
      } catch (error) {
        warnings.push(`Помилка обробки товару "${item.productName}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    logWithTimestamp(`  ✅ Оброблено ${tpGoods.length} з ${order.items.length} товарів`);

    return { tpGoods };
  }

  /**
   * Завантажити замовлення з бази даних
   */
  private async loadOrder(orderId: string): Promise<any> {
    logWithTimestamp(`  📥 Завантаження замовлення ${orderId}...`);

    // Спочатку пробуємо знайти за точним ID (якщо orderId - число)
    let order = null;
    const numericId = parseInt(orderId);
    
    if (!isNaN(numericId)) {
      order = await prisma.order.findUnique({
        where: { id: numericId }
      });
    }
    
    // Якщо не знайдено за ID - шукаємо за externalId або orderNumber
    if (!order) {
      order = await prisma.order.findFirst({
        where: {
          OR: [
            { externalId: orderId },
            { orderNumber: orderId }
          ]
        }
      });
    }

    if (!order) {
      throw new Error(`Замовлення ${orderId} не знайдено в базі даних`);
    }

    // Парсимо JSON поля
    const parsedOrder = {
      ...order,
      items: order.items ? JSON.parse(order.items) : [],
      rawData: order.rawData ? JSON.parse(order.rawData) : {}
    };

    logWithTimestamp(`  ✅ Замовлення завантажено: ${parsedOrder.orderNumber}, товарів: ${parsedOrder.items.length}, канал: ${parsedOrder.sajt}`);

    return parsedOrder;
  }

  /**
   * Завантажити налаштування Dilovod
   */
  private async loadSettings(): Promise<DilovodSettings> {
    logWithTimestamp(`  ⚙️  Завантаження налаштувань Dilovod...`);

    const config = await getDilovodConfigFromDB();

    // Отримуємо налаштування з settings_base
    const settingsRecords = await prisma.settingsBase.findMany({
      where: {
        category: 'dilovod',
        isActive: true
      }
    });

    const settingsMap = new Map(
      settingsRecords.map(s => [s.key, s.value])
    );

    const parseJson = (val: string | undefined, def: any = null) => {
      if (!val) return def;
      try { return JSON.parse(val); } catch { return def; }
    };

    const settings: DilovodSettings = {
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      storageId: settingsMap.get('dilovod_storage_id'),
      defaultFirmId: settingsMap.get('dilovod_default_firm_id'),
      channelPaymentMapping: parseJson(settingsMap.get('dilovod_channel_payment_mapping'), {}),
      deliveryMappings: parseJson(settingsMap.get('dilovod_delivery_mappings'), []),
      getPersonBy: (settingsMap.get('dilovod_get_person_by') as any) || 'end_user',
      synchronizationInterval: 'daily',
      synchronizationRegularPrice: false,
      synchronizationSalePrice: false,
      synchronizationStockQuantity: false,
      autoSendOrder: false,
      cronSendOrder: false,
      unloadOrderNumberAs: 'dilovod',
      unloadOrderAs: 'sale',
      logSendOrder: true,
      liqpayCommission: false
    };

    logWithTimestamp(`  ✅ Налаштування завантажено. Склад: ${settings.storageId}, Фірма: ${settings.defaultFirmId}`);

    return settings;
  }

  /**
   * Завантажити довідники (рахунки та фірми) з Dilovod
   */
  private async loadDirectories(): Promise<ExportBuildContext['directories']> {
    logWithTimestamp(`  📚 Завантаження довідників Dilovod...`);

    try {
      const dilovodService = new DilovodService();

      // Dilovod API блокує паралельні запити ('multithreadApiSession multithread api request blocked')
      // Тому робимо запити послідовно, як в UI роуті
      const cashAccounts = await dilovodService.getCashAccounts();
      const firms = await dilovodService.getFirms();
      const tradeChanels = await dilovodService.getTradeChanels();
      const paymentForms = await dilovodService.getPaymentForms();

      return {
        cashAccounts: cashAccounts.map((acc: any) => ({
          id: acc.id,
          owner: acc.owner,
          name: acc.name
        })),
        firms: firms.map((firm: any) => ({
          id: firm.id,
          name: firm.name
        })),
        tradeChanels: tradeChanels.map((channel: any) => ({
          id: channel.id,
          id__pr: channel.id__pr,
          code: channel.code
        })),
        paymentForms: paymentForms.map((form: any) => ({
          id: form.id,
          name: form.name
        }))
      };
    } catch (error) {
      logWithTimestamp(`  ⚠️  Помилка завантаження довідників: ${error instanceof Error ? error.message : String(error)}`);
      return {};
    }
  }

  /**
   * Валідувати налаштування перед експортом
   */
  private validateSettings(context: ExportBuildContext): void {
    const { settings, warnings } = context;

    if (!settings.storageId) {
      throw new Error('Не вказано склад для списання (storageId). Перевірте налаштування Dilovod.');
    }

    // Фірма не обов'язкова - буде визначена автоматично за рахунком або використана дефолтна
    if (!settings.defaultFirmId) {
      warnings.push('Не вказано фірму за замовчуванням. Фірма буде визначена автоматично за рахунком.');
    }

    if (!settings.channelPaymentMapping || Object.keys(settings.channelPaymentMapping).length === 0) {
      warnings.push('Мапінг каналів продажів не налаштовано. Використовуються дефолтні значення.');
    }

    logWithTimestamp(`  ✅ Валідація налаштувань пройдена`);
  }

  /**
   * Валідувати критичні дані після побудови заголовка
   * Блокує експорт у разі критичних помилок
   */
  private async validateCriticalData(context: ExportBuildContext, header: any, channelMapping: any, options?: { dryRun?: boolean }): Promise<{ isValid: boolean; criticalErrors: string[] }> {
    const { order, settings, directories, warnings } = context;
    const criticalErrors: string[] = [];

    logWithTimestamp(`  🔍 Критична валідація даних експорту...`);

    // Отримуємо зрозумілі назви
    const channelName = this.getChannelDisplayName(order.sajt);
    const paymentMethodName = await this.getPaymentMethodDisplayName(order.rawData?.payment_method);

    // 1. Комплексна перевірка мапінгу методу оплати
    const paymentMethodId = order.rawData?.payment_method;
    if (paymentMethodId && !channelMapping) {
      // Якщо немає мапінгу взагалі
      criticalErrors.push(`Не налаштовано мапінг оплати "${paymentMethodName}" в каналі "${channelName} (${order.sajt})". Перейдіть в налаштування Dilovod → Мапінг каналів оплати.`);
    } else if (channelMapping) {
      // Перевіряємо, чи це готівкова операція (за формою оплати)
      let isCashPayment = false;
      if (channelMapping.paymentForm && directories?.paymentForms) {
        const paymentForm = directories.paymentForms.find(f => f.id === channelMapping.paymentForm);
        if (paymentForm) {
          const formName = paymentForm.name.toLowerCase();
          isCashPayment = formName.includes('готівк') || 
                         formName.includes('cash') || 
                         formName.includes('наличн');
        }
      }

      // Якщо мапінг є, але не всі поля заповнені
      const missingFields = [];
      
      // Для готівкових операцій рахунок не потрібен
      if (!channelMapping.cashAccount && !isCashPayment) {
        missingFields.push('рахунок');
      }
      
      if (!channelMapping.paymentForm) {
        missingFields.push('форму оплати');
      }

      if (missingFields.length > 0) {
        criticalErrors.push(`Неповний мапінг для "${paymentMethodName}" в каналі "${channelName}". Не вказано: ${missingFields.join(', ')}.`);
      } else if (channelMapping.cashAccount && !isCashPayment) {
        // Перевіряємо чи існує рахунок у довідниках (тільки якщо це не готівка і рахунок вказано)
        const accountName = this.getAccountDisplayName(channelMapping.cashAccount, directories);
        const account = directories?.cashAccounts?.find(acc => acc.id === channelMapping.cashAccount);
        if (!account) {
          criticalErrors.push(`Рахунок "${accountName}" не існує в системі Dilovod`);
        }
      }
      
      // Логування для готівкових операцій
      if (isCashPayment) {
        logWithTimestamp(`  💵 Готівкова операція - рахунок не потрібен`);
      }
    }

    // 3. Перевірка наявності фірми
    if (!header.firm) {
      criticalErrors.push('Не налаштовано фірму (організацію) за замовчуванням');
    } else {
      // Перевіряємо чи існує фірма у довідниках
      const firmName = this.getFirmDisplayName(header.firm, directories);
      const firm = directories?.firms?.find(f => f.id === header.firm);
      if (!firm) {
        criticalErrors.push(`Фірма "${firmName}" не існує в системі Dilovod`);
      }
    }

    // 4. Перевірка наявності складу
    if (!header.storage) {
      criticalErrors.push('Не вказано склад для списання товарів');
    }

    // 5. Перевірка наявності контрагента
    if (!header.person?.id) {
      // У режимі dryRun ми не створюємо контрагента і пропускаємо критичну помилку
      // (замість цього буде попередження при формуванні header).
      if (!options?.dryRun) {
        criticalErrors.push('Не вдалося визначити або створити клієнта');
      }
    }

    // 6. Перевірка каналу продажів
    if (!header.tradeChanel) {
      criticalErrors.push(`Не вказано канал продажів для "${channelName}"`);
    }

    // Не додаємо попередження, бо вони уже обробляються вище

    const isValid = criticalErrors.length === 0;

    if (!isValid) {
      logWithTimestamp(`  ❌ Критичні помилки валідації (${criticalErrors.length}):`);
      criticalErrors.forEach((error, index) => {
        logWithTimestamp(`     ${index + 1}. ${error}`);
      });
    } else {
      logWithTimestamp(`  ✅ Критична валідація пройдена успішно`);
    }

    return { isValid, criticalErrors };
  }

  /**
   * Визначити канал продажів (tradeChanel) для документа
   * 
   * Логіка визначення каналу:
   * 1. Ручний мапінг в налаштуваннях каналу (dilovodTradeChannelId) - єдиний надійний спосіб
   * 2. Якщо мапінг не налаштовано - повертаємо пустий рядок
   * 
   * Примітка: Автоматичний пошук за кодом не використовується, оскільки
   * sajt ID не співпадають з tradeChanel.code у системі Dilovod
   * 
   * @param context Контекст побудови експорту
   * @returns ID каналу продажів для Dilovod або пустий рядок
   */
  private determineTradeChanel(context: ExportBuildContext): string {
    const { order, settings, directories, warnings } = context;

    const channelCode = order.sajt;
    if (!channelCode) {
      warnings.push('Канал продажів (sajt) не вказано в замовленні');
      return 'unknown';
    }

    // Перевіряємо ручний мапінг в налаштуваннях каналів (єдиний надійний спосіб)
    const channelSettings = settings.channelPaymentMapping?.[channelCode];
    if (channelSettings?.dilovodTradeChannelId) {
      // Перевіряємо, що цей ID існує в довідниках
      if (directories?.tradeChanels) {
        const mappedChannel = directories.tradeChanels.find(ch => ch.id === channelSettings.dilovodTradeChannelId);
        if (mappedChannel) {
          logWithTimestamp(`  📺 Канал продажів через ручний мапінг: sajt "${channelCode}" → "${mappedChannel.id__pr}" (ID: ${mappedChannel.id})`);
          return mappedChannel.id;
        } else {
          const channelDisplayName = this.getChannelDisplayName(channelCode);
          warnings.push(`Вказаний в мапінгу канал "${channelSettings.dilovodTradeChannelId}" не знайдено в довідниках Dilovod для каналу "${channelDisplayName}"`);
          logWithTimestamp(`  ⚠️  Мапінг каналу невірний: ${channelSettings.dilovodTradeChannelId} не існує`);
        }
      }
    }

    // Якщо ручний мапінг не налаштовано - повертаємо пустий рядок
    const channelDisplayName = this.getChannelDisplayName(channelCode);
    warnings.push(`Канал продажів для "${channelDisplayName}" не визначено. Налаштуйте ручний мапінг у розділі "Налаштування номера замовлення для каналу".`);
    logWithTimestamp(`  ❌ Ручний мапінг каналу не налаштовано для sajt "${channelCode}"`);
    return '';
  }


  /**
   * Визначити фірму для документа
   * Пріоритет:
   * 1. Фірма-власник рахунку (якщо вказано cashAccount)
   * 2. Фірма за замовчуванням з налаштувань
   */
  private async determineFirmId(
    context: ExportBuildContext,
    channelMapping: DilovodChannelMapping | null
  ): Promise<string> {
    const { settings, directories, warnings } = context;

    logWithTimestamp(`  🔍 Визначення фірми: channelMapping=${JSON.stringify({
      cashAccount: channelMapping?.cashAccount,
      paymentForm: channelMapping?.paymentForm,
      salesDrivePaymentMethod: channelMapping?.salesDrivePaymentMethod
    })}`);

    // Якщо є cashAccount - знаходимо його власника з довідників
    if (channelMapping?.cashAccount && directories?.cashAccounts) {
      logWithTimestamp(`  📊 Шукаємо рахунок: ${channelMapping.cashAccount}`);
      const account = directories.cashAccounts.find(acc => acc.id === channelMapping.cashAccount);

      if (!account) {
        const accountDisplayName = this.getAccountDisplayName(channelMapping.cashAccount, directories);
        warnings.push(`Рахунок "${accountDisplayName}" не знайдено в довідниках Dilovod. Використовується фірма за замовчуванням.`);
        logWithTimestamp(`  ⚠️  Рахунок не знайдено в довідниках`);
      } else {
        logWithTimestamp(`  ✅ Рахунок знайдено: ${account.name}, owner=${account.owner}`);
      }

      if (account?.owner) {
        // Перевіряємо чи існує така фірма в довідниках
        logWithTimestamp(`  🔍 Шукаємо фірму-власника: ${account.owner}`);
        logWithTimestamp(`  📋 Всього фірм у довідниках: ${directories.firms?.length || 0}`);

        if (directories.firms && directories.firms.length > 0) {
          logWithTimestamp(`  📋 Перші 3 фірми: ${directories.firms.slice(0, 3).map(f => `${f.name} (${f.id})`).join(', ')}`);
        }

        const firm = directories.firms?.find(f => f.id === account.owner);
        if (firm) {
          logWithTimestamp(`  🏢 Фірма визначена за рахунком: ${firm.name} (${account.owner})`);
          return account.owner;
        } else {
          const firmDisplayName = this.getFirmDisplayName(account.owner, directories);
          logWithTimestamp(`  ❌ Фірма ${account.owner} не знайдена в довідниках!`);
          warnings.push(`Фірма "${firmDisplayName}" (власник рахунку) не знайдена в довідниках. Використовується фірма за замовчуванням.`);
        }
      } else {
        const accountDisplayName = this.getAccountDisplayName(channelMapping.cashAccount, directories);
        logWithTimestamp(`  ⚠️  Рахунок не має власника (owner)`);
        warnings.push(`Рахунок "${accountDisplayName}" не має власника (owner). Використовується фірма за замовчуванням.`);
      }
    } else {
      if (!channelMapping?.cashAccount) {
        logWithTimestamp(`  ⚠️  cashAccount не вказано в мапінгу`);
        warnings.push(`Рахунок не вказано в мапінгу каналу. Використовується фірма за замовчуванням.`);
      }
      if (!directories?.cashAccounts) {
        logWithTimestamp(`  ⚠️  Довідник cashAccounts не завантажено`);
      }
    }

    // Якщо не вдалося визначити за рахунком - використовуємо дефолтну
    if (settings.defaultFirmId) {
      const firmDisplayName = this.getFirmDisplayName(settings.defaultFirmId, directories);
      logWithTimestamp(`  🏢 Використовується фірма за замовчуванням: "${firmDisplayName}" (ID: ${settings.defaultFirmId})`);
      return settings.defaultFirmId;
    }

    // Якщо немає ні рахунку ні дефолтної фірми - помилка
    throw new Error('Не вдалося визначити фірму для документа. Вкажіть фірму за замовчуванням в налаштуваннях Dilovod.');
  }

  /**
   * Витягнути адресу доставки з замовлення
   */
  private extractDeliveryAddress(order: any): string {
    // Спочатку перевіряємо shipping_address
    if (order.rawData?.shipping_address) {
      return order.rawData.shipping_address;
    }

    // Потім перевіряємо ord_delivery_data
    if (order.rawData?.ord_delivery_data) {
      const deliveryDataArray = order.rawData.ord_delivery_data;
      const deliveryData = Array.isArray(deliveryDataArray) ? deliveryDataArray[0] : deliveryDataArray;

      if (deliveryData) {
        const cityName = deliveryData.cityName || '';
        const address = deliveryData.address || '';

        if (cityName && address) {
          return `${cityName}, ${address}`;
        } else if (cityName) {
          return cityName;
        } else if (address) {
          return address;
        }
      }
    }

    // Fallback на deliveryAddress з order
    if (order.deliveryAddress) {
      return order.deliveryAddress;
    }

    return '';
  }

  /**
   * Отримати мапінг каналу продажів
   * 
   * Мапінг визначається за двома параметрами:
   * 1. Канал продажів (sajt) з замовлення
   * 2. Метод оплати (paymentMethod) з замовлення
   * 
   * Приклад: канал "1" + метод "LiqPay" → форма оплати "Безготівка" + рахунок "Monobank"
   */
  private async getChannelMapping(context: ExportBuildContext): Promise<DilovodChannelMapping | null> {
    const { order, settings, warnings } = context;

    const channelId = order.sajt;
    const channelName = this.getChannelDisplayName(channelId);

    if (!channelId) {
      warnings.push('Канал продажів не вказано в замовленні');
      return null;
    }

    const channelSettings = settings.channelPaymentMapping?.[channelId];
    if (!channelSettings) {
      warnings.push(`Мапінг не налаштовано для каналу "${channelName}"`);
      return null;
    }

    // Отримуємо ID методу оплати з rawData (числовий ID з SalesDrive API)
    let paymentMethodId: number | undefined;

    try {
      const rawData = typeof order.rawData === 'string' ? JSON.parse(order.rawData) : order.rawData;
      paymentMethodId = rawData?.payment_method;
    } catch (error) {
      warnings.push(`Помилка парсингу rawData для отримання payment_method: ${error instanceof Error ? error.message : String(error)}`);
    }

    const paymentMethodName = await this.getPaymentMethodDisplayName(paymentMethodId);

    if (!paymentMethodId) {
      warnings.push(`Метод оплати не вказано в замовленні з каналу "${channelName}"`);
      return null;
    }

    const mapping = channelSettings.mappings?.find(m =>
      m.salesDrivePaymentMethod === paymentMethodId
    );

    if (!mapping) {
      warnings.push(`Мапінг не налаштовано для "${paymentMethodName}" в каналі "${channelName}"`);
      return null;
    }

    // Перевірка наявності обов'язкових полів
    const channelDisplayName = this.getChannelDisplayName(channelId);
    const paymentMethodDisplayName = await this.getPaymentMethodDisplayName(paymentMethodId);

    if (!mapping.paymentForm) {
      warnings.push(`Форма оплати не вказана в мапінгу для каналу "${channelDisplayName}", метод "${paymentMethodDisplayName}"`);
    }

    if (!mapping.cashAccount) {
      warnings.push(`Рахунок не вказаний в мапінгу для каналу "${channelDisplayName}", метод "${paymentMethodDisplayName}"`);
    }

    logWithTimestamp(
      `  🔗 Мапінг знайдено: канал "${channelDisplayName}" (ID: ${channelId}), метод "${paymentMethodDisplayName}" (ID: ${paymentMethodId}) → ` +
      `форма оплати "${mapping.paymentForm}", рахунок "${mapping.cashAccount}"`
    );

    return mapping;
  }

  /**
   * Отримати мапінг способу доставки
   * 
   * Мапінг визначається за способом доставки (shippingMethod) з замовлення
   * На основі налаштованих deliveryMappings знаходимо відповідний ID методу доставки в Dilovod
   * 
   * @param context Контекст побудови експорту
   * @returns ID способу доставки для Dilovod або пустий рядок
   */
  private getDeliveryMethodMapping(context: ExportBuildContext): string {
    const { order, settings, warnings } = context;

    const shippingMethod = order.shippingMethod;
    if (!shippingMethod) {
      warnings.push('Спосіб доставки (shippingMethod) не визначено в замовленні');
      return '';
    }

    // Перевіряємо налаштування мапінгу способів доставки
    const deliveryMappings = settings.deliveryMappings;
    if (!deliveryMappings || deliveryMappings.length === 0) {
      warnings.push('Мапінги способів доставки не налаштовано. Використовуйте розділ "Мапінг способів доставки" в налаштуваннях Dilovod.');
      logWithTimestamp(`  ❌ Мапінги способів доставки не налаштовано`);
      return '';
    }

    // Знаходимо мапінг, який містить наш shippingMethod
    const mapping = deliveryMappings.find(m =>
      m.salesDriveShippingMethods &&
      m.salesDriveShippingMethods.includes(shippingMethod)
    );

    if (!mapping) {
      warnings.push(
        `Мапінг для способу доставки "${shippingMethod}" не знайдено. ` +
        `Налаштуйте мапінг у розділі "Мапінг способів доставки".`
      );
      logWithTimestamp(`  ❌ Мапінг для способу доставки "${shippingMethod}" не знайдено`);
      return '';
    }

    if (!mapping.dilovodDeliveryMethodId) {
      warnings.push(
        `ID способу доставки Dilovod не вказано в мапінгу для "${shippingMethod}".`
      );
      logWithTimestamp(`  ❌ ID способу доставки Dilovod не вказано в мапінгу`);
      return '';
    }

    logWithTimestamp(
      `  🚚 Мапінг способу доставки: "${shippingMethod}" → Dilovod ID ${mapping.dilovodDeliveryMethodId}`
    );

    return mapping.dilovodDeliveryMethodId;
  }

  /**
   * Отримати зрозумілу назву каналу продажів
   */
  private getChannelDisplayName(channelId: string): string {
    const channelNames: { [key: string]: string } = {
      '19': 'NK Food Shop (сайт)',
      '22': 'Rozetka (Сергій)',
      '24': 'prom (old)',
      '28': 'prom',
      '31': 'інше (менеджер)',
      '38': 'дрібні магазини',
      '39': 'Rozetka (Марія)'
    };

    return channelNames[channelId] || `Канал #${channelId}`;
  }

  /**
   * Отримати зрозумілу назву методу оплати
   * 
   * Спочатку пробуємо отримати назву з SalesDrive API через сервіс,
   * якщо не вдається - використовуємо статичний словник
   */
  private async getPaymentMethodDisplayName(paymentMethodId: number | undefined): Promise<string> {
    if (!paymentMethodId) {
      return 'Невідомий метод оплати';
    }

    try {
      // Спробуємо отримати назву з SalesDrive API
      const { salesDriveService } = await import('../salesDriveService.js');
      const paymentMethods = await salesDriveService.fetchPaymentMethods();
      const method = paymentMethods.find(m => m.id === paymentMethodId);

      if (method) {
        return `${method.name} (ID: ${paymentMethodId})`;
      }
    } catch (error) {
      logWithTimestamp(`  ⚠️  Не вдалося отримати назву методу оплати з SalesDrive API: ${error}`);
    }

    // Fallback на статичний словник
    const paymentMethodNames: { [key: number]: string } = {
      14: 'Plata by Mono',
      13: 'LiqPay',
      12: 'Післяплата',
      15: 'Готівка',
      21: 'Card',
      23: 'Apple Pay',
      25: 'Наложений платіж',
      27: 'Пром-оплата',
      29: 'Google Pay',
      30: 'Credit'
    };

    const fallbackName = paymentMethodNames[paymentMethodId];
    return fallbackName ? `${fallbackName} (ID: ${paymentMethodId})` : `Невідомий метод оплати (ID: ${paymentMethodId})`;
  }

  /**
   * Отримати зрозумілу назву рахунку з довідників
   */
  private getAccountDisplayName(accountId: string, directories: ExportBuildContext['directories']): string {
    if (!directories?.cashAccounts) {
      return accountId;
    }

    const account = directories.cashAccounts.find(acc => acc.id === accountId);
    return account ? account.name : accountId;
  }

  /**
   * Отримати зрозумілу назву фірми з довідників
   */
  private getFirmDisplayName(firmId: string, directories: ExportBuildContext['directories']): string {
    if (!directories?.firms) {
      return firmId;
    }

    const firm = directories.firms.find(f => f.id === firmId);
    return firm ? firm.name : firmId;
  }

}

// Експортуємо singleton
export const dilovodExportBuilder = new DilovodExportBuilder();
