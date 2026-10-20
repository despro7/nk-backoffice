// ============================================================================
// MovementHistoryService — Business Logic для отримання історії переміщень
// ============================================================================

import { prisma } from '../../lib/utils.js';
import { DilovodApiClient } from '../../services/dilovod/DilovodApiClient.js';
import type { GoodMovingDocument, GoodMovingDocumentDetails, MovementHistoryResponse } from '../../../shared/types/movement.js';
import type { GetMovementHistoryParams } from './WarehouseTypes.js';
import { catalogOpsLookup } from '../Products/CatalogOpsLookup.js';

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
   * Зберігає/оновлює документи переміщення із Діловода у таблицю warehouse_movement.
   * Використовує upsert — нові документи створює, існуючі оновлює.
   * При оновленні синхронізує: sourceWarehouse, destinationWarehouse, docNumber, movementDate, notes.
   * items оновлюються тільки якщо вони порожні (для нових документів).
   * Розбіжності між items та збереженими даними можна записати в deviations (за потребою).
   * Автора матчимо через dilovodUserId → User.id; якщо не знайдено — createdBy = 0 (система).
   */
  private static async persistDocumentsToDB(
    documents: GoodMovingDocument[],
    fromDate?: string,
  ): Promise<void> {
    if (documents.length === 0) return;

    try {
      // Фільтруємо документи за датою (за замовчуванням останні 7 днів)
      const filteredDocs = fromDate
        ? documents.filter(d => d.date && new Date(d.date) >= new Date(fromDate))
        : documents;

      if (filteredDocs.length === 0) {
        console.log(`💾 [MovementHistoryService] persistDocumentsToDB: 0 документів у діапазоні дат`);
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

      for (const doc of filteredDocs) {
        if (!doc.id) continue;

        const createdBy = userIdByDilovodId.get(doc.author) ?? 0;
        const movementDate = doc.date ? new Date(doc.date) : null;

        // Визначаємо sourceWarehouse і destinationWarehouse залежно від напрямку
        // doc.storage = склад-донор, doc.storageTo = склад-реципієнт
        const sourceWarehouse = doc.storage;
        const destinationWarehouse = doc.storageTo;

        try {
          // Використовуємо upsert: створити новий або оновити існуючий
          // При оновленні синхронізуємо метадані, items оновлюємо тільки якщо порожні
          const result = await prisma.warehouseMovement.upsert({
            where: { dilovodDocId: doc.id },
            create: {
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
            update: {
              // Оновлюємо метадані з Діловода
              docNumber: doc.number ?? null,
              movementDate,
              lastSentToDilovodAt: movementDate,
              notes: doc.remark ?? null,
              sourceWarehouse,
              destinationWarehouse,
              // items НЕ оновлюємо автоматично — лише при ручному запиті користувача
            },
          });

          if (result.id) {
            created++;
          }
        } catch (upsertErr) {
          console.warn(`⚠️ [MovementHistoryService] upsert для doc ${doc.id} не вдався:`, upsertErr);
        }
      }

      console.log(`💾 [MovementHistoryService] persistDocumentsToDB: ${created} оброблених документів`);
    } catch (error) {
      // Помилка персистування не повинна ламати відповідь клієнту
      console.error('🚨 [MovementHistoryService] persistDocumentsToDB error:', error);
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
        ? catalogOpsLookup.listUnique(await catalogOpsLookup.getByDilovodIds(dilovodIds))
        : [];

      const dilovodIdToSku = new Map<string, string>(
        productRows.map((p) => [p.dilovodId, p.sku]),
      );

      // Формуємо items: sku, dilovodId, productName, batchNumber, batchId, portionQuantity
      const items = goods.map((g: any, idx: number) => ({
        sku: dilovodIdToSku.get(g.good) ?? '',
        productName: g.good__pr ?? '',
        dilovodId: g.good ?? '',
        batchNumber: g.batchNumber ?? '',
        batchId: g.goodPart ?? '',
        batchStorage: '',
        boxQuantity: 0,
        portionQuantity: parseFloat(g.qty) || 0,
        forecast: 0,
      }));

      // Оновлюємо запис у БД
      await prisma.warehouseMovement.updateMany({
        where: { dilovodDocId },
        data: { items: JSON.stringify(items) },
      });

      console.log(`💾 [MovementHistoryService] Збережено ${items.length} товарів для doc ${dilovodDocId}`);
    } catch (error) {
      console.error('🚨 [MovementHistoryService] persistDetailsToDB error:', error);
    }
  }

  /**
   * Отримує деталі конкретного документа переміщення з Діловода (getObject).
   * Після отримання зберігає items у БД через persistDetailsToDB.
   * Повертає деталі у форматі GoodMovingDocumentDetails.
   */
  static async getMovementDetails(dilovodDocId: string): Promise<GoodMovingDocumentDetails> {
    const dilovodClient = MovementHistoryService.getDilovodClient();
    await dilovodClient.ensureReady();
    const apiKey = dilovodClient.getApiKey();

    if (!apiKey) {
      throw new Error('Dilovod API Key не налаштовано');
    }

    const request = {
      version: '0.25',
      key: apiKey,
      action: 'getObject',
      params: {
        id: dilovodDocId,
      },
    };

    const response = await dilovodClient.makeRequest(request);

    if (!response || !response.tableParts?.tpGoods) {
      throw new Error(`Деталі для документа ${dilovodDocId} не знайдено в Діловоді`);
    }

    const details = {
      header: response.header ?? {},
      tableParts: response.tableParts ?? { tpGoods: {} },
      misc: response.misc ?? {},
      fromCache: false,
    };

    // Зберігаємо items у БД (з коректним sku через маппінг products)
    await MovementHistoryService.persistDetailsToDB(dilovodDocId, details);

    return details as GoodMovingDocumentDetails;
  }

  private static normalizeHeaderDocument(
    doc: any,
    direction: 'main-to-small' | 'small-to-main',
  ): GoodMovingDocument {
    return {
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
      author__pr: doc.author__pr,
      direction,
    };
  }

  private static normalizeHeaderRows(resp: unknown): any[] {
    if (Array.isArray(resp)) return resp;
    if (resp == null || typeof resp !== 'object') return [];
    const obj = resp as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.rows)) return obj.rows;
    if (Array.isArray(obj.result)) return obj.result;
    if (Object.keys(obj).length === 0) return [];
    return [resp];
  }

  private static readonly GOOD_MOVING_HEADER_FIELDS = {
    id: 'id',
    number: 'number',
    parent: 'parent',
    date: 'date',
    remark: 'remark',
    storage: 'storage',
    storageTo: 'storageTo',
    firm: 'firm',
    author: 'author',
  };

  static async fetchHeaderDocumentsFromDilovod(
    params: GetMovementHistoryParams,
  ): Promise<{ documents: GoodMovingDocument[]; fromDate: string }> {
    const storageSettings = await MovementHistoryService.getStorageSettings();
    const fromDate = params.fromDate || (await MovementHistoryService.getDefaultFromDate());
    const storageId = params.storageId || storageSettings.mainStorageId;
    const storageToId = params.storageToId || storageSettings.smallStorageId;
    const { toDate } = params;

    const dilovodClient = MovementHistoryService.getDilovodClient();
    await dilovodClient.ensureReady();
    const apiKey = dilovodClient.getApiKey();
    if (!apiKey) {
      throw new Error('Dilovod API Key не налаштовано');
    }

    const [responseMainToSmall, responseSmallToMain] = await Promise.all([
      dilovodClient.makeRequest(MovementHistoryService.buildDilovodRequest(
        apiKey, storageId, storageToId, fromDate, toDate,
      )),
      dilovodClient.makeRequest(MovementHistoryService.buildDilovodRequest(
        apiKey, storageToId, storageId, fromDate, toDate,
      )),
    ]);

    const documents: GoodMovingDocument[] = [
      ...MovementHistoryService.normalizeHeaderRows(responseMainToSmall)
        .map((doc) => MovementHistoryService.normalizeHeaderDocument(doc, 'main-to-small')),
      ...MovementHistoryService.normalizeHeaderRows(responseSmallToMain)
        .map((doc) => MovementHistoryService.normalizeHeaderDocument(doc, 'small-to-main')),
    ];

    return { documents, fromDate };
  }

  static async syncHeadersFromDilovod(params: GetMovementHistoryParams): Promise<number> {
    const { documents, fromDate } = await MovementHistoryService.fetchHeaderDocumentsFromDilovod(params);
    await MovementHistoryService.persistDocumentsToDB(documents, fromDate);
    return documents.length;
  }

  static async syncHeadersByDilovodIds(docIds: string[]): Promise<number> {
    const uniqueIds = [...new Set(docIds.map((id) => String(id).trim()).filter(Boolean))];
    if (uniqueIds.length === 0) return 0;

    const dilovodClient = MovementHistoryService.getDilovodClient();
    await dilovodClient.ensureReady();
    const apiKey = dilovodClient.getApiKey();
    if (!apiKey) {
      throw new Error('Dilovod API Key не налаштовано');
    }

    const CHUNK = 40;
    const documents: GoodMovingDocument[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < uniqueIds.length; i += CHUNK) {
      const chunk = uniqueIds.slice(i, i + CHUNK);
      const resp = await dilovodClient.makeRequest({
        version: '0.25',
        key: apiKey,
        action: 'request',
        params: {
          from: 'documents.goodMoving',
          fields: MovementHistoryService.GOOD_MOVING_HEADER_FIELDS,
          filters: [{ alias: 'id', operator: 'IN', value: chunk }],
        },
      });

      for (const row of MovementHistoryService.normalizeHeaderRows(resp)) {
        const id = String(row?.id ?? '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        documents.push(MovementHistoryService.normalizeHeaderDocument(row, 'main-to-small'));
      }
    }

    await MovementHistoryService.persistDocumentsToDB(documents);
    return documents.length;
  }

  /**
   * Отримує історію переміщень з Діловода (v1 — повертає документи клієнту)
   */
  static async getMovementHistory(params: GetMovementHistoryParams): Promise<MovementHistoryResponse> {
    try {
      const storageSettings = await MovementHistoryService.getStorageSettings();
      const fromDate = params.fromDate || (await MovementHistoryService.getDefaultFromDate());
      const storageId = params.storageId || storageSettings.mainStorageId;
      const storageToId = params.storageToId || storageSettings.smallStorageId;
      const { toDate } = params;

      const { documents } = await MovementHistoryService.fetchHeaderDocumentsFromDilovod(params);
      await MovementHistoryService.persistDocumentsToDB(documents, fromDate);

      console.log(`📦 [MovementHistoryService] Синхронізовано ${documents.length} шапок goodMoving`);

      // Збагачуємо документи деталями (items) з локальної БД — одним запитом для всіх.
      // Це дозволяє одразу показувати статистику (кількість товарів, порції) з кешу БД,
      // не вимагаючи відкриття кожного запису. Деталі оновлюються примусово лише
      // кнопкою "Оновити деталі" всередині запису (fetchDetails з force=true).
      const docIds = documents.map(d => d.id).filter(Boolean);
      if (docIds.length > 0) {
        const cachedItems = await prisma.warehouseMovement.findMany({
          where: { dilovodDocId: { in: docIds } },
          select: { dilovodDocId: true, items: true },
        });

        // Будуємо Map для швидкого пошуку items за dilovodDocId
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

      console.log(`📦 [MovementHistoryService] Отримано ${documents.length} документів (з деталями з БД)`);

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
}
