import type { ReleaseComponentAllocation, ReleaseComponentBatch } from '../../../shared/types/warehouseRelease.js';
import { isUsableDilovodBatchId } from '../../../shared/utils/dilovodBatchId.js';

export type ReleaseBatchValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

type RequiredComponent = {
  sku: string;
  name: string | null;
  quantity: number;
};

function sumBatchQuantity(batches: ReleaseComponentBatch[]): number {
  return batches.reduce((sum, batch) => {
    const qty = Number(batch.quantity ?? 0);
    return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
  }, 0);
}

export function validateReleaseBatches(
  requiredComponents: Record<string, RequiredComponent>,
  componentBatches: ReleaseComponentAllocation[] | undefined,
  options?: { requireBatches?: boolean },
): ReleaseBatchValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const requireBatches = options?.requireBatches === true;

  const allocations = Array.isArray(componentBatches) ? componentBatches : [];
  const allocationBySku = new Map<string, ReleaseComponentAllocation>();

  for (const allocation of allocations) {
    const sku = String(allocation?.sku ?? '').trim();
    if (!sku) {
      errors.push('Порожній SKU у componentBatches');
      continue;
    }
    if (allocationBySku.has(sku)) {
      errors.push(`Дубльований SKU у componentBatches: ${sku}`);
      continue;
    }
    allocationBySku.set(sku, allocation);
  }

  const requiredSkus = Object.keys(requiredComponents);
  if (requireBatches && requiredSkus.length > 0 && allocations.length === 0) {
    errors.push('Не вказано партії для компонентів операції');
  }

  for (const sku of requiredSkus) {
    const required = requiredComponents[sku];
    const allocation = allocationBySku.get(sku);
    const requiredQty = Number(required.quantity ?? 0);

    if (!allocation || !Array.isArray(allocation.batches) || allocation.batches.length === 0) {
      if (requireBatches) {
        errors.push(`Не вказано партії для SKU ${sku} (потрібно ${requiredQty})`);
      } else {
        warnings.push(`Партії для SKU ${sku} не вказані — Dilovod підставить віртуальні партії`);
      }
      continue;
    }

    const allocatedQty = sumBatchQuantity(allocation.batches);
    if (Math.abs(allocatedQty - requiredQty) > 0.0001) {
      errors.push(
        `SKU ${sku}: обрано ${allocatedQty} порцій, потрібно ${requiredQty}`,
      );
    }

    for (const batch of allocation.batches) {
      const batchId = String(batch?.batchId ?? '').trim();
      const qty = Number(batch?.quantity ?? 0);
      if (!isUsableDilovodBatchId(batchId)) {
        warnings.push(`SKU ${sku}: партія ${batchId || '—'} виглядає як віртуальна або некоректна`);
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        errors.push(`SKU ${sku}: некоректна кількість партії (${batch?.quantity})`);
      }
    }
  }

  for (const allocation of allocations) {
    const sku = String(allocation?.sku ?? '').trim();
    if (!requiredComponents[sku]) {
      warnings.push(`SKU ${sku} не є компонентом операції — рядки буде пропущено`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function buildTpGoodsFromBatches(
  expandedComponents: Array<{ sku: string; quantity: number }>,
  skuToDilovodId: Map<string, string>,
  skuToHasNestedSet: Map<string, boolean>,
  componentBatches: ReleaseComponentAllocation[] | undefined,
  warehouseDefaults: { unitId: string | number; accountId: string | number; setAccountId: string | number },
): { tpGoods: Array<Record<string, unknown>>; warnings: string[] } {
  const warnings: string[] = [];
  const allocationBySku = new Map<string, ReleaseComponentAllocation>();
  for (const allocation of Array.isArray(componentBatches) ? componentBatches : []) {
    const sku = String(allocation?.sku ?? '').trim();
    if (sku) allocationBySku.set(sku, allocation);
  }

  const tpGoods: Array<Record<string, unknown>> = [];
  let row = 1;

  for (const comp of expandedComponents) {
    const dilovodId = skuToDilovodId.get(comp.sku);
    if (!dilovodId) continue;

    const hasNestedSet = skuToHasNestedSet.get(comp.sku) ?? false;
    const accGood = hasNestedSet ? warehouseDefaults.setAccountId : warehouseDefaults.accountId;
    const allocation = allocationBySku.get(comp.sku);
    const batches = Array.isArray(allocation?.batches) ? allocation.batches : [];

    if (batches.length === 0) {
      tpGoods.push({
        rowNum: row,
        good: dilovodId,
        unit: warehouseDefaults.unitId,
        qty: Number(comp.quantity) || 0,
        accGood,
      });
      row++;
      continue;
    }

    for (const batch of batches) {
      const batchId = String(batch?.batchId ?? '').trim();
      const qty = Number(batch?.quantity ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;

      const rowPayload: Record<string, unknown> = {
        rowNum: row,
        good: dilovodId,
        unit: warehouseDefaults.unitId,
        qty,
        accGood,
      };

      if (isUsableDilovodBatchId(batchId)) {
        rowPayload.goodPart = Number(batchId);
      } else if (batchId) {
        warnings.push(`Пропущено goodPart для SKU ${comp.sku}: некоректний batchId ${batchId}`);
      }

      tpGoods.push(rowPayload);
      row++;
    }
  }

  return { tpGoods, warnings };
}

export function mergeBatchesIntoComponentsSnapshot(
  componentsSnapshot: unknown,
  componentBatches: ReleaseComponentAllocation[] | undefined,
): unknown {
  if (!Array.isArray(componentsSnapshot)) return componentsSnapshot;
  const allocationBySku = new Map<string, ReleaseComponentBatch[]>();
  for (const allocation of Array.isArray(componentBatches) ? componentBatches : []) {
    const sku = String(allocation?.sku ?? '').trim();
    if (!sku || !Array.isArray(allocation.batches)) continue;
    allocationBySku.set(sku, allocation.batches);
  }

  return componentsSnapshot.map((component) => {
    const sku = String(component?.id ?? component?.sku ?? component?.code ?? '').trim();
    const batches = allocationBySku.get(sku);
    if (!batches) return component;
    return {
      ...component,
      batches,
    };
  });
}
