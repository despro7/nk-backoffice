/**
 * Порівняння звіту відвантажень: стара логіка (замовлення за orders.dilovodSaleExportDate,
 * поточний склад) проти подій відвантаження (кожен документ sale, склад циклу).
 * Лише читання БД.
 *
 * Usage:
 *   npx tsx server/scripts/compare-shipped-report.ts --from=2026-10-01 --to=2026-11-06
 *   npx tsx server/scripts/compare-shipped-report.ts --from=2026-10-01 --to=2026-11-06 --status=all
 */
import { getReportingDateRange } from '../lib/utils.js';
import { orderDatabaseService } from '../services/orderDatabaseService.js';
import { ordersCacheService } from '../services/ordersCacheService.js';
import { getOrderReportItems } from '../services/orderShipmentMetricsService.js';
import { loadShipmentEvents } from '../services/shipmentEvents.js';

function arg(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=')[1];
}

type Totals = Map<string, number>;

function addItems(totals: Totals, items: Array<{ sku?: string | null; orderedQuantity?: unknown; quantity?: unknown }>): number {
  let sum = 0;
  for (const item of items) {
    if (!item?.sku) continue;
    const quantity = Number(item.orderedQuantity ?? item.quantity ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    totals.set(String(item.sku), (totals.get(String(item.sku)) ?? 0) + quantity);
    sum += quantity;
  }
  return sum;
}

function parseProcessed(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function main() {
  const from = arg('from');
  const to = arg('to');
  if (!from || !to) throw new Error('Потрібні --from=YYYY-MM-DD і --to=YYYY-MM-DD');
  const statusArg = arg('status');
  const status = statusArg ? (statusArg.includes(',') ? statusArg.split(',') : statusArg) : undefined;

  // Як у звіті відвантажень: доба без зсуву звітної години
  const range = { start: getReportingDateRange(from, 24).start, end: getReportingDateRange(to, 24).end };

  // Стара логіка
  const oldOrders = await orderDatabaseService.getOrders({
    status, limit: 10000, sortBy: 'dilovodSaleExportDate', sortOrder: 'desc',
    shippedOnly: true, shippedDateRange: range, includeItems: true,
  });
  const oldCaches = await ordersCacheService.getMultipleOrderCaches(oldOrders.map((order) => order.externalId));
  const oldTotals: Totals = new Map();
  const oldByOrder = new Map<string, number>();
  for (const order of oldOrders) {
    const items = getOrderReportItems(order as any, parseProcessed(oldCaches.get(order.externalId)?.processedItems), true);
    oldByOrder.set(order.externalId, addItems(oldTotals, items));
  }

  // Нова логіка
  const { orders: events, caches } = await loadShipmentEvents({ range, status, includeItems: true, sortOrder: 'desc', limit: 10000 });
  const newTotals: Totals = new Map();
  const newByOrder = new Map<string, number>();
  for (const event of events) {
    const items = getOrderReportItems(event as any, parseProcessed(caches.get(event.reportKey)?.processedItems), true);
    newByOrder.set(event.externalId, (newByOrder.get(event.externalId) ?? 0) + addItems(newTotals, items));
  }

  const totalOld = [...oldTotals.values()].reduce((sum, value) => sum + value, 0);
  const totalNew = [...newTotals.values()].reduce((sum, value) => sum + value, 0);
  console.log(`Період ${from}..${to}, статус: ${statusArg ?? 'за замовчуванням (1–5)'}`);
  console.log(`Стара логіка: ${oldOrders.length} замовлень, ${totalOld} порцій`);
  console.log(`Нова логіка:  ${events.length} подій (${new Set(events.map((event) => event.externalId)).size} замовлень, з них з циклом: ${events.filter((event) => event.shipmentCycle != null).length}), ${totalNew} порцій`);

  const orderDiffs = [...new Set([...oldByOrder.keys(), ...newByOrder.keys()])]
    .map((externalId) => ({ externalId, old: oldByOrder.get(externalId) ?? 0, new: newByOrder.get(externalId) ?? 0 }))
    .filter((row) => row.old !== row.new);
  console.log(`\nЗамовлення з різницею: ${orderDiffs.length}`);
  for (const row of orderDiffs.slice(0, 50)) {
    const orderEvents = events.filter((event) => event.externalId === row.externalId);
    const detail = orderEvents.map((event) => `${new Date(event.dilovodSaleExportDate ?? 0).toISOString().slice(0, 10)}${event.saleDocumentNumber ? ` №${event.saleDocumentNumber}` : ''}${event.shipmentCycle ? ` цикл ${event.shipmentCycle}` : ''}`).join('; ');
    console.log(`  ${row.externalId}: було ${row.old}, стало ${row.new}${detail ? `  [${detail}]` : ''}`);
  }

  const skuDiffs = [...new Set([...oldTotals.keys(), ...newTotals.keys()])]
    .map((sku) => ({ sku, old: oldTotals.get(sku) ?? 0, new: newTotals.get(sku) ?? 0 }))
    .filter((row) => row.old !== row.new);
  console.log(`\nSKU з різницею: ${skuDiffs.length}`);
  for (const row of skuDiffs.slice(0, 30)) console.log(`  ${row.sku}: ${row.old} → ${row.new}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
