import { PrismaClient } from '@prisma/client';
import { WarehouseMovement, StockMovementHistory, WarehouseMovementItem } from '../../client/types/warehouse';

const prisma = new PrismaClient();

export class WarehouseService {
  // Создание документа перемещения
  static async createMovement(data: {
    internalDocNumber: string;
    items: any[];
    sourceWarehouse: string;
    destinationWarehouse: string;
    notes?: string;
    createdBy: number;
  }): Promise<WarehouseMovement> {
    const result = await prisma.warehouseMovement.create({
      data: {
        ...data,
        items: JSON.stringify(data.items)
      }
    });

    // Преобразуем JsonValue в WarehouseMovementItem[]
    return {
      ...result,
      items: Array.isArray(result.items) ? result.items as unknown as WarehouseMovementItem[] : []
    } as unknown as WarehouseMovement;
  }

  // Обновление документа
  static async updateMovement(id: number, data: {
    items?: any[];
    deviations?: any[];
    status?: string;
    notes?: string;
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

  // Отправка в Dilovod
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

  // Получение всех документов с пагинацией
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

  // Получение документа по ID
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

  // Создание записи в истории движения остатков
  static async createStockMovement(data: {
    productSku: string;
    warehouse: string;
    movementType: string; // Изменено с union type на string
    quantity: number;
    quantityType: string; // Изменено с union type на string
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

    // Возвращаем результат с правильными типами
    return result as StockMovementHistory;
  }

  // Получение истории движения остатков
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

  // Получение текущих остатков по складам
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

    // Получаем последние записи для каждого SKU и склада
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

  // Получение остатка конкретного товара на конкретном складе
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

  // Получить товары для перемещения между складами
  static async getProductsForMovement() {
    try {
      console.log('🏪 [WarehouseService] Получение товаров для перемещения...');

      // Получаем товары из базы данных
      const products = await prisma.product.findMany({
        where: {
          stockBalanceByStock: {
            not: null
          }
        },
        orderBy: { name: 'asc' }
      });

      console.log(`🏪 [WarehouseService] Найдено ${products.length} товаров с остатками`);

      // Фильтруем товары с остатками на основном складе и парсим JSON
      const productsWithStock = products
        .map(product => {
          try {
            const stockBalance = product.stockBalanceByStock
              ? JSON.parse(product.stockBalanceByStock)
              : {};

            // Остатки хранятся как порции в соответствующих складах
            const mainStockPortions = stockBalance["1"] || 0;  // Порции на основном складе
            const kyivStockPortions = stockBalance["2"] || 0;   // Порции на киевском складе
            const smallStockPortions = stockBalance["3"] || 0;  // Порции на малом складе

            // Для отображения конвертируем в формат "ящики / порции"
            const PORTIONS_PER_BOX = 24;
            const mainStockBoxes = Math.floor(mainStockPortions / PORTIONS_PER_BOX);
            const mainStockRemainder = mainStockPortions % PORTIONS_PER_BOX;
            const smallStockBoxes = Math.floor(smallStockPortions / PORTIONS_PER_BOX);
            const smallStockRemainder = smallStockPortions % PORTIONS_PER_BOX;

            

            // Возвращаем только товары с остатками на основном складе
            if (mainStockPortions > 0) {
              return {
                id: product.sku, // Используем SKU как ID
                sku: product.sku,
                name: product.name,
                balance: `${mainStockPortions} / ${smallStockPortions}`, // основной / малый (в порциях)
                details: {
                  boxes: 0, // Прогнозируемое количество ящиков (начальное значение)
                  portions: 0, // Автоматически рассчитывается
                  forecast: 125, // Заглушка, позже зададим логику
                  batchNumber: '' // Номер партии (пока пустой)
                },
                stockData: {
                  mainStock: mainStockPortions,     // Порции на основном складе
                  kyivStock: kyivStockPortions,     // Порции на киевском складе
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

      console.log(`✅ [WarehouseService] Отфильтровано ${productsWithStock.length} товаров с остатками на основном складе`);

      return {
        success: true,
        products: productsWithStock
      };
    } catch (error) {
      console.error('🚨 [WarehouseService] Ошибка получения товаров для перемещения:', error);
      throw error;
    }
  }

  // Обновление остатков при перемещении
  static async processWarehouseMovement(movementId: number) {
    const movement = await this.getMovementById(movementId);
    if (!movement || movement.status !== 'sent') {
      throw new Error('Invalid movement or status');
    }

    const { items, sourceWarehouse, destinationWarehouse } = movement;

    for (const item of items) {
      const { sku, boxQuantity, portionQuantity, batchNumber } = item;

      // Получаем текущие остатки
      const sourceBalance = await this.getProductStock(sku, sourceWarehouse);
      const destBalance = await this.getProductStock(sku, destinationWarehouse);

      // Списываем с исходного склада
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

      // Приходуем на целевой склад
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
