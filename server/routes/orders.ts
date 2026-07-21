import { Router } from 'express';
import { salesDriveService } from '../services/salesDriveService.js';
import { orderDatabaseService } from '../services/orderDatabaseService.js';
import { ordersCacheService } from '../services/ordersCacheService.js';
import { authenticateToken } from '../middleware/auth.js';
import { prisma, getOrderSourceDetailed, getOrderSourceMaps, getReportingDayStartHour, getReportingDate, getReportingDateRange, logServer } from '../lib/utils.js';
import { dilovodService } from '../services/dilovod/index.js';
import { getStatusText } from '../services/salesdrive/statusMapper.js';
import {
  computeShippedQuantityBreakdown,
  expandSetToLeaves,
  extractShipmentPayloadItems,
  getOrderReportItems,
  getOrderedQuantity,
  getReportProductDescriptors,
  recomputeSetPortions,
  type ReportProductDescriptor,
} from '../services/orderShipmentMetricsService.js';

const router = Router();

// Cache for aggregated statistics to improve performance on repeated requests
const statsCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type ReportCategorySeriesOption = {
  key: string;
  categoryId: number | null;
  label: string;
  count: number;
};

type ReportSetSeriesOption = {
  key: string;
  sku: string;
  label: string;
  totalOrderedQuantity: number;
};

type RawOrderItem = {
  sku?: string;
  name?: string;
  orderedQuantity?: number | string;
  quantity?: number | string;
};

type ShipmentPayloadData = {
  shipment?: {
    bySku?: Record<string, {
      accGood?: string;
      quantity?: number | string;
      orderedQuantity?: number | string;
    }>;
  };
};

function parseStockBalances(value: string | null | undefined): Record<string, number> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([warehouseId, balance]) => [warehouseId, Number(balance) || 0]),
    );
  } catch {
    return {};
  }
}

function normalizeDeductionQuantity(value: unknown): number {
  const quantity = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 0;
  }

  return Math.max(0, Math.round(quantity));
}

async function buildMonolithicSetStockUpdates(payloadData: unknown): Promise<Array<ReturnType<typeof prisma.product.update>>> {
  const shipmentBySku = (payloadData as ShipmentPayloadData | null | undefined)?.shipment?.bySku;
  if (!shipmentBySku || typeof shipmentBySku !== 'object') {
    return [];
  }

  const deductionMap = new Map<string, number>();

  for (const [sku, shipmentItem] of Object.entries(shipmentBySku)) {
    const normalizedSku = typeof sku === 'string' ? sku.trim() : '';
    const quantity = normalizeDeductionQuantity(shipmentItem?.quantity);

    if (!normalizedSku || quantity <= 0) {
      continue;
    }

    deductionMap.set(normalizedSku, (deductionMap.get(normalizedSku) ?? 0) + quantity);
  }

  if (deductionMap.size === 0) {
    return [];
  }

  const products = await prisma.product.findMany({
    where: { sku: { in: Array.from(deductionMap.keys()) } },
    select: { id: true, sku: true, stockBalanceByStock: true }
  });

  const updates = products.flatMap((product) => {
    const deduction = deductionMap.get(product.sku) ?? 0;
    if (deduction <= 0) {
      return [];
    }

    const stockBalances = parseStockBalances(product.stockBalanceByStock);
    const currentBalance = Number(stockBalances['2']) || 0;
    const nextBalance = Math.max(0, currentBalance - deduction);

    if (nextBalance === currentBalance) {
      return [];
    }

    return prisma.product.update({
      where: { id: product.id },
      data: {
        stockBalanceByStock: JSON.stringify({
          ...stockBalances,
          '2': nextBalance,
        })
      }
    });
  });

  return updates;
}

function normalizeOrderItems(items: unknown): RawOrderItem[] {
  if (Array.isArray(items)) {
    return items as RawOrderItem[];
  }

  if (typeof items === 'string') {
    if (!items.trim() || items === '[object Object]') {
      return [];
    }

    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? (parsed as RawOrderItem[]) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function buildCategorySeriesOptions(products: Array<{ sku: string; categoryKey?: string | null; categoryId?: number | null; categoryName?: string | null }>): ReportCategorySeriesOption[] {
  const categories = new Map<string, { categoryId: number | null; label: string; skus: Set<string> }>();

  for (const product of products) {
    if (!product.categoryKey || !product.categoryName) {
      continue;
    }

    const existing = categories.get(product.categoryKey) ?? {
      categoryId: product.categoryId ?? null,
      label: product.categoryName,
      skus: new Set<string>(),
    };

    existing.skus.add(product.sku);
    categories.set(product.categoryKey, existing);
  }

  return Array.from(categories.entries())
    .map(([key, value]) => ({
      key,
      categoryId: value.categoryId,
      label: value.label,
      count: value.skus.size,
    }))
    .sort((first, second) => first.label.localeCompare(second.label, 'uk-UA'));
}

function buildSetSeriesOptions(
  orders: Array<{ items?: unknown }>,
  productDescriptors: Map<string, ReportProductDescriptor>,
): ReportSetSeriesOption[] {
  const setTotals = new Map<string, { label: string; totalOrderedQuantity: number }>();

  for (const order of orders) {
    for (const item of normalizeOrderItems(order.items)) {
      const sku = typeof item.sku === 'string' ? item.sku.trim() : '';
      if (!sku) {
        continue;
      }

      const descriptor = productDescriptors.get(sku);
      if (!descriptor?.isSet) {
        continue;
      }

      const quantity = getOrderedQuantity(item.orderedQuantity ?? item.quantity);
      if (quantity <= 0) {
        continue;
      }

      const current = setTotals.get(sku) ?? {
        label: descriptor.name || item.name || sku,
        totalOrderedQuantity: 0,
      };

      current.totalOrderedQuantity += quantity;
      setTotals.set(sku, current);
    }
  }

  return Array.from(setTotals.entries())
    .map(([sku, value]) => ({
      key: `set_${sku}`,
      sku,
      label: value.label,
      totalOrderedQuantity: value.totalOrderedQuantity,
    }))
    .sort((first, second) => second.totalOrderedQuantity - first.totalOrderedQuantity || first.label.localeCompare(second.label, 'uk-UA'));
}

function buildChartDateKey(orderDate: Date, groupBy: string, reportingDate: string): string {
  switch (groupBy) {
    case 'hour': {
      const realYear = orderDate.getFullYear();
      const realMonth = String(orderDate.getMonth() + 1).padStart(2, '0');
      const realDay = String(orderDate.getDate()).padStart(2, '0');
      const realHour = String(orderDate.getHours()).padStart(2, '0');
      return `${realYear}-${realMonth}-${realDay}T${realHour}`;
    }
    case 'week': {
      const orderDateForWeek = new Date(reportingDate);
      const weekStart = new Date(orderDateForWeek);
      weekStart.setDate(orderDateForWeek.getDate() - orderDateForWeek.getDay() + 1);
      return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
    }
    case 'month': {
      const orderDateForMonth = new Date(reportingDate);
      return `${orderDateForMonth.getFullYear()}-${String(orderDateForMonth.getMonth() + 1).padStart(2, '0')}`;
    }
    case 'day':
    default: {
      const orderDateForDay = new Date(reportingDate);
      return `${orderDateForDay.getFullYear()}-${String(orderDateForDay.getMonth() + 1).padStart(2, '0')}-${String(orderDateForDay.getDate()).padStart(2, '0')}`;
    }
  }
}

function formatChartDateLabel(dateKey: string, groupBy: string): string {
  if (groupBy === 'hour') {
    const date = new Date(`${dateKey}:00:00`);
    return date.toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (groupBy === 'week') {
    const weekStart = new Date(dateKey);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const startLabel = weekStart.toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
    });
    const endLabel = weekEnd.toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
    });

    return `${startLabel} - ${endLabel}`;
  }

  if (groupBy === 'month') {
    const date = new Date(`${dateKey}-01`);
    return date.toLocaleDateString('uk-UA', {
      month: 'long',
      year: 'numeric',
    });
  }

  const date = new Date(dateKey);
  return date.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
  });
}

/**
 * GET /api/orders/test
 * Simple test to check SalesDrive API configuration
 */
