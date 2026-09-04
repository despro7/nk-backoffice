import { useMemo } from 'react';
import { Button, Card, CardBody, Skeleton } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { StockBadge } from '@/components/StockBadge';
import { useDebug } from '@/contexts/DebugContext';
import type { MovementMobProductLineViewModel } from '../WarehouseMovementMobTypes';
import { pluralize } from '@/lib/formatUtils';
import {
  computeProjectedLineStock,
  isHumanBatchLabel,
  lineReceiptState,
  movementQtyForStockProjection,
  receiptDeltaClass,
  receiptReceivedClass,
  receiptResultLabel,
} from '../WarehouseMovementMobUtils';

interface MovementMobProductCardProps {
  line: MovementMobProductLineViewModel;
  sourceStorageId: string;
  destStorageId: string;
  showReceipt?: boolean;
  qtyFocus?: 'sent' | 'received';
  onEditProduct?: (line: MovementMobProductLineViewModel) => void;
  enrichmentLoading?: boolean;
  enrichmentRefreshing?: boolean;
}

function LineStockCard({
  variant,
  batchQty,
  totalQty,
  loading = false,
}: {
  variant: 'gp' | 'ms';
  batchQty: number | null;
  totalQty: number;
  loading?: boolean;
}) {
  return (
    <div className="flex-1 min-w-0 rounded-md bg-neutral-100 px-2.5 py-2.5">
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-default-400">партія / всього</span>
        <StockBadge variant={variant} size="10px" className="leading-none" />
      </div>
      {loading ? (
        <Skeleton className="mt-1.5 h-6 w-20 rounded-sm opacity-60" />
      ) : (
        <p className="mt-1 text-sm font-semibold text-default-800 leading-none tabular-nums">
          {batchQty ?? '—'}
          <span className="mx-1 text-default-400 font-normal">/</span>
          {totalQty}
        </p>
      )}
    </div>
  );
}

function BatchLabel({
  line,
  loading,
}: {
  line: MovementMobProductLineViewModel;
  loading: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-4 w-28 rounded-md opacity-60" />;
  }

  const linked = line.batchLinked === true;
  const label = (line.batchNumber || '').trim();
  const showWarning = !linked || !isHumanBatchLabel(label);

  return (
    <p className="text-xs text-default-400">
      Партія:{' '}
      {showWarning ? (
        <span className="text-danger-500 font-medium">не обрано!</span>
      ) : (
        <span className="text-default-500">{label}</span>
      )}
    </p>
  );
}

export default function MovementMobProductCard({
  line,
  sourceStorageId,
  destStorageId,
  showReceipt = false,
  qtyFocus = 'received',
  onEditProduct,
  enrichmentLoading = false,
  enrichmentRefreshing = false,
}: MovementMobProductCardProps) {
  const { isDebugMode } = useDebug();
  const stockLoading = enrichmentLoading || enrichmentRefreshing;
  const projectedStock = useMemo(() => {
    const { sourceOut, destIn } = movementQtyForStockProjection(line, showReceipt);
    return computeProjectedLineStock(
      line.stock,
      sourceStorageId,
      destStorageId,
      sourceOut,
      destIn,
      line.batchLinked,
    );
  }, [line, showReceipt, sourceStorageId, destStorageId]);
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
  const barcodeLabel = line.barcode?.trim() || null;
  const canEditProduct = Boolean(onEditProduct && line.catalogGoodId);

  return (
    <Card className={`bg-white shadow-none rounded-xl md:h-full ${ringClass}`}>
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

        <div className="flex items-center gap-8 justify-between">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-default-400">
            {!isDebugMode && <span># {line.sku}</span>}
            {weightLabel && (
              <>
                {!isDebugMode && <span className="text-default-300">|</span>}
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

        <div className="flex items-end gap-1 mt-1 md:mt-auto md:pt-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            {isDebugMode && (
              <>
                <p className="text-xs text-default-400 truncate">
                  SKU: <span className="font-mono text-default-500">{line.sku}</span>
                </p>
                {barcodeLabel && (
                  <p className="text-xs text-default-400 truncate">
                    ШК: <span className="font-mono text-default-500">{barcodeLabel}</span>
                  </p>
                )}
                {(line.batchId || line.batchNumber) && (
                  <p className="text-xs text-default-400 truncate">
                    ID партії: <span className="font-mono text-default-500">{line.batchId || line.batchNumber}</span>
                  </p>
                )}
                {line.catalogGoodId && (
                  <p className="text-xs text-default-400 truncate">
                    ID товару: <span className="font-mono text-default-500">{line.catalogGoodId}</span>
                  </p>
                )}
              </>
            )}
            <BatchLabel line={line} loading={enrichmentLoading} />
          </div>
          {canEditProduct && !enrichmentLoading && (
            <Button
              isIconOnly
              variant="light"
              size="sm"
              className="shrink-0 h-auto min-w-0 p-2 -my-1 text-blue-500"
              aria-label="Редагувати товар"
              onPress={() => onEditProduct?.(line)}
            >
              <DynamicIcon name="pencil-line" size={13} strokeWidth={1.75} />
            </Button>
          )}
        </div>

        <h4 className="text-[10px] text-default-400 font-medium uppercase tracking-wide mt-2">
          Залишки після переміщення:
        </h4>
        <div className="flex gap-2">
          <LineStockCard
            variant="gp"
            batchQty={projectedStock.batchGp}
            totalQty={projectedStock.totalGp}
            loading={stockLoading}
          />
          <LineStockCard
            variant="ms"
            batchQty={projectedStock.batchMs}
            totalQty={projectedStock.totalMs}
            loading={stockLoading}
          />
        </div>

        {showReceipt && (
          <div className="mt-2 flex flex-col gap-1 text-xs">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-default-400">
              <span>
                Відправлено: <span className="font-medium text-default-600">{line.totalPortions}</span>
              </span>
              <span className="text-default-300">/</span>
              <span>
                Отримано:{' '}
                <span className={`font-medium ${receiptState ? receiptReceivedClass(receiptState) : 'text-default-600'}`}>
                  {line.receivedTotalPortions}
                </span>
              </span>
              <span className="text-default-300">/</span>
              <span>
                Результат:{' '}
                <span className={`font-medium ${receiptState ? receiptReceivedClass(receiptState) : 'text-default-400'}`}>
                  {receiptState ? receiptResultLabel(receiptState, qtyDelta) : '—'}
                </span>
              </span>
            </div>
            {receiptState === 'shortage' && (
              <span className={`font-medium ${receiptDeltaClass(qtyDelta)}`}>
                Δ {qtyDelta}
              </span>
            )}
            {receiptState === 'surplus' && (
              <span className={`font-medium ${receiptDeltaClass(qtyDelta)}`}>
                Δ +{qtyDelta}
              </span>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
