import { Router } from 'express';
import { prisma } from '../lib/utils.js';
import { authenticateToken } from '../middleware/auth.js';
import type { OrderCacheItem } from '../services/ordersCacheService.js';

const router = Router();

// ---------------------------------------------------------------------------
// Типи
// ---------------------------------------------------------------------------

/** Режим групування колонок таблиці */
type GroupBy = 'day' | 'calendarWeek' | 'week4';

interface PeriodMeta {
  key: string;
  label: string;
  /** Перший день включно (UTC, midnight) */
  from: Date;
  /** Останній день включно (UTC, end of day) */
  to: Date;
}

interface SalesDynamicsRow {
  sku: string;
  productName: string;
  /** periodKey → кількість порцій */
  periods: Record<string, number>;
  totalSold: number;
}

// ---------------------------------------------------------------------------
// Допоміжні функції для побудови periodMeta
// ---------------------------------------------------------------------------

/** Кількість днів у місяці */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Будує масив PeriodMeta для режиму "по днях" */
function buildDayPeriods(year: number, month: number): PeriodMeta[] {
  const total = daysInMonth(year, month);
  const periods: PeriodMeta[] = [];
  for (let d = 1; d <= total; d++) {
    const from = new Date(Date.UTC(year, month, d, 0, 0, 0));
    const to   = new Date(Date.UTC(year, month, d, 23, 59, 59, 999));
    const dd   = String(d).padStart(2, '0');
    const mm   = String(month + 1).padStart(2, '0');
    periods.push({ key: `${year}-${mm}-${dd}`, label: `${dd}.${mm}`, from, to });
  }
  return periods;
}

/** Будує масив PeriodMeta для режиму "4 рівні тижні" */
function buildWeek4Periods(year: number, month: number): PeriodMeta[] {
  const total = daysInMonth(year, month);
  const weekSize = Math.ceil(total / 4);
  const periods: PeriodMeta[] = [];
  const mm = String(month + 1).padStart(2, '0');

  for (let i = 0; i < 4; i++) {
    const startDay = i * weekSize + 1;
    const endDay   = Math.min((i + 1) * weekSize, total);
    if (startDay > total) break;
    const from = new Date(Date.UTC(year, month, startDay, 0, 0, 0));
    const to   = new Date(Date.UTC(year, month, endDay, 23, 59, 59, 999));
    const s    = String(startDay).padStart(2, '0');
    const e    = String(endDay).padStart(2, '0');
    periods.push({ key: `w${i + 1}`, label: `${s}.${mm}–${e}.${mm}`, from, to });
  }
  return periods;
}

