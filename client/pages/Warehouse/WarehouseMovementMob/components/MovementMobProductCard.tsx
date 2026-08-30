import { Card, CardBody } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { MovementMobProductLineViewModel } from '../WarehouseMovementMobTypes';
import { pluralize } from '@/lib/formatUtils';
import { lineReceiptState, receiptDeltaClass, receiptReceivedClass } from '../WarehouseMovementMobUtils';

interface MovementMobProductCardProps {
  line: MovementMobProductLineViewModel;
  showReceipt?: boolean;
  qtyFocus?: 'sent' | 'received';
}

export default function MovementMobProductCard({
  line,
  showReceipt = false,
  qtyFocus = 'received',
}: MovementMobProductCardProps) {
  const weightLabel = line.weight != null ? `${line.weight} г.` : null;
  const perBoxLabel = line.portionsPerBox != null ? `${line.portionsPerBox} шт.` : null;
  const receiptState = showReceipt ? lineReceiptState(line) : null;
  const focusReceived = showReceipt && qtyFocus !== 'sent';
  const ringClass =
    receiptState === 'match'
      ? 'ring-2 ring-success-500'
      : receiptState === 'shortage'
        ? 'ring-2 ring-danger-500'
        : receiptState === 'surplus'
          ? 'ring-2 ring-primary-500'
          : qtyFocus === 'sent' && showReceipt
            ? 'ring-2 ring-default-300'
            : '';
  const qtyDelta = line.receivedTotalPortions - line.totalPortions;
  const primaryQty = focusReceived ? line.receivedTotalPortions : line.totalPortions;
  const primaryBoxes = focusReceived ? line.receivedBoxQuantity : line.boxQuantity;
  const primaryLoose = focusReceived ? line.receivedPortionQuantity : line.portionQuantity;

  return (
    <Card className={`bg-white shadow-none rounded-xl ${ringClass}`}>
      <CardBody className="gap-1.5 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-semibold text-default-900 leading-5">{line.productName}</h4>
          <span className="inline-flex items-center gap-0.5 leading-5 text-default-800 shrink-0">
            <DynamicIcon name="sigma" size={15} strokeWidth={1.5} className="shrink-0 text-neutral-400 mb-[1px]" />
            <span className={`font-bold ${showReceipt && receiptState ? receiptReceivedClass(receiptState) : ''}`}>
              {primaryQty}
            </span>
            <span className="text-xs font-extralight">
              {pluralize(primaryQty, 'порція', 'порції', 'порцій')}
            </span>
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
            {primaryBoxes > 0 && (
              <span className="inline-flex items-center gap-1 text-xs bg-neutral-200/75 rounded px-1.5 py-0.5 ring-1 ring-neutral-400 relative">
                <DynamicIcon name="package-2" size={14} strokeWidth={1.5} className="shrink-0" />
                {primaryBoxes}
                {primaryLoose > 0 && (
                  <DynamicIcon name="plus" size={12} strokeWidth={2} className="shrink-0 text-sm absolute -right-2.5 bg-yellow-200 rounded-full border-1 border-neutral-400 leading-none" />
                )}
              </span>
            )}
            {primaryLoose > 0 && (
              <span className="inline-flex items-center gap-1 text-xs bg-neutral-200/75 rounded px-1.5 py-0.5 ring-1 ring-neutral-400">
                <DynamicIcon name="paper-bag" size={14} strokeWidth={1.5} className="shrink-0" />
                {primaryLoose}
              </span>
            )}
          </span>
        </div>

        {showReceipt && (
          <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
            <span className="text-default-400">
              {focusReceived ? (
                <>
                  Відправлено: <span className="font-medium text-default-600">{line.totalPortions}</span>
                </>
              ) : (
                <>
                  Отримано: <span className="font-medium text-default-600">{line.receivedTotalPortions}</span>
                </>
              )}
            </span>
            <span className={`font-medium ${receiptState ? receiptReceivedClass(receiptState) : 'text-default-400'}`}>
              {receiptState === 'pending' && 'Ще не скановано'}
              {receiptState === 'match' && 'Збіг'}
              {receiptState === 'shortage' && (
                <>
                  Нестача{' '}
                  <span className={receiptDeltaClass(qtyDelta)}>{qtyDelta}</span>
                </>
              )}
              {receiptState === 'surplus' && (
                <>
                  Надлишок{' '}
                  <span className={receiptDeltaClass(qtyDelta)}>+{qtyDelta}</span>
                </>
              )}
            </span>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
