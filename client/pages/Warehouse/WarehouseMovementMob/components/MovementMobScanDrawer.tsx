import { useCallback } from 'react';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { BottomSheet } from '@/components/motion/bottom-sheet';
import { StockBadge } from '@/components/StockBadge';
import { useProductMovementsDrawer } from '@/features/product-movements/context/ProductMovementsDrawerContext';
import { StepperInput } from '@/pages/Warehouse/shared/StepperInput';
import { pluralize } from '@/lib/formatUtils';
import type { MovementMobScanDraft } from '../WarehouseMovementMobTypes';
import {
  breakdownStockPortions,
  clampMovementMobQty,
  computeProjectedLineStock,
  effectiveBatchId,
  lineTotalPortions,
  movementMobStockBadgeVariant,
  receiptReceivedClass,
  receiptResultLabel,
} from '../WarehouseMovementMobUtils';
import type { MovementMobLineStockInfo } from '../WarehouseMovementMobTypes';
import type { MovementMobReceiptState } from '../WarehouseMovementMobTypes';
import MovementMobSwipeConfirm from './MovementMobSwipeConfirm';

interface MovementMobScanDrawerProps {
  isOpen: boolean;
  draft: MovementMobScanDraft | null;
  sourceLabel: string;
  destLabel: string;
  sourceStorageId: string;
  destStorageId: string;
  /** Макс. порцій відправлення (залишок партії на складі-джерелі). */
  maxSentPortions?: number | null;
  /** Партії немає на складі-джерелі (прочерк у колонці партії). */
  sourceBatchMissingOnSource?: boolean;
  /** Відправлена кількість порцій — для показу нестачі/надлишку під час отримання. */
  sentTotalPortions?: number | null;
  confirming?: boolean;
  qtySideHint?: string;
  dualQtyMode?: boolean;
  allowBatchChange?: boolean;
  catalogGoodId?: string | null;
  onClose: () => void;
  onBoxesChange: (value: number) => void;
  onPortionsChange: (value: number) => void;
  onReceivedBoxesChange?: (value: number) => void;
  onReceivedPortionsChange?: (value: number) => void;
  onChangeBatch?: () => void;
  onStepperFocusChange: (focused: boolean) => void;
  onConfirm: () => void;
}

function storageMetricDirection(
  variant: 'gp' | 'ms',
  sourceBadge: 'gp' | 'ms' | null,
  destBadge: 'gp' | 'ms' | null,
): 'out' | 'in' | 'idle' {
  if (variant === sourceBadge) return 'out';
  if (variant === destBadge) return 'in';
  return 'idle';
}

function formatStockMetric(value: number | null, isBatch: boolean): string {
  if (isBatch && value === null) return '—';
  return String(value ?? 0);
}

