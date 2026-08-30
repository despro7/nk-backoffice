import { Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { pluralize } from '@/lib/formatUtils';
import type { MovementMobAggregates } from '../WarehouseMovementMobTypes';

interface MovementMobDocumentSummaryProps {
  aggregates: MovementMobAggregates;
}

export default function MovementMobDocumentSummary({ aggregates }: MovementMobDocumentSummaryProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-neutral-300/80 shadow-inner-sm px-3 py-2.5">
      <span className="flex items-center gap-1 text-sm">
        Всього <span className="text-xs font-medium text-neutral-600 bg-neutral-200 border-1 rounded px-1.5 py-0.5 shadow-sm">{aggregates.lineCount} {pluralize(aggregates.lineCount, 'позиція', 'позиції', 'позицій')}</span>
      </span>

      <div className="flex items-center gap-2.5 text-neutral-700 shrink-0">
        {aggregates.totalBoxes > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-xs bg-neutral-200 border-1 rounded px-1.5 py-0.5 shadow-sm">
              <DynamicIcon name="package-2" size={14} strokeWidth={1.5} className="shrink-0" />
              {aggregates.totalBoxes}
            </span>
            {aggregates.totalLoosePortions > 0 && (
              <span className="inline-flex items-center gap-1 text-xs bg-neutral-200 border-1 rounded px-1.5 py-0.5 shadow-sm">
                <DynamicIcon name="paper-bag" size={14} strokeWidth={1.5} className="shrink-0" />
                {aggregates.totalLoosePortions}
              </span>
            )}
          </span>
        )}
        <span className="font-semibold text-neutral-800">{aggregates.totalPortions} <span className="text-xs font-extralight">{pluralize(aggregates.totalPortions, 'порція', 'порції', 'порцій')}</span></span>
      </div>
    </div>
  );
}
