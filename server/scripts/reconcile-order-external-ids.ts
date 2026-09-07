/**
 * Reconciliation: вирівнює orders.externalId / orderNumber з generateExternalId(rawData).
 *
 * Після інцидентів SalesDrive sync оновлює контент по id, але identity-поля
 * (externalId/orderNumber) раніше не оновлювались — цей скрипт це виправляє.
 *
 * Usage:
 *   npx tsx server/scripts/reconcile-order-external-ids.ts           # dry-run
 *   npx tsx server/scripts/reconcile-order-external-ids.ts --apply   # apply
 *   npx tsx server/scripts/reconcile-order-external-ids.ts --limit=500
 *   npx tsx server/scripts/reconcile-order-external-ids.ts --since=2026-09-07
 */
import { PrismaClient } from '@prisma/client';
import { generateExternalId } from '../services/salesdrive/externalIdHelper.js';

const prisma = new PrismaClient();

type Mismatch = {
  id: number;
  oldExternalId: string;
  oldOrderNumber: string;
  expectedExternalId: string;
  sajt: string | null;
  status: string;
};

function parseArgs(argv: string[]) {
  const apply = argv.includes('--apply');
  const limitArg = argv.find((a) => a.startsWith('--limit='));
  const sinceArg = argv.find((a) => a.startsWith('--since='));
  const sajtArg = argv.find((a) => a.startsWith('--sajt='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;
  const since = sinceArg ? new Date(sinceArg.split('=')[1]) : undefined;
  const sajt = sajtArg ? sajtArg.split('=')[1] : undefined;
  return { apply, limit, since, sajt };
}

function parseRawData(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function expectedFromOrder(order: {
  id: number;
  sajt: string | null;
  externalId: string;
  rawData: string;
}): string | null {
  const raw = parseRawData(order.rawData);
  if (!raw) return null;

  const rawId = typeof raw.id === 'number' ? raw.id : Number(raw.id);
  if (!Number.isFinite(rawId) || rawId !== order.id) {
    // Не чіпаємо рядки, де rawData.id не збігається з PK — потрібен ручний розбір
    return null;
  }

  const expected = generateExternalId({
    id: order.id,
    externalId: (raw.externalId as string | null | undefined) ?? null,
    sajt: order.sajt ?? (raw.sajt as string | number | null | undefined) ?? null,
  });

  // Історичний канон для sajt 31/38: SD{id}.
  // Якщо в raw зʼявився numeric externalId === id, generateExternalId віддає голий id,
  // але в БД уже є старі замовлення з таким externalId → не «виправляємо» префікс.
  const sajt = order.sajt != null ? String(order.sajt) : '';
  if (
    (sajt === '31' || sajt === '38' || sajt === '') &&
    order.externalId === `SD${order.id}` &&
    expected === String(order.id)
  ) {
    return order.externalId;
  }

  return expected;
}

async function findMismatches(opts: {
  limit?: number;
  since?: Date;
  sajt?: string;
}): Promise<{ mismatches: Mismatch[]; skippedBadRaw: number }> {
  const where: Record<string, unknown> = {};
  if (opts.since) where.lastSynced = { gte: opts.since };
  if (opts.sajt) where.sajt = opts.sajt;

  // Тягнемо пачками — таблиця orders велика
  const pageSize = 1000;
  let cursor: number | undefined;
  const mismatches: Mismatch[] = [];
  let skippedBadRaw = 0;

  for (;;) {
    const rows = await prisma.order.findMany({
      where,
      take: pageSize,
      ...(cursor
        ? { skip: 1, cursor: { id: cursor } }
        : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        externalId: true,
        orderNumber: true,
        sajt: true,
        status: true,
        rawData: true,
      },
    });

    if (rows.length === 0) break;

    for (const row of rows) {
      const expected = expectedFromOrder(row);
      if (!expected) {
        skippedBadRaw += 1;
        continue;
      }
      if (row.externalId !== expected || row.orderNumber !== expected) {
        mismatches.push({
          id: row.id,
          oldExternalId: row.externalId,
          oldOrderNumber: row.orderNumber,
          expectedExternalId: expected,
          sajt: row.sajt,
          status: row.status,
        });
        if (opts.limit && mismatches.length >= opts.limit) {
          return { mismatches, skippedBadRaw };
        }
      }
    }

    cursor = rows[rows.length - 1].id;
    if (rows.length < pageSize) break;
  }

  return { mismatches, skippedBadRaw };
}

function analyzeCollisions(mismatches: Mismatch[]) {
  const expectedToIds = new Map<string, number[]>();
  for (const m of mismatches) {
    const list = expectedToIds.get(m.expectedExternalId) ?? [];
    list.push(m.id);
    expectedToIds.set(m.expectedExternalId, list);
  }

  const duplicateExpected = [...expectedToIds.entries()].filter(([, ids]) => ids.length > 1);

  return { duplicateExpected };
}

async function findOccupiedTargets(mismatches: Mismatch[]) {
  const expectedIds = [...new Set(mismatches.map((m) => m.expectedExternalId))];
  const mismatchIdSet = new Set(mismatches.map((m) => m.id));

  const occupied: Array<{ expected: string; heldById: number; heldByExternalId: string }> = [];

  // Prisma `in` batches
  const chunkSize = 500;
  for (let i = 0; i < expectedIds.length; i += chunkSize) {
    const chunk = expectedIds.slice(i, i + chunkSize);
    const holders = await prisma.order.findMany({
      where: { externalId: { in: chunk } },
      select: { id: true, externalId: true },
    });
    for (const h of holders) {
      // Якщо holder сам у mismatches і віддасть цей ключ — це нормальний swap-ланцюг
      if (mismatchIdSet.has(h.id)) continue;
      occupied.push({
        expected: h.externalId,
        heldById: h.id,
        heldByExternalId: h.externalId,
      });
    }
  }

  return occupied;
}

async function migrateCache(oldExternalId: string, newExternalId: string) {
  if (oldExternalId === newExternalId) return;

  const oldCache = await prisma.ordersCache.findUnique({
    where: { externalId: oldExternalId },
  });
  if (!oldCache) return;

  const existingNew = await prisma.ordersCache.findUnique({
    where: { externalId: newExternalId },
  });

  if (existingNew) {
    // Новий ключ уже є — видаляємо застарілий
    await prisma.ordersCache.delete({ where: { externalId: oldExternalId } });
    return;
  }

  await prisma.ordersCache.update({
    where: { externalId: oldExternalId },
    data: { externalId: newExternalId },
  });
}

async function applyTwoPhase(mismatches: Mismatch[]) {
  const tempPrefix = `__reconcile_${Date.now()}_`;

  await prisma.$transaction(
    async (tx) => {
      // Phase 1: звільнити unique — тимчасові ключі
      for (const m of mismatches) {
        const temp = `${tempPrefix}${m.id}`;
        await tx.order.update({
          where: { id: m.id },
          data: {
            externalId: temp,
            orderNumber: temp,
          },
        });
      }

      // Phase 2: фінальні значення
      for (const m of mismatches) {
        await tx.order.update({
          where: { id: m.id },
          data: {
            externalId: m.expectedExternalId,
            orderNumber: m.expectedExternalId,
          },
        });

        await tx.ordersHistory.create({
          data: {
            orderId: m.id,
            status: m.status,
            statusText: `externalId reconcile: ${m.oldExternalId} → ${m.expectedExternalId}`,
            source: 'reconcile:external-id',
            notes: JSON.stringify({
              oldExternalId: m.oldExternalId,
              oldOrderNumber: m.oldOrderNumber,
              newExternalId: m.expectedExternalId,
            }),
          },
        });
      }
    },
    { timeout: 120_000 },
  );

  // Cache поза транзакцією orders (окрема таблиця, без FK)
  for (const m of mismatches) {
    try {
      await migrateCache(m.oldExternalId, m.expectedExternalId);
    } catch (err) {
      console.warn(
        `⚠️ Cache migrate failed for ${m.oldExternalId} → ${m.expectedExternalId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

async function main() {
  const { apply, limit, since, sajt } = parseArgs(process.argv.slice(2));

  console.log('🔍 Reconcile order externalId/orderNumber vs rawData');
  console.log(`   mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  if (since) console.log(`   since lastSynced: ${since.toISOString()}`);
  if (sajt) console.log(`   sajt: ${sajt}`);
  if (limit) console.log(`   limit: ${limit}`);

  const { mismatches, skippedBadRaw } = await findMismatches({ limit, since, sajt });
  const { duplicateExpected } = analyzeCollisions(mismatches);
  const occupied = await findOccupiedTargets(mismatches);

  console.log(`\n📊 Found ${mismatches.length} mismatches`);
  console.log(`   skipped (bad/missing rawData.id): ${skippedBadRaw}`);
  console.log(`   duplicate expected externalIds within batch: ${duplicateExpected.length}`);
  console.log(`   expected keys held by non-mismatch orders: ${occupied.length}`);

  const sample = mismatches.slice(0, 20);
  if (sample.length) {
    console.log('\n📋 Sample:');
    for (const m of sample) {
      console.log(
        `   id=${m.id}  ${m.oldExternalId} → ${m.expectedExternalId}  (sajt=${m.sajt ?? '∅'})`,
      );
    }
    if (mismatches.length > sample.length) {
      console.log(`   ... +${mismatches.length - sample.length} more`);
    }
  }

  if (duplicateExpected.length) {
    console.error('\n❌ Abort: кілька orders цілять в один expected externalId:');
    for (const [ext, ids] of duplicateExpected.slice(0, 10)) {
      console.error(`   ${ext} ← ids ${ids.join(', ')}`);
    }
    process.exitCode = 2;
    return;
  }

  if (occupied.length) {
    console.error('\n❌ Abort: expected externalId зайнятий іншим замовленням (не в mismatch-наборі):');
    for (const o of occupied.slice(0, 20)) {
      console.error(`   want ${o.expected} but held by id=${o.heldById}`);
    }
    console.error('   Потрібен ручний розбір або розширення набору (--since / без фільтра).');
    process.exitCode = 2;
    return;
  }

  if (!apply) {
    console.log('\n✅ Dry-run OK. Запусти з --apply щоб записати зміни.');
    return;
  }

  if (mismatches.length === 0) {
    console.log('\n✅ Немає що виправляти.');
    return;
  }

  console.log(`\n✍️ Applying two-phase update for ${mismatches.length} orders...`);
  await applyTwoPhase(mismatches);
  console.log('✅ Done.');
}

main()
  .catch((err) => {
    console.error('❌ Fatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
