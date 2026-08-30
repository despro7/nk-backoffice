import { BottomSheet } from '@/components/motion/bottom-sheet';
import { pluralize } from '@/lib/formatUtils';
import type { MovementMobProductLineViewModel } from '../WarehouseMovementMobTypes';
import {
  lineReceiptState,
  receiptDeltaClass,
  receiptReceivedClass,
} from '../WarehouseMovementMobUtils';
import MovementMobSwipeConfirm from './MovementMobSwipeConfirm';

interface MovementMobConfirmReceiptSheetProps {
  open: boolean;
  deviations: MovementMobProductLineViewModel[];
  confirming?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

function receiptStatusLabel(line: MovementMobProductLineViewModel): string {
  const state = lineReceiptState(line);
  if (state === 'pending') return 'не прийнято';
  if (state === 'shortage') return 'нестача';
  if (state === 'surplus') return 'надлишок';
  return 'збіг';
}

export default function MovementMobConfirmReceiptSheet({
  open,
  deviations,
  confirming = false,
  onOpenChange,
  onConfirm,
}: MovementMobConfirmReceiptSheetProps) {
  const shortageCount = deviations.filter((line) => {
    const state = lineReceiptState(line);
    return state === 'shortage' || state === 'pending';
  }).length;
  const surplusCount = deviations.filter((line) => lineReceiptState(line) === 'surplus').length;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={['auto', 0.92]}
      title="Підтвердити отримання"
      description="Фактично прийняті кількості буде відправлено в Dilovod."
      className="bg-background-paper border-neutral-200 max-w-lg"
    >
      <div className="flex flex-col gap-4 mt-3">
        {deviations.length === 0 ? (
          <p className="text-sm text-success-600">Розбіжностей немає — кількості збігаються.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-default-700">
              Розбіжності: {deviations.length} {pluralize(deviations.length, 'позиція', 'позиції', 'позицій')}
              {shortageCount > 0 && (
                <>
                  {' · '}
                  <span className="text-danger-600 font-medium">{shortageCount} нестача</span>
                </>
              )}
              {surplusCount > 0 && (
                <>
                  {' · '}
                  <span className="text-primary-600 font-medium">{surplusCount} надлишок</span>
                </>
              )}
            </p>
            <ul className="flex flex-col gap-2 max-h-56 overflow-y-auto">
              {deviations.map((line) => {
                const state = lineReceiptState(line);
                const delta = line.receivedTotalPortions - line.totalPortions;
                return (
                  <li key={line.key} className="rounded-lg bg-neutral-100 px-3 py-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-default-800">{line.productName}</p>
                      <span className={`text-xs font-medium shrink-0 ${receiptReceivedClass(state)}`}>
                        {receiptStatusLabel(line)}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5">
                      <span className="text-default-500">Відправлено </span>
                      <span className="font-semibold tabular-nums text-default-700">{line.totalPortions}</span>
                      <span className="text-default-400"> → </span>
                      <span className="text-default-500">отримано </span>
                      <span className={`font-semibold tabular-nums ${receiptReceivedClass(state)}`}>
                        {line.receivedTotalPortions}
                      </span>
                      <span className={`font-semibold tabular-nums ${receiptDeltaClass(delta)}`}>
                        {' '}({delta > 0 ? '+' : ''}{delta})
                      </span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <MovementMobSwipeConfirm
          label="Підтвердити отримання"
          disabled={confirming}
          onConfirm={onConfirm}
        />
      </div>
    </BottomSheet>
  );
}
