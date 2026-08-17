import { Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { MovementMobAggregates } from '../WarehouseMovementMobTypes';
import { formatPortionsLabel } from '../WarehouseMovementMobUtils';

interface MovementMobDocumentSummaryProps {
  aggregates: MovementMobAggregates;
}

export default function MovementMobDocumentSummary({ aggregates }: MovementMobDocumentSummaryProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-default-100 px-3 py-2.5">
      <Chip size="sm" variant="flat" className="bg-white text-default-600 h-7">
        Всього {aggregates.lineCount} позиції
      </Chip>

      <div className="flex items-center gap-2.5 text-default-700 shrink-0">
        {aggregates.totalBoxes > 0 && (
          <span className="inline-flex items-center gap-1 text-sm">
            <DynamicIcon name="package" size={15} className="text-default-400" />
            {aggregates.totalBoxes}
          </span>
        )}
        {aggregates.totalLoosePortions > 0 && (
          <span className="inline-flex items-center gap-1 text-sm">
            <DynamicIcon name="shopping-bag" size={15} className="text-default-400" />
            {aggregates.totalLoosePortions}
          </span>
        )}
        <span className="text-sm font-semibold">{formatPortionsLabel(aggregates.totalPortions)}</span>
      </div>
    </div>
  );
}
