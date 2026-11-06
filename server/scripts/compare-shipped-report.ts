/**
 * Звірка звіту відвантажень і діагностика циклів за період. Лише читання БД.
 *
 * 1. Порівняння: стара логіка (замовлення за orders.dilovodSaleExportDate, поточний склад)
 *    проти подій відвантаження (кожен документ sale, склад циклу): порції і монолітні набори.
 * 2. Діагностика: для кожного замовлення, скомплектованого або відвантаженого в періоді,
 *    перевірки документів Dilovod і циклів (order_shipments).
 *
 * Usage:
 *   npm run reports:compare-shipped -- --from=2026-11-01 --to=2026-11-30
 *   npm run reports:compare-shipped -- --from=… --to=… --status=all
 *   npm run reports:compare-shipped -- --from=… --to=… --cycles-since=2026-11-10T08:00:00Z
 *     (--cycles-since: з якого моменту сервер з етапом 2 працює на проді; комплектації
 *      після нього без циклу – помилка. Без параметра ця перевірка пропускається.)
 *   --limit=50: скільки рядків показувати в кожному списку; --verbose: показувати й списки [info].
 */
import { prisma, getReportingDateRange } from '../lib/utils.js';
import { orderDatabaseService } from '../services/orderDatabaseService.js';
import { ordersCacheService } from '../services/ordersCacheService.js';
import { extractShipmentPayloadItems, getOrderReportItems } from '../services/orderShipmentMetricsService.js';
import { loadShipmentEvents } from '../services/shipmentEvents.js';
import { readMonolithicSkus } from '../../shared/utils/shipmentRecord.js';

function arg(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
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

function sumValues(totals: Totals): number {
  return [...totals.values()].reduce((sum, value) => sum + value, 0);
}

function diffTotals(left: Totals, right: Totals) {
  return [...new Set([...left.keys(), ...right.keys()])]
    .map((key) => ({ key, old: left.get(key) ?? 0, new: right.get(key) ?? 0 }))
    .filter((row) => row.old !== row.new);
}

function sameMonolithic(left: Record<string, number> | null, right: Record<string, number> | null): boolean {
  const a = left ?? {};
  const b = right ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => (a[key] ?? 0) === (b[key] ?? 0));
}

const fmtDate = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString().slice(0, 16).replace('T', ' ') : '–');