/** Будує масив PeriodMeta для режиму "календарні тижні" (пн–нд) */
function buildCalendarWeekPeriods(year: number, month: number): PeriodMeta[] {
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd   = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

  const periods: PeriodMeta[] = [];
  // Знаходимо перший понеділок <= початку місяця
  let cursor = new Date(monthStart);
  // getUTCDay(): 0=Sun,1=Mon,...,6=Sat → зміщення до пн
  const dow = cursor.getUTCDay();
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  cursor.setUTCDate(cursor.getUTCDate() + offsetToMonday);

  let weekIndex = 1;
  while (cursor <= monthEnd) {
    const weekFrom = new Date(cursor);
    const weekTo   = new Date(cursor);
    weekTo.setUTCDate(weekTo.getUTCDate() + 6);
    weekTo.setUTCHours(23, 59, 59, 999);

    // Обрізаємо до меж місяця для label
    const labelFrom = weekFrom < monthStart ? monthStart : weekFrom;
    const labelTo   = weekTo   > monthEnd   ? monthEnd   : weekTo;

    const fmt = (d: Date) =>
      `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

    // ISO тиждень як ключ
    const isoWeek = getISOWeek(weekFrom);
    periods.push({
      key:   `cw${isoWeek}`,
      label: `${fmt(labelFrom)}–${fmt(labelTo)}`,
      from:  weekFrom < monthStart ? monthStart : weekFrom,
      to:    weekTo   > monthEnd   ? monthEnd   : weekTo,
    });

    cursor.setUTCDate(cursor.getUTCDate() + 7);
    weekIndex++;
  }
  return periods;
}

/** Номер ISO тижня для дати (UTC) */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/** Знайти ключ периоду для конкретної дати замовлення */
function findPeriodKey(orderDate: Date, periods: PeriodMeta[]): string | null {
  const t = orderDate.getTime();
  for (const p of periods) {
    if (t >= p.from.getTime() && t <= p.to.getTime()) return p.key;
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET /api/stat/sales-dynamics
// Query params:
//   year    — number (default: поточний рік)
//   month   — number, 1-based (default: поточний місяць)
//   groupBy — 'day' | 'calendarWeek' | 'week4' (default: 'week4')
// ---------------------------------------------------------------------------
router.get('/sales-dynamics', authenticateToken, async (req, res) => {
  try {
    const now   = new Date();
    const year  = parseInt(req.query.year  as string) || now.getFullYear();
    const month = parseInt(req.query.month as string) || now.getMonth() + 1; // 1-based
    const groupBy: GroupBy = (['day', 'calendarWeek', 'week4'].includes(req.query.groupBy as string)
      ? req.query.groupBy as GroupBy
      : 'week4');

    // Валідація
    if (month < 1 || month > 12) {
      return res.status(400).json({ success: false, error: 'month must be between 1 and 12' });
    }

    const monthIndex = month - 1; // 0-based для Date
    const monthStart = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
    const monthEnd   = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));

    console.log(`📊 [Stat] GET /sales-dynamics — ${year}-${String(month).padStart(2,'0')}, groupBy=${groupBy}`);

    // Статуси > 3 (продаж): 4, 5, 6, 7
    const SALE_STATUSES = ['4', '5', '6', '7'];

    // -----------------------------------------------------------------------
    // 1. Отримуємо замовлення з БД за місяць зі статусами продажів
    // -----------------------------------------------------------------------
    const orders = await prisma.order.findMany({
      where: {
        status:    { in: SALE_STATUSES },
        orderDate: { gte: monthStart, lte: monthEnd },
      },
      select: {
        externalId: true,
        orderDate:  true,
      },
    });

    if (orders.length === 0) {
      // Будуємо periods навіть для порожнього результату
      const periods = buildPeriods(groupBy, year, monthIndex);
      return res.json({
        success: true,
        data: { rows: [], periods: periods.map(p => ({ key: p.key, label: p.label })) },
        metadata: { year, month, groupBy, totalOrders: 0, generatedAt: new Date().toISOString() },
      });
    }

    // -----------------------------------------------------------------------
    // 2. Bulk-завантаження кешу (один запит)
    // -----------------------------------------------------------------------
    const externalIds = orders.map(o => o.externalId);
    const cacheEntries = await prisma.ordersCache.findMany({
      where:  { externalId: { in: externalIds } },
      select: { externalId: true, processedItems: true },
    });

    // Map: externalId → processedItems
    const cacheMap = new Map<string, string | null>(
      cacheEntries.map(c => [c.externalId, c.processedItems]),
    );

    // -----------------------------------------------------------------------
    // 3. Будуємо periods-метадані
    // -----------------------------------------------------------------------
    const periods = buildPeriods(groupBy, year, monthIndex);

    // -----------------------------------------------------------------------
    // 4. Агрегація: SKU → periodKey → кількість
    // -----------------------------------------------------------------------
    // Map: sku → { productName, periods: Map<periodKey, qty> }
    const skuMap = new Map<string, { productName: string; periods: Map<string, number> }>();

    for (const order of orders) {
      if (!order.orderDate) continue;
      const periodKey = findPeriodKey(order.orderDate, periods);
      if (!periodKey) continue;

      const rawItems = cacheMap.get(order.externalId);
      if (!rawItems) continue;

      let items: OrderCacheItem[];
      try {
        items = JSON.parse(rawItems);
        if (!Array.isArray(items)) continue;
      } catch {
        continue;
      }

      for (const item of items) {
        if (!item.sku) continue;

        let entry = skuMap.get(item.sku);
        if (!entry) {
          entry = { productName: item.name || item.sku, periods: new Map() };
          skuMap.set(item.sku, entry);
        }

        const current = entry.periods.get(periodKey) ?? 0;
        entry.periods.set(periodKey, current + (item.orderedQuantity || 0));
      }
    }

    // -----------------------------------------------------------------------
    // 5. Формуємо відповідь
    // -----------------------------------------------------------------------
    const rows: SalesDynamicsRow[] = [];
    for (const [sku, { productName, periods: periodMap }] of skuMap) {
      const periodsObj: Record<string, number> = {};
      let totalSold = 0;
      for (const p of periods) {
        const qty = periodMap.get(p.key) ?? 0;
        periodsObj[p.key] = qty;
        totalSold += qty;
      }
      rows.push({ sku, productName, periods: periodsObj, totalSold });
    }

    // Сортуємо за totalSold спадно (за замовчуванням для фронту)
    rows.sort((a, b) => b.totalSold - a.totalSold);

    console.log(`✅ [Stat] sales-dynamics: ${rows.length} продуктів, ${orders.length} замовлень`);

    res.json({
      success: true,
      data: {
        rows,
        periods: periods.map(p => ({ key: p.key, label: p.label })),
      },
      metadata: {
        year,
        month,
        groupBy,
        totalOrders: orders.length,
        ordersWithCache: cacheMap.size,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('🚨 [Stat] Помилка /sales-dynamics:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Внутрішня помилка сервера',
    });
  }
});

// ---------------------------------------------------------------------------
// Фабрика periods по режиму
// ---------------------------------------------------------------------------
function buildPeriods(groupBy: GroupBy, year: number, monthIndex: number): PeriodMeta[] {
  switch (groupBy) {
    case 'day':          return buildDayPeriods(year, monthIndex);
    case 'calendarWeek': return buildCalendarWeekPeriods(year, monthIndex);
    case 'week4':
    default:             return buildWeek4Periods(year, monthIndex);
  }
}

export default router;
