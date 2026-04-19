import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { MovementProduct } from '../WarehouseMovementTypes';

// ---------------------------------------------------------------------------
// EmptyBatchesWarningModal — попередження про партії з нульовою кількістю
// ---------------------------------------------------------------------------

export interface EmptyBatchInfo {
  product: MovementProduct;
  /** Індекси партій з нульовою кількістю (boxes=0 і portions=0) */
  emptyBatchIndices: number[];
}

interface EmptyBatchesWarningModalProps {
  isOpen: boolean;
  items: EmptyBatchInfo[];
  onReview: () => void;         // "Перевірити" — закрити модал
  onAutoClean: () => void;      // "Видалити пусті і відправити"
  isPending?: boolean;
}

export function EmptyBatchesWarningModal({
  isOpen,
  items,
  onReview,
  onAutoClean,
  isPending = false,
}: EmptyBatchesWarningModalProps) {
  const totalEmpty = items.reduce((s, i) => s + i.emptyBatchIndices.length, 0);

  return (
    <Modal isOpen={isOpen} onClose={onReview} size="lg">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-lg font-semibold text-amber-600">
          <DynamicIcon name="alert-triangle" className="w-5 h-5 shrink-0" />
          Виявлено пусті партії ({totalEmpty})
        </ModalHeader>
        <ModalBody className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            Деякі партії мають нульову кількість (0 коробок і 0 порцій). Перед відправкою до Діловода їх потрібно заповнити або видалити.
          </p>
          <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
            {items.map(({ product, emptyBatchIndices }) => (
              <div key={product.id} className="border border-amber-200 bg-amber-50 rounded-lg px-4 py-2.5">
                <div className="font-medium text-neutral-800 text-sm">{product.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">артикул: {product.sku}</div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {emptyBatchIndices.map((idx) => {
                    const batch = product.details.batches[idx];
                    return (
                      <span
                        key={batch.id}
                        className="inline-flex items-center gap-1 text-xs bg-white border border-amber-300 rounded px-2 py-0.5 text-amber-700"
                      >
                        <DynamicIcon name="package" className="w-3 h-3" />
                        {batch.batchNumber}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ModalBody>
        <ModalFooter className="flex gap-2 justify-end">
          <Button variant="flat" onPress={onReview} isDisabled={isPending}>
            Перевірити ще раз
          </Button>
          <Button
            color="warning"
            onPress={onAutoClean}
            isLoading={isPending}
            startContent={!isPending && <DynamicIcon name="trash-2" className="w-4 h-4" />}
          >
            Видалити пусті і відправити
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
