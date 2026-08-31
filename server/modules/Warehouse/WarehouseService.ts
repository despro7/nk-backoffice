import { prisma } from '../../lib/utils.js';
import type { WarehouseProductByBarcodeResponse } from '../../../shared/types/warehouse.js';
import { isUsableDilovodBatchId } from '../../../shared/utils/dilovodBatchId.js';
import { WarehouseMovement, WarehouseMovementItem, StockUpdateResult, WarehouseMapping } from './WarehouseTypes.js';
import type { PayloadMovementProduct } from './WarehousePayloadBuilder.js';
import { catalogOpsLookup } from '../Products/CatalogOpsLookup.js';

export class WarehouseService {
  // Парсить JSON-поле items з відповіді Prisma.
  // Prisma зберігає items як JSON.stringify(array) → рядок, тому потрібно розпарсити назад у масив.
  static parseItems(raw: any): WarehouseMovementItem[] {
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return []; }
    }
    if (Array.isArray(raw)) return raw as unknown as WarehouseMovementItem[];
    return [];
  }

  // Отримати warehouseMapping з settings_base
  static async getWarehouseMapping(): Promise<WarehouseMapping> {
    try {
      const setting = await prisma.settingsBase.findUnique({
        where: { key: 'warehouseMapping' }
      });
      if (setting && setting.value) {
        return JSON.parse(setting.value);
      }
    } catch (error) {
      console.warn('⚠️ [WarehouseService] Failed to load warehouseMapping from settings_base:', error);
    }
    // Дефолтне значення
    return {
      "Основний склад": "1",
      "Малий склад": "2"
    };
  }

  // Створення документа переміщення.
  // internalDocNumber генерується атомарно на основі id запису (авто-інкремент БД),
  // тому race condition при одночасному створенні двома юзерами неможливий.
  static async createMovement(data: {
    items: WarehouseMovementItem[];
    sourceWarehouse: string;
    destinationWarehouse: string;
    notes?: string;
    createdBy: number;
    movementDate?: Date;
    docNumber?: string;
    dilovodDocId?: string;
  }): Promise<WarehouseMovement> {
    // Крок 1: створюємо запис з унікальним тимчасовим номером
    const tmp = await prisma.warehouseMovement.create({
      data: {
        internalDocNumber: `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        items: JSON.stringify(data.items),
        sourceWarehouse: data.sourceWarehouse,
        destinationWarehouse: data.destinationWarehouse,
        notes: data.notes,
        createdBy: data.createdBy,
        movementDate: data.movementDate,
        ...(data.docNumber != null && { docNumber: data.docNumber }),
        ...(data.dilovodDocId != null && { dilovodDocId: data.dilovodDocId }),
      }
    });

    // Крок 2: одразу оновлюємо internalDocNumber на базі id (гарантовано унікальний)
    const result = await prisma.warehouseMovement.update({
      where: { id: tmp.id },
      data: { internalDocNumber: `П-${tmp.id.toString().padStart(5, '0')}` },
    });

    // Перетворюємо JsonValue в WarehouseMovementItem[]
    return {
      ...result,
      items: WarehouseService.parseItems(result.items)
    } as unknown as WarehouseMovement;
  }

  // Оновлення документа
  static async updateMovement(id: number, data: {
    items?: WarehouseMovementItem[];
    status?: string;
    notes?: string;
    movementDate?: Date;
  }): Promise<WarehouseMovement> {
    const updateData: any = {
      draftLastEditedAt: new Date()
    };

    if (data.items !== undefined) {
      updateData.items = JSON.stringify(data.items);
    }
    if (data.status !== undefined) {
      updateData.status = data.status;
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }
    if (data.movementDate !== undefined) {
      updateData.movementDate = data.movementDate;
    }

    const result = await prisma.warehouseMovement.update({
      where: { id },
      data: updateData
    });

    // Перетворюємо JsonValue в WarehouseMovementItem[]
    return {
      ...result,
      items: WarehouseService.parseItems(result.items)
    } as unknown as WarehouseMovement;
  }

  /** Позначити документ переміщення як видалений у Dilovod (delMark). */
  static async markDilovodMovementDeleted(dilovodDocId: string): Promise<{
    success: boolean;
    notFound: boolean;
    error?: string;
  }> {
    const { dilovodExportFlowService } = await import('../../services/dilovod/index.js');
    const payload = { saveType: 2, header: { id: dilovodDocId, delMark: 1 } };
    const exportResult = await dilovodExportFlowService.send({
      payload,
      dryRun: false,
      warnings: [],
      label: '[WarehouseMovement]',
    });
    if (exportResult.success) {
      return { success: true, notFound: false };
    }
    const msg = String(
      exportResult.error
      || (exportResult.dilovodResponse as { error?: string; message?: string } | undefined)?.error
      || (exportResult.dilovodResponse as { message?: string } | undefined)?.message
      || 'Unknown error',
    );
    const lower = msg.toLowerCase();
    const notFound = lower.includes('not found')
      || lower.includes('object with id')
      || lower.includes('не знайдено')
      || lower.includes('не знайден');
    return { success: false, notFound, error: msg };
  }

  // Відправка в Dilovod
  static async sendToDilovod(id: number, dilovodDocNumber: string): Promise<WarehouseMovement> {
    const result = await prisma.warehouseMovement.update({
      where: { id },
      data: {
        status: 'sent',
        notes: dilovodDocNumber, // Зберігаємо номер документа Dilovod в notes
        sentToDilovodAt: new Date()
      }
    });

    // Перетворюємо JsonValue в WarehouseMovementItem[]
    return {
      ...result,
      items: WarehouseService.parseItems(result.items)
    } as unknown as WarehouseMovement;
  }

  // Отримання всіх документів з пагінацією
  static async getMovements(params: {
    status?: string;
    warehouse?: string;
    page?: number;
    limit?: number;
    /** YYYY-MM-DD — нижня межа по COALESCE(movementDate, draftCreatedAt) */
    from?: string;
    /** YYYY-MM-DD — верхня межа по COALESCE(movementDate, draftCreatedAt) */
    to?: string;
  }) {
    const { status, warehouse, page = 1, limit = 20, from, to } = params;

    const where: any = {};
    if (status) where.status = status;
    else where.status = { not: 'deleted' };
    if (warehouse) {
      where.OR = [
        { sourceWarehouse: warehouse },
        { destinationWarehouse: warehouse }
      ];
    }

    if (from || to) {
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (from) {
        dateFilter.gte = new Date(`${from}T00:00:00`);
      }
      if (to) {
        dateFilter.lte = new Date(`${to}T23:59:59.999`);
      }

      // COALESCE(movementDate, draftCreatedAt) у межах діапазону
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { movementDate: dateFilter },
            {
              AND: [
                { movementDate: null },
                { draftCreatedAt: dateFilter },
              ],
            },
          ],
        },
      ];
    }

    const skip = (page - 1) * limit;

    const [movements, total] = await Promise.all([
      prisma.warehouseMovement.findMany({
        where,
        orderBy: { draftCreatedAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.warehouseMovement.count({ where })
    ]);

    return {
      movements,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // Отримання документа за ID
  static async getMovementById(id: number): Promise<WarehouseMovement | null> {
    const result = await prisma.warehouseMovement.findUnique({
      where: { id }
    });

    if (!result) return null;

    // Преобразуем JsonValue в WarehouseMovementItem[]
    return {
      ...result,
      items: WarehouseService.parseItems(result.items)
    } as unknown as WarehouseMovement;
  }

  // Отримати товари для переміщення між складами
  static async getProductsForMovement(asOfDate?: Date) {
    try {
      console.log('🏭 [WarehouseService] Отримання товарів для переміщення...');

      // Отримуємо товари та комплекти з бази даних
      const opsProducts = await catalogOpsLookup.listFinishedProducts({ includeOutdated: true });
      const products = opsProducts.map((p) => ({
        sku: p.sku,
        name: p.name,
        portionsPerBox: p.portionsPerBox,
        stockBalanceByStock: p.stockBalanceByStockRaw,
        barcode: p.barcode,
        dilovodId: p.dilovodId,
        isOutdated: p.isOutdated,
        set: p.set,
      }));

      console.log(`🏭 [WarehouseService] Знайдено ${products.length} активних товарів`);

      // Якщо передана дата — запитуємо з Dilovod історичні залишки для всіх SKU,
      // інакше використовуємо значення з БД (stockBalanceByStock)
      let balancesFromApi: Array<any> | null = null;
      if (asOfDate) {
        try {
          const { dilovodService } = await import('../../services/dilovod/DilovodService.js');
          balancesFromApi = await dilovodService.getStockBalanceForSkus(products.map(p => p.sku), asOfDate);
        } catch (err) {
          console.warn('⚠️ [WarehouseService] Не вдалося отримати historical balances from Dilovod:', err);
          balancesFromApi = null;
        }
      }

      const productsWithStock = products
        .map(product => {
          try {
            let mainStockPortions = 0;
            let smallStockPortions = 0;

            if (balancesFromApi && Array.isArray(balancesFromApi)) {
              const found = balancesFromApi.find((b: any) => b.sku === product.sku);
              if (found) {
                mainStockPortions = found.mainStorage ?? 0;
                smallStockPortions = found.smallStorage ?? 0;
              }
            } else {
              const stockBalance = product.stockBalanceByStock
                ? JSON.parse(product.stockBalanceByStock)
                : {};

              // Залишки зберігаються як порції у відповідних складах
              mainStockPortions = stockBalance['1'] || 0; // Порції на основному складі
              smallStockPortions = stockBalance['2'] || 0; // Порції на малому складі
            }

            const parseSetPayload = (raw: unknown): any[] => {
              if (Array.isArray(raw)) return raw;
              if (typeof raw === 'string') {
                try {
                  const parsed = JSON.parse(raw);
                  return Array.isArray(parsed) ? parsed : [];
                } catch {
                  return [];
                }
              }
              return [];
            };

            const componentsSnapshot = parseSetPayload(product.set);
            const isSet = componentsSnapshot.length > 0;

            // Кількість порцій в коробці — береться з БД для кожного товару окремо
            const portionsPerBox = product.portionsPerBox;
            const mainStockBoxes = Math.floor(mainStockPortions / portionsPerBox);
            const mainStockRemainder = mainStockPortions % portionsPerBox;
            const smallStockBoxes = Math.floor(smallStockPortions / portionsPerBox);
            const smallStockRemainder = smallStockPortions % portionsPerBox;


            const totalPortions = (mainStockPortions || 0) + (smallStockPortions || 0);

            // Формуємо об'єкт товару — безпосередньо повернемо всі товари,
            // фільтрацію по застарілим/актуальним проведемо нижче.
            const item = {
              id: product.sku,
              sku: product.sku,
              name: product.name,
              barcode: product.barcode || '',
              dilovodId: product.dilovodId || null,
              portionsPerBox: product.portionsPerBox,
              isSet,
              componentsSnapshot,
              details: {
                batches: [], // Масив партій — порожній при завантаженні
                forecast: 125, // Заглушка
              },
              stockData: {
                mainStock: mainStockPortions, // Порції на основному складі
                smallStock: smallStockPortions, // Порції на малому складі
                sourceStock: 0, // Залишок на складі-джерелі — оновлюється через refreshStockData
                destStock: 0, // Залишок на складі-призначенні — оновлюється через refreshStockData
                displayFormat: {
                  main: `${mainStockBoxes} / ${mainStockRemainder}`,
                  small: `${smallStockBoxes} / ${smallStockRemainder}`,
                },
              },
              isOutdated: !!product.isOutdated,
              _totalPortions: totalPortions,
            };

            return item;
          } catch (error) {
            console.warn(`🚨 [WarehouseService] Failed to parse stockBalanceByStock for product ${product.sku}:`, error);
            console.warn(`🚨 [WarehouseService] Raw data:`, product.stockBalanceByStock);
            return null;
          }
        })
        .filter(Boolean) as any[];

      // Фільтруємо за політикою: показуємо всі актуальні товари (isOutdated = false),
      // та застарілі товари лише якщо їхній totalPortions > 0
      const filtered = productsWithStock.filter(p => !p.isOutdated || (p._totalPortions && p._totalPortions > 0));

      // Видаляємо внутрішнє поле _totalPortions перед віддачею
      filtered.forEach(p => { delete p._totalPortions; });

      console.log(`✅ [WarehouseService] Повернено ${filtered.length} товарів для переміщення (asOfDate=${asOfDate ? asOfDate.toISOString() : 'now'})`);

      return {
        success: true,
        products: filtered
      };
    } catch (error) {
      console.error('🚨 [WarehouseService] Помилка отримання товарів для переміщення:', error);
      throw error;
    }
  }

  /**
   * Пошук товару за ШК: спочатку активний CatalogGoodBarcode, інакше Product.barcode.
   *
   * ШК коробки (таб «Наліпки») ще немає окремого регістра — усі знайдені коди = 'portion'.
   * Коли з’явиться box-код: перевіряти його першим; якщо той самий код є на обох рівнях — пріоритет 'box'.
   */
  static async findProductByBarcode(code: string): Promise<WarehouseProductByBarcodeResponse | null> {
    const trimmed = code.trim();
    if (!trimmed) return null;

    const barcodeRows = await prisma.catalogGoodBarcode.findMany({
      where: { code: trimmed, activity: true },
      include: {
        good: {
          select: { id: true, sku: true, delMark: true, isGroup: true },
        },
      },
    });

    const usableRows = barcodeRows.filter(
      (row) => row.good && !row.good.delMark && !row.good.isGroup,
    );
    const catalogHit =
      usableRows.find((row) => isUsableDilovodBatchId(row.goodPart)) ?? usableRows[0];

    if (catalogHit) {
      const good = catalogHit.good;
      const ops = await catalogOpsLookup.getByDilovodIds([good.id]);
      const product = [...ops.values()][0] ?? (good.sku ? await catalogOpsLookup.getBySku(good.sku) : null);
      if (product) {
        const batchId = isUsableDilovodBatchId(catalogHit.goodPart)
          ? catalogHit.goodPart.trim()
          : null;
        const batchNumber = catalogHit.goodPartName?.trim() || null;
        return WarehouseService.toBarcodeLookupResponse(
          {
            sku: product.sku,
            name: product.name,
            weight: product.weight,
            portionsPerBox: product.portionsPerBox,
            barcode: product.barcode,
          },
          trimmed,
          batchId,
          batchNumber,
        );
      }
    }

    return null;
  }

  static movementLineKey(item: {
    sku?: string;
    batchId?: string;
    batchNumber?: string;
  }): string {
    return `${String(item.sku ?? '').trim()}::${String(item.batchId || item.batchNumber || '').trim()}`;
  }

  static itemSentPortions(item: Record<string, unknown>): number {
    if (item.totalPortions != null && Number.isFinite(Number(item.totalPortions))) {
      return Math.max(0, Number(item.totalPortions));
    }
    return Math.max(0, Number(item.portionQuantity) || 0);
  }

  static itemReceivedPortions(item: Record<string, unknown>, portionsPerBox = 0): number {
    const stored = Number(item.receivedTotalPortions);
    if (Number.isFinite(stored) && stored > 0) {
      return stored;
    }
    const boxes = Number(item.receivedBoxQuantity) || 0;
    const loose = Number(item.receivedPortionQuantity) || 0;
    const perBox = portionsPerBox > 0 ? portionsPerBox : 0;
    if (perBox > 0) {
      return Math.max(0, boxes * perBox + loose);
    }
    return Math.max(0, loose);
  }

  static zeroReceivedFields(items: Record<string, unknown>[]): Record<string, unknown>[] {
    return items.map((item) => ({
      ...item,
      receivedBoxQuantity: 0,
      receivedPortionQuantity: 0,
      receivedTotalPortions: 0,
    }));
  }

  static mergeReceivedItems(
    storedItems: Record<string, unknown>[],
    clientItems: Record<string, unknown>[],
  ): Record<string, unknown>[] {
    const clientByKey = new Map(
      clientItems.map((item) => [WarehouseService.movementLineKey(item), item]),
    );
    const used = new Set<string>();

    const merged: Record<string, unknown>[] = storedItems.map((item) => {
      const key = WarehouseService.movementLineKey(item);
      const client = clientByKey.get(key);
      used.add(key);
      if (!client) {
        return {
          ...item,
          receivedBoxQuantity: Number(item.receivedBoxQuantity) || 0,
          receivedPortionQuantity: Number(item.receivedPortionQuantity) || 0,
          receivedTotalPortions: Number(item.receivedTotalPortions) || 0,
        };
      }
      return {
        ...item,
        receivedBoxQuantity: Number(client.receivedBoxQuantity) || 0,
        receivedPortionQuantity: Number(client.receivedPortionQuantity) || 0,
        receivedTotalPortions: Number(client.receivedTotalPortions) || 0,
      };
    });

    for (const client of clientItems) {
      const key = WarehouseService.movementLineKey(client);
      if (used.has(key)) continue;
      merged.push({
        sku: String(client.sku ?? ''),
        productName: String(client.productName ?? client.sku ?? ''),
        boxQuantity: 0,
        portionQuantity: 0,
        totalPortions: 0,
        batchNumber: client.batchNumber ?? '',
        batchId: client.batchId ?? '',
        batchStorage: client.batchStorage,
        forecast: 0,
        barcode: client.barcode,
        barcodeKind: client.barcodeKind,
        receivedBoxQuantity: Number(client.receivedBoxQuantity) || 0,
        receivedPortionQuantity: Number(client.receivedPortionQuantity) || 0,
        receivedTotalPortions: Number(client.receivedTotalPortions) || 0,
      });
    }

    return merged;
  }

  static buildReceiptDeviations(items: Record<string, unknown>[]): Array<{
    sku: string;
    productName?: string;
    batchNumber: string;
    sentPortions: number;
    receivedPortions: number;
    deviation: number;
  }> {
    return items
      .map((item) => {
        const sentPortions = WarehouseService.itemSentPortions(item);
        const receivedPortions = WarehouseService.itemReceivedPortions(item);
        return {
          sku: String(item.sku ?? ''),
          productName: item.productName != null ? String(item.productName) : undefined,
          batchNumber: String(item.batchNumber || item.batchId || ''),
          sentPortions,
          receivedPortions,
          deviation: receivedPortions - sentPortions,
        };
      })
      .filter((row) => row.deviation !== 0);
  }

  static async fillMissingBatchIds(
    summaryItems: PayloadMovementProduct[],
    sourceWarehouse: string,
  ): Promise<PayloadMovementProduct[]> {
    const needsLookup = summaryItems.some((item) =>
      item.details.batches.some((batch) => !isUsableDilovodBatchId(batch.batchId)),
    );
    if (!needsLookup) return summaryItems;

    const { DilovodService } = await import('../../services/dilovod/DilovodService.js');
    const { getDilovodConfigFromDB } = await import('../../services/dilovod/DilovodUtils.js');
    const dilovodService = new DilovodService();
    const config = await getDilovodConfigFromDB();

    for (const item of summaryItems) {
      const needFill = item.details.batches.some((batch) => !isUsableDilovodBatchId(batch.batchId));
      if (!needFill) continue;

      const batches = await dilovodService.getBatchNumbersBySku(item.sku, config.defaultFirmId);
      const onSource = sourceWarehouse
        ? batches.filter((row) => row.storage === sourceWarehouse)
        : batches;
      const pool = onSource.length > 0 ? onSource : batches;

      for (const batch of item.details.batches) {
        if (isUsableDilovodBatchId(batch.batchId)) continue;
        const byName = pool.find((row) => (
          String(row.batchNumber) === batch.batchNumber
          || String(row.batchId) === batch.batchNumber
        ));
        const usablePool = pool.filter((row) => isUsableDilovodBatchId(row.batchId));
        const picked = (byName && isUsableDilovodBatchId(byName.batchId) ? byName : null)
          ?? [...usablePool].sort((a, b) => (b.quantity || 0) - (a.quantity || 0))[0];
        if (picked && isUsableDilovodBatchId(picked.batchId)) {
          console.log(
            `📦 [Warehouse] SKU ${item.sku}: підставлено goodPart ${picked.batchId}`
            + ` замість «${batch.batchId || batch.batchNumber || ''}»`,
          );
          batch.batchId = String(picked.batchId);
          if (!batch.batchNumber || batch.batchNumber === '0') {
            batch.batchNumber = picked.batchNumber;
          }
        }
      }
    }

    return summaryItems;
  }

  static productIsSet(rawSet: unknown): boolean {
    if (Array.isArray(rawSet)) return rawSet.length > 0;
    if (typeof rawSet !== 'string' || !rawSet.trim()) return false;
    try {
      const parsed = JSON.parse(rawSet);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }

  static buildSummaryItemsFromReceived(
    items: Record<string, unknown>[],
    products: Array<{
      sku: string;
      name: string;
      dilovodId: string | null;
      portionsPerBox: number;
      set: unknown;
    }>,
  ): PayloadMovementProduct[] {
    const productBySku = new Map(products.map((product) => [product.sku, product]));
    const bySku = new Map<string, PayloadMovementProduct>();

    for (const item of items) {
      const sku = String(item.sku ?? '').trim();
      if (!sku) continue;
      const product = productBySku.get(sku);
      const portionsPerBox = product?.portionsPerBox ?? 0;
      const receivedTotal = WarehouseService.itemReceivedPortions(item, portionsPerBox);
      if (receivedTotal <= 0) continue;

      let grouped = bySku.get(sku);
      if (!grouped) {
        grouped = {
          id: sku,
          sku,
          name: product?.name || String(item.productName ?? sku),
          dilovodId: product?.dilovodId ?? null,
          portionsPerBox,
          isSet: WarehouseService.productIsSet(product?.set),
          details: { batches: [] },
        };
        bySku.set(sku, grouped);
      }

      const rawBatchId = String(item.batchId ?? '').trim();
      const batchNumber = String(item.batchNumber || item.batchId || '').trim();
      const numericName = isUsableDilovodBatchId(batchNumber) ? batchNumber : null;

      grouped.details.batches.push({
        batchNumber,
        batchId: isUsableDilovodBatchId(rawBatchId) ? rawBatchId : numericName,
        // qty в payload = boxes * portionsPerBox + portions; для комплектів — лише portions.
        // Кладемо всю прийняту кількість у portions, щоб 0 portionsPerBox не занулив рядок.
        boxes: 0,
        portions: receivedTotal,
      });
    }

    return [...bySku.values()];
  }

  private static toBarcodeLookupResponse(
    product: {
      sku: string;
      name: string;
      weight: number | null;
      portionsPerBox: number;
      barcode: string | null;
    },
    scannedCode: string,
    batchId: string | null,
    batchNumber: string | null,
  ): WarehouseProductByBarcodeResponse {
    return {
      sku: product.sku,
      name: product.name,
      weight: product.weight,
      portionsPerBox: product.portionsPerBox,
      barcode: scannedCode,
      barcodeKind: 'portion',
      batchId,
      batchNumber,
    };
  }
}