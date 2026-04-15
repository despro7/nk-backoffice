// ============================================================================
// MovementHistoryService — Business Logic для отримання історії переміщень
// ============================================================================

import { prisma } from '../../lib/utils.js';
import { DilovodApiClient } from '../../services/dilovod/DilovodApiClient.js';
import type { GoodMovingDocument, MovementHistoryResponse } from '../../../shared/types/movement.js';
import type { GetMovementHistoryParams } from './WarehouseTypes.js';

export class MovementHistoryService {
  private static dilovodClient: DilovodApiClient | null = null;

  /**
   * Ініціалізує (або повертає) Dilovod API клієнт
   */
  private static getDilovodClient(): DilovodApiClient {
    if (!MovementHistoryService.dilovodClient) {
      MovementHistoryService.dilovodClient = new DilovodApiClient();
    }
    return MovementHistoryService.dilovodClient;
  }

  /**
   * Отримує налаштування складів з settings_base
   */
  private static async getStorageSettings(): Promise<{
    mainStorageId: string;
    smallStorageId: string;
  }> {
    try {
      const [mainSetting, smallSetting] = await Promise.all([
        prisma.settingsBase.findUnique({
          where: { key: 'dilovod_main_storage_id' }
        }),
        prisma.settingsBase.findUnique({
          where: { key: 'dilovod_small_storage_id' }
        })
      ]);

      return {
        mainStorageId: mainSetting?.value || '1100700000001005',
        smallStorageId: smallSetting?.value || '1100700000001019'
      };
    } catch (error) {
      console.warn('⚠️ [MovementHistoryService] Помилка при отриманні налаштувань складів:', error);
      // Дефолтні значення (якщо налаштування не знайдені)
      return {
        mainStorageId: '1100700000001005',
        smallStorageId: '1100700000001019'
      };
    }
  }

  /**
   * Отримує дату "від" з налаштування або використовує дефолт
   */
  private static async getDefaultFromDate(): Promise<string> {
    try {
      const setting = await prisma.settingsBase.findUnique({
        where: { key: 'movement_history_from_date' }
      });
      
      if (setting?.value) {
        return setting.value;
      }
    } catch (error) {
      console.warn('⚠️ [MovementHistoryService] Помилка при отриманні defaultFromDate:', error);
    }
    
    // Дефолт: останні 6 місяців
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    return sixMonthsAgo.toISOString().split('T')[0] + ' 00:00:00';
  }

  /**
   * Формує запит до Діловода для отримання документів переміщення
   */
  private static buildDilovodRequest(
    apiKey: string,
    mainStorageId: string,
    smallStorageId: string,
    fromDate: string,
    toDate?: string,
  ) {
    const filters: Array<{ alias: string; operator: string; value: string }> = [
      { alias: 'storage',   operator: '=', value: mainStorageId },
      { alias: 'storageTo', operator: '=', value: smallStorageId },
      { alias: 'date',      operator: '>', value: fromDate },
    ];

    if (toDate) {
      filters.push({ alias: 'date', operator: '<', value: toDate });
    }

    return {
      version: '0.25',
      key: apiKey,
      action: 'request',
      params: {
        from: 'documents.goodMoving',
        fields: {
          id: 'id',
          number: 'number',
          parent: 'parent',
          date: 'date',
          remark: 'remark',
          storage: 'storage',
          storageTo: 'storageTo',
          firm: 'firm',
          author: 'author'
        },
        filters,
      }
    };
  }