async function main() {
  const from = arg('from');
  const to = arg('to');
  if (!from || !to) throw new Error('Потрібні --from=YYYY-MM-DD і --to=YYYY-MM-DD');
  const statusArg = arg('status');
  const status = statusArg ? (statusArg.includes(',') ? statusArg.split(',') : statusArg) : undefined;
  const limit = Number(arg('limit') ?? 50);
  const verbose = process.argv.includes('--verbose');
  const cyclesSinceArg = arg('cycles-since');
  const cyclesSince = cyclesSinceArg ? new Date(cyclesSinceArg) : null;

  // Як у звіті відвантажень: доба без зсуву звітної години
  const range = { start: getReportingDateRange(from, 24).start, end: getReportingDateRange(to, 24).end };

  // ---------- 1. Порівняння звіту ----------

  const oldOrders = await orderDatabaseService.getOrders({
    status, limit: 10000, sortBy: 'dilovodSaleExportDate', sortOrder: 'desc',
    shippedOnly: true, shippedDateRange: range, includeItems: true,
  });
  const oldCaches = await ordersCacheService.getMultipleOrderCaches(oldOrders.map((order) => order.externalId));
  const oldTotals: Totals = new Map();
  const oldMono: Totals = new Map();
  const oldByOrder = new Map<string, number>();
  const oldMonoByOrder = new Map<string, number>();
  for (const order of oldOrders) {
    const items = getOrderReportItems(order as any, parseProcessed(oldCaches.get(order.externalId)?.processedItems), true);
    oldByOrder.set(order.externalId, addItems(oldTotals, items));
    oldMonoByOrder.set(order.externalId, addItems(oldMono, extractShipmentPayloadItems(order.payloadData)));
  }

  const { orders: events, caches } = await loadShipmentEvents({ range, status, includeItems: true, sortOrder: 'desc', limit: 10000 });
  const newTotals: Totals = new Map();
  const newMono: Totals = new Map();
  const newByOrder = new Map<string, number>();
  const newMonoByOrder = new Map<string, number>();
  for (const event of events) {
    const items = getOrderReportItems(event as any, parseProcessed(caches.get(event.reportKey)?.processedItems), true);
    newByOrder.set(event.externalId, (newByOrder.get(event.externalId) ?? 0) + addItems(newTotals, items));
    newMonoByOrder.set(event.externalId, (newMonoByOrder.get(event.externalId) ?? 0) + addItems(newMono, extractShipmentPayloadItems(event.payloadData)));
  }

  const ordersWithMono = (map: Map<string, number>) => [...map.values()].filter((value) => value > 0).length;
  console.log(`Період ${from}..${to}, статус: ${statusArg ?? 'за замовчуванням (1–5)'}`);
  console.log('\n=== 1. Звірка звіту відвантажень ===');
  console.log(`Стара логіка: ${oldOrders.length} замовлень, ${sumValues(oldTotals)} порцій; монолітних наборів ${sumValues(oldMono)} (у ${ordersWithMono(oldMonoByOrder)} замовленнях)`);
  console.log(`Нова логіка:  ${events.length} подій (${new Set(events.map((event) => event.externalId)).size} замовлень, з них з циклом: ${events.filter((event) => event.shipmentCycle != null).length}), ${sumValues(newTotals)} порцій; монолітних наборів ${sumValues(newMono)} (у ${ordersWithMono(newMonoByOrder)} замовленнях)`);

  const orderDiffs = [...new Set([...oldByOrder.keys(), ...newByOrder.keys()])]
    .map((externalId) => ({
      externalId,
      old: oldByOrder.get(externalId) ?? 0,
      new: newByOrder.get(externalId) ?? 0,
      oldMono: oldMonoByOrder.get(externalId) ?? 0,
      newMono: newMonoByOrder.get(externalId) ?? 0,
    }))
    .filter((row) => row.old !== row.new || row.oldMono !== row.newMono);
  console.log(`\nЗамовлення з різницею (порції або моноліти): ${orderDiffs.length}`);
  for (const row of orderDiffs.slice(0, limit)) {
    const detail = events
      .filter((event) => event.externalId === row.externalId)
      .map((event) => `${fmtDate(event.dilovodSaleExportDate).slice(0, 10)}${event.saleDocumentNumber ? ` №${event.saleDocumentNumber}` : ''}${event.shipmentCycle ? ` цикл ${event.shipmentCycle}` : ''}`)
      .join('; ');
    console.log(`  ${row.externalId}: порції ${row.old} → ${row.new}, моноліти ${row.oldMono} → ${row.newMono}${detail ? `  [${detail}]` : ''}`);
  }

  const skuDiffs = diffTotals(oldTotals, newTotals);
  console.log(`\nSKU з різницею в порціях: ${skuDiffs.length}`);
  for (const row of skuDiffs.slice(0, limit)) console.log(`  ${row.key}: ${row.old} → ${row.new}`);
  const monoDiffs = diffTotals(oldMono, newMono);
  console.log(`\nМонолітні набори з різницею: ${monoDiffs.length}`);
  for (const row of monoDiffs.slice(0, limit)) console.log(`  ${row.key}: ${row.old} → ${row.new}`);

  // ---------- 2. Діагностика циклів ----------

  const pickings = await prisma.ordersHistory.findMany({
    where: { status: '3', changedAt: { gte: range.start, lte: range.end } },
    select: { orderId: true, changedAt: true },
  });
  const orderIds = [...new Set([...pickings.map((row) => row.orderId), ...events.map((event) => event.id)])];
  const [orders, cycles, docs] = await Promise.all([
    prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: {
        id: true, orderNumber: true, status: true, payloadData: true,
        dilovodDocId: true, dilovodSaleDocsCount: true, dilovodReturnDocsCount: true,
      },
    }),
    prisma.orderShipment.findMany({
      where: { orderId: { in: orderIds } },
      orderBy: [{ orderId: 'asc' }, { cycle: 'asc' }],
      select: { orderId: true, cycle: true, schemaVersion: true, source: true, pickedAt: true, summary: true, manifest: true, saleDocumentId: true, returnDocumentId: true },
    }),
    prisma.orderDilovodDocument.findMany({
      where: { orderId: { in: orderIds }, type: { in: ['sale', 'saleReturn'] } },
      select: { id: true, orderId: true, type: true, number: true, docDate: true },
    }),
  ]);

  type Issue = { orderNumber: string; level: 'error' | 'warn' | 'info'; check: string; detail: string };
  const issues: Issue[] = [];
  const cyclesByOrder = new Map<number, typeof cycles>();
  for (const cycle of cycles) cyclesByOrder.set(cycle.orderId, [...(cyclesByOrder.get(cycle.orderId) ?? []), cycle]);
  const docsByOrder = new Map<number, typeof docs>();
  for (const doc of docs) docsByOrder.set(doc.orderId, [...(docsByOrder.get(doc.orderId) ?? []), doc]);
  const lastPickingByOrder = new Map<number, Date>();
  for (const row of pickings) {
    const prev = lastPickingByOrder.get(row.orderId);
    if (!prev || row.changedAt > prev) lastPickingByOrder.set(row.orderId, row.changedAt);
  }
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  for (const order of orders) {
    const orderCycles = cyclesByOrder.get(order.id) ?? [];
    const orderDocs = docsByOrder.get(order.id) ?? [];
    const sales = orderDocs.filter((doc) => doc.type === 'sale');
    const returns = orderDocs.filter((doc) => doc.type === 'saleReturn');
    const push = (level: Issue['level'], check: string, detail: string) => issues.push({ orderNumber: order.orderNumber, level, check, detail });
    const lastPicking = lastPickingByOrder.get(order.id);

    // Комплектація після запуску циклів – цикл має бути
    if (cyclesSince && lastPicking && lastPicking >= cyclesSince && orderCycles.length === 0) {
      push('error', 'Немає циклу', `комплектація ${fmtDate(lastPicking)}, циклу в order_shipments немає`);
    }

    // Клієнт не надіслав склад v2
    for (const cycle of orderCycles) {
      if (cycle.source === 'picking' && cycle.schemaVersion !== 2) {
        push('warn', 'Цикл у форматі v1', `цикл ${cycle.cycle}: клієнт не надіслав склад v2 (старий кеш сторінки?)`);
      }
      if (cycle.schemaVersion === 2 && !cycle.manifest) {
        push('warn', 'Немає manifest', `цикл ${cycle.cycle}: schemaVersion 2 без manifest`);
      }
    }

    // Останній цикл = остання комплектація: моноліти мають збігатися з payloadData
    const lastCycle = orderCycles[orderCycles.length - 1];
    if (lastCycle && lastCycle.source === 'picking') {
      const cycleMono = readMonolithicSkus(lastCycle.summary);
      const payloadMono = readMonolithicSkus(order.payloadData) ?? {};
      if (!sameMonolithic(cycleMono, payloadMono)) {
        push('error', 'Моноліти ≠ payloadData', `цикл ${lastCycle.cycle}: ${JSON.stringify(cycleMono)} проти ${JSON.stringify(payloadMono)}`);
      }
    }

    // Відкритий цикл давно без відвантаження, хоча замовлення вже далі статусу 3
    for (const cycle of orderCycles) {
      if (cycle.saleDocumentId == null && Number(order.status) >= 4 && Number(order.status) <= 5 && now - cycle.pickedAt.getTime() > DAY_MS) {
        push('warn', 'Цикл без відвантаження', `цикл ${cycle.cycle} від ${fmtDate(cycle.pickedAt)}, статус ${order.status}, sale не привʼязано`);
      }
    }

    // Відвантаження після першої комплектації з циклами, але без циклу
    const firstCycleAt = orderCycles[0]?.pickedAt;
    const linkedSaleIds = new Set(orderCycles.map((cycle) => cycle.saleDocumentId).filter((id) => id != null));
    for (const sale of sales) {
      if (firstCycleAt && sale.docDate.getTime() >= firstCycleAt.getTime() - 12 * 60 * 60 * 1000 && !linkedSaleIds.has(sale.id)) {
        push('error', 'Sale без циклу', `№${sale.number ?? '?'} від ${fmtDate(sale.docDate)} не привʼязано до циклу`);
      }
    }

    // Повернення без циклу (лише якщо цикли є)
    const linkedReturnIds = new Set(orderCycles.map((cycle) => cycle.returnDocumentId).filter((id) => id != null));
    for (const doc of returns) {
      if (orderCycles.some((cycle) => cycle.saleDocumentId != null) && !linkedReturnIds.has(doc.id)) {
        push('warn', 'Повернення без циклу', `№${doc.number ?? '?'} від ${fmtDate(doc.docDate)}`);
      }
    }

    // Лічильники orders проти таблиці документів (лише коли документи вже синхронізовані)
    if (sales.length > 0 && order.dilovodSaleDocsCount != null && order.dilovodSaleDocsCount !== sales.length) {
      push('warn', 'Лічильник sale', `orders.dilovodSaleDocsCount = ${order.dilovodSaleDocsCount}, у таблиці ${sales.length}`);
    }
    if (returns.length > 0 && order.dilovodReturnDocsCount != null && order.dilovodReturnDocsCount !== returns.length) {
      push('warn', 'Лічильник saleReturn', `orders.dilovodReturnDocsCount = ${order.dilovodReturnDocsCount}, у таблиці ${returns.length}`);
    }
    if (order.dilovodDocId && sales.length === 0 && Number(order.status) >= 4 && Number(order.status) <= 5) {
      push('info', 'Документи не синхронізовані', 'відвантаження є, а в order_dilovod_documents порожньо (заповнить перевірка / backfill)');
    }
  }

  console.log('\n=== 2. Діагностика циклів ===');
  console.log(`Замовлень у періоді: ${orders.length}; з циклами: ${cyclesByOrder.size} (циклів ${cycles.length}, v2: ${cycles.filter((cycle) => cycle.schemaVersion === 2).length}); з документами sale у таблиці: ${[...docsByOrder.values()].filter((list) => list.some((doc) => doc.type === 'sale')).length}`);
  if (!cyclesSince) console.log('Перевірку «Немає циклу» пропущено: задайте --cycles-since=<момент деплою етапу 2 на прод>.');

  const byCheck = new Map<string, Issue[]>();
  for (const issue of issues) byCheck.set(`${issue.level}|${issue.check}`, [...(byCheck.get(`${issue.level}|${issue.check}`) ?? []), issue]);
  if (byCheck.size === 0) {
    console.log('Проблем не знайдено.');
  }
  const levelOrder = { error: 0, warn: 1, info: 2 } as const;
  for (const [key, list] of [...byCheck.entries()].sort(([left], [right]) => levelOrder[left.split('|')[0] as Issue['level']] - levelOrder[right.split('|')[0] as Issue['level']])) {
    const [level, check] = key.split('|');
    console.log(`\n[${level}] ${check}: ${list.length}`);
    // info – лише кількість (очікувані стани до backfill), список з --verbose
    if (level === 'info' && !verbose) continue;
    for (const issue of list.slice(0, limit)) console.log(`  ${issue.orderNumber}: ${issue.detail}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
