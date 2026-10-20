import { useState } from 'react';
import { Card, Switch } from '@heroui/react';
import WarehouseProductSearch from '@/components/warehouse/WarehouseProductSearch';
import WarehouseProductBatchesPanel from '../../shared/WarehouseProductBatchesPanel';
import type { MovementV2Line } from '../types';
import type { WarehouseProductSearchHit } from '@shared/types/warehouseProductSearch';
import type { ReleaseComponentBatch } from '@shared/types/warehouseRelease';

interface Props {
  lines: MovementV2Line[];
  storageId: string;
  storageName?: string;
  movementDateTime: Date;
  onAdd: (hit: WarehouseProductSearchHit) => void;
  onBatchesChange: (lineId: string, batches: ReleaseComponentBatch[]) => void;
  onPortionsPerBoxChange?: (lineId: string, portionsPerBox: number) => void;
  onRemoveLine: (lineId: string) => void;
}

export default function MovementRegisterPanel({
  lines,
  storageId,
  storageName,
  movementDateTime,
  onAdd,
  onBatchesChange,
  onPortionsPerBoxChange,
  onRemoveLine,
}: Props) {
  const excludeSkus = lines.map((line) => line.sku);
  const [showArchivedProducts, setShowArchivedProducts] = useState(false);

  return (
    <div className="mb-6">
      <div className="text-base font-semibold text-gray-700 mt-1 mb-2">Реєстр на переміщення</div>

      <Card className="rounded-xl bg-white p-4" shadow="sm" classNames={{ base: 'overflow-visible' }}>
        <div className="flex flex-col gap-4">
          {lines.map((line) => (
            <WarehouseProductBatchesPanel
              key={line.id}
              sku={line.sku}
              name={line.name}
              batches={line.batches}
              onChange={(batches) => onBatchesChange(line.id, batches)}
              selectedDateTime={movementDateTime}
              storageId={storageId}
              storageName={storageName}
              onRemove={() => onRemoveLine(line.id)}
              portionsPerBox={line.portionsPerBox}
              stockAtStorage={line.stockAtStorage}
              onPortionsPerBoxResolved={
                onPortionsPerBoxChange
                  ? (value) => onPortionsPerBoxChange(line.id, value)
                  : undefined
              }
            />
          ))}

          <div className="flex items-center gap-6 justify-between px-1 -mb-2">
            <span className="text-sm font-semibold block text-gray-600">Додати продукт</span>
            <Switch
              isSelected={showArchivedProducts}
              onValueChange={setShowArchivedProducts}
              color="warning"
              size="sm"
              classNames={{
                base: 'ml-2',
                wrapper: 'px-1 h-4.5 w-8 group-data-[selected=true]:bg-amber-400',
                thumb: 'size-3 group-data-[selected=true]:ms-3',
                label: 'text-gray-500',
              }}
            >
              Показувати архівні товари
            </Switch>
          </div>

          <WarehouseProductSearch
            onSelect={onAdd}
            excludeSkus={excludeSkus}
            storageId={storageId}
            stockAsOfDate={movementDateTime}
            filters={{ includeArchived: showArchivedProducts }}
            visibleMeta={['sku', 'stock', 'folder', 'batch', 'updatedAt']}
          />
        </div>
      </Card>
    </div>
  );
}
