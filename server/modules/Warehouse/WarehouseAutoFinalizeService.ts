/**
 * WarehouseAutoFinalizeService
 *
 * Cron-сервіс автофіналізації активних накладних на переміщення.
 * Запускається о 23:55 щодня.
 *
 * Логіка:
 *  1. Знаходить усі документи зі статусом 'active' або 'draft' (з непорожніми items)
 *  2. Для кожного будує payload і відправляє в Діловод (saveObject)
 *  3. Оновлює статус на 'finalized', фіксує lastSentToDilovodAt
 *  4. Записує результат у meta_logs (category: 'warehouse_movement', status: 'success'/'error')
 */

import { prisma } from '../../lib/utils.js';
import { WarehousePayloadBuilder } from './WarehousePayloadBuilder.js';
import { logServer } from '../../lib/utils.js';

const TAG = '[WarehouseAutoFinalize]';

// ─────────────────────────────────────────────────────────────────────────────

export class WarehouseAutoFinalizeService {

  /**
   * Основний метод: знайти всі незавершені накладні і відправити їх у Діловод.
   * Повертає кількість успішно фіналізованих документів.
   */
  async finalizeActiveMovements(): Promise<{ finalized: number; failed: number }> {
    logServer(`${TAG} Запуск автофіналізації активних накладних...`);

    // Шукаємо всі 'active' і 'draft' документи з items
    const movements = await prisma.warehouseMovement.findMany({
      where: {
        status: { in: ['active', 'draft'] },
        // Враховуємо тільки ті, у кого є хоч якісь items (не порожня чернетка)
        items: { not: null },
      },
    });

    if (movements.length === 0) {
      logServer(`${TAG} Немає активних накладних для фіналізації.`);
      return { finalized: 0, failed: 0 };
    }

    logServer(`${TAG} Знайдено ${movements.length} накладних для фіналізації.`);

    const { DilovodService } = await import('../../services/dilovod/DilovodService.js');
    const dilovodService = new DilovodService();
    const settings = await WarehousePayloadBuilder.loadSettings();

    let finalized = 0;
    let failed = 0;

    for (const movement of movements) {
      try {
        // Парсимо items з JSON
        let rawItems: any[] = [];
        try {
          rawItems = typeof movement.items === 'string'
            ? JSON.parse(movement.items as string)
            : (movement.items as any[]) ?? [];
        } catch {
          logServer(`${TAG} ⚠️  Не вдалось розпарсити items для руху #${movement.id}, пропускаємо.`);
          continue;
        }

        if (!rawItems || rawItems.length === 0) {
          logServer(`${TAG} ⚠️  Рух #${movement.id} не має items, пропускаємо.`);
          continue;
        }

        // Отримуємо dilovodId для кожного SKU з таблиці products
        const skuList = [...new Set(rawItems.map((i: any) => i.sku).filter(Boolean))] as string[];
        const products = await prisma.product.findMany({
          where: { sku: { in: skuList } },
          select: { sku: true, dilovodId: true, portionsPerBox: true, name: true },
        });
        const productMap = Object.fromEntries(products.map(p => [p.sku, p]));

        // Формуємо summaryItems у форматі PayloadMovementProduct
        const summaryItems = rawItems
          .map((item: any) => {
            const product = productMap[item.sku];
            if (!product) return null;
            return {
              id: item.sku,
              sku: item.sku,
              name: product.name,
              dilovodId: product.dilovodId ?? null,
              portionsPerBox: product.portionsPerBox ?? 1,
              details: {
                batches: Array.isArray(item.batches) ? item.batches : [],
              },
            };
          })
          .filter((i): i is NonNullable<typeof i> => i !== null);

        if (summaryItems.length === 0) {
          logServer(`${TAG} ⚠️  Рух #${movement.id}: жоден товар не знайдено в БД, пропускаємо.`);
          continue;
        }

        // Перевіряємо наявність dilovodId у всіх товарів
        const idValidation = WarehousePayloadBuilder.validateDilovodIds(summaryItems);
        if (!idValidation.valid) {
          logServer(`${TAG} ⚠️  Рух #${movement.id}: деякі товари без dilovodId — ${idValidation.errors.join(', ')}`);
          // Продовжуємо — фіналізуємо з тим що є (payload сам відфільтрує)
        }

        // Отримуємо dilovodUserId автора (якщо є)
        const authorDilovodId = movement.createdBy
          ? await WarehousePayloadBuilder.getAuthorDilovodId(movement.createdBy)
          : undefined;

        // Будуємо payload
        const docDate = movement.movementDate ?? movement.draftCreatedAt ?? new Date();
        const payload = await WarehousePayloadBuilder.buildPayload({
          draft: {
            id: movement.id,
            internalDocNumber: movement.internalDocNumber,
            dilovodDocId: movement.dilovodDocId,
            docNumber: movement.docNumber,
            notes: movement.notes,
          },
          summaryItems,
          settings,
          movementDate: docDate,
          authorDilovodId,
        });

        const validation = WarehousePayloadBuilder.validatePayload(payload);
        if (!validation.valid) {
          const errText = validation.errors.join('; ');
          logServer(`${TAG} ❌ Рух #${movement.id}: validation failed — ${errText}`);
          await this.writeLog('error', movement, `Помилка валідації при автофіналізації: ${errText}`);
          failed++;
          continue;
        }

        // Відправляємо в Діловод
        const dilovodResult = await dilovodService.exportToDilovod({
          saveType: payload.saveType,
          header: payload.header,
          tableParts: payload.tableParts,
        });

        if (dilovodResult?.error || dilovodResult?.errorMessage || !dilovodResult?.id) {
          const rawErr = dilovodResult?.error ?? dilovodResult?.errorMessage ?? 'Немає id у відповіді';
          logServer(`${TAG} ❌ Рух #${movement.id}: Діловод повернув помилку — ${rawErr}`);
          await this.writeLog('error', movement, `Діловод відхилив документ при автофіналізації: ${rawErr}`);
          failed++;
          continue;
        }

        // Отримуємо dilovodDocId і docNumber
        const dilovodDocId: string | undefined =
          dilovodResult?.id ?? dilovodResult?.header?.id ?? movement.dilovodDocId ?? undefined;

        let docNumber = movement.docNumber
          ?? dilovodResult?.number
          ?? dilovodResult?.header?.number;

        const isFirstSend = !movement.dilovodDocId && !!dilovodDocId;
        if (isFirstSend && !docNumber) {
          try {
            const docDetails = await dilovodService.getMovementDocument(dilovodDocId!);
            const fetched = docDetails?.header?.number ?? docDetails?.number;
            if (fetched) docNumber = String(fetched);
          } catch (err) {
            logServer(`${TAG} ⚠️  Не вдалось отримати номер з Діловода для руху #${movement.id}: ${err}`);
          }
        }

        // Оновлюємо запис у БД
        const now = new Date();
        await prisma.warehouseMovement.update({
          where: { id: movement.id },
          data: {
            status: 'finalized',
            lastSentToDilovodAt: now,
            ...(isFirstSend && { sentToDilovodAt: now }),
            ...(dilovodDocId && { dilovodDocId }),
            ...(docNumber && { docNumber }),
          },
        });

        logServer(`${TAG} ✅ Рух #${movement.id} (${docNumber ?? dilovodDocId}) фіналізовано.`);

        // Записуємо success-нотифікацію
        await this.writeLog('success', movement, null, docNumber ?? dilovodDocId);
        finalized++;

      } catch (err: any) {
        logServer(`${TAG} ❌ Непередбачена помилка при фіналізації руху #${movement.id}: ${err?.message}`);
        await this.writeLog('error', movement, `Непередбачена помилка: ${err?.message ?? 'Unknown'}`);
        failed++;
      }
    }

    logServer(`${TAG} Завершено: ${finalized} фіналізовано, ${failed} з помилками.`);
    return { finalized, failed };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Запис у meta_logs
  // ─────────────────────────────────────────────────────────────────────────

  private async writeLog(
    status: 'success' | 'error',
    movement: { id: number; docNumber: string | null; internalDocNumber: string; createdBy: number | null },
    errorMessage: string | null,
    resolvedDocNumber?: string | null,
  ): Promise<void> {
    try {
      const docLabel = resolvedDocNumber ?? movement.docNumber ?? movement.internalDocNumber;

      // Отримуємо ім'я автора для повідомлення
      let authorName = 'невідомий';
      if (movement.createdBy) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: movement.createdBy },
            select: { name: true },
          });
          if (user?.name) authorName = user.name;
        } catch { /* ignore */ }
      }

      await prisma.meta_logs.create({
        data: {
          category: 'warehouse_movement',
          status,
          title: status === 'success'
            ? `Автофіналізація накладної №${docLabel}`
            : `Помилка автофіналізації накладної №${docLabel}`,
          message: status === 'success'
            ? `Документ накладної на переміщення **№${docLabel}**, створений користувачем ${authorName}, було автоматично відправлено в Діловод і фіналізовано.`
            : errorMessage ?? 'Невідома помилка',
          initiatedBy: 'cron:warehouse-auto-finalize',
        },
      });
    } catch (err) {
      logServer(`${TAG} ⚠️  Не вдалось записати meta_log: ${err}`);
    }
  }
}

export const warehouseAutoFinalizeService = new WarehouseAutoFinalizeService();