  /**
   * Зберігає нові документи із Dilovod у таблицю warehouse_movement.
   * Документи, що вже існують у БД (dilovodDocId), пропускаються повністю —
   * щоб не затирати змінені items/deviations.
   * Автора матчимо через dilovodUserId → User.id; якщо не знайдено — createdBy = 0 (система).
   */
  private static async persistDocumentsToDB(
    documents: GoodMovingDocument[],
    sourceWarehouse: string,
    destinationWarehouse: string,
  ): Promise<void> {
    if (documents.length === 0) return;

    try {
      // Збираємо всі dilovodDocId що прийшли
      const incomingIds = documents.map(d => d.id).filter(Boolean);

      // Знаходимо, які вже є в БД — одним запитом
      const existing = await prisma.warehouseMovement.findMany({
        where: { dilovodDocId: { in: incomingIds } },
        select: { dilovodDocId: true },
      });
      const existingIds = new Set(existing.map(r => r.dilovodDocId as string));

      // Фільтруємо: лише нові документи
      const newDocuments = documents.filter(d => d.id && !existingIds.has(d.id));

      if (newDocuments.length === 0) {
        console.log(`💾 [MovementHistoryService] persistDocumentsToDB: 0 нових, ${existingIds.size} вже в БД — нічого не записуємо`);
        return;
      }

      // Завантажуємо мапу dilovodUserId → User.id одним запитом
      const users = await prisma.user.findMany({
        where: { dilovodUserId: { not: null } },
        select: { id: true, dilovodUserId: true },
      });
      const userIdByDilovodId = new Map<string, number>(
        users.map(u => [u.dilovodUserId as string, u.id]),
      );

      let created = 0;
      let skipped = 0;

      for (const doc of newDocuments) {
        const createdBy = userIdByDilovodId.get(doc.author) ?? 0;
        const movementDate = doc.date ? new Date(doc.date) : null;

        try {
          await prisma.warehouseMovement.create({
            data: {
              dilovodDocId: doc.id,
              // internalDocNumber з префіксом "D-" щоб не конфліктувати з власними номерами
              internalDocNumber: `D-${doc.id}`,
              docNumber: doc.number ?? null,
              movementDate,
              sentToDilovodAt: movementDate,
              lastSentToDilovodAt: movementDate,
              status: 'finalized',
              sourceWarehouse,
              destinationWarehouse,
              notes: doc.remark ?? null,
              items: '[]', // деталі завантажуються окремо при розгортанні акордіону
              createdBy,
            },
          });
          created++;
        } catch (createErr) {
          // Не ламаємо весь запит через один проблемний документ
          console.warn(`⚠️ [MovementHistoryService] create для doc ${doc.id} не вдався:`, createErr);
          skipped++;
        }
      }

      console.log(`💾 [MovementHistoryService] persistDocumentsToDB: ${created} нових, ${existingIds.size} вже були в БД, ${skipped} помилок`);
    } catch (error) {
      // Помилка персистування не повинна ламати відповідь клієнту
      console.error('🚨 [MovementHistoryService] persistDocumentsToDB error:', error);
    }
  }

