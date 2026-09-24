import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { BottomSheet } from '@/components/motion/bottom-sheet';
import { StepperInput } from '@/pages/Warehouse/shared/StepperInput';
import { pluralize } from '@/lib/formatUtils';
import type { MovementMobScanDraft } from '../WarehouseMovementMobTypes';
import {
  breakdownStockPortions,
  lineTotalPortions,
  receiptReceivedClass,
  receiptResultLabel,
} from '../WarehouseMovementMobUtils';
import type { MovementMobReceiptState } from '../WarehouseMovementMobTypes';
import MovementMobSwipeConfirm from './MovementMobSwipeConfirm';

interface MovementMobScanDrawerProps {
  isOpen: boolean;
  draft: MovementMobScanDraft | null;
  sourceLabel: string;
  destLabel: string;
  otherCommittedPortions?: number;
  /** Відправлена кількість порцій — для показу нестачі/надлишку під час отримання. */
  sentTotalPortions?: number | null;
  confirming?: boolean;
  qtySideHint?: string;
  dualQtyMode?: boolean;
  allowBatchChange?: boolean;
  onClose: () => void;
  onBoxesChange: (value: number) => void;
  onPortionsChange: (value: number) => void;
  onReceivedBoxesChange?: (value: number) => void;
  onReceivedPortionsChange?: (value: number) => void;
  onChangeBatch?: () => void;
  onStepperFocusChange: (focused: boolean) => void;
  onConfirm: () => void;
}

function StockCard({
  title,
  before,
  after,
  portionsPerBox,
  direction,
}: {
  title: string;
  before: number;
  after: number;
  portionsPerBox: number;
  direction: 'out' | 'in';
}) {
  const changed = after !== before;
  const afterColor = direction === 'out' ? 'text-danger' : 'text-success';
  const shown = breakdownStockPortions(after, portionsPerBox);

  return (
    <div className="flex-1 min-w-0 rounded-lg bg-neutral-100 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-default-400 truncate">{title}</p>
      <p className="mt-1 text-lg font-semibold text-default-800 leading-none tabular-nums flex items-center gap-1">
        {before}
        {changed && (
          <>
            <span className={afterColor}><DynamicIcon name="arrow-right" size={16} strokeWidth={2} /></span>
            <span className={afterColor}>{after}</span>
          </>
        )}
      </p>
      <div className="mt-1.5 flex items-center gap-2 text-xs text-default-500">
        <span className="inline-flex items-center gap-1">
          <DynamicIcon name="package-2" size={13} strokeWidth={1.5} />
          {shown.boxes}
        </span>
        <span className="inline-flex items-center gap-1">
          <DynamicIcon name="paper-bag" size={13} strokeWidth={1.5} />
          {shown.loosePortions}
        </span>
      </div>
    </div>
  );
}

function QtySteppers({
  label,
  boxes,
  portions,
  portionsPerBox,
  onBoxesChange,
  onPortionsChange,
  onStepperFocusChange,
}: {
  label?: string;
  boxes: number;
  portions: number;
  portionsPerBox: number;
  onBoxesChange: (value: number) => void;
  onPortionsChange: (value: number) => void;
  onStepperFocusChange: (focused: boolean) => void;
}) {
  const maxLoosePortions = portionsPerBox > 1 ? portionsPerBox - 1 : undefined;

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <p className="text-xs font-semibold uppercase tracking-wide text-default-500">{label}</p>
      )}
      <div
        className="grid grid-cols-2 gap-3"
        onFocusCapture={() => onStepperFocusChange(true)}
        onBlurCapture={(event) => {
          const next = event.relatedTarget as Node | null;
          if (next && event.currentTarget.contains(next)) return;
          onStepperFocusChange(false);
        }}
      >
        <StepperInput
          label="Коробок"
          value={boxes}
          size="lg"
          onChange={onBoxesChange}
          onIncrement={() => onBoxesChange(boxes + 1)}
          onDecrement={() => onBoxesChange(Math.max(0, boxes - 1))}
          className="gap-1"
          inputClassName="border-1! shadow-md"
        />
        <StepperInput
          label="Порцій"
          value={portions}
          size="lg"
          max={maxLoosePortions}
          onChange={onPortionsChange}
          onIncrement={() =>
            onPortionsChange(
              maxLoosePortions !== undefined
                ? Math.min(portions + 1, maxLoosePortions)
                : portions + 1,
            )
          }
          onDecrement={() => onPortionsChange(Math.max(0, portions - 1))}
          className="gap-1"
          inputClassName="border-1! shadow-md"
        />
      </div>
    </div>
  );
}

