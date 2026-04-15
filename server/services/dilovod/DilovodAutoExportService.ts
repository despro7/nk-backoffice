/**
 * DilovodAutoExportService — Автоматичний експорт/відвантаження в Dilovod при зміні статусу
 *
 * Відповідальність:
 * - Перевіряє налаштування autoSendOrder / autoSendSale
 * - Тригериться після зміни статусу замовлення (webhook або cron-синхронізація)
 * - Виконує export (saleOrder) та/або shipment (sale) якщо новий статус входить в список
 * - Повністю ідентична логіка до мануального export/shipment (early-exit, валідація, meta_logs)
 * - Всі помилки логуються, але НЕ кидаються вгору — щоб не зупиняти основний флоу
 */

import { PrismaClient } from '@prisma/client';
import { isDilovodExportError, getDilovodExportErrorMessage, cleanDilovodErrorMessageShort, cleanDilovodErrorMessageFull } from './DilovodUtils.js';
import type { DilovodSettings } from '../../../shared/types/dilovod.js';

const prisma = new PrismaClient();

// TTL кешу налаштувань у мілісекундах (5 хвилин)
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000;

interface AutoExportResult {
  triggered: boolean;
  success: boolean;
  error?: string;
}

interface StatusChangedOrder {
  orderNumber?: string;
  changedFields?: string[];
  // Внутрішній числовий id з нашої БД (якщо є)
  internalId?: number;
}

export class DilovodAutoExportService {
  private settingsCache: { data: DilovodSettings; loadedAt: number } | null = null;

  // Захист від feedback loop: Backoffice → SalesDrive → webhook назад
  private inProgressLocks = new Set<number>();
  private recentTriggers = new Map<number, { initiatedBy: string; at: number }>();
  private readonly DEDUP_COOLDOWN_MS = 5_000; // 5 секунд

  // ======================================================
  // ПУБЛІЧНІ МЕТОДИ (тригери)
  // ======================================================

  /**
   * Тригер при зміні статусу одного замовлення (webhook)
   * @param internalOrderId - числовий id замовлення в нашій БД (order.id)
   * @param newStatus - новий статус рядком (напр. '3', '5')
   * @param initiatedBy - ініціатор ('webhook:status_change' або 'cron:order_sync')
   */
  async processOrderStatusChange(
    internalOrderId: number,
    newStatus: string,
    initiatedBy: string = 'webhook:status_change'
  ): Promise<void> {
    // --- Dedup Guard 1: mutex — пропускаємо якщо вже обробляється ---
    if (this.inProgressLocks.has(internalOrderId)) {
      console.log(
        `⏭️ [AutoExport] Пропускаємо ${initiatedBy} для orderId=${internalOrderId} — вже виконується інша обробка`
      );
      return;
    }

    // --- Dedup Guard 2: cooldown — пропускаємо webhook-відлуння від SalesDrive ---
    const now = Date.now();
    const recentTrigger = this.recentTriggers.get(internalOrderId);
    if (
      recentTrigger &&
      now - recentTrigger.at < this.DEDUP_COOLDOWN_MS &&
      initiatedBy === 'webhook:status_change' &&
      recentTrigger.initiatedBy === 'manual:status_change'
    ) {
      console.log(
        `⏭️ [AutoExport] Пропускаємо webhook:status_change для orderId=${internalOrderId} — дублікат після manual:status_change (${Math.round((now - recentTrigger.at))}ms тому)`
      );
      return;
    }

    // Фіксуємо цей тригер і встановлюємо lock
    this.recentTriggers.set(internalOrderId, { initiatedBy, at: now });
    this.inProgressLocks.add(internalOrderId);

    try {
      const settings = await this.loadSettings();

      // Завантажуємо канал замовлення (sajt) для фільтрації
      const orderChannel = await prisma.order.findUnique({
        where: { id: internalOrderId },
        select: { sajt: true }
      });
      const sajt = orderChannel?.sajt || '';

      // Перевіряємо autoSendOrder (saleOrder)
      if (settings.autoSendOrder) {
        const targetStatuses: string[] = settings.autoSendListSettings || [];
        const targetChannels: string[] = settings.autoSendChannelSettings || [];
        const statusOk = targetStatuses.length === 0 || targetStatuses.includes(newStatus);
        const channelOk = targetChannels.length === 0 || targetChannels.includes(sajt);
        if (statusOk && channelOk) {
          await this.tryAutoExport(internalOrderId, newStatus, settings, initiatedBy);
        }
      }

      // Перевіряємо autoSendSale (sale) — незалежно від autoSendOrder
      if (settings.autoSendSale) {
        const targetStatuses: string[] = settings.autoSendSaleListSettings || [];
        const targetChannels: string[] = settings.autoSendSaleChannelSettings || [];
        const statusOk = targetStatuses.length === 0 || targetStatuses.includes(newStatus);
        const channelOk = targetChannels.length === 0 || targetChannels.includes(sajt);
        if (statusOk && channelOk) {
          await this.tryAutoShipment(internalOrderId, newStatus, settings, initiatedBy);
        }
      }
    } catch (err) {
      console.log(
        `⚠️ [AutoExport] processOrderStatusChange failed for orderId=${internalOrderId}: ${err instanceof Error ? err.message : err}`
      );
    } finally {
      // Знімаємо lock після завершення (успішного або з помилкою)
      this.inProgressLocks.delete(internalOrderId);
    }
  }

