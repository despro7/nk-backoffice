/**
 * Аудит і звʼязування пар kit + unkit (коригування парт. обліку).
 * Ключ пари: setSku, quantity, comment (повний текст).
 *
 * Usage:
 *   npm run warehouse:link-correction-pairs              # dry-run: аудит + план
 *   npm run warehouse:link-correction-pairs:apply        # розʼєднати помилкові + запис нових пар
 */
import { PrismaClient } from '@prisma/client';
import { createCorrectionSessionId } from '../../shared/utils/releaseBatchCorrection.js';
import {
  auditLinkedReleaseCorrectionSessions,
  clearReleaseItemsCorrectionSession,
  collectIdsToUnlinkInvalidCorrectionPairs,
  patchReleaseItemsCorrectionSession,
  planReleaseCorrectionPairLinks,
  type ReleasePairCandidate,
} from '../../shared/utils/linkReleaseCorrectionPairs.js';

const prisma = new PrismaClient();

const ACTIVE_STATUSES = ['created', 'send_failed'];

/** Коригування парт. обліку в проді з жовтня 2026 — раніше записів немає. */
const LINK_RANGE_FROM = new Date('2026-10-01T00:00:00.000Z');

function linkRangeTo(): Date {
  return new Date();
}

function parseArgs(argv: string[]) {
  return { apply: argv.includes('--apply') };
}

function formatDoc(row: ReleasePairCandidate): string {
  return row.internalDocNumber ?? `#${row.id}`;
}

async function loadCandidates(): Promise<ReleasePairCandidate[]> {
  const rangeTo = linkRangeTo();
  const rows = await prisma.warehouseReleaseSet.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      createdAt: {
        gte: LINK_RANGE_FROM,
        lte: rangeTo,
      },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      internalDocNumber: true,
      operationType: true,
      setSku: true,
      quantity: true,
      comment: true,
      createdAt: true,
      correctionSessionId: true,
      items: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    internalDocNumber: row.internalDocNumber,
    operationType: row.operationType,
    setSku: row.setSku,
    quantity: row.quantity,
    comment: row.comment,
    createdAt: row.createdAt,
    correctionSessionId: row.correctionSessionId,
    items: row.items,
  }));
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  const rangeTo = linkRangeTo();
  const candidates = await loadCandidates();
  const byId = new Map(candidates.map((row) => [row.id, row]));

  const audit = auditLinkedReleaseCorrectionSessions(candidates);
  const unlinkIds = collectIdsToUnlinkInvalidCorrectionPairs(audit.invalidLinked);

  const candidatesForPlan = candidates.map((row) => (
    unlinkIds.includes(row.id)
      ? {
        ...row,
        correctionSessionId: null,
        items: clearReleaseItemsCorrectionSession(row.items),
      }
      : row
  ));

  const plan = planReleaseCorrectionPairLinks(candidatesForPlan, createCorrectionSessionId);

  console.log(`\n=== Release correction pair linker (${apply ? 'APPLY' : 'DRY-RUN'}) ===`);
  console.log(
    `Діапазон createdAt: ${LINK_RANGE_FROM.toISOString().slice(0, 10)} … ${rangeTo.toISOString().slice(0, 10)}`,
  );
  console.log(`Переглянуто записів: ${candidates.length}`);
  console.log(`Валідних пар у БД (session + matchKey): ${audit.validLinked.length}`);
  console.log(`Помилкових пар (потрібно розʼєднати): ${audit.invalidLinked.length}`);
  console.log(`Сиріт у сесії (без пари): ${audit.orphanIds.length}`);
  console.log(`Нових пар для звʼязку після repair: ${plan.pairs.length}`);
  console.log(`Вже коректно звʼязані: ${plan.alreadyLinked.length}`);
  console.log(`Неоднозначних / пропущених кейсів: ${plan.skipped.length}\n`);

  if (audit.invalidLinked.length > 0) {
    console.log('--- Помилкові пари (різний matchKey при одній session) ---');
    for (const pair of audit.invalidLinked) {
      console.log(
        `session ${pair.sessionId}: kit ${formatDoc(pair.kit)} (id=${pair.kit.id})`
        + ` ↔ unkit ${formatDoc(pair.unkit)} (id=${pair.unkit.id})`,
      );
      console.log(`  kit key:   ${pair.kitMatchKey ?? '—'}`);
      console.log(`  unkit key: ${pair.unkitMatchKey ?? '—'}`);
      console.log(`  ${pair.reason}`);
    }
    console.log('');
  }

  if (plan.pairs.length > 0) {
    console.log('--- Будуть звʼязані пари ---');
    for (const pair of plan.pairs) {
      console.log(
        `[${pair.matchKey}] kit ${formatDoc(pair.kit)} (id=${pair.kit.id})`
        + ` ↔ unkit ${formatDoc(pair.unkit)} (id=${pair.unkit.id})`
        + ` → session ${pair.sessionId}`,
      );
    }
    console.log('');
  }

  if (plan.skipped.length > 0) {
    console.log('--- Пропущено (неоднозначно або залишки) ---');
    for (const item of plan.skipped) {
      console.log(`[${item.matchKey}] ${item.reason}`);
      console.log(`  kit ids: ${item.kitIds.join(', ') || '—'}`);
      console.log(`  unkit ids: ${item.unkitIds.join(', ') || '—'}`);
    }
    console.log('');
  }

  if (!apply) {
    console.log('Dry-run. Для запису: npm run warehouse:link-correction-pairs:apply\n');
    return;
  }

  let updatedRows = 0;
  for (const id of unlinkIds) {
    const row = byId.get(id);
    if (!row) continue;
    await prisma.warehouseReleaseSet.update({
      where: { id },
      data: {
        correctionSessionId: null,
        items: clearReleaseItemsCorrectionSession(row.items) as object,
      },
    });
    updatedRows += 1;
  }

  for (const pair of plan.pairs) {
    const memberIds = pair.memberIds ?? [pair.kit.id, pair.unkit.id];
    for (const memberId of memberIds) {
      const source = byId.get(memberId);
      if (!source) continue;
      const nextItems = patchReleaseItemsCorrectionSession(source.items, pair.sessionId);
      await prisma.warehouseReleaseSet.update({
        where: { id: memberId },
        data: {
          correctionSessionId: pair.sessionId,
          items: nextItems as object,
        },
      });
      updatedRows += 1;
    }
  }

  console.log(`✅ Оновлено записів у БД: ${updatedRows}\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
