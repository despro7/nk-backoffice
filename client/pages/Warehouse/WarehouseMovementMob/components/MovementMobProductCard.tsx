import { Card, CardBody } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { MovementMobProductLineViewModel } from '../WarehouseMovementMobTypes';
import { formatPortionsLabel } from '../WarehouseMovementMobUtils';

interface MovementMobProductCardProps {
  line: MovementMobProductLineViewModel;
}

export default function MovementMobProductCard({ line }: MovementMobProductCardProps) {
  const weightLabel = line.weight != null ? `${line.weight} г.` : null;
  const perBoxLabel = line.portionsPerBox != null ? `${line.portionsPerBox} шт.` : null;

  return (
    <Card shadow="sm" className="bg-white border border-default-100">
      <CardBody className="gap-1.5 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold text-default-900 leading-snug">{line.productName}</h4>
          <span className="text-sm font-bold text-default-800 shrink-0">
            {formatPortionsLabel(line.totalPortions)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-default-400">
          <span># {line.sku}</span>
          {weightLabel && (
            <>
              <span className="text-default-300">|</span>
              <span className="inline-flex items-center gap-1">
                <DynamicIcon name="scale" size={12} />
                {weightLabel}
              </span>
            </>
          )}
          {perBoxLabel && (
            <>
              <span className="text-default-300">|</span>
              <span className="inline-flex items-center gap-1">
                <DynamicIcon name="package" size={12} />
                {perBoxLabel}
              </span>
            </>
          )}
        </div>

        <div className="flex items-end justify-between gap-2 mt-0.5">
          <p className="text-xs text-default-400">
            Партія: <span className="text-default-500">{line.batchNumber}</span>
          </p>
          <div className="flex items-center gap-2.5 text-default-600 shrink-0">
            {line.boxQuantity > 0 && (
              <span className="inline-flex items-center gap-1 text-sm">
                <DynamicIcon name="package" size={15} className="text-default-400" />
                {line.boxQuantity}
              </span>
            )}
            {line.portionQuantity > 0 && (
              <span className="inline-flex items-center gap-1 text-sm">
                <DynamicIcon name="shopping-bag" size={15} className="text-default-400" />
                {line.portionQuantity}
              </span>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
