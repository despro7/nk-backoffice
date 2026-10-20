import type { ReleaseComponentBatch } from '@shared/types/warehouseRelease';
import type { MovementProduct, MovementBatch } from '../WarehouseMovement/WarehouseMovementTypes';
import type { MovementV2Line } from './types';

export function batchesToMovementBatches(
  batches: ReleaseComponentBatch[],
  storageId: string,
  portionsPerBox: number,
): MovementBatch[] {
  const ppb = portionsPerBox > 0 ? portionsPerBox : 1;
  return batches
    .filter((batch) => Number(batch.quantity ?? 0) > 0)
    .map((batch, index) => {
      const total = Number(batch.quantity ?? 0);
      const boxes = Math.floor(total / ppb);
      const portions = total % ppb;
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
    details: {
      batches: batchesToMovementBatches(line.batches, storageId, line.portionsPerBox),
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
