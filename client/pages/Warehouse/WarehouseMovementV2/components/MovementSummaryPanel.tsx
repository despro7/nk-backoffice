import { Card } from '@heroui/react';
import { HistoryItemsTable } from '../../shared/HistoryItemsTable';
import type { MovementProduct } from '../../WarehouseMovement/WarehouseMovementTypes';
import { totalPortions } from '../../WarehouseMovement/WarehouseMovementUtils';
import { MovementMobDirectionBadges } from '../../WarehouseMovementMob/components/MovementMobStatusStepper';
import { resolveShortStorageBadge } from '../../WarehouseMovementMob/WarehouseMovementMobUtils';

interface Props {
  items: MovementProduct[];
  sourceStorageId: string;
  destStorageId: string;
  emptyMessage?: string;
}

export default function MovementSummaryPanel({
  items,
  sourceStorageId,
  destStorageId,
  emptyMessage = 'Немає позицій для переміщення',
}: Props) {
  if (items.length === 0) return null;

  const totalQty = items.reduce((sum, item) => sum + totalPortions(item), 0);
  const rows = items.map((item) => ({
    sku: item.sku,
    name: item.name,
    qty: totalPortions(item),
    batch: item.details.batches
      .filter((b) => b.boxes > 0 || b.portions > 0)
      .map((b) => b.batchNumber || b.batchId)
      .join(', '),
  }));

  const sourceBadge = resolveShortStorageBadge(sourceStorageId);
  const destBadge = resolveShortStorageBadge(destStorageId);

  return (
    <>
      <h3 className="text-lg font-medium mb-2 flex flex-wrap items-center gap-2">
        <span>Сумарно до переміщення</span>
        <MovementMobDirectionBadges sourceBadge={sourceBadge} destBadge={destBadge} />
        <span>– {totalQty} шт.</span>
      </h3>
      <Card className="rounded-lg bg-white p-1 mb-6" shadow="sm">
        {rows.length === 0 ? (
          <div className="text-sm text-gray-500 p-3">{emptyMessage}</div>
        ) : (
          <HistoryItemsTable
            items={rows}
            footerTotals={{ qty: totalQty }}
          />
        )}
      </Card>
    </>
  );
}
