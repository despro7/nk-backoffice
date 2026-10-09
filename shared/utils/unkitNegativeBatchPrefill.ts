import { canSetTpGoodsGoodPart } from './dilovodBatchId.js';

export type UnkitWarehouseBatchStock = {
  batchId: string;
  batchNumber?: string | null;
  quantity: number;
};

export type UnkitPrefillBatch = {
  batchId: string;
  batchNumber: string;
  quantity: number;
  batchStock?: number;
  barcode?: string;
};

function roundPortions(value: number): number {
  return Math.max(0, Math.round(value));
}

/**
 * Розукомплектування (коригування): додає партії з мінусовим залишком
 * і розподіляє `requiredQuantity` — спочатку на перекриття мінусів, решту на партії з комплектування.
 */
export function mergeNegativeBatchesForUnkit(input: {
  requiredQuantity: number;
  existingBatches: UnkitPrefillBatch[];
  warehouseBatches: UnkitWarehouseBatchStock[];
}): UnkitPrefillBatch[] {
  const required = Number(input.requiredQuantity ?? 0);
  if (!Number.isFinite(required) || required <= 0) {
    return [];
  }

  const warehouseStockById = new Map<string, { stock: number; batchNumber: string }>();
  for (const row of input.warehouseBatches ?? []) {
    const batchId = String(row.batchId ?? '').trim();
    const stock = Number(row.quantity ?? 0);
    if (!batchId || !Number.isFinite(stock)) continue;
    warehouseStockById.set(batchId, {
      stock,
      batchNumber: String(row.batchNumber ?? batchId).trim() || batchId,
    });
  }

  const existingById = new Map<string, UnkitPrefillBatch>();
  for (const batch of input.existingBatches ?? []) {
    const batchId = String(batch.batchId ?? '').trim();
    if (!batchId) continue;
    const fromWarehouse = warehouseStockById.get(batchId);
    existingById.set(batchId, {
      ...batch,
      batchId,
      batchNumber: String(batch.batchNumber ?? batchId).trim() || batchId,
      quantity: Number(batch.quantity ?? 0),
      batchStock: typeof batch.batchStock === 'number' && Number.isFinite(batch.batchStock)
        ? batch.batchStock
        : fromWarehouse?.stock,
    });
  }

  const negatives: Array<{
    batchId: string;
    batchNumber: string;
    stock: number;
    coverNeeded: number;
  }> = [];

  for (const [batchId, row] of warehouseStockById.entries()) {
    if (row.stock >= 0) continue;
    if (!canSetTpGoodsGoodPart({ batchId, batchNumber: row.batchNumber })) continue;

    negatives.push({
      batchId,
      batchNumber: row.batchNumber,
      stock: row.stock,
      coverNeeded: Math.abs(row.stock),
    });
  }

  // Найглибші мінуси першими
  negatives.sort((left, right) => right.coverNeeded - left.coverNeeded);

  let remaining = required;
  const allocated = new Map<string, UnkitPrefillBatch>();

  for (const neg of negatives) {
    if (remaining <= 0) break;
    const cover = Math.min(neg.coverNeeded, remaining);
    if (cover <= 0) continue;

    const previous = existingById.get(neg.batchId);
    allocated.set(neg.batchId, {
      batchId: neg.batchId,
      batchNumber: previous?.batchNumber || neg.batchNumber,
      quantity: roundPortions(cover),
      batchStock: neg.stock,
      ...(previous?.barcode ? { barcode: previous.barcode } : {}),
    });
    remaining -= roundPortions(cover);
  }

  const kitCandidates = [...existingById.values()].filter((batch) => !allocated.has(batch.batchId));
  const kitWeight = kitCandidates.reduce((sum, batch) => sum + Math.max(0, Number(batch.quantity ?? 0)), 0);

  if (remaining > 0 && kitCandidates.length > 0) {
    if (kitWeight > 0) {
      const provisional = kitCandidates.map((batch) => {
        const weight = Math.max(0, Number(batch.quantity ?? 0));
        const share = (weight / kitWeight) * remaining;
        const fromWarehouse = warehouseStockById.get(batch.batchId);
        return {
          ...batch,
          quantity: roundPortions(share),
          batchStock: typeof batch.batchStock === 'number' && Number.isFinite(batch.batchStock)
            ? batch.batchStock
            : fromWarehouse?.stock,
        };
      });

      let diff = remaining - provisional.reduce((sum, batch) => sum + batch.quantity, 0);
      if (diff !== 0) {
        const order = provisional
          .map((_, index) => index)
          .sort((left, right) => {
            if (diff > 0) {
              return provisional[right].quantity - provisional[left].quantity;
            }
            return provisional[left].quantity - provisional[right].quantity;
          });
        for (const index of order) {
          if (diff === 0) break;
          if (diff > 0) {
            provisional[index] = {
              ...provisional[index],
              quantity: provisional[index].quantity + 1,
            };
            diff -= 1;
          } else if (provisional[index].quantity > 0) {
            provisional[index] = {
              ...provisional[index],
              quantity: provisional[index].quantity - 1,
            };
            diff += 1;
          }
        }
      }

      for (const batch of provisional) {
        if (batch.quantity <= 0) continue;
        allocated.set(batch.batchId, batch);
      }
    } else {
      // Немає ваг із комплектування — усе, що лишилось, на першу наявну партію
      const first = kitCandidates[0];
      allocated.set(first.batchId, {
        ...first,
        quantity: remaining,
      });
    }
  } else if (remaining > 0 && kitCandidates.length === 0 && allocated.size > 0) {
    // Немає kit-партій: додаток на найбільший мінус (надлишок піде в surplus UI, якщо counted > required — ні,
    // тут ми вже вичерпали required на мінусах; remaining > 0 лише якщо мінусів не вистачило покрити required)
    // Якщо мінусів менше за required і немає kit — лишаємо under-allocation (користувач добере вручну).
  }

  // Зберігаємо порядок: спочатку мінуси (як у negatives), потім решта з existing
  const result: UnkitPrefillBatch[] = [];
  const seen = new Set<string>();

  for (const neg of negatives) {
    const batch = allocated.get(neg.batchId);
    if (!batch || seen.has(batch.batchId)) continue;
    seen.add(batch.batchId);
    result.push(batch);
  }

  for (const existing of input.existingBatches ?? []) {
    const batchId = String(existing.batchId ?? '').trim();
    const batch = allocated.get(batchId);
    if (!batch || seen.has(batchId)) continue;
    seen.add(batchId);
    result.push(batch);
  }

  for (const batch of allocated.values()) {
    if (seen.has(batch.batchId)) continue;
    seen.add(batch.batchId);
    result.push(batch);
  }

  return result.filter((batch) => batch.quantity > 0);
}
