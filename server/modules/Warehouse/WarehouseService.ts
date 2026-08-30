import { prisma } from '../../lib/utils.js';
import type { WarehouseProductByBarcodeResponse } from '../../../shared/types/warehouse.js';
import { WarehouseMovement, WarehouseMovementItem, StockUpdateResult, WarehouseMapping } from './WarehouseTypes.js';

export class WarehouseService {
  // Парсить JSON-поле items з відповіді Prisma.
  // Prisma зберігає items як JSON.stringify(array) → рядок, тому потрібно розпарсити назад у масив.
  private static parseItems(raw: any): WarehouseMovementItem[] {
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
      data: { internalDocNumber: tmp.id.toString().padStart(5, '0') },
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
      const products = await prisma.product.findMany({
        select: {
          sku: true,
          name: true,
          portionsPerBox: true,
          stockBalanceByStock: true,
          barcode: true,
          dilovodId: true,
          isOutdated: true,
          set: true,
        },
        orderBy: { name: 'asc' }
      });

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
      usableRows.find((row) => row.goodPart.trim().length > 0) ?? usableRows[0];

    if (catalogHit) {
      const product = await WarehouseService.findProductForCatalogGood(
        catalogHit.good.id,
        catalogHit.good.sku,
      );
      if (product) {
        const batchId = catalogHit.goodPart.trim() || null;
        const batchNumber = catalogHit.goodPartName?.trim() || null;
        return WarehouseService.toBarcodeLookupResponse(product, trimmed, batchId, batchNumber);
      }
    }

    const productByBarcode = await prisma.product.findFirst({
      where: { barcode: trimmed },
      select: {
        sku: true,
        name: true,
        weight: true,
        portionsPerBox: true,
        barcode: true,
      },
    });

    if (!productByBarcode) return null;

    return WarehouseService.toBarcodeLookupResponse(productByBarcode, trimmed, null, null);
  }

  /** CatalogGood → Product: спочатку dilovodId (= catalog_goods.id), інакше sku. */
  private static async findProductForCatalogGood(
    catalogGoodId: string,
    catalogSku: string | null,
  ) {
    const byDilovodId = await prisma.product.findFirst({
      where: { dilovodId: catalogGoodId },
      select: {
        sku: true,
        name: true,
        weight: true,
        portionsPerBox: true,
        barcode: true,
      },
    });
    if (byDilovodId) return byDilovodId;

    const sku = catalogSku?.trim();
    if (!sku) return null;

    return prisma.product.findUnique({
      where: { sku },
      select: {
        sku: true,
        name: true,
        weight: true,
        portionsPerBox: true,
        barcode: true,
      },
    });
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