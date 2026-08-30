import { BottomSheet } from '@/components/motion/bottom-sheet';
import { pluralize } from '@/lib/formatUtils';
import type { MovementMobAggregates } from '../WarehouseMovementMobTypes';
import MovementMobSwipeConfirm from './MovementMobSwipeConfirm';

interface MovementMobSubmitSheetProps {
  open: boolean;
  sourceName: string;
  destName: string;
  aggregates: MovementMobAggregates;
  submitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export default function MovementMobSubmitSheet({
  open,
  sourceName,
  destName,
  aggregates,
  submitting = false,
  onOpenChange,
  onConfirm,
}: MovementMobSubmitSheetProps) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={['auto']}
      title="Відправити переміщення"
      description="Документ піде на склад призначення. Dilovod отримає його після підтвердження отримання."
      className="bg-background-paper border-neutral-200 max-w-lg"
    >
      <div className="flex flex-col gap-4 mt-3">
        <p className="text-sm text-default-600">
          {sourceName} → {destName}
        </p>
        <p className="text-sm text-default-500">
          {aggregates.lineCount} {pluralize(aggregates.lineCount, 'позиція', 'позиції', 'позицій')},{' '}
          {aggregates.totalPortions} {pluralize(aggregates.totalPortions, 'порція', 'порції', 'порцій')}
        </p>
        <MovementMobSwipeConfirm
          label="Відправити"
          disabled={submitting}
          onConfirm={onConfirm}
        />
      </div>
    </BottomSheet>
  );
}
