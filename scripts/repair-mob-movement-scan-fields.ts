/**
 * Відновлює barcode / batchNumber / mob-поля в items після перезапису dilovod-кешем.
 *
 * Usage: npx tsx scripts/repair-mob-movement-scan-fields.ts П-00491 П-00492
 */
import { prisma } from '../server/lib/utils.js';
import { isUsableDilovodBatchId, sanitizeStoredBatchName } from '../shared/utils/dilovodBatchId.js';
import { isMobMovementStoredItems } from '../shared/utils/warehouseMovementMobItems.js';
import { WarehouseService } from '../server/modules/Warehouse/WarehouseService.js';

type StoredItem = Record<string, unknown>;

function parseItems(raw: unknown): StoredItem[] {
  return WarehouseService.parseItems(raw) as StoredItem[];
}

function sentPortions(item: StoredItem): number {
  const total = Number(item.totalPortions);
  if (Number.isFinite(total) && total > 0) return total;
  return Math.max(0, Number(item.portionQuantity) || 0);
}

async function repairMovement(internalDocNumber: string, dryRun: boolean): Promise<void> {
  const movement = await prisma.warehouseMovement.findFirst({
    where: { internalDocNumber },
    select: { id: true, status: true, items: true },
  });
  if (!movement) {
    console.warn(`⚠️  ${internalDocNumber}: не знайдено`);
    return;
  }

  const items = parseItems(movement.items);
  if (isMobMovementStoredItems(items) && items.every((row) => String(row.barcode ?? '').trim())) {
    console.log(`✅ ${internalDocNumber}: mob items уже повні, пропуск`);
    return;
  }

  const skus = [...new Set(items.map((row) => String(row.sku ?? '').trim()).filter(Boolean))];
  const goods = await prisma.catalogGood.findMany({
    where: { sku: { in: skus }, delMark: false, isGroup: false },
    select: { sku: true, packageRatio: true },
  });
  const ppbBySku = new Map(
    goods.map((g) => [g.sku, Math.max(0, Number(g.packageRatio) || 0)]),
  );

  let changed = false;
  const nextItems: StoredItem[] = [];

  for (const row of items) {
    const sku = String(row.sku ?? '').trim();
    const batchId = String(row.batchId ?? '').trim();
    let barcode = String(row.barcode ?? '').trim();
    let batchNumber = String(row.batchNumber ?? '').trim();
    const next: StoredItem = { ...row };

    if (!barcode && sku && isUsableDilovodBatchId(batchId)) {
      const hit = await prisma.catalogGoodBarcode.findFirst({
        where: {
          goodPart: batchId,
          good: { sku },
        },
        orderBy: { id: 'asc' },
      });
      if (hit?.code) {
        barcode = hit.code.trim();
        next.barcode = barcode;
        next.barcodeKind = 'portion';
        changed = true;
      }
      const name = sanitizeStoredBatchName(hit?.goodPartName, batchId);
      if (name && !batchNumber) {
        batchNumber = name;
        next.batchNumber = batchNumber;
        changed = true;
      }
    }

    const sent = sentPortions(next);
    if (sent > 0 && (next.totalPortions == null || Number(next.totalPortions) <= 0)) {
      next.totalPortions = sent;
      changed = true;
    }

    const ppb = ppbBySku.get(sku) ?? 0;
    if (sent > 0 && ppb > 0 && (Number(next.boxQuantity) || 0) === 0 && (Number(next.portionQuantity) || 0) <= sent) {
      next.boxQuantity = Math.floor(sent / ppb);
      next.portionQuantity = sent % ppb;
      changed = true;
    }

    if (
      movement.status === 'finalized'
      && sent > 0
      && (next.receivedTotalPortions == null || Number(next.receivedTotalPortions) <= 0)
    ) {
      next.receivedBoxQuantity = Number(next.boxQuantity) || 0;
      next.receivedPortionQuantity = Number(next.portionQuantity) || 0;
      next.receivedTotalPortions = sent;
      changed = true;
    }

    nextItems.push(next);
  }

  if (!changed) {
    console.log(`ℹ️  ${internalDocNumber}: змін не потрібно`);
    return;
  }

  if (dryRun) {
    console.log(`DRY RUN ${internalDocNumber} (#${movement.id}):`, JSON.stringify(nextItems, null, 2));
    return;
  }

  await prisma.warehouseMovement.update({
    where: { id: movement.id },
    data: { items: JSON.stringify(nextItems) },
  });
  console.log(`✅ ${internalDocNumber} (#${movement.id}): відновлено ${nextItems.length} рядків`);
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
  const dryRun = process.argv.includes('--dry-run');
  const targets = args.length > 0 ? args : ['П-00491', 'П-00492'];

  for (const doc of targets) {
    await repairMovement(doc, dryRun);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
