import { Button, Spinner } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

// ---------------------------------------------------------------------------
// MovementTopActions — рядок та верхніх дій
// ---------------------------------------------------------------------------

interface MovementTopActionsProps {
  onRefreshBalances?: () => void;
  onSyncFromDilovod?: () => void;
}

export const MovementTopActions = ({
  onRefreshBalances,
  onSyncFromDilovod,
}: MovementTopActionsProps) => {

  return (
    <div className="flex items-center gap-4 ml-auto shrink-0">
      {onRefreshBalances && (
        <Button
          variant="flat"
          color="default"
          className="bg-gray-100 text-gray-600 font-medium shadow-md shadow-gray-300/50"
          size="lg"
          onPress={onRefreshBalances}
          startContent={<DynamicIcon name="rotate-cw" className="-ml-1 w-4 h-4" />}
        >
          Оновити
        </Button>
      )}
      {onSyncFromDilovod && (
        <Button
          variant="flat"
          color="default"
          className="bg-amber-300 text-black/70 font-medium shadow-md shadow-amber-700/15"
          size="lg"
          onPress={onSyncFromDilovod}
          startContent={<DynamicIcon name="refresh-cw" className="-ml-1 w-4 h-4" />}
        >
          Синхронізувати залишки з Dilovod
        </Button>
      )}
    </div>
  );
};