export default function MovementMobScanDrawer({
  isOpen,
  draft,
  sourceLabel,
  destLabel,
  otherCommittedPortions = 0,
  sentTotalPortions = null,
  confirming = false,
  qtySideHint,
  dualQtyMode = false,
  allowBatchChange = false,
  onClose,
  onBoxesChange,
  onPortionsChange,
  onReceivedBoxesChange,
  onReceivedPortionsChange,
  onChangeBatch,
  onStepperFocusChange,
  onConfirm,
}: MovementMobScanDrawerProps) {
  const portionsPerBox = draft?.portionsPerBox ?? 0;
  const sentTotal = draft
    ? lineTotalPortions(draft.boxes, draft.portions, portionsPerBox)
    : 0;
  const receivedTotal = dualQtyMode && draft
    ? lineTotalPortions(draft.receivedBoxes ?? 0, draft.receivedPortions ?? 0, portionsPerBox)
    : sentTotal;
  const total = dualQtyMode ? receivedTotal : sentTotal;
  const canConfirm = Boolean(draft) && (dualQtyMode
    ? (sentTotal > 0 || receivedTotal > 0)
    : sentTotal > 0) && !confirming;
  const receiptState: MovementMobReceiptState | null = dualQtyMode && sentTotal > 0 && receivedTotal > 0
    ? receivedTotal === sentTotal
      ? 'match'
      : receivedTotal < sentTotal
        ? 'shortage'
        : 'surplus'
    : sentTotalPortions != null && total > 0
      ? total === sentTotalPortions
        ? 'match'
        : total < sentTotalPortions
          ? 'shortage'
          : 'surplus'
      : null;
  const qtyDelta = dualQtyMode
    ? receivedTotal - sentTotal
    : sentTotalPortions != null ? total - sentTotalPortions : 0;
  const sourceBefore = Math.max(0, (draft?.sourceStock.portions ?? 0) - otherCommittedPortions);
  const destBefore = (draft?.destStock.portions ?? 0) + otherCommittedPortions;
  const sourceAfter = Math.max(0, sourceBefore - (dualQtyMode ? sentTotal : total));
  const destAfter = destBefore + (dualQtyMode ? receivedTotal : total);

  const weightLabel = draft?.weight != null ? `${draft.weight} г.` : null;
  const perBoxLabel = portionsPerBox > 0 ? `${portionsPerBox} шт. у коробці` : null;

  return (
    <BottomSheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      snapPoints={['auto']}
      title={draft?.name ?? 'Товар'}
      description={
        draft?.sku || weightLabel || perBoxLabel ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-default-400">
            {draft?.sku ?
              <span className="inline-flex items-center gap-1">
                <DynamicIcon name="hash" size={14} strokeWidth={1.5} className="-mr-0.5" />
                {draft.sku}
              </span> : null}
            {weightLabel && (
              <>
                {draft?.sku ? <span className="text-default-300">|</span> : null}
                <span className="inline-flex items-center gap-1">
                  <DynamicIcon name="scale" size={14} strokeWidth={1.5} />
                  {weightLabel}
                </span>
              </>
            )}
            {perBoxLabel && (
              <>
                {draft?.sku || weightLabel ? <span className="text-default-300">|</span> : null}
                <span className="inline-flex items-center gap-1">
                  <DynamicIcon name="package" size={14} strokeWidth={1.5} />
                  {perBoxLabel}
                </span>
              </>
            )}
          </div>
        ) : undefined
      }
      className="bg-background-paper border-neutral-200 max-w-lg"
    >
      {draft && (
        <div className="flex flex-col gap-4 mt-3">
          {qtySideHint && (
            <p className="text-xs font-medium text-primary-600 -mb-1">{qtySideHint}</p>
          )}
          <div className="flex items-center justify-between gap-2 text-sm">
            <p className="text-default-600 font-semibold min-w-0 truncate">
              Партія: <span className="font-light">{draft.batchNumber || '—'}</span>
            </p>
            <div className="flex items-center gap-1 shrink-0">
              <p className="text-default-600 font-semibold">
                ШК: <span className="font-light font-mono text-xs">{draft.barcode || '—'}</span>
              </p>
              {allowBatchChange && onChangeBatch && (
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  className="min-w-0 h-7 w-7 text-blue-600"
                  aria-label="Змінити партію"
                  onPress={onChangeBatch}
                >
                  <DynamicIcon name="repeat" size={14} strokeWidth={1.75} />
                </Button>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <StockCard
              title={sourceLabel || 'Зі складу'}
              before={sourceBefore}
              after={sourceAfter}
              portionsPerBox={portionsPerBox}
              direction="out"
            />
            <StockCard
              title={destLabel || 'На склад'}
              before={destBefore}
              after={destAfter}
              portionsPerBox={portionsPerBox}
              direction="in"
            />
          </div>

          {dualQtyMode ? (
            <>
              <QtySteppers
                label="Відправлено"
                boxes={draft.boxes}
                portions={draft.portions}
                portionsPerBox={portionsPerBox}
                onBoxesChange={onBoxesChange}
                onPortionsChange={onPortionsChange}
                onStepperFocusChange={onStepperFocusChange}
              />
              <QtySteppers
                label="Отримано"
                boxes={draft.receivedBoxes ?? 0}
                portions={draft.receivedPortions ?? 0}
                portionsPerBox={portionsPerBox}
                onBoxesChange={(value) => onReceivedBoxesChange?.(value)}
                onPortionsChange={(value) => onReceivedPortionsChange?.(value)}
                onStepperFocusChange={onStepperFocusChange}
              />
            </>
          ) : (
            <QtySteppers
              boxes={draft.boxes}
              portions={draft.portions}
              portionsPerBox={portionsPerBox}
              onBoxesChange={onBoxesChange}
              onPortionsChange={onPortionsChange}
              onStepperFocusChange={onStepperFocusChange}
            />
          )}

          <p className="text-center text-sm text-default-500">
            {dualQtyMode ? (
              <>
                Відправлено <span className="font-semibold text-default-800">{sentTotal}</span>
                {' · '}
                Отримано <span className="font-semibold text-default-800">{receivedTotal}</span>
              </>
            ) : (
              <>
                Разом{' '}
                <span className="font-semibold text-default-800">{total}</span>{' '}
                {pluralize(total, 'порція', 'порції', 'порцій')}
              </>
            )}
            {receiptState && receiptState !== 'match' && (
              <>
                {' · '}
                <span className={`font-medium ${receiptReceivedClass(receiptState)}`}>
                  {receiptResultLabel(receiptState, qtyDelta)}
                </span>
              </>
            )}
          </p>

          <MovementMobSwipeConfirm
            tapFallback
            disabled={!canConfirm}
            onConfirm={onConfirm}
          />
        </div>
      )}
    </BottomSheet>
  );
}