  /**
   * Отримує історію переміщень з Діловода
   */
  static async getMovementHistory(params: GetMovementHistoryParams): Promise<MovementHistoryResponse> {

    try {
      // Отримуємо налаштування складів
      const storageSettings = await MovementHistoryService.getStorageSettings();
      const fromDate = params.fromDate || (await MovementHistoryService.getDefaultFromDate());

      // Використовуємо передані параметри або налаштування
      const storageId = params.storageId || storageSettings.mainStorageId;
      const storageToId = params.storageToId || storageSettings.smallStorageId;
      const { toDate } = params;

      // Отримуємо API Key для запиту
      const dilovodClient = MovementHistoryService.getDilovodClient();
      // Чекаємо, доки клієнт завантажить конфігурацію з БД (race condition при холодному старті)
      await dilovodClient.ensureReady();
      const apiKey = dilovodClient.getApiKey();

      if (!apiKey) {
        throw new Error('Dilovod API Key не налаштовано');
      }

      console.log(`📦 [MovementHistoryService] Параметри запиту:`);
      console.log(`   Склад (з): ${storageId}`);
      console.log(`   Склад (в): ${storageToId}`);
      console.log(`   Дата від: ${fromDate}${toDate ? ` по: ${toDate}` : ''}`);

      // Будуємо запит до Діловода
      const dilovodRequest = MovementHistoryService.buildDilovodRequest(
        apiKey,
        storageId,
        storageToId,
        fromDate,
        toDate,
      );

      // Виконуємо запит до Діловода
      const response = await dilovodClient.makeRequest(dilovodRequest);

      // Нормалізуємо відповідь: Dilovod може повернути {}, null або одиночний об'єкт при 0 результатах
      const responseArray: any[] = Array.isArray(response)
        ? response
        : (response == null ? [] : []);

      console.log(`✅ [MovementHistoryService] Отримано документів від Діловода: ${responseArray.length}`);

      // Типізуємо відповідь
      const documents: GoodMovingDocument[] = responseArray.map((doc: any) => ({
        id: doc.id,
        number: doc.number,
        date: doc.date,
        remark: doc.remark,
        storage: doc.storage,
        storageTo: doc.storageTo,
        firm: doc.firm,
        author: doc.author,
        id__pr: doc.id__pr,
        number__pr: doc.number__pr,
        date__pr: doc.date__pr,
        storage__pr: doc.storage__pr,
        storageTo__pr: doc.storageTo__pr,
        firm__pr: doc.firm__pr,
        author__pr: doc.author__pr
      }));

      // Зберігаємо тільки нові документи в БД (існуючі пропускаються)
      await MovementHistoryService.persistDocumentsToDB(documents, storageId, storageToId);

      // Збагачуємо документи деталями з БД (items) — одним запитом для всіх
      const docIds = documents.map(d => d.id).filter(Boolean);
      if (docIds.length > 0) {
        const cachedItems = await prisma.warehouseMovement.findMany({
          where: { dilovodDocId: { in: docIds } },
          select: { dilovodDocId: true, items: true },
        });

        // Будуємо Map для швидкого пошуку
        const itemsByDocId = new Map<string, string>(
          cachedItems.map(r => [r.dilovodDocId as string, r.items]),
        );

        let enrichedCount = 0;
        for (const doc of documents) {
          const rawItems = itemsByDocId.get(doc.id);
          if (!rawItems || rawItems === '[]') continue;
          try {
            const parsedItems = JSON.parse(rawItems);
            if (!Array.isArray(parsedItems) || parsedItems.length === 0) continue;
            // Формуємо details у форматі GoodMovingDocumentDetails
            const tpGoods = Object.fromEntries(
              parsedItems.map((item: any, idx: number) => [String(idx), {
                id: String(idx),
                rowNum: String(idx + 1),
                good: item.dilovodId ?? '',
                good__pr: item.productName || item.sku,
                sku: item.sku ?? '',
                goodPart__pr: item.batchNumber ?? '',
                goodPart: item.batchId ?? '',
                // unit/unit__pr — одиниця виміру з Діловода, не склад партії. У кеші БД не зберігається.
                unit: '',
                unit__pr: '',
                // Якщо є totalPortions (новий формат від serializeMovementItems) — використовуємо його.
                // Інакше portionQuantity з Діловода-кешу (там зберігається total qty).
                qty: String(item.totalPortions ?? item.portionQuantity ?? 0),
                price: '0',
                amountCost: '0',
                amountCur: '0',
              }]),
            );
            (doc as any).details = {
              header: {},
              tableParts: { tpGoods },
              misc: {},
              fromCache: true,
            };
            enrichedCount++;
          } catch {
            // Некоректний JSON — пропускаємо
          }
        }

        if (enrichedCount > 0) {
          console.log(`📦 [MovementHistoryService] Збагачено ${enrichedCount} документів деталями з БД`);
        }
      }

      return {
        documents,
        total: documents.length,
        filters: {
          storageId,
          storageToId,
          fromDate,
          ...(toDate ? { toDate } : {}),
        }
      };
    } catch (error) {
      console.error('🚨 [MovementHistoryService] Помилка при отриманні історії переміщень:', error);
      throw new Error(`Помилка при отриманні історії переміщень: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Зберігає деталі документа (tpGoods) у поле items запису warehouse_movement.
   * Викликається при першому розгортанні акордіону — щоб не зберігати зайве при простому перегляді списку.
   */
  private static async persistDetailsToDB(
    dilovodDocId: string,
    details: { header: any; tableParts: any; misc: any },
  ): Promise<void> {
    try {
      const goods: any[] = details.tableParts?.tpGoods
        ? Object.values(details.tableParts.tpGoods)
        : [];

      if (goods.length === 0) return;

      // Збираємо Dilovod ID товарів для маппінгу good → sku через таблицю products
      const dilovodIds = goods.map((g: any) => g.good).filter(Boolean);
      const productRows = dilovodIds.length > 0
        ? await prisma.product.findMany({
            where: { dilovodId: { in: dilovodIds } },
            select: { dilovodId: true, sku: true },
          })
        : [];

      // Map: dilovodId → sku
      const dilovodIdToSku = new Map<string, string>(
        productRows
          .filter((p): p is { dilovodId: string; sku: string } => p.dilovodId !== null)
          .map((p) => [p.dilovodId, p.sku]),
      );

      // Формат items — масив MovementItem-подібних об'єктів (достатньо для відображення)
      const items = goods.map((g: any) => {
        const sku = dilovodIdToSku.get(g.good) ?? null;
        if (!sku) {
          console.warn(`⚠️ [MovementHistoryService] SKU не знайдено для dilovodId=${g.good} (${g.good__pr})`);
        }
        return {
          sku: sku ?? '',
          productName: g.good__pr ?? '',
          dilovodId: g.good ?? '',
          batchNumber: g.goodPart__pr ?? '',
          batchId: g.goodPart ?? '',
          // batchStorage: у tpGoods Діловода немає поля "склад партії" — є лише unit (одиниця виміру).
          // Склад партії відомий тільки при ручному виборі через BatchNumbersAutocomplete.
          batchStorage: '',
          boxQuantity: 0,
          portionQuantity: parseFloat(g.qty) || 0,
          forecast: 0,
        };
      });

      await prisma.warehouseMovement.updateMany({
        where: { dilovodDocId },
        data: { items: JSON.stringify(items) },
      });

      console.log(`💾 [MovementHistoryService] persistDetailsToDB: збережено ${items.length} товарів для doc ${dilovodDocId}`);
    } catch (error) {
      console.error('🚨 [MovementHistoryService] persistDetailsToDB error:', error);
    }
  }

  /**
   * Отримує деталі переміщення за ID документа
   */
  static async getMovementDetails(documentId: string) {
    try {
      console.log(`📦 [MovementHistoryService] Запит деталей переміщення ID: ${documentId}`);

      const dilovodClient = MovementHistoryService.getDilovodClient();

      // Отримуємо API Key через клієнт (він вже завантажується під час ініціалізації)
      const apiKey = dilovodClient.getApiKey();
      if (!apiKey) {
        throw new Error('DILOVOD_API_KEY не налаштований');
      }

      // Запит до Діловода для отримання деталей об'єкта
      const request = {
        version: '0.25',
        key: apiKey,
        action: 'getObject',
        params: {
          id: documentId
        }
      };

      console.log(`🔗 [MovementHistoryService] Запит до Діловода: getObject ID=${documentId}`);

      const response = await dilovodClient.makeRequest(request);

      console.log(`✅ [MovementHistoryService] Отримані деталі переміщення ID: ${documentId}`);
      console.log(`📋 [MovementHistoryService] Структура відповіді:`, {
        hasHeader: !!response?.header,
        hasTableParts: !!response?.tableParts,
        hasMisc: !!response?.misc,
        tablePartsKeys: response?.tableParts ? Object.keys(response.tableParts) : []
      });

      const details = {
        header: response?.header || {},
        tableParts: response?.tableParts || {},
        misc: response?.misc || {}
      };

      // Зберігаємо товари (tpGoods) в items запису warehouse_movement
      await MovementHistoryService.persistDetailsToDB(documentId, details);

      return details;
    } catch (error) {
      console.error('🚨 [MovementHistoryService] Помилка при отриманні деталей переміщення:', error);
      throw new Error(`Помилка при отриманні деталей переміщення: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
