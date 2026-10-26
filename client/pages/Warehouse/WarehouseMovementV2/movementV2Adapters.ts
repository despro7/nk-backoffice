import type { GoodMovingDocumentDetails, GoodMovingItem } from '@shared/types/movement';
import type { ReleaseComponentBatch } from '@shared/types/warehouseRelease';
import type { MovementProduct, MovementBatch } from '../WarehouseMovement/WarehouseMovementTypes';
import type { MovementV2Line } from './types';

function tpGoodsRows(details: GoodMovingDocumentDetails): GoodMovingItem[] {
  const tp = details.tableParts?.tpGoods;
  if (!tp) return [];
  return Object.values(tp);
}

/** Рядки реєстру v2 з tpGoods Dilovod (редагування goodMoving без локальної БД). */
export function linesFromGoodMovingDetails(details: GoodMovingDocumentDetails): MovementV2Line[] {
  const goods = tpGoodsRows(details);
  const byKey = new Map<string, GoodMovingItem[]>();

  for (const row of goods) {
    const sku = String(row.sku ?? (row as { productNum?: string }).productNum ?? '').trim();
    const goodId = String(row.good ?? '').trim();
    const key = sku || goodId || String(row.good__pr ?? '').trim().toLowerCase();
    if (!key) continue;
    const bucket = byKey.get(key) ?? [];
    bucket.push(row);
    byKey.set(key, bucket);
  }

  const lines: MovementV2Line[] = [];
  let idx = 0;
  for (const [, rows] of byKey) {
    const first = rows[0];
    const sku = String(first.sku ?? (first as { productNum?: string }).productNum ?? first.good ?? '').trim();
    const name = String(first.good__pr ?? sku);
    const dilovodId = String(first.good ?? '').trim() || null;
    const batches: ReleaseComponentBatch[] = rows
      .map((g) => ({
        batchId: String(g.goodPart ?? '').trim(),
        batchNumber: String(g.goodPart__pr ?? '').trim(),
        quantity: parseFloat(g.qty) || 0,
      }))
      .filter((b) => b.quantity > 0 || b.batchId);

    lines.push({
      id: `dilovod-line-${idx}-${sku.replace(/\W/g, '_')}`,
      sku,
      name,
      barcode: '',
      dilovodId,
      portionsPerBox: 1,
      batches,
    });
    idx += 1;
  }
  return lines;
}


export function batchesToMovementBatches(
  batches: ReleaseComponentBatch[],
  storageId: string,
  portionsPerBox: number,
  isSet = false,
): MovementBatch[] {
  const ppb = portionsPerBox > 0 ? portionsPerBox : 1;
  return batches
    .filter((batch) => Number(batch.quantity ?? 0) > 0)
    .map((batch, index) => {
      const total = Number(batch.quantity ?? 0);
      const boxes = isSet ? 0 : Math.floor(total / ppb);
      const portions = isSet ? total : total % ppb;
      return {
        id: `${batch.batchId}-${index}`,
        batchId: batch.batchId,
        batchNumber: batch.batchNumber ?? '',
        storage: storageId,
        quantity: total,
        boxes,
        portions,
      };
    });
}

export function lineToMovementProduct(line: MovementV2Line, storageId: string): MovementProduct {
  return {
    id: line.id,
    sku: line.sku,
    name: line.name,
    barcode: line.barcode,
    dilovodId: line.dilovodId,
    portionsPerBox: line.portionsPerBox > 0 ? line.portionsPerBox : 1,
    isSet: line.isSet,
    details: {
      batches: batchesToMovementBatches(line.batches, storageId, line.portionsPerBox, Boolean(line.isSet)),
      forecast: 0,
    },
    stockData: null,
  };
}

export function linesToSummaryItems(lines: MovementV2Line[], storageId: string): MovementProduct[] {
  return lines
    .map((line) => lineToMovementProduct(line, storageId))
    .filter((product) => product.details.batches.some((b) => b.boxes > 0 || b.portions > 0));
}
