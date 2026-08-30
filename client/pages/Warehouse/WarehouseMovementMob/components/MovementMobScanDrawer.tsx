import { DynamicIcon } from 'lucide-react/dynamic';
import { BottomSheet } from '@/components/motion/bottom-sheet';
import { StepperInput } from '@/pages/Warehouse/shared/StepperInput';
import { pluralize } from '@/lib/formatUtils';
import type { MovementMobScanDraft } from '../WarehouseMovementMobTypes';
import { breakdownStockPortions, lineTotalPortions } from '../WarehouseMovementMobUtils';
import MovementMobSwipeConfirm from './MovementMobSwipeConfirm';

interface MovementMobScanDrawerProps {
  isOpen: boolean;
  draft: MovementMobScanDraft | null;
  sourceLabel: string;
  destLabel: string;
  otherCommittedPortions?: number;
  confirming?: boolean;
  onClose: () => void;
  onBoxesChange: (value: number) => void;
  onPortionsChange: (value: number) => void;
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

export default function MovementMobScanDrawer({
  isOpen,
  draft,
  sourceLabel,
  destLabel,
  otherCommittedPortions = 0,
  confirming = false,
  onClose,
  onBoxesChange,
  onPortionsChange,
  onStepperFocusChange,
  onConfirm,
}: MovementMobScanDrawerProps) {
  const portionsPerBox = draft?.portionsPerBox ?? 0;
  const total = draft
    ? lineTotalPortions(draft.boxes, draft.portions, portionsPerBox)
    : 0;
  const canConfirm = Boolean(draft) && total > 0 && !confirming;
  const sourceBefore = Math.max(0, (draft?.sourceStock.portions ?? 0) - otherCommittedPortions);
  const destBefore = (draft?.destStock.portions ?? 0) + otherCommittedPortions;
  const sourceAfter = Math.max(0, sourceBefore - total);
  const destAfter = destBefore + total;

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
          <div className="flex items-center justify-between text-sm">
            <p className="text-default-600 font-semibold">
              Партія: <span className="font-light">{draft.batchNumber}</span>
            </p>
            <p className="text-default-600 font-semibold">
              ШК: <span className="font-light">{draft.barcode}</span>
            </p>
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
              value={draft.boxes}
              size="lg"
              onChange={onBoxesChange}
              onIncrement={() => onBoxesChange(draft.boxes + 1)}
              onDecrement={() => onBoxesChange(Math.max(0, draft.boxes - 1))}
              className="gap-1"
              inputClassName="border-1! shadow-md"
            />
            <StepperInput
              label="Порцій"
              value={draft.portions}
              size="lg"
              onChange={onPortionsChange}
              onIncrement={() => onPortionsChange(draft.portions + 1)}
              onDecrement={() => onPortionsChange(Math.max(0, draft.portions - 1))}
              className="gap-1"
              inputClassName="border-1! shadow-md"
            />
          </div>

          <p className="text-center text-sm text-default-500">
            Разом{' '}
            <span className="font-semibold text-default-800">{total}</span>{' '}
            {pluralize(total, 'порція', 'порції', 'порцій')}
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
