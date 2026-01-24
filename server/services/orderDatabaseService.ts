import { id } from 'zod/v4/locales';
import { prisma } from '../lib/utils.js';
import { ordersCacheService } from './ordersCacheService.js';

export interface OrderCreateData {
  id: number; // Обов'язково - SalesDrive ID
  externalId: string;
  orderNumber: string;
  ttn: string;
  quantity: number;
  status: string;
  statusText: string;
  items: any[];
  rawData: any;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  totalPrice?: number;
  orderDate?: string;
  shippingMethod?: string;
  paymentMethod?: string;
  cityName?: string;
  provider?: string;
  pricinaZnizki?: string;
  sajt?: string;
}

export interface OrderUpdateData {
  dilovodExportDate?: Date;
  status?: string;
  statusText?: string;
  items?: any[];
  rawData?: any;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  totalPrice?: number;
  orderDate?: string | Date;
  shippingMethod?: string;
  paymentMethod?: string;
  cityName?: string;
  provider?: string;
  ttn?: string;
  quantity?: number;
  pricinaZnizki?: string;
  sajt?: string;
}

export class OrderDatabaseService {
  /**
   * Smart-перевірка змін у замовленні
   */
  detectOrderChanges(existingOrder: any, newData: any): { fields: string[], details: any } {
    const changes: string[] = [];
    const changeDetails: any = {};
    const fieldsToCheck = [
      'status', 'statusText', 'ttn', 'quantity', 'customerName', 'customerPhone',
      'deliveryAddress', 'totalPrice', 'shippingMethod', 'paymentMethod',
      'cityName', 'provider', 'pricinaZnizki', 'sajt'
    ];

    // console.log(`🔍 [DEBUG] Detecting changes for order ${newData.orderNumber || existingOrder.externalId}`);

    // Перевіряємо прості поля
    for (const field of fieldsToCheck) {
      if (newData[field] !== undefined && existingOrder[field] !== newData[field]) {
        console.log(`🔄 [DEBUG] Field '${field}' changed: '${existingOrder[field]}' → '${newData[field]}'`);
        changes.push(field);
        changeDetails[field] = {
          oldValue: existingOrder[field],
          newValue: newData[field]
        };
      }
    }

    // Перевіряємо orderDate
    if (newData.orderDate) {
      // Використовуємо локальну дату для правильного порівняння
      const getLocalDateString = (date: string | Date) => {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const newDate = getLocalDateString(newData.orderDate);
      const existingDate = existingOrder.orderDate ? getLocalDateString(existingOrder.orderDate) : null;
      if (newDate !== existingDate) {
        console.log(`🔄 [DEBUG] orderDate changed: '${existingDate}' → '${newDate}'`);
        changes.push('orderDate');
        changeDetails.orderDate = {
          oldValue: existingDate,
          newValue: newDate
        };
      }
    }

    // Перевіряємо items (глибоке порівняння)
    if (newData.items && existingOrder.items) {
      try {
        const newItemsStr = JSON.stringify(newData.items);
        const existingItemsStr = typeof existingOrder.items === 'string'
          ? existingOrder.items
          : JSON.stringify(existingOrder.items);

        if (newItemsStr !== existingItemsStr) {
          console.log(`🔄 [DEBUG] items changed (length: ${newItemsStr.length} vs ${existingItemsStr.length})`);
          changes.push('items');
          changeDetails.items = {
            oldValue: existingOrder.items,
            newValue: newData.items,
            oldLength: existingItemsStr.length,
            newLength: newItemsStr.length
          };
        }
      } catch (error) {
        // Якщо не вдалося порівняти, вважаємо що змінилося
        console.log(`🔄 [DEBUG] items comparison failed, assuming changed:`, error);
        changes.push('items');
        changeDetails.items = {
          oldValue: existingOrder.items,
          newValue: newData.items,
          error: 'Comparison failed'
        };
      }
    }

    // Перевіряємо rawData (глибоке порівняння)
    if (newData.rawData && existingOrder.rawData) {
      try {
        const newRawDataStr = JSON.stringify(newData.rawData);
        const existingRawDataStr = typeof existingOrder.rawData === 'string'
          ? existingOrder.rawData
          : JSON.stringify(existingOrder.rawData);

        if (newRawDataStr !== existingRawDataStr) {
          console.log(`🔄 [DEBUG] rawData changed (length: ${newRawDataStr.length} vs ${existingRawDataStr.length})`);
          changes.push('rawData');
          changeDetails.rawData = {
            oldValue: existingOrder.rawData,
            newValue: newData.rawData,
            oldLength: existingRawDataStr.length,
            newLength: newRawDataStr.length
          };
        }
      } catch (error) {
        // Якщо не вдалося порівняти, вважаємо що змінилося
        console.log(`🔄 [DEBUG] rawData comparison failed, assuming changed:`, error);
        changes.push('rawData');
        changeDetails.rawData = {
          oldValue: existingOrder.rawData,
          newValue: newData.rawData,
          error: 'Comparison failed'
        };
      }
    }

    // console.log(`🔍 [DEBUG] Change detection completed: ${changes.length} changes found [${changes.join(', ')}]`);
    return { fields: changes, details: changeDetails };
  }
  /**
   * Створює нове замовлення в БД
   */
  async createOrder(data: OrderCreateData) {
    try {
      const order = await prisma.order.create({
        data: {
          id: data.id,
          externalId: data.externalId,
          ttn: data.ttn,
          quantity: data.quantity,
          status: data.status,
          items: JSON.stringify(data.items),
          rawData: JSON.stringify(data.rawData),
          cityName: data.cityName,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          deliveryAddress: data.deliveryAddress,
          orderDate: data.orderDate,
          orderNumber: data.orderNumber,
          paymentMethod: data.paymentMethod,
          provider: data.provider,
          shippingMethod: data.shippingMethod,
          statusText: data.statusText,
          totalPrice: data.totalPrice,
          pricinaZnizki: data.pricinaZnizki,
          sajt: data.sajt,
          updatedAt: data.rawData?.updateAt ? new Date(data.rawData.updateAt) : new Date()
        }
      });

      // Створюємо запис в історії змін
      await this.createOrderHistory(order.id, data.status, data.statusText || '', 'salesdrive');

      // Попередньо рахуємо та кешуємо статистику товарів
      try {
        await this.updateOrderCache(order.externalId);
      } catch (cacheError) {
        console.warn(`Failed to cache processed items for order ${order.externalId}:`, cacheError);
        // Не перериваємо створення замовлення через помилку кешування
      }

      console.log(`✅ Order ${data.orderNumber} created in database`);
      return order;
    } catch (error) {
      console.error(`❌ Error creating order ${data.orderNumber}:`, error);
      throw error;
    }
  }

  /**
   * Оновлюємо існуюче замовлення в БД
   */
  async updateOrder(externalId: string, data: OrderUpdateData) {
    try {
      const updateData: any = {
        lastSynced: new Date(),
        syncStatus: 'success',
        syncError: null
      };

      // dilovodExportDate має бути призначено після визначення updateData
      if (data.dilovodExportDate !== undefined) updateData.dilovodExportDate = data.dilovodExportDate;

      // Додаємо тільки певні поля
      if (data.orderDate !== undefined) updateData.orderDate = data.orderDate;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.statusText !== undefined) updateData.statusText = data.statusText;
      if (data.customerName !== undefined) updateData.customerName = data.customerName;
      if (data.customerPhone !== undefined) updateData.customerPhone = data.customerPhone;
      if (data.deliveryAddress !== undefined) updateData.deliveryAddress = data.deliveryAddress;
      if (data.cityName !== undefined) updateData.cityName = data.cityName;
      if (data.quantity !== undefined) updateData.quantity = data.quantity;
      if (data.totalPrice !== undefined) updateData.totalPrice = data.totalPrice;
      if (data.ttn !== undefined) updateData.ttn = data.ttn;
      if (data.shippingMethod !== undefined) updateData.shippingMethod = data.shippingMethod;
      if (data.paymentMethod !== undefined) updateData.paymentMethod = data.paymentMethod;
      if (data.pricinaZnizki !== undefined && data.pricinaZnizki !== null) updateData.pricinaZnizki = data.pricinaZnizki;
      if (data.sajt !== undefined && data.sajt !== null) updateData.sajt = data.sajt;

      // Оновлюємо items якщо вони передані
      if (data.items) {
        console.log(`🔧 Serializing items:`, {
          type: typeof data.items,
          isArray: Array.isArray(data.items),
          length: Array.isArray(data.items) ? data.items.length : 'N/A'
        });
        updateData.items = JSON.stringify(data.items);
        console.log(`✅ Items serialized, length: ${updateData.items.length}`);
      }

      // Оновлюємо rawData якщо вона передана
      if (data.rawData) {
        console.log(`🔧 Serializing rawData:`, {
          type: typeof data.rawData,
          isObject: typeof data.rawData === 'object',
          keys: typeof data.rawData === 'object' ? Object.keys(data.rawData || {}).length : 'N/A'
        });
        updateData.rawData = JSON.stringify(data.rawData);
        if (data.rawData.updateAt) {
          updateData.updatedAt = new Date(data.rawData.updateAt);
        }
        console.log(`✅ RawData serialized, length: ${updateData.rawData.length}`);
      }

      const order = await prisma.order.update({
        where: { externalId },
        data: updateData
      });

      // Створюємо запис в історії, якщо змінився статус
      if (data.status && data.status !== order.status) {
        await this.createOrderHistory(order.id, data.status, data.statusText || '', 'salesdrive');
      }

      // Перераховуємо кешовані дані, якщо змінилися items
      if (data.items) {
        try {
          await this.updateOrderCache(order.externalId);
        } catch (cacheError) {
          console.warn(`Failed to update cached processed items for order ${order.externalId}:`, cacheError);
          // Не перериваємо оновлення замовлення через помилку кешування
        }
      }

      console.log(`✅ Order ${externalId} updated in database`);
      return order;
    } catch (error) {
      console.error(`❌ Error updating order ${externalId}:`, error);
      throw error;
    }
  }

