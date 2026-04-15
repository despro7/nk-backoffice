import { prisma } from '../../lib/utils.js';
import { WarehouseMovement, StockMovementHistory, WarehouseMovementItem, StockUpdateResult, WarehouseMapping, CreateStockMovementHistoryParams, RevertStockMovementParams } from './WarehouseTypes.js';

export class WarehouseService {
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

  // Оновлює залишки товару на складах
  static async updateProductStock(
    sku: string,
    sourceWarehouse: string,
    destinationWarehouse: string,
    portionsQuantity: number
  ): Promise<StockUpdateResult> {
    console.log(`📦 [Stock Update] Оновлення залишку товару ${sku}: ${sourceWarehouse} -> ${destinationWarehouse}, порцій: ${portionsQuantity}`);

    const product = await prisma.product.findUnique({
      where: { sku }
    });

    if (!product) {
      throw new Error(`Товар с SKU ${sku} не знайдено`);
    }

    const warehouseMapping = await this.getWarehouseMapping();

    // Отримуємо ID складів
    const sourceWarehouseId = warehouseMapping[sourceWarehouse] || sourceWarehouse;
    const destinationWarehouseId = warehouseMapping[destinationWarehouse] || destinationWarehouse;

    // Аналізуємо поточні залишки (по частинах)
    const currentStock = product.stockBalanceByStock
      ? JSON.parse(product.stockBalanceByStock)
      : {};

    const sourceStockPortions = currentStock[sourceWarehouseId] || 0;
    const destStockPortions = currentStock[destinationWarehouseId] || 0;

    console.log(`📦 [Stock Update] Поточні залишки:`);
    console.log(`   ${sourceWarehouse} (ID: ${sourceWarehouseId}): ${sourceStockPortions} порцій`);
    console.log(`   ${destinationWarehouse} (ID: ${destinationWarehouseId}): ${destStockPortions} порцій`);

    // Перевіряємо достатність залишків
    if (sourceStockPortions < portionsQuantity) {
      throw new Error(`Недостатньо залишків товару ${sku} на складі ${sourceWarehouse}. Доступно: ${sourceStockPortions} порцій, потрібно: ${portionsQuantity} порцій`);
    }

    // Оновлюємо залишки (працюємо з порціями)
    const newStock = {
      ...currentStock,
      [sourceWarehouseId]: Math.max(0, sourceStockPortions - portionsQuantity),
      [destinationWarehouseId]: destStockPortions + portionsQuantity
    };

    // Зберігаємо оновлені залишки
    await prisma.product.update({
      where: { sku },
      data: {
        stockBalanceByStock: JSON.stringify(newStock),
        updatedAt: new Date()
      }
    });

    console.log(`✅ [Stock Update] Залишки оновлено:`);
    console.log(`   ${sourceWarehouse}: ${sourceStockPortions} -> ${newStock[sourceWarehouseId]} порцій`);
    console.log(`   ${destinationWarehouse}: ${destStockPortions} -> ${newStock[destinationWarehouseId]} порцій`);

    return {
      previousStock: currentStock,
      newStock,
      sourceBalance: sourceStockPortions,
      destBalance: destStockPortions,
      movedPortions: portionsQuantity
    };
  }