function StorageStockMetricCard({
  variant,
  metric,
  metricCaption,
  before,
  after,
  direction,
  portionsPerBox,
  batchShortage = false,
  showBreakdown = false,
}: {
  variant: 'gp' | 'ms';
  metric: 'total' | 'batch';
  /** Артикул (ряд «всього») або номер партії (ряд «партія»). */
  metricCaption: string;
  before: number | null;
  after: number | null;
  direction: 'out' | 'in' | 'idle';
  portionsPerBox: number;
  batchShortage?: boolean;
  showBreakdown?: boolean;
}) {
  const isBatch = metric === 'batch';
  const changed = before !== after;
  const afterColor = direction === 'out'
    ? 'text-danger'
    : direction === 'in'
      ? 'text-success'
      : 'text-default-800';
  const showEmptyBatchBreakdown = showBreakdown && isBatch && before === null;
  const breakdownInitial = showBreakdown && !showEmptyBatchBreakdown
    ? breakdownStockPortions(before ?? 0, portionsPerBox)
    : null;

  return (
    <div
      className={`flex-1 min-w-0 rounded-lg px-2.5 py-2.5 ${
        batchShortage ? 'bg-danger-50 ring-1 ring-danger-200' : 'bg-neutral-100'
      }`}
    >
      {/* <div className="flex items-center justify-between gap-1.5 pb-0.5 min-w-0">
        <div
          className="flex min-w-0 max-w-[calc(100%-1.75rem)] items-center gap-0.5"
          title={metricCaption}
        >
          <DynamicIcon
            name={isBatch ? 'tag' : 'hash'}
            size={11}
            strokeWidth={1.5}
            className="shrink-0 text-default-400"
            aria-hidden
          />
          <span className="min-w-0 truncate text-nowrap text-[11px] uppercase tracking-wide text-default-400">
            {metricCaption}
          </span>
        </div>
        <StockBadge variant={variant} size="10px" className="leading-none shrink-0" />
      </div> */}
      <p className="mt-1 text-lg font-semibold text-default-800 leading-none tabular-nums flex items-center gap-1 min-w-0">
        <span className={batchShortage && !changed ? 'text-danger-600' : undefined}>
          {formatStockMetric(before, isBatch)}
        </span>
        {changed && (
          <>
            <span className={afterColor}>
              <DynamicIcon name="arrow-right" size={16} strokeWidth={2} className="shrink-0" />
            </span>
            <span className={`${afterColor} ${batchShortage ? 'font-semibold' : ''}`}>
              {formatStockMetric(after, isBatch)}
            </span>
          </>
        )}
      </p>
      {showBreakdown && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-default-500 tabular-nums">
          <span className="inline-flex items-center gap-0.5">
            <DynamicIcon name="package-2" size={13} strokeWidth={1.5} />
            {showEmptyBatchBreakdown ? '—' : breakdownInitial?.boxes ?? 0}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <DynamicIcon name="paper-bag" size={13} strokeWidth={1.5} />
            {showEmptyBatchBreakdown ? '—' : breakdownInitial?.loosePortions ?? 0}
          </span>
        </div>
      )}
    </div>
  );
}

