import { prisma } from '../../lib/utils.js';
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

  // Створення документа переміщення
  static async createMovement(data: {
    internalDocNumber: string;
    items: WarehouseMovementItem[];
    sourceWarehouse: string;
    destinationWarehouse: string;
    notes?: string;
    createdBy: number;
    movementDate?: Date;
    docNumber?: string;
    dilovodDocId?: string;
  }): Promise<WarehouseMovement> {
    const result = await prisma.warehouseMovement.create({
      data: {
        internalDocNumber: data.internalDocNumber,
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
  }) {
    const { status, warehouse, page = 1, limit = 20 } = params;

    const where: any = {};
    if (status) where.status = status;
    if (warehouse) {
      where.OR = [
        { sourceWarehouse: warehouse },
        { destinationWarehouse: warehouse }
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
  static async getProductsForMovement() {
    try {
      console.log('🏭 [WarehouseService] Отримання товарів для переміщення...');

      // Отримуємо товари з бази даних (всі не застарілі)
      const products = await prisma.product.findMany({
        where: {
          AND: [{ isOutdated: false, set: null }]
        },
        select: {
          sku: true,
          name: true,
          portionsPerBox: true,
          stockBalanceByStock: true,
          barcode: true,
          dilovodId: true
        },
        orderBy: { name: 'asc' }
      });

      console.log(`🏭 [WarehouseService] Знайдено ${products.length} активних товарів`);

      // Фільтруємо товари з залишками на основному складі та парсим JSON
      const productsWithStock = products
        .map(product => {
          try {
            const stockBalance = product.stockBalanceByStock
              ? JSON.parse(product.stockBalanceByStock)
              : {};

            // Залишки зберігаються як порції у відповідних складах
            const mainStockPortions = stockBalance["1"] || 0;  // Порції на основному складі
            const smallStockPortions = stockBalance["2"] || 0;   // Порції на малому складі

            // Кількість порцій в коробці — береться з БД для кожного товару окремо
            const portionsPerBox = product.portionsPerBox;
            const mainStockBoxes = Math.floor(mainStockPortions / portionsPerBox);
            const mainStockRemainder = mainStockPortions % portionsPerBox;
            const smallStockBoxes = Math.floor(smallStockPortions / portionsPerBox);
            const smallStockRemainder = smallStockPortions % portionsPerBox;


            // Повертаємо товари з залишком > 0 хоча б на одному складі
            if (mainStockPortions <= 0 && smallStockPortions <= 0) return null;

            return {
              id: product.sku,
              sku: product.sku,
              name: product.name,
              barcode: product.barcode || '',
              dilovodId: product.dilovodId || null,
              portionsPerBox: product.portionsPerBox,
              details: {
                batches: [], // Масив партій — порожній при завантаженні
                forecast: 125, // Заглушка
              },
              stockData: {
                mainStock: mainStockPortions,     // Порції на основному складі
                smallStock: smallStockPortions,   // Порції на малому складі
                displayFormat: {
                  main: `${mainStockBoxes} / ${mainStockRemainder}`,     // "ящики / порції"
                  small: `${smallStockBoxes} / ${smallStockRemainder}`   // "ящики / порції"
                }
              }
            };
          } catch (error) {
            console.warn(`🚨 [WarehouseService] Failed to parse stockBalanceByStock for product ${product.sku}:`, error);
            console.warn(`🚨 [WarehouseService] Raw data:`, product.stockBalanceByStock);
            return null;
          }
        })
        .filter(Boolean);

      console.log(`✅ [WarehouseService] Повернено ${productsWithStock.length} товарів із залишком на хоча б одному складі`);

      return {
        success: true,
        products: productsWithStock
      };
    } catch (error) {
      console.error('🚨 [WarehouseService] Помилка отримання товарів для переміщення:', error);
      throw error;
    }
  }
}