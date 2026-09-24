import { Button, Spinner } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { BottomSheet } from '@/components/motion/bottom-sheet';
import type { MovementMobBatchRow } from '../WarehouseMovementMobUtils';

interface MovementMobBatchPickerSheetProps {
  open: boolean;
  batches: MovementMobBatchRow[];
  loading: boolean;
  selectedBatchId: string;
  onClose: () => void;
  onSelect: (batch: MovementMobBatchRow) => void;
  onRefresh: () => void;
}

export default function MovementMobBatchPickerSheet({
  open,
  batches,
  loading,
  selectedBatchId,
  onClose,
  onSelect,
  onRefresh,
}: MovementMobBatchPickerSheetProps) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      snapPoints={['auto']}
      title="Змінити партію"
      description="Оберіть партію — штрих-код оновиться відповідно до каталогу"
      className="bg-background-paper border-neutral-200 max-w-lg"
    >
      <div className="flex flex-col gap-3 mt-2 pb-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-default-500">
            <Spinner size="md" color="primary" />
            <p className="text-sm">Завантаження партій…</p>
          </div>
        ) : batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-default-400">
            <DynamicIcon name="inbox" size={32} strokeWidth={1.5} />
            <p className="text-sm text-center">Партії не знайдені для цього товару</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto">
            {batches.map((batch) => {
              const isSelected = batch.batchId === selectedBatchId;
              return (
                <button
                  key={`${batch.batchId}:${batch.storage}`}
                  type="button"
                  onClick={() => onSelect(batch)}
                  className={`w-full text-left rounded-lg border px-3 py-3 transition-colors ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-default-200 bg-white hover:bg-default-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-default-900 truncate">{batch.batchNumber || batch.batchId}</p>
                      <p className="text-xs text-default-400 mt-0.5">
                        Залишок: <span className="font-medium text-default-600">{batch.quantity}</span> порцій
                      </p>
                    </div>
                    {isSelected && (
                      <DynamicIcon name="check-circle" size={18} className="text-primary-600 shrink-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <Button
          variant="light"
          className="text-default-500"
          startContent={<DynamicIcon name="refresh-cw" size={16} className={loading ? 'animate-spin' : ''} />}
          onPress={onRefresh}
          isDisabled={loading}
        >
          Оновити залишки
        </Button>
      </div>
    </BottomSheet>
  );
}