  // Створює записи в історії руху залишків
  static async createStockMovementHistory(params: CreateStockMovementHistoryParams): Promise<void> {
    const { sku, sourceWarehouse, destinationWarehouse, movedPortions, boxQuantity, portionQuantity, batchNumber, movementId, userId, stockUpdateResult } = params;

    console.log(`📊 [Movement History] Створення записів історії для ${sku}: переміщено ${movedPortions} порцій`);

    const warehouseMapping = await this.getWarehouseMapping();

    // Отримуємо ID складів
    const sourceWarehouseId = warehouseMapping[sourceWarehouse] || sourceWarehouse;
    const destinationWarehouseId = warehouseMapping[destinationWarehouse] || destinationWarehouse;

    // Списуємо з вихідного складу
    await prisma.stockMovementHistory.create({
      data: {
        productSku: sku,
        warehouse: sourceWarehouse,
        movementType: 'transfer_out',
        quantity: movedPortions,  // Кількість порцій
        quantityType: 'portion',  // Тип: порції
        batchNumber: batchNumber || null,
        referenceId: movementId.toString(),
        referenceType: 'warehouse_movement',
        previousBalance: stockUpdateResult.sourceBalance,
        newBalance: stockUpdateResult.newStock[sourceWarehouseId],
        notes: `Переміщення ${movedPortions} порцій в ${destinationWarehouse}`,
        createdBy: userId
      }
    });

    // Приходуємо на цільовий склад
    await prisma.stockMovementHistory.create({
      data: {
        productSku: sku,
        warehouse: destinationWarehouse,
        movementType: 'transfer_in',
        quantity: movedPortions,  // Кількість порцій
        quantityType: 'portion',  // Тип: порції
        batchNumber: batchNumber || null,
        referenceId: movementId.toString(),
        referenceType: 'warehouse_movement',
        previousBalance: stockUpdateResult.destBalance,
        newBalance: stockUpdateResult.newStock[destinationWarehouseId],
        notes: `Переміщення ${movedPortions} порцій з ${sourceWarehouse}`,
        createdBy: userId
      }
    });

    console.log(`✅ [Movement History] Записи історії створено для ${sku}: ${movedPortions} порцій`);
  }

  // Скасовує переміщення залишків (повертає товари назад на вихідний склад)
  static async revertStockMovement(params: RevertStockMovementParams): Promise<void> {
    const { sku, sourceWarehouse, destinationWarehouse, portionsToReturn, movementId, userId } = params;

    console.log(`🔄 [Stock Revert] Скасовує переміщення товару ${sku}: ${destinationWarehouse} -> ${sourceWarehouse}, порцій: ${portionsToReturn}`);

    const product = await prisma.product.findUnique({
      where: { sku }
    });

    if (!product) {
      throw new Error(`Товар с SKU ${sku} не знайдено`);
    }

    const warehouseMapping = await this.getWarehouseMapping();

    // Отримуємо ID складів
    const sourceWarehouseId = warehouseMapping[sourceWarehouse] || sourceWarehouse;
    const destinationWarehouseId = warehouseMapping[destinationWarehouse] || destinationWarehouse;

    // Парсимо поточні залишки (в порціях)
    const currentStock = product.stockBalanceByStock
      ? JSON.parse(product.stockBalanceByStock)
      : {};

    const sourceStockPortions = currentStock[sourceWarehouseId] || 0;
    const destStockPortions = currentStock[destinationWarehouseId] || 0;

    console.log(`🔄 [Stock Revert] Поточні залишки:`);
    console.log(`   ${sourceWarehouse} (ID: ${sourceWarehouseId}): ${sourceStockPortions} порцій`);
    console.log(`   ${destinationWarehouse} (ID: ${destinationWarehouseId}): ${destStockPortions} порцій`);

    // Перевіряємо достатність залишків на цільовому складі
    if (destStockPortions < portionsToReturn) {
      console.warn(`⚠️ [Stock Revert] Недостатньо залишків на цільовому складі. Доступно: ${destStockPortions} порцій, потрібно: ${portionsToReturn} порцій`);
      // Повертаємо максимально можливу кількість
    }

    // Повертаємо товари назад (працюємо з порціями)
    const actualReturnPortions = Math.min(destStockPortions, portionsToReturn);

    const newStock = {
      ...currentStock,
      [sourceWarehouseId]: sourceStockPortions + actualReturnPortions,
      [destinationWarehouseId]: Math.max(0, destStockPortions - actualReturnPortions)
    };

    // Зберігаємо оновлені залишки
    await prisma.product.update({
      where: { sku },
      data: {
        stockBalanceByStock: JSON.stringify(newStock),
        updatedAt: new Date()
      }
    });

    // Створюємо записи в історії про скасування
    await prisma.stockMovementHistory.create({
      data: {
        productSku: sku,
        warehouse: destinationWarehouse,
        movementType: 'adjustment',
        quantity: -actualReturnPortions,  // Від'ємна кількість порцій
        quantityType: 'portion',
        referenceId: movementId.toString(),
        referenceType: 'warehouse_movement',
        previousBalance: destStockPortions,
        newBalance: newStock[destinationWarehouseId],
        notes: `Скасування переміщення — повернення ${actualReturnPortions} порцій з ${sourceWarehouse}`,
        createdBy: userId
      }
    });

    await prisma.stockMovementHistory.create({
      data: {
        productSku: sku,
        warehouse: sourceWarehouse,
        movementType: 'adjustment',
        quantity: actualReturnPortions,   // Позитивна кількість порцій
        quantityType: 'portion',
        referenceId: movementId.toString(),
        referenceType: 'warehouse_movement',
        previousBalance: sourceStockPortions,
        newBalance: newStock[sourceWarehouseId],
        notes: `Скасування переміщення - повернення ${actualReturnPortions} порцій в ${sourceWarehouse}`,
        createdBy: userId
      }
    });

    console.log(`✅ [Stock Revert] Переміщення скасовано: повернено ${actualReturnPortions} порцій`);
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

    // Преобразуем JsonValue в WarehouseMovementItem[]
    return {
      ...result,
      items: Array.isArray(result.items) ? result.items as unknown as WarehouseMovementItem[] : []
    } as unknown as WarehouseMovement;
  }

