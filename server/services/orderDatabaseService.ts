import { PrismaClient } from '@prisma/client';
import { ordersCacheService } from './ordersCacheService.js';

const prisma = new PrismaClient();

export interface OrderCreateData {
  id: number; // Обязательно - SalesDrive ID
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
  status?: string;
  statusText?: string;
  items?: any[];
  rawData?: any;        // ← Добавляем rawData!
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
   * Создает новый заказ в БД
   */
  async createOrder(data: OrderCreateData) {
    try {
      const order =         await prisma.order.create({
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
          sajt: data.sajt
        }
      });

      // Создаем запись в истории
      await this.createOrderHistory(order.id, data.status, data.statusText || '', 'salesdrive');

      // Предварительно рассчитываем и кешируем статистику товаров
      try {
        await this.updateOrderCache(order.externalId);
      } catch (cacheError) {
        console.warn(`Failed to cache processed items for order ${order.externalId}:`, cacheError);
        // Не прерываем создание заказа из-за ошибки кеширования
      }

      console.log(`✅ Order ${data.orderNumber} created in database`);
      return order;
    } catch (error) {
      console.error(`❌ Error creating order ${data.orderNumber}:`, error);
      throw error;
    }
  }

  /**
   * Обновляет существующий заказ в БД
   */
  async updateOrder(externalId: string, data: OrderUpdateData) {
    try {
      const updateData: any = {
        orderDate: data.orderDate,
        lastSynced: new Date(),
        syncStatus: 'success',
        syncError: null,
        status: data.status,
        statusText: data.statusText,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        deliveryAddress: data.deliveryAddress,
        cityName: data.cityName,
        quantity: data.quantity,
        pricinaZnizki: data.pricinaZnizki,
        sajt: data.sajt
      };

      // Обновляем items если они переданы
      if (data.items) {
        console.log(`🔧 Serializing items:`, {
          type: typeof data.items,
          isArray: Array.isArray(data.items),
          length: Array.isArray(data.items) ? data.items.length : 'N/A'
        });
        updateData.items = JSON.stringify(data.items);
        console.log(`✅ Items serialized, length: ${updateData.items.length}`);
      }

      // Обновляем rawData если передана
      if (data.rawData) {
        console.log(`🔧 Serializing rawData:`, {
          type: typeof data.rawData,
          isObject: typeof data.rawData === 'object',
          keys: typeof data.rawData === 'object' ? Object.keys(data.rawData || {}).length : 'N/A'
        });
        updateData.rawData = JSON.stringify(data.rawData);
        console.log(`✅ RawData serialized, length: ${updateData.rawData.length}`);
      }


      const order = await prisma.order.update({
        where: { externalId },
        data: updateData
      });

      // Создаем запись в истории, если изменился статус
      if (data.status && data.status !== order.status) {
        await this.createOrderHistory(order.id, data.status, data.statusText || '', 'salesdrive');
      }

      // Пересчитываем кешированные данные если изменились items
      if (data.items) {
        try {
          await this.updateOrderCache(order.externalId);
        } catch (cacheError) {
          console.warn(`Failed to update cached processed items for order ${order.externalId}:`, cacheError);
          // Не прерываем обновление заказа из-за ошибки кеширования
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
   * Создает запись в истории изменений заказа
   */
  async createOrderHistory(orderId: number, status: string, statusText: string, source: string, userId?: number, notes?: string) {
    try {
      await prisma.ordersHistory.create({
        data: {
          orderId,
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
   * Получает заказ по externalId
   */
  async getOrderByExternalId(externalId: string) {
    try {
      const order = await prisma.order.findUnique({
        where: { externalId },
        include: {
          OrdersHistory: {
            orderBy: { changedAt: 'desc' },
            take: 10
          }
        }
      });

      if (!order) return null;

      // Парсим JSON поля
      return {
        ...order,
        items: order.items ? JSON.parse(order.items) : [],
        rawData: order.rawData ? JSON.parse(order.rawData) : {}
      };
    } catch (error) {
      console.error(`❌ Error getting order ${externalId}:`, error);
      return null;
    }
  }

  /**
   * Получает все заказы с фильтрацией и сортировкой
   */
  /**
   * Получает счетчики заказов по статусам для табов
   */
  async getStatusCounts() {
    const startTime = Date.now();

    try {
      // Получаем количество заказов по каждому статусу
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
   * Получает количество заказов с фильтрами (для пагинации)
   */
  async getOrdersCount(filters?: {
    status?: string;
    syncStatus?: string;
  }) {
    const startTime = Date.now();
    console.log('🗄️ [DB] orderDatabaseService.getOrdersCount: Starting count query');

    try {
      const where: any = {};

      if (filters?.status) {
        where.status = filters.status;
      } else {
        // Якщо статус не вказано (фільтр "all"), показуємо всі статуси крім невдалих
        where.status = {
          in: ['1', '2', '3', '4', '5'] // Усі статуси крім "Відхилені (6)", "Повернені (7)", "Видалені (8)"
        };
      }

      if (filters?.syncStatus) {
        where.syncStatus = filters.syncStatus;
      }

      const count = await prisma.order.count({ where });

      const queryTime = Date.now() - startTime;
      console.log(`✅ [DB] orderDatabaseService.getOrdersCount: Count query completed in ${queryTime}ms, result: ${count}`);

      return count;
    } catch (error) {
      const errorTime = Date.now() - startTime;
      console.error(`❌ [DB] orderDatabaseService.getOrdersCount: Error after ${errorTime}ms:`, error);
      return 0;
    }
  }

  async getOrders(filters?: {
    status?: string;
    syncStatus?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'orderDate' | 'createdAt' | 'lastSynced' | 'orderNumber';
    sortOrder?: 'asc' | 'desc';
    dateRange?: {
      start: Date;
      end: Date;
    };
  }) {
    const startTime = Date.now();

    try {
      const where: any = {};

      if (filters?.status) {
        where.status = filters.status;
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
      const orders = await prisma.order.findMany({
        where,
        orderBy,
        take: filters?.limit || 100,
        skip: filters?.offset || 0,
        select: {
          id: true,
          externalId: true,
          orderNumber: true,
          ttn: true,
          quantity: true,
          status: true,
          statusText: true,
          items: true,
          rawData: true,
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
          sajt: true
          // Исключаем OrdersHistory для оптимизации скорости
        }
      });

      const dbQueryTime = Date.now() - dbQueryStart;

      // Парсим JSON поля
      const parseStartTime = Date.now();

      const parsedOrders = orders.map(order => ({
        ...order,
        items: order.items ? JSON.parse(order.items) : [],
        rawData: order.rawData ? JSON.parse(order.rawData) : {}
      }));

      const parseTime = Date.now() - parseStartTime;

      const totalTime = Date.now() - startTime;

      return parsedOrders;
    } catch (error) {
      const errorTime = Date.now() - startTime;
      console.error(`❌ [DB] orderDatabaseService.getOrders: Error after ${errorTime}ms:`, error);
      return [];
    }
  }

  /**
   * Получает статистику по заказам
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
   * Получает информацию о последней синхронизации
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
   * Очищает старые записи истории (старше 30 дней)
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
   * Получает заказы по списку externalId для batch операций
   */
  async getOrdersByExternalIds(externalIds: string[]) {
    try {
      if (externalIds.length === 0) return [];

      const orders = await prisma.order.findMany({
        where: {
          externalId: {
            in: externalIds
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
   * Batch создание заказов
   */
  async createOrdersBatch(ordersData: Array<{
    id: string;
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
          // Создаем заказ
          const order = await prisma.order.create({
            data: {
              id: parseInt(orderData.id),
              externalId: orderData.externalId,
              orderNumber: orderData.orderNumber,
              ttn: orderData.ttn,
              quantity: orderData.quantity,
              status: orderData.status,
              statusText: orderData.statusText,
              items: JSON.stringify(orderData.items),
              rawData: JSON.stringify(orderData.rawData),
              customerName: orderData.customerName,
              customerPhone: orderData.customerPhone,
              deliveryAddress: orderData.deliveryAddress,
              totalPrice: orderData.totalPrice,
              orderDate: orderData.orderDate ? new Date(orderData.orderDate) : null,
              shippingMethod: orderData.shippingMethod,
              paymentMethod: orderData.paymentMethod,
              cityName: orderData.cityName,
              provider: orderData.provider,
              pricinaZnizki: orderData.pricinaZnizki,
              sajt: orderData.sajt,
              lastSynced: new Date(),
              syncStatus: 'success'
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
   * Batch обновление заказов с оптимизацией (исправленная версия)
   */
  async updateOrdersBatch(ordersData: Array<{
    orderNumber: string;
    status: string;
    statusText: string;
    items: any[];
    rawData: any;
    ttn?: string;           // Добавляем ttn
    quantity?: number;       // Добавляем quantity
    customerName?: string;
    customerPhone?: string;
    deliveryAddress?: string;
    totalPrice?: number;
    orderDate?: string;
    shippingMethod?: string;
    paymentMethod?: string;
    cityName?: string;
    provider?: string;
  }>) {
    try {
      console.log(`🔄 Starting batch update of ${ordersData.length} orders...`);
      
      const updatedOrders = [];
      const historyRecords = [];

      for (const orderData of ordersData) {
        try {
          // Получаем текущий заказ для сравнения
          const existingOrder = await prisma.order.findUnique({
            where: { externalId: orderData.orderNumber },
            select: { 
              id: true, 
              status: true,
              ttn: true,
              quantity: true
            }
          });

          if (!existingOrder) {
            console.warn(`⚠️ Order ${orderData.orderNumber} not found for update`);
            continue;
          }

          // Подготавливаем данные для обновления
          const updateData: any = {
            status: orderData.status,
            statusText: orderData.statusText,
            items: orderData.items,
            rawData: orderData.rawData,
            customerName: orderData.customerName,
            customerPhone: orderData.customerPhone,
            deliveryAddress: orderData.deliveryAddress,
            totalPrice: orderData.totalPrice,
            orderDate: orderData.orderDate ? new Date(orderData.orderDate) : undefined,
            shippingMethod: orderData.shippingMethod,
            paymentMethod: orderData.paymentMethod,
            cityName: orderData.cityName,
            provider: orderData.provider,
            lastSynced: new Date(),
            syncStatus: 'success',
            syncError: null
          };

          // Добавляем ttn и quantity если они предоставлены
          if (orderData.ttn !== undefined) {
            updateData.ttn = orderData.ttn;
          }
          if (orderData.quantity !== undefined) {
            updateData.quantity = orderData.quantity;
          }

          // Обновляем заказ
          const updatedOrder = await prisma.order.update({
            where: { externalId: orderData.orderNumber },
            data: updateData
          });

          updatedOrders.push(updatedOrder);

          // Создаем запись в истории если изменился статус, ttn или quantity
          const statusChanged = existingOrder.status !== orderData.status;
          const ttnChanged = orderData.ttn !== undefined && existingOrder.ttn !== orderData.ttn;
          const quantityChanged = orderData.quantity !== undefined && existingOrder.quantity !== orderData.quantity;

          if (statusChanged || ttnChanged || quantityChanged) {
            let changeDescription = '';
            if (statusChanged) changeDescription += `Status: ${existingOrder.status} → ${orderData.status}`;
            if (ttnChanged) changeDescription += `${changeDescription ? ', ' : ''}TTN: ${existingOrder.ttn} → ${orderData.ttn}`;
            if (quantityChanged) changeDescription += `${changeDescription ? ', ' : ''}Quantity: ${existingOrder.quantity} → ${orderData.quantity}`;

            historyRecords.push({
              orderId: existingOrder.id,
              status: orderData.status,
              statusText: orderData.statusText,
              source: 'salesdrive',
              changedAt: new Date(),
              notes: changeDescription
            });
          }

        } catch (error) {
          console.error(`❌ Error updating order ${orderData.orderNumber}:`, error);
          throw error;
        }
      }

      // Batch создание записей истории
      if (historyRecords.length > 0) {
        try {
          await prisma.ordersHistory.createMany({
            data: historyRecords
          });
          console.log(`✅ Created ${historyRecords.length} history records for changes`);
        } catch (error) {
          console.error('❌ Error creating history records batch:', error);
        }
      }

      console.log(`✅ Successfully updated ${updatedOrders.length} orders in batch`);
      return updatedOrders;
    } catch (error) {
      console.error('❌ Batch update failed:', error);
      throw error;
    }
  }

  /**
   * Получает заказы с момента последней синхронизации
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
   * Получает статистику синхронизации
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
   * Умное парциальное обновление заказа
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
        'status', 'statusText', 'items', 'ttn', 'quantity',
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
        'status', 'statusText', 'items', 'rawData', 'ttn', 'quantity',
        'customerName', 'customerPhone', 'deliveryAddress', 'totalPrice',
        'orderDate', 'shippingMethod', 'paymentMethod', 'cityName', 'provider',
        'lastSynced', 'syncStatus', 'syncError',
        'pricinaZnizki', 'sajt'  // ✅ ДОБАВИТЬ НОВЫЕ ПОЛЯ
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
   * Batch обновление с парциальными обновлениями
   */
  async updateOrdersBatchSmart(ordersData: Array<{
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
  }>) {
    try {
      console.log(`🔄 Starting smart batch update of ${ordersData.length} orders...`);
      
      const results = [];
      let totalUpdated = 0;
      let totalSkipped = 0;

      for (const orderData of ordersData) {
        try {
          // Пытаемся найти заказ по orderNumber как externalId
          let existingOrder = await this.getOrderByExternalId(orderData.orderNumber);

          // Если не найден, пробуем найти по id (для случаев, когда externalId != orderNumber)
          if (!existingOrder && orderData.orderNumber) {
            const orderById = await prisma.order.findUnique({
              where: { externalId: orderData.orderNumber },
              include: {
                OrdersHistory: {
                  orderBy: { changedAt: 'desc' },
                  take: 10
                }
              }
            });

            if (orderById) {
              existingOrder = {
                ...orderById,
                items: orderById.items ? JSON.parse(orderById.items) : [],
                rawData: orderById.rawData ? JSON.parse(orderById.rawData) : {}
              };
            }
          }

          if (!existingOrder) {
            results.push({
              orderNumber: orderData.orderNumber,
              action: 'error',
              error: `Order ${orderData.orderNumber} not found`
            });
            continue;
          }

          // Используем найденный externalId для обновления
          const result = await this.updateOrderSmart(existingOrder.externalId, orderData);
          
          if (result.updated) {
            totalUpdated++;
            results.push({
              orderNumber: orderData.orderNumber,
              action: 'updated',
              changedFields: result.changedFields,
              previousValues: result.previousValues
            });
          } else {
            totalSkipped++;
            results.push({
              orderNumber: orderData.orderNumber,
              action: 'skipped',
              reason: 'No changes detected'
            });
          }

        } catch (error) {
          console.error(`❌ Error updating order ${orderData.orderNumber}:`, error);
          results.push({
            orderNumber: orderData.orderNumber,
            action: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Обновляем кеш только для заказов, у которых изменились items
      const ordersWithItemsChanged = results
        .filter(result => result.action === 'updated' && result.changedFields.includes('items'))
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
        console.log(`✅ Updated cache for ${ordersWithItemsChanged.length} orders`);
      }

      console.log(`✅ Smart batch update completed: ${totalUpdated} updated, ${totalSkipped} skipped`);

      return {
        success: true,
        totalUpdated,
        totalSkipped,
        results
      };

    } catch (error) {
      console.error('❌ Smart batch update failed:', error);
      throw error;
    }
  }

  /**
   * Получает статистику по заказам из локальной БД
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
   * Получает время последней синхронизации
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
   * Получает товар по SKU с парсингом JSON полей
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
   * Предварительно рассчитывает статистику товаров для заказа (для кеша)
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
   * Обновляет кеш для заказа
   */
  async updateOrderCache(externalId: string): Promise<boolean> {
    try {
      // Получаем заказ по externalId
      const order = await prisma.order.findUnique({
        where: { externalId }
      });

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

      // Сохраняем в кеш
      await ordersCacheService.upsertOrderCache({
        externalId,
        processedItems,
        totalQuantity
      });

      console.log(`✅ Updated cache for order ${externalId}`);
      return true;
    } catch (error) {
      console.error(`❌ Error updating cache for order ${externalId}:`, error);
      return false;
    }
  }
  /**
   * Force обновление заказов (всегда обновляет, без проверки изменений)
   * Используется для ручной синхронизации, когда нужно пересинхронизировать все заказы
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
            const newOrderData = {
              id: parseInt(orderData.orderNumber), // Преобразуем orderNumber в число для id
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
              sajt: orderData.sajt || ''
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
            const updateData = {
              status: orderData.status || existingOrder.status,
              statusText: orderData.statusText || existingOrder.statusText,
              items: orderData.items || existingOrder.items,
              rawData: orderData.rawData || existingOrder.rawData,
              ttn: orderData.ttn || existingOrder.ttn,
              quantity: orderData.quantity !== undefined ? orderData.quantity : existingOrder.quantity,
              customerName: orderData.customerName || existingOrder.customerName,
              customerPhone: orderData.customerPhone || existingOrder.customerPhone,
              deliveryAddress: orderData.deliveryAddress || existingOrder.deliveryAddress,
              totalPrice: orderData.totalPrice !== undefined ? orderData.totalPrice : existingOrder.totalPrice,
              orderDate: orderData.orderDate ? new Date(orderData.orderDate).toISOString() : existingOrder.orderDate,
              shippingMethod: orderData.shippingMethod || existingOrder.shippingMethod,
              paymentMethod: orderData.paymentMethod || existingOrder.paymentMethod,
              cityName: orderData.cityName || existingOrder.cityName,
              provider: orderData.provider || existingOrder.provider,
              pricinaZnizki: orderData.pricinaZnizki || existingOrder.pricinaZnizki,
              sajt: orderData.sajt || existingOrder.sajt,
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
        console.log(`✅ Updated cache for ${ordersToCache.length} orders`);
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