function MovementMobStockGrid({
  sku,
  batchLabel,
  stockInfo,
  projectedStock,
  sourceBadge,
  destBadge,
  portionsPerBox,
  sourceBatchShortage,
}: {
  sku: string;
  batchLabel: string;
  stockInfo: MovementMobLineStockInfo;
  projectedStock: MovementMobLineStockInfo;
  sourceBadge: 'gp' | 'ms' | null;
  destBadge: 'gp' | 'ms' | null;
  portionsPerBox: number;
  sourceBatchShortage: boolean;
}) {
  const skuCaption = sku.trim() || '—';
  const batchCaption = batchLabel.trim() || '—';
  const variants = ['gp', 'ms'] as const;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-default-400 mb-1.5 flex items-center gap-2">Всього залишків
          {sourceBadge !== destBadge && (
            <span className="inline-flex items-center gap-0.5 -mt-0.5">
              <StockBadge variant={sourceBadge} size="10px" className="leading-none shrink-0" />
              <DynamicIcon name="arrow-right" size={12} strokeWidth={2} className="shrink-0" />
              <StockBadge variant={destBadge} size="10px" className="leading-none shrink-0" />
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {variants.map((variant) => (
            <StorageStockMetricCard
              key={`total-${variant}`}
              variant={variant}
              metric="total"
              metricCaption={skuCaption}
              before={variant === 'gp' ? stockInfo.totalGp : stockInfo.totalMs}
              after={variant === 'gp' ? projectedStock.totalGp : projectedStock.totalMs}
              direction={storageMetricDirection(variant, sourceBadge, destBadge)}
              portionsPerBox={portionsPerBox}
              showBreakdown
            />
          ))}
        </div>
      </div>
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-default-400 mb-1.5 flex items-center gap-2">
          Залишки партії <span className="-ml-0.5 font-light">#{batchCaption}</span>
          {sourceBadge !== destBadge && (
            <span className="inline-flex items-center gap-0.5 -mt-0.5">
              <StockBadge variant={sourceBadge} size="10px" className="leading-none shrink-0" />
              <DynamicIcon name="arrow-right" size={12} strokeWidth={2} className="shrink-0" />
              <StockBadge variant={destBadge} size="10px" className="leading-none shrink-0" />
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {variants.map((variant) => (
            <StorageStockMetricCard
              key={`batch-${variant}`}
              variant={variant}
              metric="batch"
              metricCaption={batchCaption}
              before={variant === 'gp' ? stockInfo.batchGp : stockInfo.batchMs}
              after={variant === 'gp' ? projectedStock.batchGp : projectedStock.batchMs}
              direction={storageMetricDirection(variant, sourceBadge, destBadge)}
              portionsPerBox={portionsPerBox}
              batchShortage={sourceBatchShortage && variant === sourceBadge}
              showBreakdown
            />
          ))}
        </div>
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
  maxTotalPortions,
  disabled = false,
}: {
  label?: string;
  boxes: number;
  portions: number;
  portionsPerBox: number;
  onBoxesChange: (value: number) => void;
  onPortionsChange: (value: number) => void;
  onStepperFocusChange: (focused: boolean) => void;
  maxTotalPortions?: number | null;
  disabled?: boolean;
}) {
  const maxLoosePortions = portionsPerBox > 1 ? portionsPerBox - 1 : undefined;

  const applyCap = (nextBoxes: number, nextPortions: number) => {
    if (disabled) return;
    if (maxTotalPortions == null) {
      onBoxesChange(nextBoxes);
      onPortionsChange(nextPortions);
      return;
    }
    const capped = clampMovementMobQty(nextBoxes, nextPortions, portionsPerBox, maxTotalPortions);
    onBoxesChange(capped.boxes);
    onPortionsChange(capped.portions);
  };

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
          disabled={disabled}
          locked={disabled}
          onChange={(value) => applyCap(value, portions)}
          onIncrement={() => applyCap(boxes + 1, portions)}
          onDecrement={() => applyCap(Math.max(0, boxes - 1), portions)}
          className="gap-1"
          inputClassName="border-0! shadow-medium"
        />
        <StepperInput
          label="Порцій"
          value={portions}
          size="lg"
          max={maxLoosePortions}
          disabled={disabled}
          locked={disabled}
          onChange={(value) => applyCap(boxes, value)}
          onIncrement={() => {
            const nextPortions = maxLoosePortions !== undefined
              ? Math.min(portions + 1, maxLoosePortions)
              : portions + 1;
            applyCap(boxes, nextPortions);
          }}
          onDecrement={() => applyCap(boxes, Math.max(0, portions - 1))}
          className="gap-1"
          inputClassName="border-0! shadow-medium"
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
  sourceStorageId,
  destStorageId,
  maxSentPortions = null,
  sourceBatchMissingOnSource = false,
  sentTotalPortions = null,
  confirming = false,
  qtySideHint,
  dualQtyMode = false,
  allowBatchChange = false,
  catalogGoodId = null,
  onClose,
  onBoxesChange,
  onPortionsChange,
  onReceivedBoxesChange,
  onReceivedPortionsChange,
  onChangeBatch,
  onStepperFocusChange,
  onConfirm,
}: MovementMobScanDrawerProps) {
  const { open: openProductMovements } = useProductMovementsDrawer();
  const portionsPerBox = draft?.portionsPerBox ?? 0;
  const batchPartId = draft ? effectiveBatchId(draft.batchId, draft.batchNumber) : '';
  const canOpenBatchMovements = Boolean(batchPartId);
  const openBatchMovements = useCallback(() => {
    if (!draft || !canOpenBatchMovements) return;
    openProductMovements({
      sku: draft.sku,
      productName: draft.name,
      dilovodGoodId: catalogGoodId ?? undefined,
      goodPartId: batchPartId,
      batchLabel: draft.batchNumber || batchPartId,
      storageId: sourceStorageId || undefined,
      autoGenerate: true,
    });
  }, [
    batchPartId,
    canOpenBatchMovements,
    catalogGoodId,
    draft,
    openProductMovements,
    sourceStorageId,
  ]);
  const sentTotal = draft
    ? lineTotalPortions(draft.boxes, draft.portions, portionsPerBox)
    : 0;
  const receivedTotal = dualQtyMode && draft
    ? lineTotalPortions(draft.receivedBoxes ?? 0, draft.receivedPortions ?? 0, portionsPerBox)
    : sentTotal;
  const total = dualQtyMode ? receivedTotal : sentTotal;
  const sentQtyLocked = maxSentPortions != null && maxSentPortions <= 0;
  const sentExceedsBatch = maxSentPortions != null
    && maxSentPortions > 0
    && sentTotal > maxSentPortions;
  const sourceStorageBlocked = sentQtyLocked;
  const sourceBatchShortage = sourceStorageBlocked
    || (maxSentPortions != null && maxSentPortions > 0 && sentTotal >= maxSentPortions);
  const canConfirm = Boolean(draft) && !sentQtyLocked && (dualQtyMode
    ? (sentTotal > 0 || receivedTotal > 0)
    : sentTotal > 0) && !confirming && !sentExceedsBatch;
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
  const stockInfo = draft?.stockInfo;
  const sourceOut = dualQtyMode ? sentTotal : total;
  const destIn = dualQtyMode ? receivedTotal : total;
  const projectedStock = stockInfo
    ? computeProjectedLineStock(stockInfo, sourceStorageId, destStorageId, sourceOut, destIn, true)
    : null;
  const sourceBadge = movementMobStockBadgeVariant(sourceStorageId);
  const destBadge = movementMobStockBadgeVariant(destStorageId);

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
            <span className="text-default-300">|</span>
            {sourceBadge !== destBadge && (
              <div className="flex items-center gap-0.5">
                <StockBadge variant={sourceBadge} size="10px" className="leading-none shrink-0" />
                <span className="text-default-400">-&gt;</span>
                <StockBadge variant={destBadge} size="10px" className="leading-none shrink-0" />
              </div>
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
            <div className="flex items-center gap-0.5 min-w-0">
              <p className="text-default-600 font-semibold min-w-0 truncate">
                Партія: <span className="font-light">{draft.batchNumber || '—'}</span>
              </p>
              {canOpenBatchMovements && (
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  className="min-w-0 h-7 w-7 shrink-0 text-blue-600"
                  aria-label="Рухи товарів по партії"
                  onPress={openBatchMovements}
                >
                  <DynamicIcon name="arrow-left-right" size={14} strokeWidth={1.75} />
                </Button>
              )}
            </div>
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

          {projectedStock && stockInfo && (
            <>
              <MovementMobStockGrid
                sku={draft.sku}
                batchLabel={draft.batchNumber || draft.batchId || ''}
                stockInfo={stockInfo}
                projectedStock={projectedStock}
                sourceBadge={sourceBadge}
                destBadge={destBadge}
                portionsPerBox={portionsPerBox}
                sourceBatchShortage={sourceBatchShortage}
              />
              {sentQtyLocked && (
                <p className="text-xs text-danger-600 -mt-1">
                  {sourceBatchMissingOnSource
                    ? `Партія ${draft.batchNumber || draft.batchId || ''} відсутня або має мінусові залишки. Подивіться рухи партії та спробуйте зробити коригування партійних залишків на складі ${sourceBadge === 'gp' ? 'ГП' : 'МС'}.`
                    : `Немає вільного залишку партії ${draft.batchNumber || draft.batchId || ''} на складі ${sourceBadge === 'gp' ? 'ГП' : 'МС'}.`}
                </p>
              )}
              {maxSentPortions != null && maxSentPortions > 0 && sentTotal >= maxSentPortions && (
                <p className="text-xs text-warning-600 -mt-1">
                  Досягнуто максимум партії: {maxSentPortions} порцій
                </p>
              )}
            </>
          )}

          {dualQtyMode ? (
            <>
              <QtySteppers
                label="Відправлено"
                boxes={draft.boxes}
                portions={draft.portions}
                portionsPerBox={portionsPerBox}
                maxTotalPortions={maxSentPortions}
                disabled={sentQtyLocked}
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
              maxTotalPortions={maxSentPortions}
              disabled={sentQtyLocked}
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
