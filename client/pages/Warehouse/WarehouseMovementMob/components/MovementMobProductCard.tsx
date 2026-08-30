import { Card, CardBody } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { MovementMobProductLineViewModel } from '../WarehouseMovementMobTypes';
import { pluralize } from '@/lib/formatUtils';

interface MovementMobProductCardProps {
  line: MovementMobProductLineViewModel;
}

export default function MovementMobProductCard({ line }: MovementMobProductCardProps) {
  const weightLabel = line.weight != null ? `${line.weight} г.` : null;
  const perBoxLabel = line.portionsPerBox != null ? `${line.portionsPerBox} шт.` : null;

  return (
    <Card className="bg-white shadow-none">
      <CardBody className="gap-1.5 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-semibold text-default-900 leading-5">{line.productName}</h4>
          <span className="inline-flex items-center gap-0.5 leading-5 text-default-800 shrink-0">
            <DynamicIcon name="sigma" size={15} strokeWidth={1.5} className="shrink-0 text-neutral-400 mb-[1px]" />
            <span className="font-bold">{line.totalPortions}</span>
            <span className="text-xs font-extralight">{pluralize(line.totalPortions, 'порція', 'порції', 'порцій')}</span>
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
          <span className="flex items-center gap-2 text-neutral-500 shrink-0">
            {line.boxQuantity > 0 && (
              <span className="inline-flex items-center gap-1 text-xs bg-neutral-200/75 rounded px-1.5 py-0.5 ring-1 ring-neutral-400 relative">
                <DynamicIcon name="package-2" size={14} strokeWidth={1.5} className="shrink-0" />
                {line.boxQuantity}
                {line.portionQuantity > 0 && <DynamicIcon name="plus" size={12} strokeWidth={2} className="shrink-0 text-sm absolute -right-2.5 bg-yellow-200 rounded-full border-1 border-neutral-400 leading-none" />}
              </span>
            )}
            {line.portionQuantity > 0 && (
              <span className="inline-flex items-center gap-1 text-xs bg-neutral-200/75 rounded px-1.5 py-0.5 ring-1 ring-neutral-400">
                <DynamicIcon name="paper-bag" size={14} strokeWidth={1.5} className="shrink-0" />
                {line.portionQuantity}
              </span>
            )}
          </span>
        </div>
      </CardBody>
    </Card>
  );
}