  /**
   * Створює запис в історії змін замовлення
   */
  async createOrderHistory(orderId: number, status: string, statusText: string, source: string, userId?: number, notes?: string) {
    try {
      await prisma.ordersHistory.create({
        data: {
          orderId: orderId,
          status,
          statusText,
          source,
          userId,
          notes
        }
      });
    } catch (error) {
      console.error(`❌ Error creating order history for order ${orderId}:`, error);
    }
  }

  /**
   * Отримуємо замовлення за externalId
   */
  async getOrderByExternalId(externalId: string) {
    try {
      const order = await prisma.order.findUnique({
        where: { externalId }
      });

      if (!order) return null;

      // Знаходимо попереднє замовлення (з більш ранньою датою)
      // Статуси: 2 (Підтверджено), 3 (Готове до відправки), 4 (Відправлено)
      const previousOrder = await prisma.order.findFirst({
        where: {
          orderDate: {
            lt: order.orderDate
          },
          status: {
            in: ['2', '3', '4']
          }
        },
        orderBy: {
          orderDate: 'desc' // Беремо найближче попереднє
        },
        select: {
          externalId: true,
          orderNumber: true
        }
      });

      // Знаходимо наступне замовлення (з більш пізньою датою)
      // Статуси: 2 (Підтверджено), 3 (Готове до відправки), 4 (Відправлено)
      const nextOrder = await prisma.order.findFirst({
        where: {
          orderDate: {
            gt: order.orderDate
          },
          status: {
            in: ['2', '3', '4']
          }
        },
        orderBy: {
          orderDate: 'asc' // Беремо найближче наступне
        },
        select: {
          externalId: true,
          orderNumber: true
        }
      });

      // Парсимо JSON поля
      return {
        ...order,
        items: order.items ? JSON.parse(order.items) : [],
        rawData: order.rawData ? JSON.parse(order.rawData) : {},
        previousOrderExternalId: previousOrder?.externalId || null,
        previousOrderNumber: previousOrder?.orderNumber || null,
        nextOrderExternalId: nextOrder?.externalId || null,
        nextOrderNumber: nextOrder?.orderNumber || null
      };
    } catch (error) {
      console.error(`❌ Error getting order ${externalId}:`, error);
      return null;
    }
  }

  /**
   * Отримуємо замовлення за id
   */
  async getOrderById(id: string) {
    try {
      const order = await prisma.order.findUnique({
        where: { id: Number(id) }
      });

      if (!order) return null;

      // Парсимо JSON поля
      return {
        ...order,
        items: order.items ? JSON.parse(order.items) : [],
        rawData: order.rawData ? JSON.parse(order.rawData) : {}
      };
    } catch (error) {
      console.error(`❌ Error getting order ${id}:`, error);
      return null;
    }
  }

