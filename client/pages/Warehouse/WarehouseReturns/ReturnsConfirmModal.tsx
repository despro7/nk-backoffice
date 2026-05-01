import { Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { ReturnItem } from './WarehouseReturnsTypes';

interface ReturnsConfirmModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  orderNumber?: string;
  items: ReturnItem[];
  returnReason: string;
  comment: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function ReturnsConfirmModal({
  isOpen,
  isSubmitting,
  orderNumber,
  items,
  returnReason,
  comment,
  onClose,
  onConfirm,
}: ReturnsConfirmModalProps) {
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalRows = items.length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" isDismissable={!isSubmitting}>
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-lg font-semibold">
          <DynamicIcon name="check-circle" className="w-5 h-5 text-emerald-600" />
          Підтвердити оприбуткування повернення?
        </ModalHeader>
        <ModalBody className="space-y-4">
          <p className="text-sm text-gray-600">
            Ви намагаєтеся створити повернення для замовлення №<span className="font-semibold">{orderNumber}</span>.
          </p>
          <div className="grid gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            <div>Позицій: <span className="font-semibold">{totalRows}</span></div>
            <div>Загальна кількість: <span className="font-semibold">{totalQuantity}</span></div>
            <div>Причина повернення: <span className="font-semibold">{returnReason || 'не визначено'}</span></div>
            <div>Коментар: <span className={comment ? 'font-semibold' : 'text-gray-400'}>{comment || 'немає'}</span></div>
          </div>
          <div className="space-y-2">
            {items.slice(0, 5).map((item) => (
              <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
                <div className="font-medium text-gray-900">{item.name}</div>
                <div className="text-gray-500">SKU: {item.sku} · К-сть: {item.quantity}</div>
              </div>
            ))}
            {items.length > 5 && (
              <div className="text-xs text-gray-500">Показано перші 5 позицій...</div>
            )}
          </div>
        </ModalBody>
        <ModalFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            color="primary"
            size="lg"
            onPress={onConfirm}
            isLoading={isSubmitting}
            className="w-full sm:w-auto"
          >
            Підтвердити
          </Button>
          <Button
            variant="flat"
            size="lg"
            onPress={onClose}
            isDisabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            Скасувати
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