  /**
   * Тригер після batch-оновлення замовлень (cron-синхронізація)
   * Приймає масив результатів з updateOrdersBatchSmart
   */
  async processStatusChangedOrders(
    changedOrders: StatusChangedOrder[],
    initiatedBy: string = 'cron:order_sync'
  ): Promise<void> {
    if (changedOrders.length === 0) return;

    try {
      const settings = await this.loadSettings();
      const autoExportEnabled = settings.autoSendOrder;
      const autoShipEnabled = settings.autoSendSale;

      if (!autoExportEnabled && !autoShipEnabled) return;

      console.log(
        `🤖 [AutoExport] Batch trigger: ${changedOrders.length} order(s) with status change (autoExport=${autoExportEnabled}, autoShip=${autoShipEnabled})`
      );

      for (const changed of changedOrders) {
        if (!changed.orderNumber) continue;

        // Отримуємо внутрішній id та актуальний статус з БД
        const dbOrder = await prisma.order.findFirst({
          where: { orderNumber: changed.orderNumber },
          select: { id: true, status: true, sajt: true }
        });

        if (!dbOrder) {
          console.log(`⚠️ [AutoExport] Order ${changed.orderNumber} not found in DB, skipping`);
          continue;
        }

        const currentStatus = dbOrder.status || '';
        const sajt = dbOrder.sajt || '';

        if (autoExportEnabled) {
          const targetStatuses: string[] = settings.autoSendListSettings || [];
          const targetChannels: string[] = settings.autoSendChannelSettings || [];
          const statusOk = targetStatuses.length === 0 || targetStatuses.includes(currentStatus);
          const channelOk = targetChannels.length === 0 || targetChannels.includes(sajt);
          if (statusOk && channelOk) {
            await this.tryAutoExport(dbOrder.id, currentStatus, settings, initiatedBy);
          }
        }

        if (autoShipEnabled) {
          const targetStatuses: string[] = settings.autoSendSaleListSettings || [];
          const targetChannels: string[] = settings.autoSendSaleChannelSettings || [];
          const statusOk = targetStatuses.length === 0 || targetStatuses.includes(currentStatus);
          const channelOk = targetChannels.length === 0 || targetChannels.includes(sajt);
          if (statusOk && channelOk) {
            await this.tryAutoShipment(dbOrder.id, currentStatus, settings, initiatedBy);
          }
        }
      }
    } catch (err) {
      console.log(
        `⚠️ [AutoExport] processStatusChangedOrders failed: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  // ======================================================
  // ПРИВАТНІ МЕТОДИ — ЛОГІКА EXPORT / SHIPMENT
  // ======================================================

  /**
   * Спроба автоматичного export (documents.saleOrder)
   * Повна логіка early-exit — ідентична мануальному /export endpoint
   */
  private async tryAutoExport(
    internalOrderId: number,
    newStatus: string,
    settings: DilovodSettings,
    initiatedBy: string
  ): Promise<AutoExportResult> {
    const orderId = String(internalOrderId);

    // Отримуємо orderNumber заздалегідь — щоб він був доступний і в catch-блоці
    const orderNumberPrefetch = await prisma.order.findUnique({
      where: { id: internalOrderId },
      select: { orderNumber: true }
    }).then(r => r?.orderNumber || null).catch(() => null);

    const orderNumForLog = orderNumberPrefetch || `id=${internalOrderId}`;

    try {
      // Крок 1: Отримуємо замовлення з БД
      const order = await prisma.order.findUnique({
        where: { id: internalOrderId },
        select: {
          id: true,
          orderNumber: true,
          dilovodDocId: true,
          dilovodExportDate: true,
          dilovodSaleExportDate: true,
        }
      });

      if (!order) {
        console.log(`⚠️ [AutoExport/saleOrder] Order id=${internalOrderId} not found in DB`);
        return { triggered: false, success: false, error: 'Order not found' };
      }

      const orderNum = order.orderNumber || orderId;

      // Early-exit 1: вже експортовано
      if (order.dilovodDocId) {
        console.log(
          `ℹ️ [AutoExport/saleOrder] Замовлення ${orderNum} вже експортовано (baseDocId: ${order.dilovodDocId}), пропускаємо`
        );
        return { triggered: false, success: true };
      }

      // Early-exit 2: перевірка в Dilovod API (захист від race condition)
      try {
        const { dilovodService } = await import('./DilovodService.js');
        const existingInDilovod = (await dilovodService.getOrderByNumber([orderNum])).flat();
        if (existingInDilovod.length > 0) {
          const dilovodDoc = existingInDilovod[0];
          console.log(
            `⚠️ [AutoExport/saleOrder] Замовлення ${orderNum} вже існує в Dilovod (id: ${dilovodDoc.id}), синхронізуємо БД`
          );

          console.log(
            `📝 [AutoExport/saleOrder] EARLY-EXIT 2: ПЕРЕД записом дати від Dilovod API: orderId=${internalOrderId}, orderNum=${orderNum}, dilovodDoc.id=${dilovodDoc.id}, dilovodDoc.date=${dilovodDoc.date}`
          );

          await prisma.order.update({
            where: { id: internalOrderId },
            data: {
              dilovodDocId: dilovodDoc.id,
              dilovodExportDate: new Date(dilovodDoc.date || new Date()).toISOString()
            }
          });

          console.log(
            `✅ [AutoExport/saleOrder] EARLY-EXIT 2: ПІСЛЯ запису дати від Dilovod API: orderId=${internalOrderId}, orderNum=${orderNum}, dilovodDocId=${dilovodDoc.id}`
          );

          return { triggered: false, success: true };
        }
      } catch (checkErr) {
        console.log(
          `⚠️ [AutoExport/saleOrder] Не вдалося перевірити наявність в Dilovod API: ${checkErr instanceof Error ? checkErr.message : checkErr}. Продовжуємо.`
        );
      }

      console.log(`🤖 [AutoExport/saleOrder] Автоматичний export замовлення ${orderNum} (статус: ${newStatus}, ініціатор: ${initiatedBy})`);

      // Крок 2: Будуємо payload
      const { dilovodExportBuilder } = await import('./DilovodExportBuilder.js');
      const { payload, warnings } = await dilovodExportBuilder.buildExportPayload(orderId);

      console.log(`✅ [AutoExport/saleOrder] Payload для ${orderNum} сформовано`);

      // Крок 3: Відправляємо в Dilovod
      const { dilovodService } = await import('./DilovodService.js');
      const exportResult = await dilovodService.exportToDilovod(payload);

      const isError = isDilovodExportError(exportResult);
      const errorMessage = isError ? getDilovodExportErrorMessage(exportResult) : '';

      // Крок 4: Зберігаємо в БД при успіху
      if (!isError && exportResult?.id) {
        console.log(
          `📝 [AutoExport/saleOrder] ПЕРЕД записом дати: orderId=${internalOrderId}, orderNum=${orderNum}, isError=${isError}, exportResult.id=${exportResult?.id}`
        );

        await prisma.order.update({
          where: { id: internalOrderId },
          data: {
            dilovodDocId: exportResult.id,
            dilovodExportDate: new Date().toISOString()
          }
        });

        console.log(
          `✅ [AutoExport/saleOrder] ПІСЛЯ запису дати успішно: orderId=${internalOrderId}, orderNum=${orderNum}, dilovodDocId=${exportResult.id}`
        );
      } else {
        console.log(
          `❌ [AutoExport/saleOrder] ПОМИЛКА export замовлення ${orderNum}: isError=${isError}, exportResult?.id=${exportResult?.id}, errorMessage=${errorMessage}`
        );
      }

      // Крок 5: Логуємо в meta_logs
      // Для помилок: записуємо коротку версію в message, повну в data.error
      // Для повідомлення зручніше записувати коротку, читабельну версію помилки
      let metaLogMessage = isError
        ? `[Авто] Помилка export замовлення ${orderNum}: ${
            exportResult?.error
              ? cleanDilovodErrorMessageShort(String(exportResult.error)) || errorMessage
              : errorMessage
          }`
        : `[Авто] Замовлення ${orderNum} успішно експортовано в Dilovod`;

      const metaLogData: any = {
        orderId,
        orderNumber: orderNum,
        triggerStatus: newStatus,
        payload,
        exportResult,
        warnings: warnings.length > 0 ? warnings : undefined,
        // Додаємо індикатор: чи була дата записана в БД при помилці?
        dbUpdateAttempted: !isError && exportResult?.id,
        isError: isError
      };

      // Якщо помилка від Dilovod — додаємо повну версію в data.error
      if (isError && exportResult?.error) {
        metaLogData.error = cleanDilovodErrorMessageFull(String(exportResult.error));
      }

      await dilovodService.logMetaDilovodExport({
        title: 'Auto export result (saleOrder)',
        status: isError ? 'error' : 'success',
        message: metaLogMessage,
        initiatedBy,
        data: metaLogData
      });

      return { triggered: true, success: !isError };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // channel_not_configured — не є помилкою, лише пропускаємо без meta_log
      if (errorMessage.includes('не налаштований для експорту через Dilovod')) {
        console.log(`ℹ️ [AutoExport/saleOrder] Замовлення ${orderNumForLog}: канал не налаштовано, пропускаємо`);
        return { triggered: false, success: true };
      }

      console.log(`❌ [AutoExport/saleOrder] Помилка для замовлення ${orderNumForLog}: ${errorMessage}`);

      // Для критичних помилок (валідація, тощо) — пишемо в meta_logs
      try {
        const { dilovodService } = await import('./DilovodService.js');
        await dilovodService.logMetaDilovodExport({
          title: 'Auto export error (saleOrder)',
          status: 'error',
          message: `[Авто] Помилка export замовлення ${orderNumForLog}: ${errorMessage}`,
          initiatedBy,
          data: { orderId, orderNumber: orderNumberPrefetch, triggerStatus: newStatus, errorMessage }
        });
      } catch { /* ігноруємо помилку логування */ }

      return { triggered: true, success: false, error: errorMessage };
    }
  }

  /**
   * Спроба автоматичного відвантаження (documents.sale)
   * Повна логіка early-exit — ідентична мануальному /shipment endpoint
   */
  private async tryAutoShipment(
    internalOrderId: number,
    newStatus: string,
    settings: DilovodSettings,
    initiatedBy: string
  ): Promise<AutoExportResult> {
    const orderId = String(internalOrderId);

    // Отримуємо orderNumber заздалегідь — щоб він був доступний і в catch-блоці
    const orderNumberPrefetch = await prisma.order.findUnique({
      where: { id: internalOrderId },
      select: { orderNumber: true }
    }).then(r => r?.orderNumber || null).catch(() => null);

    const orderNumForLog = orderNumberPrefetch || `id=${internalOrderId}`;

    try {
      // Крок 1: Отримуємо замовлення з БД
      const order = await prisma.order.findUnique({
        where: { id: internalOrderId },
        select: {
          id: true,
          orderNumber: true,
          dilovodDocId: true,
          dilovodSaleExportDate: true,
          readyToShipAt: true,
        }
      });

      if (!order) {
        console.log(`⚠️ [AutoExport/sale] Order id=${internalOrderId} not found in DB`);
        return { triggered: false, success: false, error: 'Order not found' };
      }

      const orderNum = order.orderNumber || orderId;

      // Early-exit 1: відвантаження вже є
      if (order.dilovodSaleExportDate) {
        console.log(
          `ℹ️ [AutoExport/sale] Замовлення ${orderNum} вже відвантажено (${new Date(order.dilovodSaleExportDate).toLocaleString('uk-UA')}), пропускаємо`
        );
        return { triggered: false, success: true };
      }

      // Early-exit 2: базовий документ відсутній
      if (!order.dilovodDocId) {
        console.log(
          `ℹ️ [AutoExport/sale] Замовлення ${orderNum} ще не має baseDoc (saleOrder не експортовано), пропускаємо shipment`
        );
        return { triggered: false, success: false, error: 'No baseDoc' };
      }

      // Early-exit 3: перевірка в Dilovod API (захист від дублів)
      try {
        const { dilovodService } = await import('./DilovodService.js');
        const existingSaleDocs = await dilovodService.getDocuments([order.dilovodDocId], 'sale');
        if (existingSaleDocs.length > 0) {
          const saleDoc = existingSaleDocs[0];
          const saleCount = existingSaleDocs.length;
          console.log(
            `⚠️ [AutoExport/sale] В Dilovod вже існує ${saleCount} документ(ів) відвантаження для ${orderNum}, синхронізуємо БД`
          );
          
          console.log(
            `📝 [AutoExport/sale] EARLY-EXIT 3: ПЕРЕД записом дати від Dilovod API: orderId=${internalOrderId}, orderNum=${orderNum}, saleDoc.date=${saleDoc.date}, saleCount=${saleCount}`
          );

          await prisma.order.update({
            where: { id: internalOrderId },
            data: {
              dilovodSaleExportDate: new Date(saleDoc.date || new Date()).toISOString(),
              dilovodSaleDocsCount: saleCount
            }
          });

          console.log(
            `✅ [AutoExport/sale] EARLY-EXIT 3: ПІСЛЯ запису дати від Dilovod API: orderId=${internalOrderId}, orderNum=${orderNum}, dilovodSaleExportDate=${new Date(saleDoc.date || new Date()).toISOString()}`
          );

          return { triggered: false, success: true };
        }
      } catch (checkErr) {
        console.log(
          `⚠️ [AutoExport/sale] Не вдалося перевірити documents.sale в Dilovod API: ${checkErr instanceof Error ? checkErr.message : checkErr}. Продовжуємо.`
        );
      }

      console.log(
        `🤖 [AutoExport/sale] Автоматичне відвантаження замовлення ${orderNum} (статус: ${newStatus}, baseDoc: ${order.dilovodDocId}, ініціатор: ${initiatedBy})`
      );

      // Крок 2: Будуємо payload відвантаження
      const { dilovodExportBuilder } = await import('./DilovodExportBuilder.js');
      const { payload: salePayload, warnings } = await dilovodExportBuilder.buildSalePayload(
        orderId,
        order.dilovodDocId
      );

      console.log(`✅ [AutoExport/sale] Payload відвантаження для ${orderNum} сформовано`);

      // Крок 3: Відправляємо в Dilovod
      const { dilovodService } = await import('./DilovodService.js');
      const exportResult = await dilovodService.exportToDilovod(salePayload);

      const isError = isDilovodExportError(exportResult);
      const errorMessage = isError ? getDilovodExportErrorMessage(exportResult) : '';

      // Крок 4: Зберігаємо в БД при успіху — ТІЛЬКИ якщо немає жодної помилки
      if (!isError && exportResult?.id) {
        const shipmentDate = order.readyToShipAt
          ? new Date(order.readyToShipAt).toISOString()
          : new Date().toISOString();

        console.log(
          `📝 [AutoExport/sale] ПЕРЕД записом дати: orderId=${internalOrderId}, orderNum=${orderNum}, isError=${isError}, exportResult.id=${exportResult?.id}, dateToWrite=${shipmentDate}`
        );

        await prisma.order.update({
          where: { id: internalOrderId },
          data: { dilovodSaleExportDate: shipmentDate }
        });

        console.log(
          `✅ [AutoExport/sale] ПІСЛЯ запису дати успішно: orderId=${internalOrderId}, orderNum=${orderNum}, dilovodSaleExportDate=${shipmentDate}`
        );

        const dateSource = order.readyToShipAt ? 'readyToShipAt' : 'поточна дата';
        console.log(
          `✅ [AutoExport/sale] Відвантаження для замовлення ${orderNum} успішно створено (дата: ${dateSource})`
        );
      } else {
        console.log(
          `❌ [AutoExport/sale] ПОМИЛКА відвантаження замовлення ${orderNum}: isError=${isError}, exportResult?.id=${exportResult?.id}, errorMessage=${errorMessage}`
        );
      }

      // Крок 5: Логуємо в meta_logs
      // Для помилок: записуємо коротку версію в message, повну в data.error
      // Для повідомлення зручніше записувати коротку, читабельну версію помилки
      let metaLogMessage = isError
        ? `[Авто] Помилка відвантаження замовлення ${orderNum}: ${
            exportResult?.error
              ? cleanDilovodErrorMessageShort(String(exportResult.error)) || errorMessage
              : errorMessage
          }`
        : `[Авто] Документ відвантаження для замовлення ${orderNum} успішно створено`;

      const metaLogData: any = {
        orderId,
        orderNumber: orderNum,
        triggerStatus: newStatus,
        baseDoc: order.dilovodDocId,
        payload: salePayload,
        exportResult,
        warnings: warnings.length > 0 ? warnings : undefined,
        // Додаємо індикатор: чи була дата записана в БД при помилці?
        dbUpdateAttempted: !isError && exportResult?.id,
        isError: isError
      };

      // Якщо помилка від Dilovod — додаємо повну версію в data.error
      if (isError && exportResult?.error) {
        metaLogData.error = cleanDilovodErrorMessageFull(String(exportResult.error));
      }

      await dilovodService.logMetaDilovodExport({
        title: 'Auto shipment export result (sale)',
        status: isError ? 'error' : 'success',
        message: metaLogMessage,
        initiatedBy,
        data: metaLogData
      });

      return { triggered: true, success: !isError };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      console.log(`❌ [AutoExport/sale] Помилка для замовлення ${orderNumForLog}: ${errorMessage}`);

      try {
        const { dilovodService } = await import('./DilovodService.js');
        await dilovodService.logMetaDilovodExport({
          title: 'Auto shipment error (sale)',
          status: 'error',
          message: `[Авто] Помилка відвантаження замовлення ${orderNumForLog}: ${errorMessage}`,
          initiatedBy,
          data: { orderId, orderNumber: orderNumberPrefetch, triggerStatus: newStatus, errorMessage }
        });
      } catch { /* ігноруємо помилку логування */ }

      return { triggered: true, success: false, error: errorMessage };
    }
  }

  // ======================================================
  // КЕШУВАННЯ НАЛАШТУВАНЬ
  // ======================================================

  private async loadSettings(): Promise<DilovodSettings> {
    const now = Date.now();

    if (this.settingsCache && now - this.settingsCache.loadedAt < SETTINGS_CACHE_TTL_MS) {
      return this.settingsCache.data;
    }

    const rows = await prisma.settingsBase.findMany({
      where: { category: 'dilovod', isActive: true }
    });

    const map = new Map(rows.map(r => [r.key, r.value]));

    const parseBool = (v: string | undefined, def = false) =>
      v === undefined ? def : v === 'true' || v === '1';

    const parseJsonSafe = <T>(v: string | undefined, def: T): T => {
      if (!v) return def;
      try { return JSON.parse(v); } catch { return def; }
    };

    const settings: DilovodSettings = {
      apiUrl: map.get('dilovod_api_url'),
      apiKey: map.get('dilovod_api_key'),
      storageId: map.get('dilovod_storage_id'),
      productsInterval: (map.get('dilovod_products_interval') as DilovodSettings['productsInterval']) || 'daily',
      synchronizationInterval: (map.get('dilovod_synchronization_interval') as DilovodSettings['synchronizationInterval']) || 'daily',
      synchronizationRegularPrice: parseBool(map.get('dilovod_synchronization_regular_price')),
      synchronizationSalePrice: parseBool(map.get('dilovod_synchronization_sale_price')),
      synchronizationStockQuantity: parseBool(map.get('dilovod_synchronization_stock_quantity')),
      ordersInterval: (map.get('dilovod_orders_interval') as DilovodSettings['ordersInterval']) || 'hourly',
      autoSendOrder: parseBool(map.get('dilovod_auto_send_order')),
      autoSendListSettings: parseJsonSafe(map.get('dilovod_auto_send_list_settings'), []),
      autoSendChannelSettings: parseJsonSafe(map.get('dilovod_auto_send_channel_settings'), []),
      autoSendSale: parseBool(map.get('dilovod_auto_send_sale')),
      autoSendSaleListSettings: parseJsonSafe(map.get('dilovod_auto_send_sale_list_settings'), []),
      autoSendSaleChannelSettings: parseJsonSafe(map.get('dilovod_auto_send_sale_channel_settings'), []),
      getPersonBy: (map.get('dilovod_get_person_by') as DilovodSettings['getPersonBy']) || 'end_user',
      defaultFirmId: map.get('dilovod_default_firm_id'),
      channelPaymentMapping: parseJsonSafe(map.get('dilovod_channel_payment_mapping'), {}),
      deliveryMappings: parseJsonSafe(map.get('dilovod_delivery_mappings'), []),
      logSendOrder: parseBool(map.get('dilovod_log_send_order')),
      liqpayCommission: parseBool(map.get('dilovod_liqpay_commission'))
    };

    this.settingsCache = { data: settings, loadedAt: now };
    return settings;
  }

  /**
   * Інвалідація кешу налаштувань (викликати після збереження нових налаштувань)
   */
  invalidateSettingsCache(): void {
    this.settingsCache = null;
    console.log('🔄 [AutoExport] Settings cache invalidated');
  }
}

export const dilovodAutoExportService = new DilovodAutoExportService();