router.get('/test', authenticateToken, async (req, res) => {
  try {

    // Check if environment variables are set
    const hasUrl = !!process.env.SALESDRIVE_API_URL;
    const hasKey = !!process.env.SALESDRIVE_API_KEY;

    const config = {
      hasUrl,
      hasKey,
      url: process.env.SALESDRIVE_API_URL || 'NOT_SET',
      keyPreview: hasKey ? 'SET (hidden)' : 'NOT_SET'
    };

    if (!hasUrl || !hasKey) {
      return res.json({
        success: false,
        message: '❌ SalesDrive API not configured',
        config,
        nextSteps: [
          'Create .env file in project root',
          'Add SALESDRIVE_API_URL=your_api_url',
          'Add SALESDRIVE_API_KEY=your_api_key'
        ]
      });
    }

    res.json({
      success: true,
      message: '✅ SalesDrive API configuration found!',
      config,
      nextSteps: [
        'Test API connection',
        'Fetch sample orders'
      ]
    });

  } catch (error) {
    console.error('❌ Test error:', error);
    res.status(500).json({
      success: false,
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/orders
 * Отримувати замовлення з локальної БД з можливістю синхронізації та сортування
 */
router.get('/', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  const { status, sync, sortBy, sortOrder, limit, search } = req.query;
  const include = (req.query.include as string | undefined)?.split(',').map(s => s.trim()).filter(Boolean) || [];
  const fields = (req.query.fields as string | undefined)?.split(',').map(s => s.trim()).filter(Boolean) || [];

  // Парсимо статуси: якщо рядок містить кому, розбиваємо на масив
  let parsedStatus: string | string[] | undefined = status as string;
  if (typeof status === 'string' && status.includes(',')) {
    parsedStatus = status.split(',').map(s => s.trim());
  }


  try {
    // Якщо запрошена синхронізація, спочатку синхронізуємо
    if (sync === 'true') {
      const syncStartTime = Date.now();
      const syncResult = await salesDriveService.syncOrdersWithDatabase();
      const syncDuration = Date.now() - syncStartTime;
      if (!syncResult.success) {
        console.warn('⚠️ [SERVER] GET /api/orders: Sync completed with errors:', syncResult.errors);
      }
    }

    // Отримуємо замовлення з локальної БД з сортуванням та фільтрацією
    const dbStartTime = Date.now();

    const orders = await orderDatabaseService.getOrders({
      status: parsedStatus,
      limit: parseInt(limit as string) || 100,
      offset: parseInt(req.query.offset as string) || 0,
      sortBy: (sortBy as 'orderDate' | 'createdAt' | 'lastSynced' | 'orderNumber') || 'orderDate',
      sortOrder: (sortOrder as 'asc' | 'desc') || 'desc',
      search: search as string,
      // @ts-ignore: extended filters with include flags supported by service
      includeItems: include.includes('items'),
      // @ts-ignore
      includeRaw: include.includes('rawData'),
      // @ts-ignore: dynamic fields whitelist supported by service
      fields
    });

    // Отримуємо загальну кількість замовлень для пагінації
    const totalCount = await orderDatabaseService.getOrdersCount({
      status: parsedStatus,
      search: search as string
    });

    // Отримуємо лічильники по статусах для табів
    const statusCounts = await orderDatabaseService.getStatusCounts();
    const dbDuration = Date.now() - dbStartTime;
    const totalDuration = Date.now() - startTime;
    const response = {
      success: true,
      data: orders,
      metadata: {
        source: 'local_database',
        totalOrders: totalCount,
        ordersOnPage: orders.length,
        fetchedAt: new Date().toISOString(),
        lastSynced: orders.length > 0 ? orders[0].lastSynced : null,
        sortBy: sortBy || 'orderDate',
        sortOrder: sortOrder || 'desc',
        limit: parseInt(limit as string) || 100,
        offset: parseInt(req.query.offset as string) || 0,
        processingTimeMs: totalDuration,
        dbFetchTimeMs: dbDuration,
        statusCounts: statusCounts
      }
    };

    res.json(response);

  } catch (error) {
    const errorTime = Date.now() - startTime;
    console.error(`❌ [SERVER] GET /api/orders: Error after ${errorTime}ms:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      processingTimeMs: errorTime
    });
  }
});


// Кеш для статистики ваги (5 хвилин)
const weightStatsCache = new Map();
const WEIGHT_STATS_CACHE_TTL = 5 * 60 * 1000; // 5 хвилин

/**
 * GET /api/orders/weight-stats
 * Отримати статистику ваги замовлень за статусами для комірника
 */
router.get('/weight-stats', authenticateToken, async (req, res) => {
  try {
    console.log('📊 [WEIGHT STATS] Запит статистики ваги замовлень (через CACHE)');
    const cacheKey = 'weight-stats';
    const cached = weightStatsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < WEIGHT_STATS_CACHE_TTL) {
      console.log('📊 [WEIGHT STATS] Повертаємо дані з кешу');
      return res.json(cached.data);
    }

    const aWeekAgo = new Date();
    aWeekAgo.setDate(aWeekAgo.getDate() - 7);
    aWeekAgo.setHours(0, 0, 0, 0);

    // Витягуємо тільки externalId + status за останній тиждень
    const orders = await prisma.order.findMany({
      where: {
        status: { in: ['2', '3', '4'] },
        orderDate: { gte: aWeekAgo },
      },
      select: { externalId: true, status: true }
    });

    const orderIdsByStatus: { [status: string]: string[] } = { '2': [], '3': [], '4': [] };
    for (const order of orders) {
      if (order.status && order.externalId) {
        if (!orderIdsByStatus[order.status]) orderIdsByStatus[order.status] = [];
        orderIdsByStatus[order.status].push(order.externalId);
      }
    }
    // Об'єднання всіх externalId для bulk кеш-запиту
    const allExternalIds = orders.map(o => o.externalId);

    // Bulk отримаємо кеші
    const ordersCacheMap = await ordersCacheService.getMultipleOrderCaches(allExternalIds);

    // Агрегація по статусу
    let confirmedWeightKg = 0;
    let readyToShipWeightKg = 0;
    let shippedWeightKg = 0;
    let confirmedCount = 0;
    let readyToShipCount = 0;
    let shippedCount = 0;

    for (const status of ['2', '3', '4']) {
      for (const externalId of orderIdsByStatus[status] || []) {
        const cache = ordersCacheMap.get(externalId);
        if (cache && cache.totalWeight != null && !isNaN(Number(cache.totalWeight))) {
          const w = Number(cache.totalWeight);
          if (status === '2') { confirmedWeightKg += w; confirmedCount++; }
          else if (status === '3') { readyToShipWeightKg += w; readyToShipCount++; }
          else if (status === '4') { shippedWeightKg += w; shippedCount++; }
        }
      }
    }
    
    const activeTotalWeightKg = confirmedWeightKg + readyToShipWeightKg;
    const activeTotalCount = confirmedCount + readyToShipCount;
    const response = {
      success: true,
      data: {
        confirmed: {
          count: confirmedCount,
          weight: confirmedWeightKg,
          weightText: `${confirmedWeightKg.toFixed(2)} кг`
        },
        readyToShip: {
          count: readyToShipCount,
          weight: readyToShipWeightKg,
          weightText: `${readyToShipWeightKg.toFixed(2)} кг`
        },
        total: {
          count: activeTotalCount,
          weight: activeTotalWeightKg,
          weightText: `${activeTotalWeightKg.toFixed(2)} кг`
        }
      },
      metadata: {
        calculatedAt: new Date().toISOString(),
        totalOrdersProcessed: orders.length
      }
    };
    weightStatsCache.set(cacheKey, {
      data: response,
      timestamp: Date.now()
    });
    res.json(response);
  } catch (error) {
    console.error('❌ [WEIGHT STATS] Помилка отримання статистики ваги (через кеш):', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/orders/stats/summary
 * Отримати статистику по замовленням із локальної БД
 */
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    // Отримуємо статистику із локальної БД
    const stats = await orderDatabaseService.getOrdersStats();
    const lastSyncInfo = await orderDatabaseService.getLastSyncInfo();

    res.json({
      success: true,
      data: stats,
      metadata: {
        source: 'Local Database',
        lastSynced: lastSyncInfo,
        fetchedAt: new Date().toISOString(),
        note: 'Data from local database, updated via background sync'
      }
    });
  } catch (error) {
    console.error('Error getting order stats from database:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/orders/raw/all
 * Отримати всі замовлення за останні 7 днів у сирому вигляді для налагодження
 */
router.get('/raw/all', authenticateToken, async (req, res) => {
  try {
    // Використовуємо паралельне завантаження за останній тиждень
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 1); // За останній тиждень
    const startDateStr = startDate.toISOString().split('T')[0];

    const allOrders = await salesDriveService.fetchOrdersFromDateRangeParallel(startDateStr, endDate);

    if (!allOrders.success) {
      return res.status(500).json({
        success: false,
        error: allOrders.error || 'Failed to fetch orders',
      });
    }

    res.json({
      success: true,
      data: allOrders.data,
      metadata: {
        fetchedAt: new Date().toISOString(),
        totalOrders: allOrders.data?.length || 0,
        note: 'Raw data from SalesDrive API for debugging purposes'
      }
    });
  } catch (error) {
    console.error('Error getting raw orders:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/orders/debug/raw
 * Отримати сирі дані від SalesDrive API без обробки
 */
router.get('/debug/raw', authenticateToken, async (req, res) => {
  try {
    // Отримуємо сирі дані безпосередньо від SalesDrive API
    const response = await fetch(`${process.env.SALESDRIVE_API_URL}?page=1&limit=5`, {
      method: 'GET',
      headers: {
        'Form-Api-Key': process.env.SALESDRIVE_API_KEY || '',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`SalesDrive API error: ${response.status} - ${response.statusText}`);
    }

    const rawData = await response.json();

    res.json({
      success: true,
      rawData: rawData,
      metadata: {
        fetchedAt: new Date().toISOString(),
        apiUrl: process.env.SALESDRIVE_API_URL,
        note: 'Direct raw response from SalesDrive API without processing'
      }
    });
  } catch (error) {
    console.error('Error getting debug raw data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/orders/period
 * Отримати замовлення за певний період з синхронізацією
 */
router.get('/period', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, sync } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    // Якщо запрошена синхронізація, спочатку синхронізуємо
    if (sync === 'true') {
      const syncResult = await salesDriveService.syncOrdersWithDatabase();

      if (!syncResult.success) {
        console.warn('⚠️ Sync completed with errors:', syncResult.errors);
      }
    }

    // Отримуємо замовлення за період
    const orders = await orderDatabaseService.getOrders({
      limit: 10000, // Великий ліміт для періоду
      sortBy: 'orderDate',
      sortOrder: 'desc'
    });

    // Фільтруємо по даті
    const filteredOrders = orders.filter(order => {
      if (!order.orderDate) return false;
      const orderDate = new Date(order.orderDate);
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      return orderDate >= start && orderDate <= end;
    });

    res.json({
      success: true,
      data: filteredOrders,
      metadata: {
        source: 'local_database',
        period: { startDate, endDate },
        totalOrders: filteredOrders.length,
        fetchedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting orders for period:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/orders/fix-items-data
 * Виправити пошкоджені дані items у замовленнях
 */
router.post('/fix-items-data', authenticateToken, async (req, res) => {
  try {
    const { user } = req as any;

    // Перевіряємо права доступу (тільки ADMIN)
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    const orders = await orderDatabaseService.getOrders({ limit: 10000 });
    let fixedCount = 0;
    let skippedCount = 0;

    for (const order of orders) {
      if (order.items === '[object Object]') {
        // Намагаємось відновити дані з rawData
        try {
          if (order.rawData && typeof order.rawData === 'string') {
            const rawData = JSON.parse(order.rawData);

            // Шукаємо items у rawData (структура може бути різною)
            let items = null;
            if (rawData.items) {
              items = rawData.items;
            } else if (rawData.data && rawData.data.items) {
              items = rawData.data.items;
            }

            if (items && Array.isArray(items)) {
              // Оновлюємо items у базі даних
              await orderDatabaseService.updateOrder(order.externalId, {
                items: items
              });
              fixedCount++;
            } else {
              console.warn(`Could not extract items from rawData for order ${order.externalId}`);
              skippedCount++;
            }
          } else {
            skippedCount++;
          }
        } catch (parseError) {
          console.warn(`Failed to parse rawData for order ${order.externalId}:`, parseError);
          skippedCount++;
        }
      }
    }

    res.json({
      success: true,
      message: `Fixed ${fixedCount} orders, skipped ${skippedCount} orders`,
      stats: {
        totalOrders: orders.length,
        fixedCount,
        skippedCount
      }
    });
  } catch (error) {
    console.error('Error fixing items data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/orders/calculate-actual-quantity
 * Тестовий ендпоінт для перевірки логіки calculateActualQuantity
 */
router.post('/calculate-actual-quantity', authenticateToken, async (req, res) => {
  try {
    const { items, initialQuantity } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, error: 'items must be an array' });
    }
    const result = await orderDatabaseService.calculateActualQuantityPublic(items, initialQuantity);
    res.json({ success: true, actualQuantity: result });
  } catch (error) {
    console.error('❌ Error in /api/orders/calculate-actual-quantity:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * GET /api/orders/:externalId
 * Отримати деталі конкретного замовлення за externalId (номером замовлення з SalesDrive)
 */
router.get('/:externalId', authenticateToken, async (req, res) => {
  try {
    const { externalId } = req.params; // Змінили з id на externalId
    if (!externalId) {
      return res.status(400).json({
        success: false,
        error: 'Order external ID is required'
      });
    }


    // Отримуємо деталі замовлення за externalId
    const orderDetails = await orderDatabaseService.getOrderByExternalId(externalId);

    if (!orderDetails) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Повертаємо повні дані замовлення
    res.json({
      success: true,
      data: {
        id: orderDetails.id,
        externalId: orderDetails.externalId,
        orderNumber: orderDetails.orderNumber,
        ttn: orderDetails.ttn,
        quantity: orderDetails.quantity,
        status: orderDetails.status,
        statusText: orderDetails.statusText,
        items: orderDetails.items,
        customerName: orderDetails.customerName,
        customerPhone: orderDetails.customerPhone,
        deliveryAddress: orderDetails.deliveryAddress,
        totalPrice: orderDetails.totalPrice,
        createdAt: orderDetails.createdAt,
        orderDate: orderDetails.orderDate,
        shippingMethod: orderDetails.shippingMethod,
        paymentMethod: orderDetails.paymentMethod,
        cityName: orderDetails.cityName,
        provider: orderDetails.provider,
        lastSynced: orderDetails.lastSynced,
        rawData: orderDetails.rawData,
        payloadData: orderDetails.payloadData,
        previousOrderExternalId: orderDetails.previousOrderExternalId,
        previousOrderNumber: orderDetails.previousOrderNumber,
        nextOrderExternalId: orderDetails.nextOrderExternalId,
        nextOrderNumber: orderDetails.nextOrderNumber,
        dilovodDocId: orderDetails.dilovodDocId,
        sajt: orderDetails.sajt,
      }
    });

  } catch (error) {
    console.error('❌ Error fetching order details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order details',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});


/**
 * GET /api/orders/:id/status
 * Отримати статус замовлення з локальної бази даних
 */
router.get('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await orderDatabaseService.getOrderStatus(id);
    res.json({
      success: true,
      status: result
    });
  } catch (error) {
    console.error('❌ Error fetching order status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/orders/:id/fiscal-receipt?index=0
 * Отримати фіскальний чек з Dilovod за ID замовлення
 * Query params:
 *   - index: номер чека (0-based), за замовчуванням 0
 */
router.get('/:id/fiscal-receipt', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const index = parseInt(req.query.index as string) || 0;

    console.log(`📄 [FISCAL RECEIPT] Запит фіскального чеку для замовлення ID: ${id}, індекс: ${index}`);

    // Отримуємо замовлення з БД для отримання dilovodDocId
    const order = await prisma.order.findFirst({
      where: {
        id: parseInt(id)
      },
      select: {
        id: true,
        externalId: true,
        orderNumber: true,
        dilovodDocId: true
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    if (!order.dilovodDocId) {
      return res.status(404).json({
        success: false,
        error: 'Fiscal receipt not generated yet',
        message: 'Чек ще не сформовано. Замовлення має бути експортоване в Dilovod.'
      });
    }

    // Отримуємо фіскальний чек з Dilovod
    const receipt = await dilovodService.getFiscalReceipt(order.dilovodDocId, index);

    if (!receipt) {
      return res.status(404).json({
        success: false,
        error: 'Fiscal receipt not found',
        message: `Чек з індексом ${index} не знайдено в системі Dilovod`
      });
    }

    res.json({
      success: true,
      data: {
        orderId: order.id,
        externalId: order.externalId,
        orderNumber: order.orderNumber,
        dilovodDocId: order.dilovodDocId,
        receiptIndex: index,
        receipt
      }
    });

  } catch (error) {
    console.error('❌ Error fetching fiscal receipt:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fiscal receipt',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/orders/:id/fiscal-receipts/list
 * Отримати список всіх доступних фіскальних чеків для замовлення
 */
router.get('/:id/fiscal-receipts/list', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`📋 [FISCAL RECEIPTS LIST] Запит списку чеків для замовлення ID: ${id}`);

    // Отримуємо замовлення з БД
    const order = await prisma.order.findFirst({
      where: {
        id: parseInt(id)
      },
      select: {
        id: true,
        externalId: true,
        orderNumber: true,
        dilovodDocId: true
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    if (!order.dilovodDocId) {
      return res.status(404).json({
        success: false,
        error: 'Order not exported to Dilovod',
        message: 'Замовлення ще не експортоване в Dilovod'
      });
    }

    // Отримуємо список чеків
    const receiptsList = await dilovodService.getFiscalReceiptsList(order.dilovodDocId);

    res.json({
      success: true,
      data: {
        orderId: order.id,
        externalId: order.externalId,
        orderNumber: order.orderNumber,
        dilovodDocId: order.dilovodDocId,
        ...receiptsList
      }
    });

  } catch (error) {
    console.error('❌ Error fetching fiscal receipts list:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fiscal receipts list',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/orders/:id/status
 * Оновити статус замовлення локально, в SalesDrive та тригернути автоматичний export/відвантаження в Dilovod, якщо статус змінився на "3" (На відправку)
 */
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, payloadData } = req.body;
    const orderId = parseInt(id, 10);

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required',
      });
    }

    const currentOrder = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        readyToShipAt: true,
        payloadData: true,
      }
    });

    if (!currentOrder) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    const shouldDeductMonolithicStock = status === '3' && currentOrder.status === '2' && !currentOrder.readyToShipAt;
    const shipmentPayloadSource = payloadData !== undefined ? payloadData : currentOrder.payloadData;

    // Якщо статус змінився на "3" (На відправку), записуємо дату в readyToShipAt
    if (status === '3') {
      try {
        const stockUpdates = shouldDeductMonolithicStock
          ? await buildMonolithicSetStockUpdates(shipmentPayloadSource)
          : [];

        await prisma.$transaction([
          prisma.order.update({
            where: { id: orderId },
            data: {
              ...(currentOrder.readyToShipAt ? {} : { readyToShipAt: new Date() }),
              ...(payloadData !== undefined ? { payloadData } : {})
            }
          }),
          ...stockUpdates
        ]);

        if (shouldDeductMonolithicStock && stockUpdates.length > 0) {
          console.log(`✅ [Orders API] Optimistic monolithic stock deduction applied for order ${orderId} (${stockUpdates.length} product(s))`);
        }

        if (!currentOrder.readyToShipAt) {
          console.log(`✅ [Orders API] Order ${id} readyToShipAt set to current time`);
        }

      } catch (dbError) {
        console.error(`⚠️ [Orders API] Failed to update readyToShipAt / deduct stock for order ${id}:`, dbError);
        // Не блокуємо відповідь, якщо не вдалося оновити дату
      }
    
      // Тригер автоматичного export/відвантаження в Dilovod (фонова операція — не блокує відповідь)
      import('../services/dilovod/DilovodAutoExportService.js')
        .then(({ dilovodAutoExportService }) =>
          dilovodAutoExportService.processOrderStatusChange(
            orderId,
            status,
            'manual:status_change'
          )
        )
        .catch(err =>
          console.warn('⚠️ [AutoExport] Manual status change trigger failed:', err instanceof Error ? err.message : err)
        );
    }

    // Оновлюємо статус в SalesDrive
    const result = await salesDriveService.updateSalesDriveOrderStatus(id, status);

    if (result) {
      res.json({
        success: true,
        message: 'Order status updated successfully in SalesDrive',
        id: id,
        newStatus: status,
        salesDriveUpdated: true,
        updatedAt: new Date().toISOString()
      });
    } else {
      console.warn(`⚠️ Failed to update order ${id} status in SalesDrive`);
      res.status(500).json({
        success: false,
        error: 'Failed to update order status in SalesDrive',
        id: id,
        newStatus: status
      });
    }
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/orders/:externalId/cache
 * Заповнити кеш для конкретного замовлення
 */
router.post('/:externalId/cache', authenticateToken, async (req, res) => {
  try {
    const { externalId } = req.params;
    const success = await orderDatabaseService.updateOrderCache(externalId);

    if (success) {
      res.json({
        success: true,
        message: `Cache updated for order ${externalId}`
      });
    } else {
      res.status(500).json({
        success: false,
        error: `Failed to update cache for order ${externalId}`
      });
    }
  } catch (error) {
    console.error('Error updating cache:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/orders/cache/stats
 * Отримати статистику кешу
 */
router.get('/cache/stats', authenticateToken, async (req, res) => {
  try {
    const totalOrders = await prisma.order.count();

    // Отримуємо статистику кешу з orders_cache
    const cacheStats = await ordersCacheService.getCacheStatistics();
    const cachedOrders = cacheStats.totalEntries;
    const averageCacheTime = cacheStats.averageAge * 60 * 60 * 1000; // в миллисекунды

    // Отримати hit rate (відсоток замовлень з кешем)
    const cacheHitRate = totalOrders > 0 ? (cachedOrders / totalOrders) * 100 : 0;

    // Загальний розмір кешу - кількість замовлень з кешем
    const totalCacheSize = cachedOrders;

    // Отримати час останнього оновлення кешу
    const lastCacheUpdate = await prisma.ordersCache.findFirst({
      orderBy: { cacheUpdatedAt: 'desc' },
      select: { cacheUpdatedAt: true }
    });

    res.json({
      success: true,
      stats: {
        totalOrders,
        cachedOrders,
        cacheHitRate,
        lastCacheUpdate: lastCacheUpdate ? lastCacheUpdate.cacheUpdatedAt.toISOString() : new Date().toISOString(),
        averageCacheTime: cacheStats.averageAge, // в годинах
        totalCacheSize
      }
    });
  } catch (error) {
    console.error('Error fetching cache stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cache stats'
    });
  }
});

/**
 * GET /api/orders/cache/info
 * Отримати інформацію про стан кешу
 */
router.get('/cache/info', authenticateToken, async (req, res) => {
  try {
    // TODO: Implement cache info endpoint
    const cacheInfo = {
      enabled: false,
      size: 0,
      maxSize: 0,
      entries: []
    };

    res.json({
      success: true,
      data: cacheInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting cache info:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/orders/cache/clear
 * Очистити весь кеш
 */
router.post('/cache/clear', authenticateToken, async (req, res) => {
  try {
    const result = salesDriveService.clearCache();

    res.json({
      success: true,
      message: `Cache cleared successfully`,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * DELETE /api/orders/cache/:key
 * Очистити конкретний запис з кешу
 */
router.delete('/cache/:key', authenticateToken, async (req, res) => {
  try {
    const { key } = req.params;
    const deleted = salesDriveService.clearCacheEntry(decodeURIComponent(key));

    res.json({
      success: true,
      message: deleted ? `Cache entry cleared` : `Cache entry not found`,
      data: { deleted, key },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error clearing cache entry:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * POST /api/orders/cache/stats/clear
 * Очистити серверний кеш статистики
 */
router.post('/cache/stats/clear', authenticateToken, async (req, res) => {
  try {
    const sizeBefore = statsCache.size;
    statsCache.clear();
    
    logServer(`✅ [STATS CACHE] Cleared ${sizeBefore} cached statistics entries`);

    res.json({
      success: true,
      message: `Statistics cache cleared successfully`,
      data: {
        entriesCleared: sizeBefore,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error clearing statistics cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear statistics cache',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Допоміжні функції для порівняння товарів у замовленнях
async function getOrderItemsForComparison(orderId: number): Promise<any[] | null> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { items: true, externalId: true }
    });

    if (!order || !order.items) {
      return null;
    }

    let orderItems: any[] = [];

    // Парсимо товари замовлення
    if (typeof order.items === 'string') {
      if (order.items === '[object Object]') {
        console.warn(`Order has invalid items data`);
        return null;
      }

      try {
        orderItems = JSON.parse(order.items);
      } catch (parseError) {
        console.warn(`Failed to parse items for order:`, parseError);
        return null;
      }
    } else if (Array.isArray(order.items)) {
      orderItems = order.items;
    }

    return orderItems;
  } catch (error) {
    console.error('Error getting order items for comparison:', error);
    return null;
  }
}

// Розпарсити кешовані товари замовлення
function parseCachedOrderItems(processedItems: string | null): any[] | null {
  if (!processedItems) return null;

  try {
    const cachedData = JSON.parse(processedItems);
    if (Array.isArray(cachedData)) {
      return cachedData;
    }
    return null;
  } catch (error) {
    console.warn('Failed to parse cached items:', error);
    return null;
  }
}

// Порівняти товари в замовленнях
function compareOrderItems(currentItems: any[], cachedItems: any[]): boolean {
  if (!currentItems || !cachedItems) return true; // Якщо не можемо порівняти - вважаємо, що змінилися

  // Створюємо мапи за SKU для швидкого порівняння
  const currentMap = new Map();
  const cachedMap = new Map();

  // Нормалізуємо поточні товари
  currentItems.forEach(item => {
    if (item && item.sku) {
      currentMap.set(item.sku.toString().toLowerCase(), {
        sku: item.sku,
        quantity: item.orderedQuantity || item.quantity || 0,
        name: item.name || ''
      });
    }
  });

  // Нормалізуємо кешовані товари
  cachedItems.forEach(item => {
    if (item && item.sku) {
      cachedMap.set(item.sku.toString().toLowerCase(), {
        sku: item.sku,
        quantity: item.orderedQuantity || item.quantity || 0,
        name: item.name || ''
      });
    }
  });

  // Порівнюємо розміри
  if (currentMap.size !== cachedMap.size) {
    console.log(`📊 Items count changed: current=${currentMap.size}, cached=${cachedMap.size}`);
    return true; // Кількість товарів змінилася
  }

  // Порівнюємо кожен товар
  for (const [sku, currentItem] of currentMap) {
    const cachedItem = cachedMap.get(sku);

    if (!cachedItem) {
      console.log(`➕ New item found: ${sku}`);
      return true; // Новий товар
    }

    if (currentItem.quantity !== cachedItem.quantity) {
      console.log(`📈 Quantity changed for ${sku}: current=${currentItem.quantity}, cached=${cachedItem.quantity}`);
      return true; // Кількість змінилася
    }
  }

  // Перевіряємо зворотне - чи немає видалених товарів
  for (const [sku, cachedItem] of cachedMap) {
    if (!currentMap.has(sku)) {
      console.log(`➖ Item removed: ${sku}`);
      return true; // Товар видалений
    }
  }

  return false; // Товари не змінилися
}

/**
 * POST /api/orders/cache/validate
 * Валидировать и обновить кеш заказов
 */
router.post('/cache/validate', authenticateToken, async (req, res) => {
  try {
    // Params can come from body (JSON POST) or query string — support both
    const startDate = (req.body?.startDate ?? req.query.startDate) as string | undefined;
    const endDate = (req.body?.endDate ?? req.query.endDate) as string | undefined;
    const force = req.body?.force ?? req.query.force;
    const mode = (req.body?.mode ?? req.query.mode) as string | undefined;

    console.log('🔍 [CACHE VALIDATION] Starting cache validation...', {
      startDate,
      endDate,
      force: force,
      mode: mode || 'full',
      hasStartDate: !!startDate,
      hasEndDate: !!endDate
    });

    let actualOrders: any[];
    let validationMode: string;
    let dateRangeFilter: { startDate: Date; endDate: Date } | null = null;

    if (mode === 'full' || (!startDate && mode !== 'period')) {
      // Полная валидация - проверяем заказы за последний год
      validationMode = 'full';

      console.log('🌐 [CACHE VALIDATION] Full validation mode - getting all orders from database...');

      // Получаем все заказы за последний год из базы данных
      const fullStartDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const fullEndDate = new Date();

      const ordersFromDb = await prisma.order.findMany({
        where: {
          orderDate: {
            gte: fullStartDate,
            lte: fullEndDate
          }
        },
        select: {
          id: true,
          externalId: true,
          orderDate: true,
          updatedAt: true
        }
      });

      actualOrders = ordersFromDb;
      console.log(`📊 [CACHE VALIDATION] Found ${ordersFromDb.length} orders in database for full validation`);

    } else {
      // Валидация за период - проверяем только заказы в выбранном диапазоне
      validationMode = 'period';
      const startDateObj = new Date(startDate as string + ' 00:00:00');
      const endDateObj = endDate ? new Date(endDate as string + ' 23:59:59') : new Date();
      dateRangeFilter = { startDate: startDateObj, endDate: endDateObj };

      const now = new Date();
      const daysDiff = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));

      console.log('🌐 [CACHE VALIDATION] Period validation mode - getting orders from database...');
      console.log(`📅 [CACHE VALIDATION] Date range: ${daysDiff} days (${startDateObj.toISOString()} to ${endDateObj.toISOString()})`);

      // Проверки на корректность дат
      if (startDateObj > now) {
        console.warn(`⚠️ [CACHE VALIDATION] Start date is in the future: ${startDateObj.toISOString()}`);
      }
      if (endDateObj > now) {
        console.warn(`⚠️ [CACHE VALIDATION] End date is in the future: ${endDateObj.toISOString()}`);
      }
      if (daysDiff > 30) {
        console.warn(`⚠️ [CACHE VALIDATION] Large date range selected: ${daysDiff} days. Consider using a smaller period.`);
      }
      if (daysDiff <= 0) {
        throw new Error('Invalid date range: start date must be before end date');
      }

      // Получаем заказы из базы данных за выбранный период
      console.log(`📅 [CACHE VALIDATION] Searching for orders updated between ${startDateObj.toISOString()} and ${endDateObj.toISOString()}`);

      const ordersFromDb = await prisma.order.findMany({
        where: {
          orderDate: {
            gte: startDateObj,
            lte: endDateObj
          }
        },
        select: {
          id: true,
          externalId: true,
          orderDate: true,
          updatedAt: true
        },
        orderBy: {
          orderDate: 'desc'
        }
      });

      actualOrders = ordersFromDb;
      console.log(`📊 [CACHE VALIDATION] Found ${ordersFromDb.length} orders in database for period validation`);

      // Предупреждение если найдено много заказов
      if (ordersFromDb.length >= 500) {
        console.warn(`⚠️ [CACHE VALIDATION] Знайдено 500+ замовлень за обраний період. Подумайте над тим, щоб звузити діапазон дат для кращої продуктивності.`);
      }
    }

    const actualOrderIds = new Set(actualOrders.map(order => order.externalId));
    console.log(`📊 [CACHE VALIDATION] Found ${actualOrders.length} orders in database`);

    // Статистика обработки
    const stats = {
      totalCached: 0, // Будет рассчитано позже
      totalActual: actualOrders.length,
      cacheHits: 0,
      cacheMisses: 0,
      cacheStale: 0,
      itemsUnchanged: 0, // Товары не изменились, хотя дата была новее
      updated: 0,
      processed: 0,
      errors: 0
    };

    // Получаем кеш для всех найденных заказов
    const cachedOrdersMap = await ordersCacheService.getMultipleOrderCaches(Array.from(actualOrderIds));
    stats.totalCached = cachedOrdersMap.size;

    // Создаем мапу заказов из базы данных по externalId
    const actualOrdersMap = new Map();
    actualOrders.forEach(order => {
      actualOrdersMap.set(order.externalId, order);
    });

    // Проходим по всем заказам из базы данных
    const toUpdate: string[] = [];

    for (const actualOrder of actualOrders) {
      stats.processed++;

      try {
        const externalId = actualOrder.externalId;
        const cachedOrder = cachedOrdersMap.get(externalId);

        let needsUpdate = force === 'true';

        if (!needsUpdate) {
          if (!cachedOrder) {
            // Кеш не существует - нужно создать
            needsUpdate = true;
            stats.cacheMisses++;
            console.log(`⚠️ [CACHE VALIDATION] Cache missing for order ${externalId}`);
          } else {
            // Сравниваем даты обновления
            const cachedDate = new Date(cachedOrder.cacheUpdatedAt);
            const actualDate = new Date(actualOrder.updatedAt);

            if (actualDate > cachedDate) {
              // Дата обновления заказа новее даты кеша - проверяем, изменились ли товары
              console.log(`📅 [CACHE VALIDATION] Order ${externalId} is stale by date (cached: ${cachedDate.toLocaleString('uk-UA')}, actual: ${actualDate.toLocaleString('uk-UA')})`);

              // Получаем актуальные товары заказа
              const currentOrderItems = await getOrderItemsForComparison(actualOrder.id);
              const cachedOrderItems = parseCachedOrderItems(cachedOrder.processedItems);

              if (currentOrderItems && cachedOrderItems) {
                // Сравниваем товары
                const itemsChanged = compareOrderItems(currentOrderItems, cachedOrderItems);

                if (itemsChanged) {
                  needsUpdate = true;
                  stats.cacheStale++;
                  console.log(`📦 [CACHE VALIDATION] Order ${externalId} items changed - cache needs update`);
                } else {
                  // Товары не изменились, кеш все еще актуален (несмотря на более новую дату)
                  stats.itemsUnchanged++;
                  console.log(`✅ [CACHE VALIDATION] Order ${externalId} items unchanged - cache is still valid despite newer date`);
                }
              } else {
                // Не удалось получить или распарсить товары - обновляем кеш для безопасности
                needsUpdate = true;
                stats.cacheStale++;
                console.log(`⚠️ [CACHE VALIDATION] Could not compare items for order ${externalId} - updating cache anyway`);
              }
            } else {
              stats.cacheHits++;
              console.log(`✅ [CACHE VALIDATION] Order ${externalId} cache is up to date`);
            }
          }
        } else {
          console.log(`🔄 [CACHE VALIDATION] Force update enabled for order ${externalId}`);
        }

        if (needsUpdate) {
          toUpdate.push(externalId);
        }

      } catch (error) {
        console.error(`❌ [CACHE VALIDATION] Error processing order ${actualOrder.externalId}:`, error);
        stats.errors++;
      }
    }

    const batchesCount = Math.ceil(toUpdate.length / 50);
    console.log(`📊 [CACHE VALIDATION] Validation summary:`, {
      mode: validationMode,
      period: dateRangeFilter ? `${dateRangeFilter.startDate.toLocaleString('uk-UA')} - ${dateRangeFilter.endDate.toLocaleString('uk-UA')}` : 'all time',
      processed: stats.processed,
      cacheHits: stats.cacheHits,
      cacheMisses: stats.cacheMisses,
      cacheStale: stats.cacheStale,
      itemsUnchanged: stats.itemsUnchanged,
      toUpdate: toUpdate.length,
      batches: batchesCount,
      estimatedTime: `${Math.ceil(batchesCount * 0.5)}s (with 500ms pauses)`,
      efficiency: `${Math.round((stats.itemsUnchanged / (stats.processed - stats.cacheMisses)) * 100) || 0}% items unchanged despite newer dates`
    });

    console.log(`📊 [CACHE VALIDATION] Processing ${toUpdate.length} orders to update`);

    // Разделяем на пакеты для эффективной обработки
    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      batches.push(toUpdate.slice(i, i + BATCH_SIZE));
    }

    console.log(`📦 [CACHE VALIDATION] Split into ${batches.length} batches of up to ${BATCH_SIZE} orders each`);

    // Обрабатываем каждый пакет
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`🔄 [CACHE VALIDATION] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} orders)`);

      // Обрабатываем заказы в пакете параллельно
      const batchPromises = batch.map(async (orderId) => {
        try {
          const cacheUpdated = await orderDatabaseService.updateOrderCache(orderId);
          if (cacheUpdated) {
            return { orderId, success: true };
          } else {
            console.warn(`⚠️ [CACHE VALIDATION] Failed to update cache for orderId ${orderId}`);
            return { orderId, success: false, error: 'Update failed' };
          }
        } catch (error) {
          console.error(`❌ [CACHE VALIDATION] Error updating cache for orderId ${orderId}:`, error);
          return { orderId, success: false, error: error.message };
        }
      });

      // Ждем завершения всех обновлений в пакете
      const batchResults = await Promise.all(batchPromises);

      const successCount = batchResults.filter(r => r.success).length;
      stats.updated += successCount;
      stats.errors += batchResults.filter(r => !r.success).length;

      console.log(`✅ [CACHE VALIDATION] Batch ${batchIndex + 1} completed: ${successCount}/${batch.length} successful`);

      // Небольшая пауза между пакетами (кроме последнего)
      if (batchIndex < batches.length - 1) {
        console.log(`⏳ [CACHE VALIDATION] Waiting 500ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`🎉 [CACHE VALIDATION] All batches processed successfully`);

    // Получаем финальную статистику кеша
    const finalCacheStats = await ordersCacheService.getCacheStatistics();

    const result = {
      success: true,
      message: `Cache validation completed successfully`,
      data: {
        stats,
        finalCacheStats,
        summary: {
          processed: stats.processed,
          updated: stats.updated,
          errors: stats.errors,
          cacheHitRate: stats.totalCached > 0 ? Math.round((stats.cacheHits / stats.totalCached) * 100) : 0,
          batchesProcessed: batchesCount,
          batchSize: 50,
          estimatedProcessingTime: Math.ceil(batchesCount * 0.5),
          validationDate: new Date().toLocaleString('uk-UA')
        }
      },
      timestamp: new Date().toLocaleString('uk-UA')
    };

    console.log('✅ [CACHE VALIDATION] Validation completed:', result.data.summary);

    res.json(result);

  } catch (error) {
    console.error('❌ [CACHE VALIDATION] Error during cache validation:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during cache validation',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/orders/products/stats
 * Получить статистику по товарам из заказов с фильтрами
 */
router.get('/products/stats', authenticateToken, async (req, res) => {
  try {
    const { status, startDate, endDate, sync, shippedOnly } = req.query;

    const cacheKey = `stats-products-${status || 'all'}-${startDate || 'none'}-${endDate || 'none'}-${shippedOnly || 'false'}`;
    if (sync !== 'true') {
      const cached = statsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        console.log(`✅ [STATS CACHE] HIT: Returning cached product stats for key: ${cacheKey}`);
        cached.data.metadata.source = 'local_stats_cache';
        return res.json(cached.data);
      }
    }

    // Отримуємо час початку звітного дня
    const dayStartHour = await getReportingDayStartHour();
    // Для відвантажень використовуємо 00:00 (24-годинний цикл без зміщення), 
    // щоб 19.12 00:00 - 23:59 потрапляло в 19.12
    const effectiveDayStartHour = shippedOnly === 'true' ? 24 : dayStartHour;

    // Парсим статуси: якщо рядок містить кому, розбиваємо на масив
    let parsedStatus: string | string[] | undefined = status as string;
    if (typeof status === 'string' && status.includes(',')) {
      parsedStatus = status.split(',').map(s => s.trim());
    }
    // console.log('🔍 SERVER RECEIVED:', { status, startDate, endDate, sync });

    // Якщо запрошена синхронізація, спочатку синхронізуємо
    if (sync === 'true') {
      console.log('🔄 Sync requested for products stats, starting synchronization...');
      const syncResult = await salesDriveService.syncOrdersWithDatabase();

      if (!syncResult.success) {
        console.warn('⚠️ Sync completed with errors:', syncResult.errors);
      }
    }

    // Фільтруємо за датою, якщо вказані дати (з урахуванням dayStartHour)
    let dateRangeFilter = undefined;
    let shippedDateRangeFilter = undefined;

    if (startDate && endDate) {
      const { start } = getReportingDateRange(startDate as string, effectiveDayStartHour);
      const { end } = getReportingDateRange(endDate as string, effectiveDayStartHour);

      if (shippedOnly === 'true') {
        shippedDateRangeFilter = { start, end };
      } else {
        dateRangeFilter = { start, end };
      }
    }

    // Отримуємо замовлення з фільтрами включно з датою
    const orders = await orderDatabaseService.getOrders({
      status: parsedStatus,
      limit: 10000, // Збільшуємо ліміт для отримання більшої кількості даних
      sortBy: shippedOnly === 'true' ? 'dilovodSaleExportDate' : 'orderDate',
      sortOrder: 'desc',
      dateRange: dateRangeFilter,
      shippedOnly: shippedOnly === 'true',
      shippedDateRange: shippedDateRangeFilter,
      includeItems: true,
    });

    const filteredOrders = orders; // Вже відфільтровані в БД

    // Збираємо статистику по товарам з кешованих даних
    const productStats: {
      [key: string]: {
        name: string;
        sku: string;
        orderedQuantity: number;
        stockBalances: { [warehouse: string]: number };
        categoryId: number | null;
        categoryName: string | null;
        categoryKey: string | null;
        isSet: boolean;
        isMonolithicSet: boolean;
        setPortions: number;
        /** Кількість порцій цього товару, що були використані як компоненти монолітних наборів */
        monolithicComponentQuantity: number;
      };
    } = {};


    // Отримуємо всі externalId для bulk-запиту до кешу
    const orderExternalIds = filteredOrders.map(order => order.externalId);

    // Отримуємо всі кеші одним запитом
    const orderCaches = await ordersCacheService.getMultipleOrderCaches(orderExternalIds);

    const allSkus = new Set<string>();
    const processedItemsByOrder = new Map<string, Array<{ sku: string; name?: string; orderedQuantity?: number }>>();

    for (const order of filteredOrders) {
      const cacheData = orderCaches.get(order.externalId);
      if (cacheData?.processedItems) {
        try {
          const parsedItems = JSON.parse(cacheData.processedItems);
          if (Array.isArray(parsedItems)) {
            processedItemsByOrder.set(order.externalId, parsedItems);

            for (const item of parsedItems) {
              if (item?.sku) {
                allSkus.add(item.sku);
              }
            }
          }
        } catch {
          // Ігноруємо пошкоджені кешовані дані, нижче це піде в cacheMisses
        }
      }

      if (shippedOnly === 'true' && order.payloadData) {
        for (const item of extractShipmentPayloadItems(order.payloadData)) {
          if (item.sku) {
            allSkus.add(item.sku);
          }
        }
      }

      for (const item of normalizeOrderItems(order.items)) {
        if (item.sku) {
          allSkus.add(item.sku);
        }
      }
    }

    const productDescriptors = await getReportProductDescriptors(allSkus);
    // Перераховуємо setPortions рекурсивно, щоб врахувати вкладені набори
    recomputeSetPortions(productDescriptors);

    let processedOrders = 0;
    let cacheHits = 0;
    let cacheMisses = 0;
    let ordersWithMonolithicSetsCount = 0;

    // Проходимо по всіх замовленнях і збираємо статистику з кешу
    for (const order of filteredOrders) {
      if (processedOrders % 50 === 0) {
        console.log(`Processed ${processedOrders}/${filteredOrders.length} orders (${cacheHits} cache hits, ${cacheMisses} misses)`);
      }
      processedOrders++;

      try {
        // Перевіряємо, чи є кешовані дані
        const cachedStats = processedItemsByOrder.get(order.externalId);
        const shipmentItems = shippedOnly === 'true' ? extractShipmentPayloadItems(order.payloadData) : [];
        const shipmentSkuSet = new Set(shipmentItems.map((item) => item.sku));
        if (shipmentItems.length > 0) {
          ordersWithMonolithicSetsCount++;
        }
        if (cachedStats || shipmentItems.length > 0) {
            cacheHits++;

            // Додаємо кешовані дані до загальної статистики
            for (const item of [...(cachedStats ?? []), ...shipmentItems]) {
              if (item && item.sku) {
                const isMonolithicSet = shipmentSkuSet.has(item.sku);
                const descriptor = productDescriptors.get(item.sku);
                const orderedQuantity = getOrderedQuantity((item as RawOrderItem).orderedQuantity ?? (item as RawOrderItem).quantity);

                if (productStats[item.sku]) {
                  if (descriptor?.name && (!productStats[item.sku].name || productStats[item.sku].name === item.sku)) {
                    productStats[item.sku].name = descriptor.name;
                  }
                  productStats[item.sku].orderedQuantity += orderedQuantity;
                  productStats[item.sku].isMonolithicSet = productStats[item.sku].isMonolithicSet || isMonolithicSet;
                } else {
                  productStats[item.sku] = {
                    name: descriptor?.name || item.name || item.sku,
                    sku: item.sku,
                    orderedQuantity,
                    stockBalances: descriptor?.stockBalances ?? {},
                    categoryId: descriptor?.categoryId ?? null,
                    categoryName: descriptor?.categoryLabel ?? null,
                    categoryKey: descriptor?.categoryKey ?? null,
                    isSet: descriptor?.isSet ?? false,
                    isMonolithicSet,
                    setPortions: descriptor?.setPortions ?? 0,
                    monolithicComponentQuantity: 0,
                  };
                }
              }
            }
          // Відстежуємо кількість порцій компонентів, що входять до монолітних наборів,
          // щоб коректно розрахувати totalPortions у звіті (без подвійного рахунку).
          // expandSetToLeaves рекурсивно розгортає вкладені набори до листових SKU.
          if (shippedOnly === 'true') {
            for (const monoItem of shipmentItems) {
              const monoQty = getOrderedQuantity(monoItem.orderedQuantity ?? monoItem.quantity);
              if (monoQty <= 0) continue;

              const leaves = expandSetToLeaves(monoItem.sku ?? '', monoQty, productDescriptors);
              for (const [leafSku, leafQty] of leaves) {
                if (!productStats[leafSku]) continue;
                productStats[leafSku].monolithicComponentQuantity += leafQty;
              }
            }
          }
        } else {
          // Кеша немає - пропускаємо це замовлення
          console.log(`No cached data for order ${order.externalId}, skipping...`);
          cacheMisses++;
        }
      } catch (error) {
        // Помилка при обробці кешу - пропускаємо це замовлення
        console.warn(`Error processing cached data for order ${order.externalId}, skipping:`, error);
        cacheMisses++;
      }
    }

    console.log(`✅ Cache processing completed: ${cacheHits} hits, ${cacheMisses} misses`);

    // Фінальна корекція для звіту відвантажень:
    // Зменшуємо orderedQuantity звичайних товарів на ту кількість, що пішла в монолітні набори,
    // щоб уникнути подвійного рахунку (компоненти вже враховані через монолітний набір × setPortions).
    if (shippedOnly === 'true') {
      for (const stat of Object.values(productStats)) {
        if (!stat.isMonolithicSet) {
          stat.orderedQuantity = Math.max(0, stat.orderedQuantity - stat.monolithicComponentQuantity);
        }
      }
    }

    // Конвертуємо в масив для відповіді; виключаємо звичайні товари з нульовою кількістю
    // (весь обсяг яких увійшов до монолітних наборів)
    const productStatsArray = Object.values(productStats).filter(
      (stat) => stat.isMonolithicSet || stat.orderedQuantity > 0,
    );
    const categoryOptions = buildCategorySeriesOptions(productStatsArray);
    const setOptions = buildSetSeriesOptions(filteredOrders, productDescriptors);

    console.log('✅ FINAL RESULT:', {
      totalProducts: productStatsArray.length,
      totalOrders: filteredOrders.length,
      filters: {
        status: status || 'all',
        dateRange: startDate && endDate ? { startDate, endDate } : null,
        dayStartHour: effectiveDayStartHour
      }
    });

    const response = {
      success: true,
      data: productStatsArray,
      metadata: {
        source: 'local_database',
        filters: {
          status: status || 'all',
          shippedOnly: shippedOnly === 'true',
          dateRange: startDate && endDate ? { startDate, endDate } : null,
          dayStartHour: effectiveDayStartHour
        },
        totalProducts: productStatsArray.length,
        totalOrders: filteredOrders.length,
          ordersWithMonolithicSetsCount,
        availableSeries: {
          default: {
            key: 'all_products',
            label: 'Всі товари',
          },
          categories: categoryOptions,
          sets: {
            all: {
              key: 'set_all',
              label: 'Всі набори',
              count: setOptions.length,
            },
            items: setOptions,
          },
        },
        fetchedAt: new Date().toISOString()
      }
    };

    statsCache.set(cacheKey, { data: response, timestamp: Date.now() });
    console.log(`✅ [STATS CACHE] MISS: Calculated and cached product stats for key: ${cacheKey}`);

    res.json(response);
  } catch (error) {
    console.error('Error getting products stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/orders/products/orders
 * Отримати список замовлень, що містять конкретний товар
 */
router.get('/products/orders', authenticateToken, async (req, res) => {
  try {
    const { sku, status, startDate, endDate, shippedOnly } = req.query;

    if (!sku) {
      return res.status(400).json({ success: false, error: 'SKU is required' });
    }

    const dayStartHour = await getReportingDayStartHour();
    const effectiveDayStartHour = shippedOnly === 'true' ? 24 : dayStartHour;

    let parsedStatus: string | string[] | undefined = status as string;
    if (typeof status === 'string' && status.includes(',')) {
      parsedStatus = status.split(',').map(s => s.trim());
    }

    let dateRangeFilter = undefined;
    let shippedDateRangeFilter = undefined;

    if (startDate && endDate) {
      const { start } = getReportingDateRange(startDate as string, effectiveDayStartHour);
      const { end } = getReportingDateRange(endDate as string, effectiveDayStartHour);

      if (shippedOnly === 'true') {
        shippedDateRangeFilter = { start, end };
      } else {
        dateRangeFilter = { start, end };
      }
    }

    const orders = await orderDatabaseService.getOrders({
      status: parsedStatus,
      limit: 1000,
      sortBy: shippedOnly === 'true' ? 'dilovodSaleExportDate' : 'orderDate',
      sortOrder: 'asc',
      dateRange: dateRangeFilter,
      shippedOnly: shippedOnly === 'true',
      shippedDateRange: shippedDateRangeFilter,
      includeItems: true
    });

    // Отримуємо всі externalId для bulk-запиту до кешу
    const orderExternalIds = orders.map(order => order.externalId);

    // Отримуємо всі кеші одним запитом (з розгорнутими комплектами)
    const orderCaches = await ordersCacheService.getMultipleOrderCaches(orderExternalIds);

    // Для режиму відвантажень: завантажуємо дескриптори продуктів, щоб розгортати
    // монолітні набори до листових SKU через expandSetToLeaves.
    const allSkus = new Set<string>();
    for (const order of orders) {
      const cacheData = orderCaches.get(order.externalId);
      if (cacheData?.processedItems) {
        try {
          const parsedItems = JSON.parse(cacheData.processedItems);
          if (Array.isArray(parsedItems)) {
            for (const item of parsedItems) {
              if (item?.sku) allSkus.add(item.sku);
            }
          }
        } catch { /* ігноруємо пошкоджений кеш */ }
      }
      if (shippedOnly === 'true') {
        for (const item of extractShipmentPayloadItems(order.payloadData)) {
          if (item.sku) allSkus.add(item.sku);
        }
      }
      for (const item of normalizeOrderItems(order.items)) {
        if (item.sku) allSkus.add(item.sku);
      }
    }
    const productDescriptors = await getReportProductDescriptors(allSkus);
    recomputeSetPortions(productDescriptors);

    // Розділяємо замовлення на два списки:
    //  - regularOrders: замовлення, де SKU відвантажено як звичайну порцію (з cachedStats)
    //  - monolithicOrders: замовлення, де SKU є компонентом монолітного набору
    //    (визначається через expandSetToLeaves з shipmentItems з payloadData)
    // Замовлення може потрапити в обидва списки, якщо частина — звичайна, частина — у наборі.
    const regularOrders: typeof orders = [];
    const monolithicOrders: typeof orders = [];

    for (const order of orders) {
      const cacheData = orderCaches.get(order.externalId);
      let cachedStats: Array<{ sku: string; name?: string; orderedQuantity?: number }> | null = null;
      if (cacheData && cacheData.processedItems) {
        try {
          const parsedCache = JSON.parse(cacheData.processedItems);
          if (Array.isArray(parsedCache)) {
            cachedStats = parsedCache as Array<{ sku: string; name?: string; orderedQuantity?: number }>;
          }
        } catch (e) {
          console.warn(`Error parsing cached data for order ${order.externalId}:`, e);
        }
      }

      // Без shippedOnly не враховуємо payloadData.shipment.bySku (як і раніше).
      const orderForBreakdown = shippedOnly === 'true' ? order : { ...order, payloadData: undefined };
      const breakdown = computeShippedQuantityBreakdown(
        orderForBreakdown,
        cachedStats,
        String(sku),
        productDescriptors,
      );
      const regularQuantity = Math.max(
        0,
        breakdown.cacheQuantity - breakdown.monolithicComponentQuantity - breakdown.monolithicSetQuantity,
      );

      if (regularQuantity > 0) {
        (order as any).productQuantity = regularQuantity;
        (order as any).regularQuantity = regularQuantity;
        regularOrders.push(order);
      }

      // Монолітні набори: і сам набір, і його компоненти
      const monolithicTotal = breakdown.monolithicSetQuantity + breakdown.monolithicComponentQuantity;
      if (monolithicTotal > 0) {
        // Для монолітного списку використовуємо окремий екземпляр об'єкта,
        // щоб productQuantity не конфліктував між списками.
        const monolithicOrder: typeof order = { ...order };
        (monolithicOrder as any).productQuantity = monolithicTotal;
        (monolithicOrder as any).monolithicComponentQuantity = monolithicTotal;
        (monolithicOrder as any).monolithicSetQuantity = breakdown.monolithicSetQuantity;
        monolithicOrders.push(monolithicOrder);
      }
    }

    res.json({
      success: true,
      data: regularOrders,
      monolithicOrders,
      metadata: {
        totalOrders: regularOrders.length + monolithicOrders.length,
        regularOrdersCount: regularOrders.length,
        monolithicOrdersCount: monolithicOrders.length,
        sku
      }
    });
  } catch (error) {
    console.error('Error getting product orders:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/orders/products/stats/dates
 * Отримати статистику по конкретному товару з розбивкою по датах
 */
router.get('/products/stats/dates', authenticateToken, async (req, res) => {
  try {
    const { sku, status, startDate, endDate, sync, shippedOnly } = req.query;

    // Отримуємо час початку звітного дня
    const dayStartHour = await getReportingDayStartHour();
    // Для відвантажень використовуємо 00:00 (24-годинний цикл без зміщення), 
    // щоб 19.12 00:00 - 23:59 потрапляло в 19.12
    const effectiveDayStartHour = shippedOnly === 'true' ? 24 : dayStartHour;

    // Парсим статуси: якщо рядок містить кому, розбиваємо на масив
    let parsedStatus: string | string[] | undefined = status as string;
    if (typeof status === 'string' && status.includes(',')) {
      parsedStatus = status.split(',').map(s => s.trim());
    }

    if (!sku) {
      return res.status(400).json({
        success: false,
        error: 'SKU товару обов\'язковий для отримання статистики по датах'
      });
    }

    // Якщо запрошено синхронізацію, спочатку синхронізуємо
    if (sync === 'true') {
      console.log('🔄 Запитано синхронізацію для статистики по датах товару, починаємо синхронізацію...');
      const syncResult = await salesDriveService.syncOrdersWithDatabase();

      if (!syncResult.success) {
        console.warn('⚠️ Синхронізація завершена з помилками:', syncResult.errors);
      }
    }

    // Фільтруємо по даті, якщо вказані дати (з урахуванням dayStartHour)
    let dateRangeFilter = undefined;
    let shippedDateRangeFilter = undefined;

    if (startDate && endDate) {
      const { start } = getReportingDateRange(startDate as string, effectiveDayStartHour);
      const { end } = getReportingDateRange(endDate as string, effectiveDayStartHour);

      if (shippedOnly === 'true') {
        shippedDateRangeFilter = { start, end };
      } else {
        dateRangeFilter = { start, end };
      }
    }

    // Отримуємо замовлення з фільтрами включно з датою
    const orders = await orderDatabaseService.getOrders({
      status: parsedStatus,
      limit: 10000, // Збільшуємо ліміт для отримання більшої кількості даних
      sortBy: shippedOnly === 'true' ? 'dilovodSaleExportDate' : 'orderDate',
      sortOrder: 'asc', // Для коректної послідовності дат
      dateRange: dateRangeFilter,
      shippedOnly: shippedOnly === 'true',
      shippedDateRange: shippedDateRangeFilter
    });

    const filteredOrders = orders; // Вже відфільтровані в БД

    // Отримуємо всі externalId для bulk-запиту до кешу
    const orderExternalIds = filteredOrders.map(order => order.externalId);

    // Отримуємо всі кеші одним запитом
    const orderCaches = await ordersCacheService.getMultipleOrderCaches(orderExternalIds);

    // Збираємо статистику по датах для конкретного товару (використовуючи звітні дати)
    const dateStats: { [date: string]: { date: string; orderedQuantity: number; stockBalances: { [warehouse: string]: number } } } = {};

    for (const order of filteredOrders) {
      try {
        const cacheData = orderCaches.get(order.externalId);
        let cachedStats: Array<{ sku: string; name?: string; orderedQuantity?: number }> | null = null;
        if (cacheData && cacheData.processedItems) {
          const parsedCache = JSON.parse(cacheData.processedItems);
          if (Array.isArray(parsedCache)) {
            cachedStats = parsedCache as Array<{ sku: string; name?: string; orderedQuantity?: number }>;
          }
        }

        const reportItems = getOrderReportItems(order, cachedStats, shippedOnly === 'true');
        const orderedQuantity = reportItems
          .filter((item) => item && String(item.sku) === String(sku))
          .reduce((sum, item) => sum + Number(item.orderedQuantity ?? item.quantity ?? 0), 0);

        if (orderedQuantity > 0) {
          // Використовуємо звітну дату замість простої дати
          // Якщо shippedOnly=true, використовуємо dilovodSaleExportDate для визначення звітної дати
          const dateToUse = (shippedOnly === 'true' && order.dilovodSaleExportDate)
            ? new Date(order.dilovodSaleExportDate)
            : order.orderDate;

          const reportingDate = getReportingDate(dateToUse, effectiveDayStartHour);

          if (dateStats[reportingDate]) {
            dateStats[reportingDate].orderedQuantity += orderedQuantity;
          } else {
            dateStats[reportingDate] = {
              date: reportingDate,
              orderedQuantity,
              stockBalances: {} // Буде наповнено актуальними даними нижче
            };
          }
        }
      } catch (error) {
        console.warn(`Помилка обробки кешованих даних для замовлення ${order.externalId}:`, error);
      }
    }

    // --- Оновлюємо залишки АКТУАЛЬНИМИ даними з бази даних ---
    try {
      const actualProduct = await orderDatabaseService.getProductBySku(sku as string);
      if (actualProduct && actualProduct.stockBalanceByStock) {
        const balances: { [warehouse: string]: number } = {};
        for (const [warehouseId, balance] of Object.entries(actualProduct.stockBalanceByStock)) {
          balances[warehouseId] = balance as number;
        }

        // Оновлюємо кожну дату актуальними залишками
        for (const dateKey of Object.keys(dateStats)) {
          dateStats[dateKey].stockBalances = balances;
        }
      }
    } catch (error) {
      console.warn(`Failed to get actual stock balance for product ${sku}:`, error);
    }

    // Конвертуємо в масив і сортуємо за датою
    const dateStatsArray = Object.values(dateStats).sort((a, b) => a.date.localeCompare(b.date));

    // Отримуємо інформацію про товар з останнього замовлення
    let productInfo = { name: sku, sku: sku };
    for (const order of filteredOrders.slice().reverse()) {
      try {
        const cacheData = orderCaches.get(order.externalId);
        if (cacheData && cacheData.processedItems) {
          const cachedStats = JSON.parse(cacheData.processedItems);
          if (Array.isArray(cachedStats)) {
            const productItem = cachedStats.find(item => item && item.sku === sku);
            if (productItem) {
              productInfo = { name: productItem.name || sku, sku: productItem.sku };
              break;
            }
          }
        }
      } catch (error) {
        // Продовжуємо пошук
      }
    }

    console.log('✅ PRODUCT DATE STATS RESULT:', {
      product: productInfo,
      totalDates: dateStatsArray.length,
      totalOrders: filteredOrders.length,
      filters: {
        sku,
        status: status || 'all',
        dateRange: startDate && endDate ? { startDate, endDate } : null,
        dayStartHour: effectiveDayStartHour
      }
    });

    res.json({
      success: true,
      data: dateStatsArray,
      product: productInfo,
      metadata: {
        source: 'local_database',
        filters: {
          sku,
          status: status || 'all',
          shippedOnly: shippedOnly === 'true',
          dateRange: startDate && endDate ? { startDate, endDate } : null,
          dayStartHour: effectiveDayStartHour
        },
        totalDates: dateStatsArray.length,
        totalOrders: filteredOrders.length,
        fetchedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting product date stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/orders/products/chart
 * Отримати дані для графіка продажів за товарами з розбивкою за датами
 */
router.get('/products/chart', authenticateToken, async (req, res) => {
  try {
    const { status, startDate, endDate, sync, groupBy = 'day', products } = req.query;

    // Отримуємо час початку звітного дня
    const dayStartHour = await getReportingDayStartHour();

    const productsKey = Array.isArray(products) ? [...products].sort().join(',') : products || 'all';
    const cacheKey = `stats-chart-${status || 'all'}-${startDate || 'none'}-${endDate || 'none'}-${groupBy}-${productsKey}-${dayStartHour}`;

    if (sync !== 'true') {
      const cached = statsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        console.log(`✅ [STATS CACHE] HIT: Returning cached chart data for key: ${cacheKey}`);
        cached.data.metadata.source = 'local_stats_cache';
        return res.json(cached.data);
      }
    }

    // Парсимо статуси: якщо рядок містить кому, розбиваємо на масив
    let parsedStatus: string | string[] | undefined = status as string;
    if (typeof status === 'string' && status.includes(',')) {
      parsedStatus = status.split(',').map(s => s.trim());
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate и endDate обязательны'
      });
    }

    // Якщо запрошена синхронізація, спочатку синхронізуємо
    if (sync === 'true') {
      console.log('🔄 Sync requested for products chart, starting synchronization...');
      const syncResult = await salesDriveService.syncOrdersWithDatabase();

      if (!syncResult.success) {
        console.warn('⚠️ Sync completed with errors:', syncResult.errors);
      }
    }

    // Фільтруємо по даті (з урахуванням dayStartHour)
    // startDate та endDate вже правильно конвертовані на клієнті через convertCalendarRangeToReportingRange
    // Тому просто використовуємо їх безпосередньо
    const { start } = getReportingDateRange(startDate as string, dayStartHour);

    // endDate це звітна дата - закінчується в кінці звітного дня
    const { end } = getReportingDateRange(endDate as string, dayStartHour);

    // console.log(`📅 Filtering chart data by date range: ${start.toISOString()} to ${end.toISOString()}`);

    // Отримуємо замовлення з фільтрами, включаючи дату
    const orders = await orderDatabaseService.getOrders({
      status: parsedStatus,
      limit: 10000, // Збільшуємо ліміт для отримання більшої кількості даних
      sortBy: 'orderDate',
      sortOrder: 'asc',
      dateRange: {
        start: start,
        end: end
      },
      includeItems: true,
    });

    const filteredOrders = orders; // Вже відфільтровані в БД

    const selectedSeriesKeys = Array.isArray(products)
      ? products as string[]
      : products
        ? [products as string]
        : [];
    const selectedCategoryKeys = new Set(selectedSeriesKeys.filter((item) => item.startsWith('category_')));
    const hasCategoryFilters = selectedCategoryKeys.size > 0;

    // Отримуємо всі externalId для bulk-запиту до кешу
    const orderExternalIds = filteredOrders.map(order => order.externalId);

    // Отримуємо всі кеші одним запитом
    const orderCaches = await ordersCacheService.getMultipleOrderCaches(orderExternalIds);

    const processedItemsByOrder = new Map<string, Array<{ sku: string; name?: string; orderedQuantity?: number }>>();
    const allSkus = new Set<string>();

    for (const order of filteredOrders) {
      const cacheData = orderCaches.get(order.externalId);
      if (cacheData?.processedItems) {
        try {
          const parsedItems = JSON.parse(cacheData.processedItems);
          if (Array.isArray(parsedItems)) {
            processedItemsByOrder.set(order.externalId, parsedItems);
            for (const item of parsedItems) {
              if (item?.sku) {
                allSkus.add(item.sku);
              }
            }
          }
        } catch {
          // Ігноруємо пошкоджений кеш, далі це просто не потрапить у графік
        }
      }

    }

    const productDescriptors = await getReportProductDescriptors(allSkus);
    const chartData = new Map<string, {
      ordersCount: number;
      portionsCount: number;
      totalRevenue: number;
      categories: Record<string, { label: string; quantity: number }>;
    }>();
    const soldProductsForCategories = new Map<string, Set<string>>();

    for (const order of filteredOrders) {
      try {
        const reportingDate = getReportingDate(order.orderDate, dayStartHour);
        const dateKey = buildChartDateKey(order.orderDate, groupBy as string, reportingDate);
        const bucket = chartData.get(dateKey) ?? {
          ordersCount: 0,
          portionsCount: 0,
          totalRevenue: 0,
          categories: {},
        };

        bucket.ordersCount += 1;
        bucket.totalRevenue += typeof order.totalPrice === 'number' && Number.isFinite(order.totalPrice)
          ? order.totalPrice
          : 0;

        for (const item of processedItemsByOrder.get(order.externalId) ?? []) {
          if (!item?.sku) {
            continue;
          }

          const quantity = getOrderedQuantity(item.orderedQuantity);
          if (quantity <= 0) {
            continue;
          }

          bucket.portionsCount += quantity;

          const descriptor = productDescriptors.get(item.sku);
          if (descriptor?.categoryKey && descriptor.categoryLabel) {
            const categorySoldSkus = soldProductsForCategories.get(descriptor.categoryKey) ?? new Set<string>();
            categorySoldSkus.add(item.sku);
            soldProductsForCategories.set(descriptor.categoryKey, categorySoldSkus);

            if (!hasCategoryFilters || selectedCategoryKeys.has(descriptor.categoryKey)) {
              bucket.categories[descriptor.categoryKey] = bucket.categories[descriptor.categoryKey] ?? {
                label: descriptor.categoryLabel,
                quantity: 0,
              };
              bucket.categories[descriptor.categoryKey].quantity += quantity;
            }
          }
        }

        chartData.set(dateKey, bucket);
      } catch (error) {
        console.warn(`Error processing order ${order.externalId} for chart:`, error);
      }
    }

    const categoryOptions = Array.from(soldProductsForCategories.entries())
      .map(([key, soldSkus]) => {
        const descriptor = Array.from(productDescriptors.values()).find((item) => item.categoryKey === key);
        return {
          key,
          categoryId: descriptor?.categoryId ?? null,
          label: descriptor?.categoryLabel ?? key,
          count: soldSkus.size,
        };
      })
      .sort((first, second) => first.label.localeCompare(second.label, 'uk-UA'));

    // Конвертуємо в масив для відповіді
    const chartDataArray = Array.from(chartData.entries())
      .map(([dateKey, bucket]) => {
        const result: Record<string, string | number> = {
          date: formatChartDateLabel(dateKey, groupBy as string),
          rawDate: dateKey,
        };

        if (!hasCategoryFilters) {
          result.portionsCount = bucket.portionsCount;
          result.portionsCount_name = 'Порції';
          result.averageCheck = bucket.ordersCount > 0
            ? Math.round((bucket.totalRevenue / bucket.ordersCount) * 100) / 100
            : 0;
          result.averageCheck_name = 'Середній чек';
          result.ordersCount = bucket.ordersCount;
          result.ordersCount_name = 'Замовлення';
        }

        if (hasCategoryFilters) {
          for (const [categoryKey, categoryData] of Object.entries(bucket.categories)) {
            result[categoryKey] = categoryData.quantity;
            result[`${categoryKey}_name`] = categoryData.label;
          }
        }

        return result;
      })
      .sort((a, b) => String(a.rawDate).localeCompare(String(b.rawDate)));

    // Підраховуємо реальну кількість ліній у даних (товари + групи)
    const actualProductCount = chartDataArray.length > 0
      ? Object.keys(chartDataArray[0]).filter(key =>
        (key.startsWith('category_') || key === 'ordersCount' || key === 'portionsCount' || key === 'averageCheck') &&
        !key.endsWith('_name') &&
        key !== 'rawDate'
      ).length
      : 0;

    const response = {
      success: true,
      data: chartDataArray,
      metadata: {
        source: 'local_database',
        filters: {
          status: status || 'all',
          dateRange: { startDate, endDate },
          groupBy,
          series: selectedSeriesKeys,
          categories: Array.from(selectedCategoryKeys),
          dayStartHour
        },
        totalPoints: chartDataArray.length,
        totalProducts: actualProductCount, // Реальна кількість товарів у даних
        totalOrders: filteredOrders.length,
        availableSeries: {
          default: {
            key: 'all_categories',
            label: 'Всі категорії',
          },
          categories: categoryOptions,
        },
        fetchedAt: new Date().toISOString()
      }
    };

    statsCache.set(cacheKey, { data: response, timestamp: Date.now() });
    console.log(`✅ [STATS CACHE] MISS: Calculated and cached chart data for key: ${cacheKey}`);

    res.json(response);
  } catch (error) {
    console.error('Error getting products chart data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/orders/sales/report
 * Отримати звіт продажу днями для таблиці
 */
router.get('/sales/report', authenticateToken, async (req, res) => {
  try {
    const { status, startDate, endDate, sync, products, singleDay } = req.query;

    // Отримуємо час початку звітного дня
    const dayStartHour = await getReportingDayStartHour();

    const productsKey = Array.isArray(products) ? [...products].sort().join(',') : products || 'all';
    const singleDayKey = singleDay === 'true' ? 'single' : 'range';
    const cacheKey = `stats-report-${status || 'all'}-${startDate || 'none'}-${endDate || 'none'}-${productsKey}-${dayStartHour}-${singleDayKey}`;

    if (sync !== 'true') {
      const cached = statsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        console.log(`✅ [STATS CACHE] HIT: Returning cached sales report for key: ${cacheKey}`);
        cached.data.metadata.source = 'local_stats_cache';
        return res.json(cached.data);
      }
    }

    // Парсимо статуси: якщо рядок містить кому, розбиваємо на масив
    let parsedStatus: string | string[] | undefined = status as string;
    if (typeof status === 'string' && status.includes(',')) {
      parsedStatus = status.split(',').map(s => s.trim());
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate и endDate обязательны'
      });
    }

    // Якщо запитується синхронізація, спочатку синхронізуємо
    if (sync === 'true') {
      console.log('🔄 Sync requested for sales report, starting synchronization...');
      const syncResult = await salesDriveService.syncOrdersWithDatabase();

      if (!syncResult.success) {
        console.warn('⚠️ Sync completed with errors:', syncResult.errors);
      }
    }

    // Фільтруємо за датою (з урахуванням dayStartHour)
    let start: Date, end: Date;

    if (startDate === endDate) {
      // Для однієї дати: startDate це календарна дата, треба знайти правильний звітний день
      // Календарна дата 16.10 може належати до звітного дня 16.10 або 17.10 залежно від часу
      // Оскільки користувач вибрав 16.10, він хоче бачити дані за 16.10 як звітний день
      const calendarDateStr = startDate as string;
      const reportingRange = getReportingDateRange(calendarDateStr, dayStartHour);
      start = reportingRange.start;
      end = reportingRange.end;
      console.log(`📅 Single day mode: календарна дата ${startDate} → звітний день ${startDate}, range: ${start.toISOString()} - ${end.toISOString()}`);
    } else {
      // Для діапазону дат: startDate та endDate це календарні дати
      // Конвертуємо їх напряму без зсувів
      start = getReportingDateRange(startDate as string, dayStartHour).start;
      end = getReportingDateRange(endDate as string, dayStartHour).end;
      console.log(`📅 Date range mode: ${startDate} - ${endDate}, range: ${start.toISOString()} - ${end.toISOString()}`);
    }

    // Отримуємо замовлення з фільтрами, включаючи дату
    const orders = await orderDatabaseService.getOrders({
      status: parsedStatus,
      limit: 10000, // Збільшуємо ліміт для отримання більшої кількості даних
      sortBy: 'orderDate',
      sortOrder: 'asc',
      includeRaw: true, // Потрібно для читання vidskoduvanna / vidskoduvannaGrn
      // Додаємо фільтр по даті в запит до БД
      dateRange: {
        start: start,
        end: end
      }
    });

    // [DEBUG] Логування rawData для перших 3 замовлень — допомагає перевірити наявність полів
    const sampleOrders = orders.slice(0, 3);
    for (const o of sampleOrders) {
      const raw = (o as any).rawData;
      console.log(`🔍 [SALES REPORT DEBUG] order=${o.externalId} rawData type=${typeof raw} keys=${raw && typeof raw === 'object' ? Object.keys(raw).slice(0, 10).join(',') : String(raw)?.slice(0, 100)}`);
      if (raw && typeof raw === 'object') {
        console.log(`🔍   vidskoduvanna=${raw.vidskoduvanna ?? 'undefined'} vidskoduvannaGrn=${raw.vidskoduvannaGrn ?? 'undefined'}`);
      }
    }

    const filteredOrders = orders; // Вже відфільтровані у БД

    // Функція визначення групи товару
    const getProductGroup = (productName: string): string => {
      const name = productName.toLowerCase();
      if (name.includes('борщ') || name.includes('суп') || name.includes('перший') || name.includes('перша')) {
        return 'first_courses';
      }
      // За замовчуванням решту товарів вважаємо іншими стравами
      return 'main_courses';
    };

    // Обробляємо фільтр за товарами
    let filterProducts: string[] = [];
    let filterGroups: string[] = [];

    if (products) {
      if (Array.isArray(products)) {
        filterProducts = products as string[];
      } else {
        filterProducts = [products as string];
      }

      // Поділяємо на групи та індивідуальні товари
      const individualProducts = filterProducts.filter(p => !p.startsWith('group_'));
      const groupFilters = filterProducts.filter(p => p.startsWith('group_'));

      filterProducts = individualProducts;
      filterGroups = groupFilters.map(g => g.replace('group_', ''));
    }

    // Отримуємо все externalId для bulk-запиту до кешу
    const orderExternalIds = filteredOrders.map(order => order.externalId);

    // Отримуємо всі кеші одним запитом
    const orderCaches = await ordersCacheService.getMultipleOrderCaches(orderExternalIds);

    const sourceMaps = await getOrderSourceMaps();

    // Збираємо дані по днях (використовуючи звітні дати)
    const salesData: {
      [dateKey: string]: {
        ordersCount: number;
        portionsCount: number;
        totalPrice: number;
        ordersByStatus: { [status: string]: number };
        portionsByStatus: { [status: string]: number };
        ordersBySource: { [source: string]: number };
        portionsBySource: { [source: string]: number };
        priceBySource: { [source: string]: number };
        ordersWithDiscountReason: number;
        portionsWithDiscountReason: number;
        priceWithDiscountReason: number;
        discountReasonText: string;
        vidskoduvannaTotal: number;    // загальна кількість замовлень з відшкодуванням за день
        vidskoduvannaGrnTotal: number; // загальна сума відшкодувань за день (грн)
        vidskoduvannaPortions: number; // кількість порцій з відшкодуванням за день
        orders: Array<{
          orderNumber: string;
          portionsCount: number;
          orderDate: string;
          externalId: string;
          status: string;
          source: string;
          // Detailed per-order fields so client can rely on real values
          totalPrice?: number | undefined;
          hasDiscount?: boolean;
          discountReasonCode?: string | null;
          vidskoduvanna?: number | null;    // кількість відшкодованих порцій із rawData
          vidskoduvannaGrn?: number | null; // сума відшкодування в грн із rawData
        }>;
      }
    } = {};

    for (const order of filteredOrders) {
      try {
        // Використовуємо звітну дату замість просто локальної дати
        const reportingDate = getReportingDate(order.orderDate, dayStartHour);
        const dateKey = reportingDate; // YYYY-MM-DD в форматі звітної дати

        if (!salesData[dateKey]) {
          salesData[dateKey] = {
            ordersCount: 0,
            portionsCount: 0,
            totalPrice: 0,
            ordersByStatus: {},
            portionsByStatus: {},
            ordersBySource: {},
            portionsBySource: {},
            priceBySource: {},
            ordersWithDiscountReason: 0,
            portionsWithDiscountReason: 0,
            priceWithDiscountReason: 0,
            discountReasonText: '',
            vidskoduvannaPortions: 0,
            vidskoduvannaTotal: 0,
            vidskoduvannaGrnTotal: 0,
            orders: []
          };
        }

        // Перевіряємо фільтр по товарам
        let shouldIncludeOrder = false;
        let orderPortions = 0;

        const cacheData = orderCaches.get(order.externalId);
        if (cacheData && cacheData.processedItems) {
          const cachedStats = JSON.parse(cacheData.processedItems);
          if (Array.isArray(cachedStats)) {
            for (const item of cachedStats) {
              if (item && item.sku && item.orderedQuantity > 0) {
                let shouldInclude = false;

                if (filterProducts.length === 0 && filterGroups.length === 0) {
                  // Немає фільтрів - включаємо всі товари
                  shouldInclude = true;
                } else {
                  // Перевіряємо індивідуальні товари
                  if (filterProducts.includes(item.sku)) {
                    shouldInclude = true;
                  }

                  // Перевіряємо групи товарів
                  if (filterGroups.length > 0) {
                    const productGroup = getProductGroup(item.name || item.sku);
                    if (filterGroups.includes(productGroup)) {
                      shouldInclude = true;
                    }
                  }
                }

                if (shouldInclude) {
                  orderPortions += item.orderedQuantity;
                  shouldIncludeOrder = true;
                }
              }
            }
          }
        }

        if (shouldIncludeOrder) {
          // Додаємо замовлення до статистики дня
          salesData[dateKey].ordersCount += 1;
          salesData[dateKey].portionsCount += orderPortions;
          salesData[dateKey].totalPrice += Number(order.totalPrice) || 0;

          // Статистика по статусам
          const ordStatus = order.status;
          if (!salesData[dateKey].ordersByStatus[ordStatus]) {
            salesData[dateKey].ordersByStatus[ordStatus] = 0;
            salesData[dateKey].portionsByStatus[ordStatus] = 0;
          }
          salesData[dateKey].ordersByStatus[ordStatus] += 1;
          salesData[dateKey].portionsByStatus[ordStatus] += orderPortions;

          // Статистика за джерелами
          const sourceCode = order.sajt || '';
          const sourceName = getOrderSourceDetailed(sourceCode, sourceMaps.detailed) || 'Інше';

          if (!salesData[dateKey].ordersBySource[sourceName]) {
            salesData[dateKey].ordersBySource[sourceName] = 0;
            salesData[dateKey].portionsBySource[sourceName] = 0;
            salesData[dateKey].priceBySource[sourceName] = 0;
          }
          salesData[dateKey].ordersBySource[sourceName] += 1;
          salesData[dateKey].portionsBySource[sourceName] += orderPortions;
          salesData[dateKey].priceBySource[sourceName] += Number(order.totalPrice) || 0;

          // Статистика по pricinaZnizki (причина знижки)
          if (order.pricinaZnizki && order.pricinaZnizki.trim() !== '') {
            salesData[dateKey].ordersWithDiscountReason += 1;
            salesData[dateKey].portionsWithDiscountReason += orderPortions;
            salesData[dateKey].priceWithDiscountReason += Number(order.totalPrice) || 0;

            // Визначаємо причину знижки
            if (order.pricinaZnizki === '33') {
              salesData[dateKey].discountReasonText = 'Військові/волонтери';
            }
          }

          // Зчитуємо vidskoduvanna / vidskoduvannaGrn з rawData (серіалізований JSON)
          let vidskoduvanna: number | null = null;
          let vidskoduvannaGrn: number | null = null;
          if (order.rawData) {
            try {
              const raw = typeof order.rawData === 'string' ? JSON.parse(order.rawData) : order.rawData;
              if (raw.vidskoduvanna != null) vidskoduvanna = Number(raw.vidskoduvanna) || 0;
              if (raw.vidskoduvannaGrn != null) vidskoduvannaGrn = Number(raw.vidskoduvannaGrn) || 0;
            } catch {
              // rawData не є валідним JSON — ігноруємо
            }
          }

          // Агрегуємо відшкодування по дню
          if (vidskoduvanna != null && vidskoduvanna > 0) {
            salesData[dateKey].vidskoduvannaTotal += 1;
          }
          if (vidskoduvannaGrn != null) {
            salesData[dateKey].vidskoduvannaGrnTotal += vidskoduvannaGrn;
          }
          if (vidskoduvanna != null) {
            salesData[dateKey].vidskoduvannaPortions += vidskoduvanna;
          }

          salesData[dateKey].orders.push({
            orderNumber: order.orderNumber || order.externalId,
            portionsCount: orderPortions,
            orderDate: order.orderDate
              ? new Date(order.orderDate).toLocaleString('uk-UA', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })
              : '',
            externalId: order.externalId,
            status: order.status,
            source: getOrderSourceDetailed(order.sajt || '', sourceMaps.detailed),
            totalPrice: order.totalPrice != null ? Number(order.totalPrice) : undefined,
            hasDiscount: !!(order.pricinaZnizki && String(order.pricinaZnizki).trim() !== ''),
            discountReasonCode: order.pricinaZnizki ? String(order.pricinaZnizki) : null,
            vidskoduvanna,
            vidskoduvannaGrn,
          });
        }

      } catch (error) {
        console.warn(`Error processing order ${order.externalId} for sales report:`, error);
      }
    }

    // Конвертуємо в масив для відповіді
    const salesDataArray = Object.entries(salesData)
      .map(([dateKey, data]) => ({
        date: dateKey,
        ordersCount: data.ordersCount,
        portionsCount: data.portionsCount,
        totalPrice: data.totalPrice,
        ordersByStatus: data.ordersByStatus,
        portionsByStatus: data.portionsByStatus,
        ordersBySource: data.ordersBySource,
        portionsBySource: data.portionsBySource,
        priceBySource: data.priceBySource,
        ordersWithDiscountReason: data.ordersWithDiscountReason,
        portionsWithDiscountReason: data.portionsWithDiscountReason,
        priceWithDiscountReason: data.priceWithDiscountReason,
        discountReasonText: data.discountReasonText,
        vidskoduvannaTotal: data.vidskoduvannaTotal,
        vidskoduvannaGrnTotal: data.vidskoduvannaGrnTotal,
        vidskoduvannaPortions: data.vidskoduvannaPortions,
        orders: data.orders.sort((a, b) => new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime())
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    console.log(`✅ SALES REPORT GENERATED: ${salesDataArray.length} days`);

    const response = {
      success: true,
      data: salesDataArray,
      metadata: {
        source: 'local_database',
        filters: {
          status: status || 'all',
          dateRange: { startDate, endDate },
          products: filterProducts,
          groups: filterGroups,
          dayStartHour
        },
        totalDays: salesDataArray.length,
        totalOrders: filteredOrders.length,
        fetchedAt: new Date().toISOString()
      }
    };

    statsCache.set(cacheKey, { data: response, timestamp: Date.now() });
    console.log(`✅ [STATS CACHE] MISS: Calculated and cached sales report for key: ${cacheKey}`);

    res.json(response);
  } catch (error) {
    console.error('Error getting sales report data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/orders/sales/report/sets
 * Отримати звіт продажів по наборах за обраний період
 */
router.get('/sales/report/sets', authenticateToken, async (req, res) => {
  try {
    const { status, startDate, endDate, sync } = req.query;

    const dayStartHour = await getReportingDayStartHour();
    const cacheKey = `stats-report-sets-v2-${status || 'all'}-${startDate || 'none'}-${endDate || 'none'}-${dayStartHour}`;

    if (sync !== 'true') {
      const cached = statsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        cached.data.metadata.source = 'local_stats_cache';
        return res.json(cached.data);
      }
    }

    let parsedStatus: string | string[] | undefined = status as string;
    if (typeof status === 'string' && status.includes(',')) {
      parsedStatus = status.split(',').map((item) => item.trim());
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate та endDate є обовʼязковими',
      });
    }

    if (sync === 'true') {
      const syncResult = await salesDriveService.syncOrdersWithDatabase();
      if (!syncResult.success) {
        console.warn('⚠️ Sync completed with errors:', syncResult.errors);
      }
    }

    let start: Date;
    let end: Date;

    if (startDate === endDate) {
      const reportingRange = getReportingDateRange(startDate as string, dayStartHour);
      start = reportingRange.start;
      end = reportingRange.end;
    } else {
      start = getReportingDateRange(startDate as string, dayStartHour).start;
      end = getReportingDateRange(endDate as string, dayStartHour).end;
    }

    const orders = await orderDatabaseService.getOrders({
      status: parsedStatus,
      limit: 10000,
      sortBy: 'orderDate',
      sortOrder: 'asc',
      includeItems: true,
      includeRaw: true,
      dateRange: {
        start,
        end,
      },
    });

    const sourceMaps = await getOrderSourceMaps();

    const setSkus = new Set<string>();
    for (const order of orders) {
      for (const item of normalizeOrderItems(order.items)) {
        const sku = typeof item?.sku === 'string' ? item.sku.trim() : '';
        if (sku) {
          setSkus.add(sku);
        }
      }
    }

    const productDescriptors = await getReportProductDescriptors(setSkus);

    const setSalesData: Record<string, {
      sku: string;
      name: string;
      ordersCount: number;
      uniqOrdersCount: number;
      ordersBySource: Record<string, number>;
      portionsBySource: Record<string, number>;
      ordersWithDiscountReason: number;
      portionsWithDiscountReason: number;
      orders: Array<{
        orderNumber: string;
        externalId: string;
        status: string;
        source: string;
        orderedQuantity: number;
        totalPrice?: number;
        hasDiscount?: boolean;
        discountReasonCode?: string | null;
      }>;
    }> = {};

    for (const order of orders) {
      try {
        const setItemsInOrder = new Map<string, { name: string; orderedQuantity: number }>();

        for (const item of normalizeOrderItems(order.items)) {
          const sku = typeof item?.sku === 'string' ? item.sku.trim() : '';
          if (!sku) {
            continue;
          }

          const descriptor = productDescriptors.get(sku);
          if (!descriptor?.isSet) {
            continue;
          }

          const orderedQuantity = getOrderedQuantity(item.quantity ?? item.orderedQuantity);
          if (orderedQuantity <= 0) {
            continue;
          }

          const current = setItemsInOrder.get(sku) ?? {
            name: descriptor.name || item.name || sku,
            orderedQuantity: 0,
          };

          current.orderedQuantity += orderedQuantity;
          setItemsInOrder.set(sku, current);
        }

        if (setItemsInOrder.size === 0) {
          continue;
        }

        const source = getOrderSourceDetailed(order.sajt || '', sourceMaps.detailed) || 'Інше';
        const hasDiscount = !!(order.pricinaZnizki && String(order.pricinaZnizki).trim() !== '');
        const discountReasonCode = order.pricinaZnizki ? String(order.pricinaZnizki) : null;

        for (const [sku, setItem] of setItemsInOrder.entries()) {
          if (!setSalesData[sku]) {
            setSalesData[sku] = {
              sku,
              name: setItem.name,
              ordersCount: 0,
              uniqOrdersCount: 0,
              ordersBySource: {},
              portionsBySource: {},
              ordersWithDiscountReason: 0,
              portionsWithDiscountReason: 0,
              orders: [],
            };
          }

          setSalesData[sku].ordersCount += setItem.orderedQuantity;
          setSalesData[sku].uniqOrdersCount += 1;
          setSalesData[sku].ordersBySource[source] = (setSalesData[sku].ordersBySource[source] || 0) + 1;
          setSalesData[sku].portionsBySource[source] = (setSalesData[sku].portionsBySource[source] || 0) + setItem.orderedQuantity;

          if (hasDiscount) {
            setSalesData[sku].ordersWithDiscountReason += 1;
            setSalesData[sku].portionsWithDiscountReason += setItem.orderedQuantity;
          }

          setSalesData[sku].orders.push({
            orderNumber: order.orderNumber || order.externalId,
            externalId: order.externalId,
            status: order.status,
            source,
            orderedQuantity: setItem.orderedQuantity,
            totalPrice: order.totalPrice != null ? Number(order.totalPrice) : undefined,
            hasDiscount,
            discountReasonCode,
          });
        }
      } catch (error) {
        console.warn(`Error processing order ${order.externalId} for sales sets report:`, error);
      }
    }

    const data = Object.values(setSalesData)
      .map((item) => ({
        ...item,
        orders: item.orders.sort((first, second) => first.orderNumber.localeCompare(second.orderNumber, 'uk-UA')),
      }))
      .sort((first, second) => second.ordersCount - first.ordersCount || first.name.localeCompare(second.name, 'uk-UA'));

    const response = {
      success: true,
      data,
      metadata: {
        source: 'local_database',
        filters: {
          status: status || 'all',
          dateRange: { startDate, endDate },
          dayStartHour,
        },
        totalSets: data.length,
        totalOrders: orders.length,
        fetchedAt: new Date().toISOString(),
      },
    };

    statsCache.set(cacheKey, { data: response, timestamp: Date.now() });
    res.json(response);
  } catch (error) {
    console.error('Error getting sales sets report data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/orders/products/chart/status-details
 * Получить детальную информацию по статусам заказов за конкретную дату
 */
router.get('/products/chart/status-details', authenticateToken, async (req, res) => {
  try {
    const { date, startDate, endDate, groupBy = 'day' } = req.query;

    if (!date || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'date, startDate и endDate обязательны'
      });
    }

    // Фильтруем по дате
    const start = new Date(startDate as string + ' 00:00:00');
    const end = new Date(endDate as string + ' 23:59:59');

    // Получаем заказы за указанный период с фильтром по дате
    const orders = await orderDatabaseService.getOrders({
      limit: 10000,
      sortBy: 'orderDate',
      sortOrder: 'asc',
      dateRange: {
        start: start,
        end: end
      }
    });

    const filteredOrders = orders; // Уже отфильтрованы в БД

    // Определяем границы даты для группировки
    let dateStart: Date;
    let dateEnd: Date;

    if (groupBy === 'day') {
      dateStart = new Date(date as string + ' 00:00:00');
      dateEnd = new Date(date as string + ' 23:59:59');
    } else if (groupBy === 'week') {
      const targetDate = new Date(date as string);
      dateStart = new Date(targetDate);
      dateStart.setDate(targetDate.getDate() - targetDate.getDay() + 1); // Понедельник
      dateStart.setHours(0, 0, 0, 0);
      dateEnd = new Date(dateStart);
      dateEnd.setDate(dateStart.getDate() + 6);
      dateEnd.setHours(23, 59, 59, 999);
    } else if (groupBy === 'month') {
      const targetDate = new Date(date as string + '-01');
      dateStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
      dateEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
      dateEnd.setHours(23, 59, 59, 999);
    } else {
      // hour
      dateStart = new Date(date as string + ':00:00');
      dateEnd = new Date(date as string + ':59:59');
    }


    // Получаем все externalId для bulk-запроса к кешу
    const orderExternalIds = filteredOrders.map(order => order.externalId);

    // Получаем все кеши одним запросом
    const orderCaches = await ordersCacheService.getMultipleOrderCaches(orderExternalIds);

    // Группируем заказы по статусам для указанной даты
    const statusBreakdown: { [status: string]: { orders: any[], totalPortions: number, products: { [sku: string]: { name: string, quantity: number } } } } = {};

    for (const order of filteredOrders) {
      if (!order.orderDate) continue;

      const orderDate = new Date(order.orderDate);
      if (orderDate >= dateStart && orderDate <= dateEnd) {
        const status = order.status;

        if (!statusBreakdown[status]) {
          statusBreakdown[status] = {
            orders: [],
            totalPortions: 0,
            products: {}
          };
        }

        statusBreakdown[status].orders.push({
          id: order.externalId,
          orderDate: order.orderDate,
          quantity: order.quantity,
          statusText: order.statusText
        });

        // Парсим товары из кешированных данных
        try {
          const cacheData = orderCaches.get(order.externalId);
          if (cacheData && cacheData.processedItems) {
            const cachedStats = JSON.parse(cacheData.processedItems);
            if (Array.isArray(cachedStats)) {
              for (const item of cachedStats) {
                if (item && item.sku && item.orderedQuantity > 0) {
                  if (!statusBreakdown[status].products[item.sku]) {
                    statusBreakdown[status].products[item.sku] = {
                      name: item.name || item.sku,
                      quantity: 0
                    };
                  }
                  statusBreakdown[status].products[item.sku].quantity += item.orderedQuantity;
                  statusBreakdown[status].totalPortions += item.orderedQuantity;
                }
              }
            }
          }
        } catch (error) {
          console.warn(`Error parsing cached data for order ${order.externalId}:`, error);
        }
      }
    }

    // Преобразуем в массив для ответа
    const statusArray = Object.entries(statusBreakdown).map(([status, data]) => ({
      status,
      statusText: getStatusText(status),
      orderCount: data.orders.length,
      totalPortions: data.totalPortions,
      products: Object.values(data.products),
      orders: data.orders.slice(0, 10) // Ограничиваем до 10 заказов для производительности
    }));

    // Сортируем по количеству порций (убывание)
    statusArray.sort((a, b) => b.totalPortions - a.totalPortions);

    const totalPortionsAll = statusArray.reduce((sum, item) => sum + item.totalPortions, 0);
    const totalOrdersAll = statusArray.reduce((sum, item) => sum + item.orderCount, 0);

    res.json({
      success: true,
      data: statusArray,
      metadata: {
        date: date,
        dateRange: { start: dateStart.toISOString(), end: dateEnd.toISOString() },
        groupBy,
        totalPortions: totalPortionsAll,
        totalOrders: totalOrdersAll,
        statusCount: statusArray.length,
        fetchedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error getting status details:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