  /**
   * Отримуємо номер замовлення за id замовлення
   */
  async getOrderNumberFromId(orderId: number): Promise<string | null> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { orderNumber: true }
      });

      return order ? order.orderNumber : null;
    } catch (error) {
      console.error(`❌ Error getting order number for orderId ${orderId}:`, error);
      return null;
    }
  }

  /**
   * Отримуємо лічильники замовлень за статусами для вкладок
   */
  async getStatusCounts() {
    const startTime = Date.now();

    try {
      // Отримуємо кількість замовлень за кожним статусом
      const statusStats = await prisma.order.groupBy({
        by: ['status'],
        _count: {
          status: true
        }
      });

      // Создаем объект с подсчетами
      const counts = {
        confirmed: 0,    // status = "2"
        readyToShip: 0,  // status = "3"
        shipped: 0,      // status = "4"
        all: 0           // все три статуса вместе
      };

      // Заполняем счетчики из результатов запроса
      statusStats.forEach(stat => {
        switch (stat.status) {
          case "2":
            counts.confirmed = stat._count.status;
            break;
          case "3":
            counts.readyToShip = stat._count.status;
            break;
          case "4":
            counts.shipped = stat._count.status;
            break;
        }
      });

      // Считаем общее количество для всех трех статусов
      counts.all = counts.confirmed + counts.readyToShip + counts.shipped;

      const queryTime = Date.now() - startTime;

      return counts;
    } catch (error) {
      const errorTime = Date.now() - startTime;
      console.error(`❌ [DB] orderDatabaseService.getStatusCounts: Error after ${errorTime}ms:`, error);
      return {
        confirmed: 0,
        readyToShip: 0,
        shipped: 0,
        all: 0
      };
    }
  }

  /**
   * Отримує статус замовлення
   */
  async getOrderStatus(orderId: string): Promise<string | null> {
    const order = await this.getOrderById(orderId);
    return order?.status || null;
  }

  /**
   * Отримує кількість замовлень з фільтрами (для пагінації)
   */
  async getOrdersCount(filters?: {
    status?: string | string[];
    syncStatus?: string;
    search?: string;
  }) {
    const startTime = Date.now();
    // console.log('🗄️ [DB] orderDatabaseService.getOrdersCount: Starting count query');

    try {
      const where: any = {};

      if (filters?.status) {
        // Если передан массив статусов, используем IN
        if (Array.isArray(filters.status)) {
          where.status = { in: filters.status };
        } else {
          where.status = filters.status;
        }
      } else {
        // Якщо статус не вказано (фільтр "all"), показуємо всі статуси крім невдалих
        where.status = {
          in: ['1', '2', '3', '4', '5'] // Усі статуси крім "Відхилені (6)", "Повернені (7)", "Видалені (8)"
        };
      }

      if (filters?.syncStatus) {
        where.syncStatus = filters.syncStatus;
      }

      // Добавляем фильтр по поиску (номер замовлення або ТТН)
      // Для MySQL используем contains без mode (MySQL по умолчанию case-insensitive для VARCHAR)
      if (filters?.search && filters.search.trim() !== '') {
        const searchTerm = filters.search.trim();
        where.OR = [
          { orderNumber: { contains: searchTerm } },
          { ttn: { contains: searchTerm } }
        ];
      }

      const count = await prisma.order.count({ where });

      const queryTime = Date.now() - startTime;
      // console.log(`✅ [DB] orderDatabaseService.getOrdersCount: Count query completed in ${queryTime}ms, result: ${count}`);

      return count;
    } catch (error) {
      const errorTime = Date.now() - startTime;
      console.error(`❌ [DB] orderDatabaseService.getOrdersCount: Error after ${errorTime}ms:`, error);
      return 0;
    }
  }

  /**
   * Отримує всі замовлення з фільтрацією та сортуванням
   */
  async getOrders(filters?: {
    status?: string | string[];
    syncStatus?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'orderDate' | 'createdAt' | 'lastSynced' | 'orderNumber' | 'dilovodSaleExportDate';
    sortOrder?: 'asc' | 'desc';
    dateRange?: {
      start: Date;
      end: Date;
    };
    shippedOnly?: boolean;
    shippedDateRange?: {
      start: Date;
      end: Date;
    };
    search?: string;
    includeItems?: boolean;
    includeRaw?: boolean;
    fields?: string[];
  }) {
    const startTime = Date.now();

    try {
      const where: any = {};

      if (filters?.status) {
        // Если передан массив статусов, используем IN
        if (Array.isArray(filters.status)) {
          where.status = { in: filters.status };
        } else {
          where.status = filters.status;
        }
      } else {
        // Якщо статус не вказано (фільтр "all"), показуємо всі статуси крім невдалих
        where.status = {
          in: ['1', '2', '3', '4', '5'] // Усі статуси крім "Відхилені (6)", "Повернені (7)", "Видалені (8)"
        };
      }

      if (filters?.syncStatus) {
        where.syncStatus = filters.syncStatus;
      }

      // Добавляем фильтр по дате
      if (filters?.dateRange) {
        where.orderDate = {
          gte: filters.dateRange.start,
          lte: filters.dateRange.end
        };
      }

      // Добавляем фильтр по дате отгрузки
      if (filters?.shippedOnly) {
        where.dilovodSaleExportDate = { not: null };
      }

      if (filters?.shippedDateRange) {
        where.dilovodSaleExportDate = {
          gte: filters.shippedDateRange.start,
          lte: filters.shippedDateRange.end
        };
      }

      // Добавляем фильтр по поиску (номер замовлення або ТТН)
      // Для MySQL используем contains без mode (MySQL по умолчанию case-insensitive для VARCHAR)
      if (filters?.search && filters.search.trim() !== '') {
        const searchTerm = filters.search.trim();
        where.OR = [
          { orderNumber: { contains: searchTerm } },
          { ttn: { contains: searchTerm } }
        ];
      }

      // Определяем сортировку
      const orderBy: any = {};
      if (filters?.sortBy) {
        orderBy[filters.sortBy] = filters?.sortOrder || 'desc';
      } else {
        // По умолчанию сортируем по дате создания (новые сначала)
        orderBy.createdAt = 'desc';
      }


      const dbQueryStart = Date.now();
      // Оптимизированный запрос без OrdersHistory для быстрой загрузки списка
      // Базовий whitelist полів, які дозволено вибирати
      const allowedFields: Record<string, boolean> = {
        id: true,
        externalId: true,
        orderNumber: true,
        ttn: true,
        quantity: true,
        status: true,
        statusText: true,
        createdAt: true,
        updatedAt: true,
        lastSynced: true,
        cityName: true,
        customerName: true,
        customerPhone: true,
        deliveryAddress: true,
        orderDate: true,
        paymentMethod: true,
        provider: true,
        shippingMethod: true,
        totalPrice: true,
        pricinaZnizki: true,
        sajt: true,
        dilovodSaleExportDate: true
      };

      let select: any;
      if (filters?.fields && Array.isArray(filters.fields) && filters.fields.length > 0) {
        // Формуємо select тільки з дозволених полів
        select = {};
        for (const f of filters.fields) {
          if (allowedFields[f]) select[f] = true;
        }
        // Захист: якщо після фільтрації нічого не лишилось — додаємо мінімум ключове поле
        if (Object.keys(select).length === 0) {
          select = { id: true };
        }
      } else {
        // Повний дефолтний набір (без важких items/rawData)
        select = { ...allowedFields };
      }
      if (filters?.includeItems) select.items = true;
      if (filters?.includeRaw) select.rawData = true;

      const orders = await prisma.order.findMany({
        where,
        orderBy,
        take: filters?.limit || 100,
        skip: filters?.offset || 0,
        select
      });

      const dbQueryTime = Date.now() - dbQueryStart;

      // Парсим JSON поля только если они были выбраны
      const parseStartTime = Date.now();
      const parsedOrders = orders.map(order => {
        const result: any = { ...order };
        if (filters?.includeItems) {
          result.items = order.hasOwnProperty('items') && (order as any).items
            ? JSON.parse((order as any).items)
            : [];
        }
        if (filters?.includeRaw) {
          result.rawData = order.hasOwnProperty('rawData') && (order as any).rawData
            ? JSON.parse((order as any).rawData)
            : {};
        }
        return result;
      });

      // Якщо потрібно поле quantity, воно вже коректно обраховане при додаванні/оновленні замовлення
      // з врахуванням комплектів (наборів товарів), тому fallback на кеш більше не потрібен
      let finalOrders = parsedOrders;

      const parseTime = Date.now() - parseStartTime;
      const totalTime = Date.now() - startTime;

      return finalOrders;
    } catch (error) {
      const errorTime = Date.now() - startTime;
      console.error(`❌ [DB] orderDatabaseService.getOrders: Error after ${errorTime}ms:`, error);
      return [];
    }
  }

  /**
   * Отримує статистику по замовленням
   */
  async getOrderStats() {
    try {
      const stats = await prisma.order.groupBy({
        by: ['status'],
        _count: { status: true }
      });

      const total = await prisma.order.count();
      const lastSynced = await prisma.order.findFirst({
        orderBy: { lastSynced: 'desc' },
        select: { lastSynced: true }
      });

      return {
        total,
        byStatus: stats.reduce((acc, stat) => {
          acc[stat.status] = stat._count.status;
          return acc;
        }, {} as Record<string, number>),
        lastSynced: lastSynced?.lastSynced
      };
    } catch (error) {
      console.error('❌ Error getting order stats:', error);
      return { total: 0, byStatus: {}, lastSynced: null };
    }
  }

  /**
   * Отримує інформацію про останню синхронізацію
   */
  async getLastSyncedOrder() {
    try {
      return await prisma.order.findFirst({
        orderBy: { lastSynced: 'desc' },
        select: {
          lastSynced: true,
          syncStatus: true,
          syncError: true
        }
      });
    } catch (error) {
      console.error('❌ Error getting last synced order:', error);
      return null;
    }
  }

  /**
   * Очищає старі записи історії (старше 30 днів)
   */
  async cleanupOldHistory() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const deleted = await prisma.ordersHistory.deleteMany({
        where: {
          changedAt: {
            lt: thirtyDaysAgo
          }
        }
      });

      console.log(`🧹 Cleaned up ${deleted.count} old history records`);
      return deleted.count;
    } catch (error) {
      console.error('❌ Error cleaning up old history:', error);
      return 0;
    }
  }

  /**
   * Отримує замовлення за списком id для batch операцій
   */
  async getOrdersByIds(ids: number[]) {
    try {
      if (ids.length === 0) return [];

      const orders = await prisma.order.findMany({
        where: {
          id: {
            in: ids
          }
        },
        select: {
          id: true,
          externalId: true,
          status: true,
          lastSynced: true
        }
      });

      return orders;
    } catch (error) {
      console.error('❌ Error getting orders by external IDs:', error);
      return [];
    }
  }

  /**
   * Batch створення замовлень
   */
  async createOrdersBatch(ordersData: Array<{
    id: number;
    externalId: string;
    orderNumber: string;
    ttn: string;
    quantity: number;
    status: string;
    statusText: string;
    items: any[];
    rawData: any;
    customerName?: string;
    customerPhone?: string;
    deliveryAddress?: string;
    totalPrice?: number;
    orderDate?: string;
    shippingMethod?: string;
    paymentMethod?: string;
    cityName?: string;
    provider?: string;
    pricinaZnizki?: string;
    sajt?: string;
  }>) {
    try {
      console.log(`📝 Starting batch creation of ${ordersData.length} orders...`);

      const createdOrders = [];
      const historyRecords = [];

      for (const orderData of ordersData) {
        try {
          // Обчислюємо актуальну quantity з врахуванням комплектів
          const actualQuantity = await this.calculateActualQuantity(orderData.items, orderData.quantity);

          // Создаем заказ
          const order = await prisma.order.create({
            data: {
              id: orderData.id,
              externalId: orderData.externalId,
              orderNumber: orderData.orderNumber,
              ttn: orderData.ttn,
              quantity: actualQuantity,
              status: orderData.status,
              statusText: orderData.statusText,
              items: JSON.stringify(orderData.items),
              rawData: JSON.stringify(orderData.rawData),
              customerName: orderData.customerName,
              customerPhone: orderData.customerPhone,
              deliveryAddress: orderData.deliveryAddress,
              totalPrice: orderData.totalPrice,
              orderDate: orderData.orderDate ? new Date(orderData.orderDate).toISOString() : null,
              shippingMethod: orderData.shippingMethod,
              paymentMethod: orderData.paymentMethod,
              cityName: orderData.cityName,
              provider: orderData.provider,
              pricinaZnizki: orderData.pricinaZnizki,
              sajt: orderData.sajt,
              lastSynced: new Date(),
              syncStatus: 'success',
              updatedAt: orderData.rawData?.updateAt ? new Date(orderData.rawData.updateAt) : new Date()
            }
          });

          createdOrders.push(order);

          // Подготавливаем запись истории
          historyRecords.push({
            orderId: order.id,
            status: orderData.status,
            statusText: orderData.statusText,
            source: 'salesdrive',
            changedAt: new Date()
          });

        } catch (error) {
          console.error(`❌ Error creating order ${orderData.orderNumber}:`, error);
          throw error;
        }
      }

      // Batch создание записей истории
      if (historyRecords.length > 0) {
        try {
          await prisma.ordersHistory.createMany({
            data: historyRecords
          });
          console.log(`✅ Created ${historyRecords.length} history records`);
        } catch (error) {
          console.error('❌ Error creating history records batch:', error);
          // Не прерываем процесс, если история не создалась
        }
      }

      // Предварительно рассчитываем и кешируем статистику товаров для всех новых заказов
      console.log(`🔄 Caching processed items for ${createdOrders.length} new orders...`);
      const cachePromises = createdOrders.map(async (order) => {
        try {
          const cacheStartTime = Date.now();
          await this.updateOrderCache(order.externalId);
          const cacheDuration = Date.now() - cacheStartTime;

          console.log(`✅ [CACHE] Order ${order.externalId} cached in ${cacheDuration}ms`);
        } catch (cacheError) {
          console.warn(`❌ [CACHE] Failed to cache processed items for order ${order.externalId}:`, cacheError);
        }
      });

      // Ожидаем завершения кеширования всех заказов
      await Promise.allSettled(cachePromises);
      console.log(`✅ Cached processed items for ${createdOrders.length} orders`);

      console.log(`✅ Successfully created ${createdOrders.length} orders in batch`);
      return createdOrders;
    } catch (error) {
      console.error('❌ Batch creation failed:', error);
      throw error;
    }
  }

  /**
   * Batch оновлення замовлень з оптимізацією (виправлена версія)
   */
  async updateOrdersBatch(ordersData: Array<{
    id: number;
    orderNumber: string;
    status: string;
    statusText: string;
    items: any[];
    rawData: any;
    ttn?: string;
    quantity?: number;
    customerName?: string;
    customerPhone?: string;
    deliveryAddress?: string;
    totalPrice?: number;
    orderDate?: string;
    shippingMethod?: string;
    paymentMethod?: string;
    cityName?: string;
    provider?: string;
    pricinaZnizki?: string;
    sajt?: string;
  }>, options: { batchSize?: number; concurrency?: number } = {}) {
    try {
      const batchSize = options.batchSize || 50;
      const concurrency = options.concurrency || 3;

      console.log(`🔄 Starting TRUE batch update of ${ordersData.length} orders (batch: ${batchSize}, concurrency: ${concurrency})...`);

      // Разбиваем на батчи
      const batches = [];
      for (let i = 0; i < ordersData.length; i += batchSize) {
        batches.push(ordersData.slice(i, i + batchSize));
      }

      console.log(`📦 Split into ${batches.length} batches of ~${batchSize} orders each`);

      const totalUpdated = 0;
      const totalSkipped = 0;
      const results = [];

      // Обрабатываем батчи с контролем параллельности
      for (let i = 0; i < batches.length; i += concurrency) {
        const batchSlice = batches.slice(i, i + concurrency);
        console.log(`🔄 Processing batch group ${Math.floor(i / concurrency) + 1}/${Math.ceil(batches.length / concurrency)} (${batchSlice.length} batches)`);

        const batchPromises = batchSlice.map(async (batch, batchIndex) => {
          try {
            const batchNumber = i + batchIndex + 1;
            console.log(`📝 Processing batch ${batchNumber}/${batches.length} (${batch.length} orders)`);

            // Создаем bulk update операции
            const updatePromises = batch.map(async (orderData) => {
              try {
                // Получаем существующий заказ для проверки изменений
                const existingOrder = await prisma.order.findUnique({
                  where: { externalId: orderData.orderNumber },
                  select: {
                    id: true,
                    pricinaZnizki: true,
                    sajt: true,
                    status: true,
                    statusText: true,
                    ttn: true,
                    quantity: true,
                    customerName: true,
                    customerPhone: true,
                    deliveryAddress: true,
                    totalPrice: true,
                    shippingMethod: true,
                    paymentMethod: true,
                    cityName: true,
                    provider: true,
                    items: true,
                    rawData: true,
                    orderDate: true
                  }
                });

                // console.log(`🔍 Checking order ${orderData.orderNumber}: ${existingOrder ? 'EXISTS' : 'NOT FOUND'}`);

                if (!existingOrder) {
                  console.log(`🚀 Order ${orderData.orderNumber} not found - will create new order`);
                  // Создаем новый заказ
                  try {
                    console.log(`🆕 Creating new order ${orderData.orderNumber}`);
                    const createdOrder = await prisma.order.create({
                      data: {
                        id: orderData.id,
                        externalId: orderData.orderNumber,
                        status: orderData.status || 'unknown',
                        statusText: orderData.statusText || '',
                        ttn: orderData.ttn || null,
                        quantity: orderData.quantity || 0,
                        customerName: orderData.customerName || '',
                        customerPhone: orderData.customerPhone || '',
                        deliveryAddress: orderData.deliveryAddress || '',
                        totalPrice: orderData.totalPrice || 0,
                        orderDate: orderData.orderDate ? new Date(orderData.orderDate).toISOString() : null,
                        shippingMethod: orderData.shippingMethod || null,
                        paymentMethod: orderData.paymentMethod || null,
                        cityName: orderData.cityName || null,
                        provider: orderData.provider || null,
                        pricinaZnizki: orderData.pricinaZnizki || null,
                        sajt: orderData.sajt || null,
                        items: orderData.items ? JSON.stringify(orderData.items) : null,
                        rawData: orderData.rawData ? JSON.stringify(orderData.rawData) : null,
                        lastSynced: new Date(),
                        syncStatus: 'success',
                        syncError: null,
                        updatedAt: orderData.rawData?.updateAt ? new Date(orderData.rawData.updateAt) : new Date()
                      } as any // Игнорируем типы для создания заказа
                    });
                    console.log(`✅ Successfully created order ${orderData.orderNumber} with ID: ${createdOrder.id}`);
                    return { orderNumber: orderData.orderNumber, action: 'created', reason: 'new order' };
                  } catch (createError) {
                    console.error(`❌ Failed to create order ${orderData.orderNumber}:`, createError);
                    return { orderNumber: orderData.orderNumber, action: 'error', reason: 'create failed' };
                  }
                }

                // Умная проверка изменений
                const changeResult = this.detectOrderChanges(existingOrder, orderData);
                const changes = changeResult.fields;
                console.log(`🔄 Order ${orderData.orderNumber} has ${changes.length} changes: ${changes.join(', ')}`);

                if (changes.length === 0) {
                  console.log(`⏭️ Order ${orderData.orderNumber} skipped - no changes`);
                  return { orderNumber: orderData.orderNumber, action: 'skipped', reason: 'no changes' };
                }

                // Обновляем только если есть изменения
                const updateData: any = {
                  lastSynced: new Date(),
                  syncStatus: 'success',
                  syncError: null
                };

                // Применяем только изменившиеся поля
                if (changes.includes('id')) updateData.id = orderData.id;
                if (changes.includes('status')) updateData.status = orderData.status;
                if (changes.includes('statusText')) updateData.statusText = orderData.statusText;
                if (changes.includes('ttn')) updateData.ttn = orderData.ttn;
                if (changes.includes('quantity')) updateData.quantity = orderData.quantity;
                if (changes.includes('customerName')) updateData.customerName = orderData.customerName;
                if (changes.includes('customerPhone')) updateData.customerPhone = orderData.customerPhone;
                if (changes.includes('deliveryAddress')) updateData.deliveryAddress = orderData.deliveryAddress;
                if (changes.includes('totalPrice')) updateData.totalPrice = orderData.totalPrice;
                if (changes.includes('shippingMethod')) updateData.shippingMethod = orderData.shippingMethod;
                if (changes.includes('paymentMethod')) updateData.paymentMethod = orderData.paymentMethod;
                if (changes.includes('cityName')) updateData.cityName = orderData.cityName;
                if (changes.includes('provider')) updateData.provider = orderData.provider;
                if (changes.includes('pricinaZnizki')) updateData.pricinaZnizki = orderData.pricinaZnizki;
                if (changes.includes('sajt')) updateData.sajt = orderData.sajt;

                // Сериализуем сложные поля
                if (changes.includes('items')) {
                  updateData.items = JSON.stringify(orderData.items);
                }
                if (changes.includes('rawData')) {
                  updateData.rawData = JSON.stringify(orderData.rawData);
                }
                if (changes.includes('orderDate')) {
                  updateData.orderDate = new Date(orderData.orderDate);
                }

                if (orderData.rawData?.updateAt) {
                  updateData.updatedAt = new Date(orderData.rawData.updateAt);
                }

                const updatedOrder = await prisma.order.update({
                  where: { externalId: orderData.orderNumber },
                  data: updateData
                });

                // Создаем запись истории только для значимых изменений
                if (changes.includes('status') || changes.includes('ttn')) {
                  await this.createOrderHistory(
                    existingOrder.id,
                    orderData.status,
                    orderData.statusText,
                    'salesdrive',
                    undefined,
                    `Bulk update: ${changes.join(', ')}`
                  );
                }

                return {
                  orderNumber: orderData.orderNumber,
                  action: 'updated',
                  changedFields: changes
                };

              } catch (error) {
                console.error(`❌ Error updating order ${orderData.orderNumber}:`, error);
                return {
                  orderNumber: orderData.orderNumber,
                  action: 'error',
                  error: error instanceof Error ? error.message : 'Unknown error'
                };
              }
            });

            const batchResults = await Promise.all(updatePromises);
            const updatedInBatch = batchResults.filter(r => r.action === 'updated').length;
            const createdInBatch = batchResults.filter(r => r.action === 'created').length;
            const skippedInBatch = batchResults.filter(r => r.action === 'skipped').length;
            const errorsInBatch = batchResults.filter(r => r.action === 'error').length;

            console.log(`✅ Batch ${batchNumber} completed: +${createdInBatch} created, +${updatedInBatch} updated, ${skippedInBatch} skipped, ${errorsInBatch} errors`);

            return batchResults;

          } catch (error) {
            console.error(`❌ Error processing batch ${i + batchIndex + 1}:`, error);
            return [];
          }
        });

        const groupResults = await Promise.all(batchPromises);
        results.push(...groupResults.flat());

        // Небольшая задержка между группами батчей
        if (i + concurrency < batches.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const totalCreated = results.filter(r => r.action === 'created').length;
      const totalErrors = results.filter(r => r.action === 'error').length;

      console.log(`✅ SMART batch update completed:`);
      console.log(`   📊 Total processed: ${ordersData.length}`);
      console.log(`   🆕 Created: ${totalCreated}`);
      console.log(`   ✅ Updated: ${totalUpdated}`);
      console.log(`   ⏭️ Skipped: ${totalSkipped}`);
      console.log(`   ❌ Errors: ${totalErrors}`);
      console.log(`   📈 Efficiency: ${(((totalCreated + totalUpdated) / ordersData.length) * 100).toFixed(1)}%`);

      return {
        success: true,
        totalProcessed: ordersData.length,
        totalCreated,
        totalUpdated,
        totalSkipped,
        totalErrors,
        results
      };
    } catch (error) {
      console.error('❌ TRUE batch update failed:', error);
      throw error;
    }
  }

  /**
   * Отримує замовлення з моменту останньої синхронізації
   */
  async getOrdersSinceLastSync(limit: number = 100) {
    try {
      const lastSyncedOrder = await this.getLastSyncedOrder();

      if (!lastSyncedOrder?.lastSynced) {
        // Если нет последней синхронизации, возвращаем все заказы
        return this.getOrders({ limit });
      }

      const orders = await prisma.order.findMany({
        where: {
          lastSynced: {
            gte: lastSyncedOrder.lastSynced
          }
        },
        orderBy: { lastSynced: 'desc' },
        take: limit,
        include: {
          OrdersHistory: {
            orderBy: { changedAt: 'desc' },
            take: 5
          }
        }
      });

      return orders;
    } catch (error) {
      console.error('❌ Error getting orders since last sync:', error);
      return [];
    }
  }

  /**
   * Отримує статистику синхронізації
   */
  async getSyncStats() {
    try {
      const total = await prisma.order.count();
      const synced = await prisma.order.count({
        where: { syncStatus: 'success' }
      });
      const pending = await prisma.order.count({
        where: { syncStatus: 'pending' }
      });
      const errors = await prisma.order.count({
        where: { syncStatus: 'error' }
      });

      const lastSync = await this.getLastSyncedOrder();

      return {
        total,
        synced,
        pending,
        errors,
        lastSync: lastSync?.lastSynced,
        syncSuccessRate: total > 0 ? (synced / total) * 100 : 0
      };
    } catch (error) {
      console.error('❌ Error getting sync stats:', error);
      return {
        total: 0,
        synced: 0,
        pending: 0,
        errors: 0,
        lastSync: null,
        syncSuccessRate: 0
      };
    }
  }

  /**
   * Розумне парціальне оновлення замовлення
   */
  async updateOrderSmart(externalId: string, newData: OrderUpdateData): Promise<{
    updated: boolean;
    changedFields: string[];
    previousValues: Record<string, any>;
  }> {
    try {
      // Получаем текущий заказ
      const existingOrder = await this.getOrderByExternalId(externalId);
      if (!existingOrder) {
        throw new Error(`Order ${externalId} not found`);
      }

      // Сравниваем поля и находим изменения
      const changes: Partial<OrderUpdateData> = {};
      const previousValues: Record<string, any> = {};
      const changedFields: string[] = [];

      // Проверяем каждое поле (ДОБАВЛЯЕМ rawData!)
      const fieldsToCheck = [
        'id', 'status', 'statusText', 'items', 'ttn', 'quantity',
        'customerName', 'customerPhone', 'deliveryAddress',
        'totalPrice', 'orderDate', 'shippingMethod', 'paymentMethod',
        'cityName', 'provider', 'rawData', 'pricinaZnizki', 'sajt'  // ← Добавляем rawData и новые поля!
      ];

      for (const field of fieldsToCheck) {
        if (newData[field] !== undefined) {
          const oldValue = existingOrder[field];
          const newValue = newData[field];

          // Специальная обработка для дат
          if (field === 'orderDate') {
            const oldDate = oldValue ? new Date(oldValue).toISOString() : null;
            const newDate = newValue ? new Date(newValue).toISOString() : null;

            if (oldDate !== newDate) {
              changes[field] = newValue;
              previousValues[field] = oldValue;
              changedFields.push(field);
            }
          }
          // Специальная обработка для rawData (всегда обновляем)
          else if (field === 'rawData') {
            // Для rawData всегда проверяем изменения, так как это важные данные
            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
              changes[field] = newValue;
              previousValues[field] = oldValue;
              changedFields.push(field);
              console.log(`🔄 rawData changed for order ${externalId}`);
            }
          }
          // Специальная обработка для массивов и объектов
          else if (Array.isArray(oldValue) || Array.isArray(newValue)) {
            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
              changes[field] = newValue;
              previousValues[field] = oldValue;
              changedFields.push(field);
            }
          }
          // Обычные поля
          else if (oldValue !== newValue) {
            changes[field] = newValue;
            previousValues[field] = oldValue;
            changedFields.push(field);
          }
        }
      }

      // Если изменений нет - возвращаем без обновления
      if (changedFields.length === 0) {
        // console.log(`✅ Order ${externalId}: No changes detected`);
        return {
          updated: false,
          changedFields: [],
          previousValues: {}
        };
      }

      // Подготавливаем данные для обновления
      const updateData: any = {
        ...changes,
        lastSynced: new Date(),
        syncStatus: 'success',
        syncError: null
      };

      // Преобразуем orderDate в Date если это string
      if (updateData.orderDate && typeof updateData.orderDate === 'string') {
        updateData.orderDate = new Date(updateData.orderDate);
      }

      // Преобразуем rawData в строку если это объект
      if (updateData.rawData && typeof updateData.rawData === 'object') {
        updateData.rawData = JSON.stringify(updateData.rawData);
      }

      // Преобразуем items в строку если это массив
      if (updateData.items && Array.isArray(updateData.items)) {
        updateData.items = JSON.stringify(updateData.items);
      }

      // Удаляем поля, которых нет в схеме Order
      const allowedFields = [
        'id', 'status', 'statusText', 'items', 'rawData', 'ttn', 'quantity',
        'customerName', 'customerPhone', 'deliveryAddress', 'totalPrice',
        'orderDate', 'shippingMethod', 'paymentMethod', 'cityName', 'provider',
        'lastSynced', 'syncStatus', 'syncError',
        'pricinaZnizki', 'sajt', 'updatedAt'  // ✅ ДОБАВИТЬ НОВЫЕ ПОЛЯ
      ];

      Object.keys(updateData).forEach(key => {
        if (!allowedFields.includes(key)) {
          console.warn(`⚠️ Removing unknown field '${key}' from order update data`);
          delete updateData[key];
        }
      });

      const updatedOrder = await prisma.order.update({
        where: { externalId },
        data: updateData
      });

      // Создаем запись в истории с деталями изменений
      if (changedFields.includes('status')) {
        await this.createOrderHistory(
          updatedOrder.id,
          updateData.status!,
          updateData.statusText || '',
          'salesdrive',
          undefined,
          `Changed fields: ${changedFields.join(', ')}`
        );
      }

      console.log(`✅ Order ${externalId} updated: ${changedFields.join(', ')}`);

      return {
        updated: true,
        changedFields,
        previousValues
      };

    } catch (error) {
      console.error(`❌ Error updating order ${externalId}:`, error);
      throw error;
    }
  }

  /**
   * Batch оновлення з парціальними оновленнями (розумне оновлення)
   */
  async updateOrdersBatchSmart(ordersData: Array<{
    id: number;
    orderNumber: string;
    status: string;
    statusText: string;
    items: any[];
    rawData: any;
    ttn?: string;
    quantity?: number;
    customerName?: string;
    customerPhone?: string;
    deliveryAddress?: string;
    totalPrice?: number;
    orderDate?: string;
    shippingMethod?: string;
    paymentMethod?: string;
    cityName?: string;
    provider?: string;
    pricinaZnizki?: string;
    sajt?: string;
  }>, options: { batchSize?: number; concurrency?: number } = {}) {
    try {
      const batchSize = options.batchSize || 50;
      const concurrency = options.concurrency || 3;

      console.log(`🔄 Starting SMART batch update of ${ordersData.length} orders (batch: ${batchSize}, concurrency: ${concurrency})...`);

      // Разбиваем на батчи для параллельной обработки
      const batches = [];
      for (let i = 0; i < ordersData.length; i += batchSize) {
        batches.push(ordersData.slice(i, i + batchSize));
      }

      console.log(`📦 Split into ${batches.length} smart batches of ~${batchSize} orders each`);

      const results = [];
      let totalUpdated = 0;
      let totalCreated = 0;
      let totalSkipped = 0;
      let totalErrors = 0;

      // Обрабатываем батчи с контролем параллельности
      for (let i = 0; i < batches.length; i += concurrency) {
        const batchSlice = batches.slice(i, i + concurrency);
        console.log(`🔄 Processing smart batch group ${Math.floor(i / concurrency) + 1}/${Math.ceil(batches.length / concurrency)} (${batchSlice.length} batches)`);

        // Детальное логирование для отладки
        console.log(`🔍 [DEBUG] Batch slice contains ${batchSlice.length} batches`);
        batchSlice.forEach((batch, idx) => {
          console.log(`🔍 [DEBUG] Batch ${idx + 1}: ${batch.length} orders`);
          batch.slice(0, 2).forEach((order, orderIdx) => {
            if (order && order.orderNumber) {
              console.log(`🔍 [DEBUG] Order ${orderIdx + 1}: ${order.orderNumber} (status: ${order.status || 'N/A'})`);
            } else {
              console.log(`🔍 [DEBUG] Order ${orderIdx + 1}: INVALID ORDER OBJECT`);
            }
          });
          if (batch.length > 2) {
            console.log(`🔍 [DEBUG] ... and ${batch.length - 2} more orders`);
          }
        });

        const batchPromises = batchSlice.map(async (batch) => {
          const batchResults = [];

          for (const orderData of batch) {
            try {
              // Проверяем, что orderData существует и имеет необходимые поля
              if (!orderData || !orderData.id) {
                console.error(`❌ [ERROR] Invalid order data:`, orderData);
                totalErrors++;
                continue;
              }

              // console.log(`🔍 [DEBUG] Processing order: ${orderData.id}, status: ${orderData.status || 'N/A'}`);

              // Получаем существующий заказ для проверки изменений
              const existingOrder = await prisma.order.findUnique({
                where: { id: orderData.id },
                select: {
                  id: true,
                  externalId: true,
                  orderNumber: true,
                  status: true,
                  statusText: true,
                  ttn: true,
                  quantity: true,
                  customerName: true,
                  customerPhone: true,
                  deliveryAddress: true,
                  totalPrice: true,
                  shippingMethod: true,
                  paymentMethod: true,
                  cityName: true,
                  provider: true,
                  items: true,
                  rawData: true,
                  orderDate: true,
                  pricinaZnizki: true,
                  sajt: true
                }
              });

              // console.log(`🔍 [DEBUG] Order ${orderData.orderNumber}: ${existingOrder ? 'EXISTS' : 'NOT FOUND'} in database`);

              if (!existingOrder) {
                // console.log(`🆕 [DEBUG] Order ${orderData.orderNumber} not found in database - CREATING NEW`);

                try {
                  // Создаем новый заказ
                  const newOrderData = {
                    id: parseInt(orderData.id),
                    externalId: orderData.orderNumber,
                    orderNumber: orderData.orderNumber,
                    ttn: orderData.ttn || '',
                    quantity: orderData.quantity || 0,
                    status: orderData.status || 'unknown',
                    statusText: orderData.statusText || '',
                    items: orderData.items || [],
                    rawData: orderData.rawData || {},
                    customerName: orderData.customerName || '',
                    customerPhone: orderData.customerPhone || '',
                    deliveryAddress: orderData.deliveryAddress || '',
                    totalPrice: orderData.totalPrice || 0,
                    orderDate: orderData.orderDate ? new Date(orderData.orderDate).toISOString() : null,
                    shippingMethod: orderData.shippingMethod || '',
                    paymentMethod: orderData.paymentMethod || '',
                    cityName: orderData.cityName || '',
                    provider: orderData.provider || '',
                    pricinaZnizki: orderData.pricinaZnizki || '',
                    sajt: orderData.sajt || '',
                    lastSynced: new Date(),
                    syncStatus: 'success',
                    updatedAt: orderData.rawData?.updateAt ? new Date(orderData.rawData.updateAt) : new Date()
                  };

                  const createdOrder = await this.createOrder(newOrderData);
                  console.log(`✅ [DEBUG] Order ${orderData.orderNumber} successfully created in database (ID: ${createdOrder.id})`);

                  totalCreated++;
                  batchResults.push({
                    orderNumber: orderData.orderNumber,
                    action: 'created',
                    success: true
                  });

                  console.log(`📊 [DEBUG] Batch results updated: totalCreated=${totalCreated}`);
                } catch (createError) {
                  console.error(`❌ [DEBUG] Failed to create order ${orderData.orderNumber}:`, createError);
                  totalErrors++;
                  batchResults.push({
                    orderNumber: orderData.orderNumber,
                    action: 'error',
                    error: createError instanceof Error ? createError.message : 'Create failed'
                  });
                }

                continue;
              }

              // Умная проверка изменений
              const changeResult = this.detectOrderChanges(existingOrder, orderData);
              const changes = changeResult.fields;
              // console.log(`🔍 [DEBUG] Order ${orderData.orderNumber} has ${changes.length} changes: [${changes.join(', ')}]`);

              if (changes.length === 0) {
                // console.log(`⏭️ [DEBUG] Order ${orderData.orderNumber} has no changes - SKIPPING`);
                totalSkipped++;
                batchResults.push({
                  orderNumber: orderData.orderNumber,
                  action: 'skipped',
                  reason: 'no changes'
                });
                continue;
              }

              console.log(`✅ [DEBUG] Order ${orderData.orderNumber} will be UPDATED with changes: [${changes.join(', ')}]`);

              // Обновляем только если есть изменения
              const updateData: any = {
                lastSynced: new Date(),
                syncStatus: 'success',
                syncError: null
              };

              // Обчислюємо актуальну quantity з врахуванням комплектів
              let actualQuantity = orderData.quantity;
              if (changes.includes('quantity') || changes.includes('items')) {
                actualQuantity = await this.calculateActualQuantity(orderData.items, orderData.quantity);
              }

              // Применяем только изменившиеся поля
              if (changes.includes('externalId')) updateData.externalId = orderData.externalId;
              if (changes.includes('orderNumber')) updateData.orderNumber = orderData.orderNumber;
              if (changes.includes('status')) updateData.status = orderData.status;
              if (changes.includes('statusText')) updateData.statusText = orderData.statusText;
              if (changes.includes('ttn')) updateData.ttn = orderData.ttn;
              if (changes.includes('quantity') || changes.includes('items')) updateData.quantity = actualQuantity;
              if (changes.includes('customerName')) updateData.customerName = orderData.customerName;
              if (changes.includes('customerPhone')) updateData.customerPhone = orderData.customerPhone;
              if (changes.includes('deliveryAddress')) updateData.deliveryAddress = orderData.deliveryAddress;
              if (changes.includes('totalPrice')) updateData.totalPrice = orderData.totalPrice;
              if (changes.includes('shippingMethod')) updateData.shippingMethod = orderData.shippingMethod;
              if (changes.includes('paymentMethod')) updateData.paymentMethod = orderData.paymentMethod;
              if (changes.includes('cityName')) updateData.cityName = orderData.cityName;
              if (changes.includes('provider')) updateData.provider = orderData.provider;
              if (changes.includes('pricinaZnizki')) updateData.pricinaZnizki = orderData.pricinaZnizki;
              if (changes.includes('sajt')) updateData.sajt = orderData.sajt;

              // Сериализуем сложные поля
              if (changes.includes('items')) {
                updateData.items = JSON.stringify(orderData.items);
              }
              if (changes.includes('rawData')) {
                updateData.rawData = JSON.stringify(orderData.rawData);
              }
              if (changes.includes('orderDate')) {
                updateData.orderDate = new Date(orderData.orderDate);
              }

              if (orderData.rawData?.updateAt) {
                updateData.updatedAt = new Date(orderData.rawData.updateAt);
              }

              const updateResult = await prisma.order.update({
                where: { id: orderData.id },
                data: updateData
              });

              console.log(`✅ [DEBUG] Order ${orderData.orderNumber} successfully updated in database (ID: ${updateResult.id})`);

              // Создаем запись истории только для значимых изменений
              if (changes.includes('status') || changes.includes('ttn')) {
                await this.createOrderHistory(
                  existingOrder.id,
                  orderData.status,
                  orderData.statusText,
                  'salesdrive',
                  undefined,
                  `Smart batch update: ${changes.join(', ')}`
                );
                console.log(`📝 [DEBUG] Created history record for order ${orderData.orderNumber}`);
              }

              totalUpdated++;
              batchResults.push({
                orderNumber: orderData.orderNumber,
                action: 'updated',
                changedFields: changes,
                changeDetails: changeResult.details
              });

              console.log(`📊 [DEBUG] Batch results updated: totalUpdated=${totalUpdated}`);

            } catch (error) {
              console.error(`❌ [DEBUG] Error updating order ${orderData.orderNumber}:`, error);
              console.error(`❌ [DEBUG] Error details:`, {
                orderNumber: orderData.orderNumber,
                status: orderData.status,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
              batchResults.push({
                orderNumber: orderData.orderNumber,
                action: 'error',
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }

          return batchResults;
        });

        const groupResults = await Promise.all(batchPromises);
        const flattenedResults = groupResults.flat();
        results.push(...flattenedResults);

        console.log(`📊 [DEBUG] Group results summary:`);
        console.log(`   📦 Batches processed: ${groupResults.length}`);
        console.log(`   📋 Orders processed: ${flattenedResults.length}`);
        console.log(`   ✅ Updated: ${flattenedResults.filter(r => r.action === 'updated').length}`);
        console.log(`   ⏭️ Skipped: ${flattenedResults.filter(r => r.action === 'skipped').length}`);
        console.log(`   ❌ Errors: ${flattenedResults.filter(r => r.action === 'error').length}`);

        // Небольшая задержка между группами батчей
        if (i + concurrency < batches.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      // Обновляем кеш только для заказов, у которых изменились items
      const ordersWithItemsChanged = results
        .filter(result => (result.action === 'updated' || result.action === 'created') && result.changedFields && result.changedFields.includes('items'))
        .map(result => ordersData.find(order => order.orderNumber === result.orderNumber))
        .filter(order => order !== undefined);

      if (ordersWithItemsChanged.length > 0) {
        console.log(`🔄 Updating cache for ${ordersWithItemsChanged.length} orders with changed items...`);

        const cachePromises = ordersWithItemsChanged.map(async (orderData) => {
          try {
            const order = await this.getOrderByExternalId(orderData!.orderNumber);
            if (order) {
              await this.updateOrderCache(order.externalId);
            }
          } catch (cacheError) {
            console.warn(`Failed to update cache for order ${orderData!.orderNumber}:`, cacheError);
          }
        });

        await Promise.allSettled(cachePromises);
        // console.log(`✅ Updated cache for ${ordersWithItemsChanged.length} orders`);
      }

      console.log(`✅ SMART batch update completed:`);
      console.log(`   📊 Total processed: ${ordersData.length}`);
      console.log(`   🆕 Created: ${totalCreated}`);
      console.log(`   ✅ Updated: ${totalUpdated}`);
      console.log(`   ⏭️ Skipped: ${totalSkipped}`);
      console.log(`   ❌ Errors: ${totalErrors}`);
      console.log(`   📈 Efficiency: ${(((totalCreated + totalUpdated) / ordersData.length) * 100).toFixed(1)}%`);

      // Собираем детальную информацию об изменениях
      const changesSummary: any = {};
      results.forEach(result => {
        if (result.action === 'updated' && result.changeDetails) {
          const orderNumber = result.orderNumber;
          changesSummary[orderNumber] = result.changeDetails;
        }
      });

      return {
        success: true,
        totalCreated,
        totalUpdated,
        totalSkipped,
        totalErrors,
        results,
        changesSummary
      };

    } catch (error) {
      console.error('❌ Smart batch update failed:', error);
      throw error;
    }
  }

  /**
   * Отримує статистику по замовленням з локальної БД
   */
  async getOrdersStats() {
    try {
      console.log('📊 Getting orders statistics from local database...');

      // Получаем общее количество заказов
      const totalOrders = await prisma.order.count();

      // Получаем количество заказов по каждому статусу
      const stats = await prisma.order.groupBy({
        by: ['status'],
        _count: {
          status: true
        }
      });

      // Создаем объект статистики
      const statsMap = new Map();
      stats.forEach(stat => {
        statsMap.set(stat.status, stat._count.status);
      });

      const result = {
        total: totalOrders,
        new: statsMap.get('1') || 0,
        confirmed: statsMap.get('2') || 0,
        readyToShip: statsMap.get('3') || 0,
        shipped: statsMap.get('4') || 0,
        sold: statsMap.get('5') || 0,
        rejected: statsMap.get('6') || 0,
        returned: statsMap.get('7') || 0,
        deleted: statsMap.get('8') || 0
      };

      console.log(`✅ Statistics retrieved: ${totalOrders} total orders`);
      return result;

    } catch (error) {
      console.error('❌ Error getting orders statistics:', error);
      throw error;
    }
  }

  /**
   * Отримує час останньої синхронізації
   */
  async getLastSyncInfo() {
    try {
      const lastSyncedOrder = await prisma.order.findFirst({
        orderBy: {
          lastSynced: 'desc'
        },
        select: {
          lastSynced: true
        }
      });

      return lastSyncedOrder?.lastSynced || null;
    } catch (error) {
      console.error('❌ Error getting last sync info:', error);
      return null;
    }
  }

  /**
   * Отримує товар по SKU з парсингом JSON полів
   */
  async getProductBySku(sku: string) {
    try {
      const product = await prisma.product.findUnique({
        where: { sku }
      });

      if (!product) {
        return null;
      }

      // Парсим JSON поля с обработкой ошибок
      const parsedProduct = {
        ...product,
        set: product.set ? (() => {
          try {
            return JSON.parse(product.set);
          } catch (e) {
            console.warn(`Failed to parse set for product ${sku}:`, e);
            return null;
          }
        })() : null,
        additionalPrices: product.additionalPrices ? (() => {
          try {
            return JSON.parse(product.additionalPrices);
          } catch (e) {
            console.warn(`Failed to parse additionalPrices for product ${sku}:`, e);
            return null;
          }
        })() : null,
        stockBalanceByStock: product.stockBalanceByStock ? (() => {
          try {
            return JSON.parse(product.stockBalanceByStock);
          } catch (e) {
            console.warn(`Failed to parse stockBalanceByStock for product ${sku}:`, e);
            return null;
          }
        })() : null
      };

      return parsedProduct;
    } catch (error) {
      console.error(`❌ Error getting product by SKU ${sku}:`, error);
      throw error;
    }
  }

  /**
   * Публічний метод для API: обгортка над calculateActualQuantity
   */
  async calculateActualQuantityPublic(items: any[], initialQuantity: number = 0): Promise<number> {
    return this.calculateActualQuantity(items, initialQuantity);
  }

  /**
   * Обчислює актуальну quantity з врахуванням комплектів (наборів)
   * Якщо kilTPorcij порожнє або 0 — рахує сумму всіх компонентів комплектів та звичайних товарів
   * (така ж логіка як в preprocessOrderItemsForCache)
   *
   * @param items - масив товарів (SKU)
   * @param initialQuantity - початкова кількість (опціонально)
   */
  private async calculateActualQuantity(items: any[], initialQuantity: number = 0): Promise<number> {
    try {
      // Якщо є явне значення кількості (kilTPorcij) — використовуємо його
      if (initialQuantity && initialQuantity > 0) {
        return initialQuantity;
      }

      // Якщо initialQuantity порожнє, або 0 — обраховуємо з товарів (як в preprocessOrderItemsForCache)
      if (!Array.isArray(items) || items.length === 0) {
        return 0;
      }

      // Збираємо статистику за товарами (як в preprocessOrderItemsForCache)
      const productStats: { [key: string]: number } = {};

      for (const item of items) {
        if (!item || !item.sku || !item.quantity) continue;

        try {
          const product = await this.getProductBySku(item.sku);

          if (product) {
            // Перевіряємо, чи це комплект (набір товарів)
            if (product.set && Array.isArray(product.set) && product.set.length > 0) {
              // Розкладаємо комплект на окремі компоненти (як в preprocessOrderItemsForCache)
              for (const setItem of product.set) {
                if (setItem && typeof setItem === 'object' && setItem.id && setItem.quantity) {
                  const component = await this.getProductBySku(setItem.id);
                  if (component) {
                    const componentSku = component.sku;
                    const totalQuantity = item.quantity * setItem.quantity;

                    if (productStats[componentSku]) {
                      productStats[componentSku] += totalQuantity;
                    } else {
                      productStats[componentSku] = totalQuantity;
                    }
                  }
                }
              }
            } else {
              // Для звичайного товару: просто додаємо кількість
              if (productStats[item.sku]) {
                productStats[item.sku] += item.quantity;
              } else {
                productStats[item.sku] = item.quantity;
              }
            }
          }
        } catch (productError) {
          console.warn(`⚠️ Error processing product ${item.sku} for quantity calculation:`, productError);
          // При помилці — додаємо quantity як є
          if (productStats[item.sku]) {
            productStats[item.sku] += item.quantity;
          } else {
            productStats[item.sku] = item.quantity;
          }
        }
      }

      // Обчислюємо totalQuantity як суму всіх orderedQuantity (як в preprocessOrderItemsForCache)
      const totalQuantity = Object.values(productStats).reduce((sum, qty) => sum + qty, 0);

      return totalQuantity;
    } catch (error) {
      console.warn(`⚠️ Error calculating actual quantity:`, error);
      return initialQuantity || 0;
    }
  }

  /**
   * Попередньо розраховує статистику товарів для замовлення (для кешу)
   */
  async preprocessOrderItemsForCache(orderId: number): Promise<string | null> {
    try {
      // Получаем заказ с товарами
      const order = await prisma.order.findUnique({
        where: { id: orderId }
      });

      if (!order || !order.items) {
        return null;
      }

      let orderItems: any[] = [];

      // Парсим товары заказа
      if (typeof order.items === 'string') {
        if (order.items === '[object Object]') {
          console.warn(`Order ${order.externalId} has invalid items data`);
          return null;
        }

        try {
          orderItems = JSON.parse(order.items);
        } catch (parseError) {
          console.warn(`Failed to parse items for order ${order.externalId}:`, parseError);
          return null;
        }
      } else if (Array.isArray(order.items)) {
        orderItems = order.items;
      }

      if (!Array.isArray(orderItems)) {
        console.warn(`Order ${order.externalId} items is not an array`);
        return null;
      }

      // Собираем статистику по товарам
      const productStats: { [key: string]: { name: string; sku: string; orderedQuantity: number; stockBalances: { [warehouse: string]: number } } } = {};

      for (const item of orderItems) {
        if (!item || typeof item !== 'object' || !item.sku || !item.quantity) {
          continue;
        }

        try {
          const product = await this.getProductBySku(item.sku);
          if (product) {
            // Проверяем, является ли товар комплектом
            if (product.set && Array.isArray(product.set) && product.set.length > 0) {
              // Разлагаем комплект на отдельные товары
              for (const setItem of product.set) {
                if (setItem && typeof setItem === 'object' && setItem.id && setItem.quantity) {
                  const component = await this.getProductBySku(setItem.id);
                  if (component) {
                    const totalQuantity = item.quantity * setItem.quantity;
                    const componentSku = component.sku;

                    if (productStats[componentSku]) {
                      productStats[componentSku].orderedQuantity += totalQuantity;
                    } else {
                      productStats[componentSku] = {
                        name: component.name,
                        sku: component.sku,
                        orderedQuantity: totalQuantity,
                        stockBalances: {}
                      };
                    }
                  }
                }
              }
            } else {
              // Обычный товар
              if (productStats[item.sku]) {
                productStats[item.sku].orderedQuantity += item.quantity;
              } else {
                productStats[item.sku] = {
                  name: product.name,
                  sku: product.sku,
                  orderedQuantity: item.quantity,
                  stockBalances: {}
                };
              }
            }
          }
        } catch (productError) {
          console.warn(`Error processing product ${item.sku} in order ${order.externalId}:`, productError);
        }
      }

      // Получаем остатки на складах для каждого товара (исключая Киев id2)
      for (const [sku, stats] of Object.entries(productStats)) {
        try {
          const product = await this.getProductBySku(sku);
          if (product && product.stockBalanceByStock) {
            const filteredBalances: { [warehouse: string]: number } = {};
            for (const [warehouseId, balance] of Object.entries(product.stockBalanceByStock)) {
              if (warehouseId !== '2') { // Исключаем Киев id2
                filteredBalances[warehouseId] = balance as number;
              }
            }
            stats.stockBalances = filteredBalances;
          }
        } catch (stockError) {
          console.warn(`Failed to get stock balance for product ${sku}:`, stockError);
        }
      }

      // Конвертируем в массив и сериализуем
      const processedData = Object.values(productStats);
      return JSON.stringify(processedData);

    } catch (error) {
      console.error(`❌ Error preprocessing items for order ${orderId}:`, error);
      return null;
    }
  }

  /**
   * Оновлює кеш для замовлення
   */
  async updateOrderCache(externalId: string): Promise<boolean> {
    try {
      // Отримуємо замовлення за externalId
      const order = await prisma.order.findUnique({ where: { externalId } });

      if (!order) {
        console.error(`❌ Order with externalId ${externalId} not found`);
        return false;
      }

      const processedItems = await this.preprocessOrderItemsForCache(order.id);
      if (!processedItems) {
        console.warn(`⚠️ No processed items for order ${externalId}`);
        return false;
      }

      // Подсчитываем totalQuantity
      let totalQuantity = order.quantity || 0;
      try {
        const items = JSON.parse(processedItems);
        if (Array.isArray(items)) {
          totalQuantity = items.reduce((sum: number, item: any) => sum + (item.orderedQuantity || 0), 0);
        }
      } catch (parseError) {
        console.warn(`Failed to parse processed items for total quantity calculation:`, parseError);
      }

      // ---- Подсчитываем totalWeight (кг) ----
      let totalWeight = 0;
      try {
        const items = JSON.parse(order.items);
        if (Array.isArray(items)) {
          for (const item of items) {
            if (!item || !item.sku || !item.quantity) continue;
            // Берем product по SKU
            const product = await this.getProductBySku(item.sku);
            if (product && product.weight) {
              totalWeight += (product.weight * item.quantity) / 1000; // Преобразуем из грамм в кг
            } else if (product && product.set && Array.isArray(product.set) && product.set.length > 0) {
              // Комплект — рахуємо вагу по складникам
              for (const setItem of product.set) {
                if (setItem && setItem.id && setItem.quantity) {
                  const component = await this.getProductBySku(setItem.id);
                  if (component && component.weight) {
                    totalWeight += (component.weight * setItem.quantity * item.quantity) / 1000;
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn(`Failed to calculate total weight for cache:`, err);
      }
      // ---- END totalWeight ----

      // Сохраняем в кеш
      await ordersCacheService.upsertOrderCache({
        externalId,
        processedItems,
        totalQuantity,
        totalWeight
      });

      return true;
    } catch (error) {
      console.error(`❌ Error updating cache for order ${externalId}:`, error);
      return false;
    }
  }
  /**
   * Примусове оновлення замовлень (завжди оновлює, без перевірки змін)
   * Використовується для ручної синхронізації, коли потрібно пересинхронізувати всі замовлення
   */
  async forceUpdateOrdersBatch(ordersData: Array<{
    orderNumber: string;
    status?: string;
    statusText?: string;
    items?: any[];
    rawData?: any;
    ttn?: string;
    quantity?: number;
    customerName?: string;
    customerPhone?: string;
    deliveryAddress?: string;
    totalPrice?: number;
    orderDate?: string;
    shippingMethod?: string;
    paymentMethod?: string;
    cityName?: string;
    provider?: string;
    pricinaZnizki?: string;
    sajt?: string;
  }>) {
    try {
      console.log(`🔄 Starting FORCE batch update of ${ordersData.length} orders...`);

      const results = [];
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalErrors = 0;

      for (const orderData of ordersData) {
        try {
          // Проверяем, существует ли заказ
          const existingOrder = await this.getOrderByExternalId(orderData.orderNumber);

          if (!existingOrder) {
            // Создаем новый заказ
            // Обчислюємо актуальну quantity з врахуванням комплектів
            const actualQuantity = await this.calculateActualQuantity(orderData.items || [], orderData.quantity);

            const newOrderData = {
              id: parseInt(orderData.orderNumber), // Преобразуем orderNumber в число для id
              externalId: orderData.orderNumber,
              orderNumber: orderData.orderNumber,
              ttn: orderData.ttn || '',
              quantity: actualQuantity,
              status: orderData.status || 'unknown',
              statusText: orderData.statusText || '',
              items: orderData.items || [],
              rawData: orderData.rawData || {},
              customerName: orderData.customerName || '',
              customerPhone: orderData.customerPhone || '',
              deliveryAddress: orderData.deliveryAddress || '',
              totalPrice: orderData.totalPrice || 0,
              orderDate: orderData.orderDate ? new Date(orderData.orderDate).toISOString() : null,
              shippingMethod: orderData.shippingMethod || '',
              paymentMethod: orderData.paymentMethod || '',
              cityName: orderData.cityName || '',
              provider: orderData.provider || '',
              pricinaZnizki: orderData.pricinaZnizki || '',
              sajt: orderData.sajt || '',
              lastSynced: new Date(),
              syncStatus: 'success',
              updatedAt: orderData.rawData?.updateAt ? new Date(orderData.rawData.updateAt) : new Date()
            };

            await this.createOrder(newOrderData);
            totalCreated++;
            results.push({
              orderNumber: orderData.orderNumber,
              action: 'created',
              success: true
            });
          } else {
            // Всегда обновляем существующий заказ (force update)
            // Обчислюємо актуальну quantity з врахуванням комплектів
            const actualQuantity = await this.calculateActualQuantity(
              orderData.items || (typeof existingOrder.items === 'string' ? JSON.parse(existingOrder.items) : existingOrder.items),
              orderData.quantity !== undefined ? orderData.quantity : existingOrder.quantity
            );

            const updateData = {
              status: orderData.status || existingOrder.status,
              statusText: orderData.statusText || existingOrder.statusText,
              items: orderData.items || existingOrder.items,
              rawData: orderData.rawData || existingOrder.rawData,
              ttn: orderData.ttn || existingOrder.ttn,
              quantity: actualQuantity,
              customerName: orderData.customerName || existingOrder.customerName,
              customerPhone: orderData.customerPhone || existingOrder.customerPhone,
              deliveryAddress: orderData.deliveryAddress || existingOrder.deliveryAddress,
              totalPrice: orderData.totalPrice !== undefined ? orderData.totalPrice : existingOrder.totalPrice,
              orderDate: orderData.orderDate ? new Date(orderData.orderDate).toISOString() : existingOrder.orderDate,
              shippingMethod: orderData.shippingMethod || existingOrder.shippingMethod,
              paymentMethod: orderData.paymentMethod || existingOrder.paymentMethod,
              cityName: orderData.cityName || existingOrder.cityName,
              provider: orderData.provider || existingOrder.provider,
              pricinaZnizki: orderData.pricinaZnizki !== undefined ? orderData.pricinaZnizki : existingOrder.pricinaZnizki,
              sajt: orderData.sajt !== undefined ? orderData.sajt : existingOrder.sajt,
              lastSynced: new Date(),
              syncStatus: 'success',
              syncError: null,
              updatedAt: orderData.rawData?.updateAt ? new Date(orderData.rawData.updateAt) : new Date()
            };


            // Преобразуем orderDate в Date если это string
            if (updateData.orderDate && typeof updateData.orderDate === 'string') {
              updateData.orderDate = new Date(updateData.orderDate);
            }

            // Преобразуем rawData в строку если это объект
            if (updateData.rawData && typeof updateData.rawData === 'object') {
              updateData.rawData = JSON.stringify(updateData.rawData);
            }

            // Преобразуем items в строку если это массив
            if (updateData.items && Array.isArray(updateData.items)) {
              updateData.items = JSON.stringify(updateData.items);
            }

            if (orderData.rawData?.updateAt) {
              updateData.updatedAt = new Date(orderData.rawData.updateAt);
            }

            await prisma.order.update({
              where: { externalId: orderData.orderNumber },
              data: updateData
            });

            totalUpdated++;
            results.push({
              orderNumber: orderData.orderNumber,
              action: 'updated',
              success: true
            });
          }

        } catch (error) {
          console.error(`❌ Error force updating order ${orderData.orderNumber}:`, error);
          totalErrors++;
          results.push({
            orderNumber: orderData.orderNumber,
            action: 'error',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Обновляем кеш для всех заказов
      const ordersToCache = results
        .filter(result => result.action === 'updated' || result.action === 'created')
        .map(result => ordersData.find(order => order.orderNumber === result.orderNumber))
        .filter(order => order !== undefined);

      if (ordersToCache.length > 0) {
        console.log(`🔄 Updating cache for ${ordersToCache.length} force-updated orders...`);

        const cachePromises = ordersToCache.map(async (orderData) => {
          try {
            const order = await this.getOrderByExternalId(orderData!.orderNumber);
            if (order) {
              await this.updateOrderCache(order.externalId);
            }
          } catch (cacheError) {
            console.warn(`Failed to update cache for order ${orderData!.orderNumber}:`, cacheError);
          }
        });

        await Promise.allSettled(cachePromises);
        // console.log(`✅ Updated cache for ${ordersToCache.length} orders`);
      }

      console.log(`✅ Force batch update completed: ${totalCreated} created, ${totalUpdated} updated, ${totalErrors} errors`);

      return {
        success: totalErrors === 0,
        totalCreated,
        totalUpdated,
        totalSkipped: 0, // В force update не пропускаем
        totalErrors,
        results
      };

    } catch (error) {
      console.error('❌ Force batch update failed:', error);
      throw error;
    }
  }

}

export const orderDatabaseService = new OrderDatabaseService();