  // Оновлення документа
  static async updateMovement(id: number, data: {
    items?: WarehouseMovementItem[];
    deviations?: any[];
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
    if (data.deviations !== undefined) {
      updateData.deviations = JSON.stringify(data.deviations);
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

    // Преобразуем JsonValue в WarehouseMovementItem[]
    return {
      ...result,
      items: Array.isArray(result.items) ? result.items as unknown as WarehouseMovementItem[] : []
    } as unknown as WarehouseMovement;
  }

  // Відправка в Dilovod
  static async sendToDilovod(id: number, dilovodDocNumber: string): Promise<WarehouseMovement> {
    const result = await prisma.warehouseMovement.update({
      where: { id },
      data: {
        status: 'sent',
        notes: dilovodDocNumber, // Сохраняем номер документа Dilovod в notes
        sentToDilovodAt: new Date()
      }
    });

    // Преобразуем JsonValue в WarehouseMovementItem[]
    return {
      ...result,
      items: Array.isArray(result.items) ? result.items as unknown as WarehouseMovementItem[] : []
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
      items: Array.isArray(result.items) ? result.items as unknown as WarehouseMovementItem[] : []
    } as unknown as WarehouseMovement;
  }

  // Створення запису в історії руху залишків
  static async createStockMovement(data: {
    productSku: string;
    warehouse: string;
    movementType: string;
    quantity: number;
    quantityType: string;
    batchNumber?: string;
    referenceId?: string;
    referenceType?: string;
    previousBalance: number;
    newBalance: number;
    notes?: string;
    createdBy?: number;
  }): Promise<StockMovementHistory> {
    const result = await prisma.stockMovementHistory.create({
      data
    });

    return result as StockMovementHistory;
  }

  // Отримання історії руху залишків
  static async getStockHistory(params: {
    sku?: string;
    warehouse?: string;
    movementType?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const { sku, warehouse, movementType, startDate, endDate, page = 1, limit = 50 } = params;

    const where: any = {};
    if (sku) where.productSku = sku;
    if (warehouse) where.warehouse = warehouse;
    if (movementType) where.movementType = movementType;
    if (startDate || endDate) {
      where.movementDate = {};
      if (startDate) where.movementDate.gte = startDate;
      if (endDate) where.movementDate.lte = endDate;
    }

    const skip = (page - 1) * limit;

    const [history, total] = await Promise.all([
      prisma.stockMovementHistory.findMany({
        where,
        orderBy: { movementDate: 'desc' },
        skip,
        take: limit
      }),
      prisma.stockMovementHistory.count({ where })
    ]);

    return {
      history,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // Отримання поточних залишків по складах
  static async getCurrentStock(warehouse?: string) {
    const where: any = {};
    if (warehouse) where.warehouse = warehouse;

    const currentStock = await prisma.stockMovementHistory.groupBy({
      by: ['productSku', 'warehouse'],
      where,
      _max: {
        movementDate: true
      }
    });

    // Отримуємо останні записи для кожного SKU і складу
    const stockData = await Promise.all(
      currentStock.map(async (item) => {
        const lastRecord = await prisma.stockMovementHistory.findFirst({
          where: {
            productSku: item.productSku,
            warehouse: item.warehouse,
            movementDate: item._max.movementDate
          }
        });
        return lastRecord;
      })
    );

    return stockData.filter(Boolean);
  }

  // Отримання залишку конкретного товару на конкретному складі
  static async getProductStock(sku: string, warehouse: string): Promise<number> {
    const lastRecord = await prisma.stockMovementHistory.findFirst({
      where: {
        productSku: sku,
        warehouse: warehouse
      },
      orderBy: {
        movementDate: 'desc'
      }
    });

    return lastRecord ? lastRecord.newBalance : 0;
  }

  // Отримати товари для переміщення між складами
  static async getProductsForMovement() {
    try {
      console.log('🏭 [WarehouseService] Отримання товарів для переміщення...');

      // Отримуємо товари з бази даних
      const products = await prisma.product.findMany({
        where: {
          stockBalanceByStock: {
            not: null
          }
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

      console.log(`🏭 [WarehouseService] Знайдено ${products.length} товарів з залишками`);

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


            // Повертаємо лише товари, які залишилися на головному складі
            if (mainStockPortions > 0) {
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
                  deviation: 0,
                },
                stockData: {
                  mainStock: mainStockPortions,     // Порции на основном складе
                  smallStock: smallStockPortions,   // Порции на малом складе
                  displayFormat: {
                    main: `${mainStockBoxes} / ${mainStockRemainder}`,     // "ящики / порции"
                    small: `${smallStockBoxes} / ${smallStockRemainder}`   // "ящики / порции"
                  }
                }
              };
            }
            return null;
          } catch (error) {
            console.warn(`🚨 [WarehouseService] Failed to parse stockBalanceByStock for product ${product.sku}:`, error);
            console.warn(`🚨 [WarehouseService] Raw data:`, product.stockBalanceByStock);
            return null;
          }
        })
        .filter(Boolean);

      console.log(`✅ [WarehouseService] Відфільтровано ${productsWithStock.length} товарів із залишками на основному складі`);

      return {
        success: true,
        products: productsWithStock
      };
    } catch (error) {
      console.error('🚨 [WarehouseService] Помилка отримання товарів для переміщення:', error);
      throw error;
    }
  }

  // Оновлення залишків при переміщенні
  static async processWarehouseMovement(movementId: number) {
    const movement = await this.getMovementById(movementId);
    if (!movement || movement.status !== 'sent') {
      throw new Error('Invalid movement or status');
    }

    const { items, sourceWarehouse, destinationWarehouse } = movement;

    for (const item of items) {
      const { sku, boxQuantity, portionQuantity, batchNumber } = item;

      // Отримуємо поточні залишки
      const sourceBalance = await this.getProductStock(sku, sourceWarehouse);
      const destBalance = await this.getProductStock(sku, destinationWarehouse);

      // Списуємо з вихідного складу
      await this.createStockMovement({
        productSku: sku,
        warehouse: sourceWarehouse,
        movementType: 'transfer_out',
        quantity: boxQuantity,
        quantityType: 'box',
        batchNumber,
        referenceId: movementId.toString(),
        referenceType: 'warehouse_movement',
        previousBalance: sourceBalance,
        newBalance: sourceBalance - boxQuantity,
        notes: `Перемещение в ${destinationWarehouse}`,
        createdBy: movement.createdBy
      });

      // Приходимо на цільовий склад
      await this.createStockMovement({
        productSku: sku,
        warehouse: destinationWarehouse,
        movementType: 'transfer_in',
        quantity: boxQuantity,
        quantityType: 'box',
        batchNumber,
        referenceId: movementId.toString(),
        referenceType: 'warehouse_movement',
        previousBalance: destBalance,
        newBalance: destBalance + boxQuantity,
        notes: `Перемещение из ${sourceWarehouse}`,
        createdBy: movement.createdBy
      });
    }
  }
}