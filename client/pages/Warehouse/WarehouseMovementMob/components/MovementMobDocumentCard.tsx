import { Card, CardBody } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { MovementMobListCardViewModel, MovementMobReceiptSummary } from '../WarehouseMovementMobTypes';
import { pluralize } from '@/lib/formatUtils';
import { receiptDeltaClass, receiptReceivedClass } from '../WarehouseMovementMobUtils';
import MovementMobStatusStepper, { MovementMobDirectionBadges } from './MovementMobStatusStepper';

interface MovementMobDocumentCardProps {
  card: MovementMobListCardViewModel;
  onPress: (id: number) => void;
  showAdminActions?: boolean;
  onAdminEdit?: (id: number) => void;
  onAdminDelete?: (id: number) => void;
}

function QtyPills({ boxes, loose }: { boxes: number; loose: number }) {
  if (boxes <= 0 && loose <= 0) return null;
  return (
    <span className="flex items-center gap-2">
      {boxes > 0 && (
        <span className="inline-flex items-center gap-1 text-xs bg-neutral-200/50 rounded px-1.5 py-0.5 ring-1 ring-neutral-400/80">
          <DynamicIcon name="package-2" size={14} strokeWidth={1.5} className="shrink-0" />
          {boxes}
        </span>
      )}
      {loose > 0 && (
        <span className="inline-flex items-center gap-1 text-xs bg-neutral-200/50 rounded px-1.5 py-0.5 ring-1 ring-neutral-400/80 relative">
          {boxes > 0 && (
            <DynamicIcon name="plus" size={12} strokeWidth={2} className="shrink-0 text-sm absolute -left-2.5 bg-yellow-200 rounded-full border-1 border-neutral-400 leading-none" />
          )}
          <DynamicIcon name="paper-bag" size={14} strokeWidth={1.5} className="shrink-0" />
          {loose}
        </span>
      )}
    </span>
  );
}

function PortionsLabel({ value, className = 'text-base font-semibold text-neutral-600' }: { value: number; className?: string }) {
  return (
    <span className={className}>
      {value}{' '}
      <span className="text-xs font-extralight">
        {pluralize(value, 'порція', 'порції', 'порцій')}
      </span>
    </span>
  );
}

function receiptStateFromSummary(summary: MovementMobReceiptSummary): 'match' | 'shortage' | 'surplus' | 'pending' {
  if (summary.pendingLines > 0 && summary.matchLines === 0 && summary.shortageLines === 0 && summary.surplusLines === 0) {
    return 'pending';
  }
  if (summary.deltaPortions === 0 && summary.shortageLines === 0 && summary.surplusLines === 0) {
    return 'match';
  }
  if (summary.deltaPortions < 0) return 'shortage';
  if (summary.deltaPortions > 0) return 'surplus';
  return summary.shortageLines > 0 ? 'shortage' : 'surplus';
}

function ReceiptStatsRow({
  summary,
}: {
  summary: MovementMobReceiptSummary;
}) {
  const state = receiptStateFromSummary(summary);
  const deltaLabel =
    summary.deltaPortions > 0
      ? `+${summary.deltaPortions}`
      : String(summary.deltaPortions);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end justify-between gap-3">
        <span className="text-xs text-neutral-400 leading-none">Отримано</span>
        <div className="flex items-center gap-2.5 text-neutral-500 shrink-0">
          <QtyPills boxes={summary.receivedBoxes} loose={summary.receivedLoosePortions} />
          <PortionsLabel
            value={summary.receivedTotalPortions}
            className={`text-base font-semibold ${receiptReceivedClass(state)}`}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-1.5 flex-wrap">
        {state === 'pending' && (
          <span className="text-xs font-medium text-default-400">
            ще не скановано
          </span>
        )}
        {state === 'match' && summary.pendingLines === 0 && (
          <span className={`text-xs font-medium ${receiptReceivedClass('match')}`}>збіг</span>
        )}
        {summary.deltaPortions !== 0 && (
          <span className={`text-xs font-semibold ${receiptDeltaClass(summary.deltaPortions)}`}>
            Δ {deltaLabel}
          </span>
        )}
        {summary.pendingLines > 0 && state !== 'pending' && (
          <span className="inline-flex items-center gap-0.5 text-[11px] bg-neutral-100 text-neutral-500 rounded px-1.5 py-0.5 ring-1 ring-neutral-300">
            {summary.pendingLines} ще
          </span>
        )}
        {summary.shortageLines > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[11px] bg-danger-50 text-danger-600 rounded px-1.5 py-0.5 ring-1 ring-danger-200">
            {summary.shortageLines} нестача (−{summary.shortagePortions})
          </span>
        )}
        {summary.surplusLines > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[11px] bg-primary-50 text-primary-600 rounded px-1.5 py-0.5 ring-1 ring-primary-200">
            {summary.surplusLines} надлишок (+{summary.surplusPortions})
          </span>
        )}
      </div>
    </div>
  );
}

export default function MovementMobDocumentCard({
  card,
  onPress,
}: MovementMobDocumentCardProps) {
  const { aggregates, receiptSummary } = card;

  return (
    <Card shadow="sm" className="bg-white">
      <CardBody
        className="gap-4 p-3 md:p-4 cursor-pointer"
        onClick={() => onPress(card.id)}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs text-neutral-400">{card.displayDateTime}</span>
          <div className="flex items-center gap-1">
            <MovementMobDirectionBadges
              sourceBadge={card.sourceBadge}
              destBadge={card.destBadge}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {receiptSummary ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-lg font-bold text-default-900 leading-none">{card.displayNumber}</h3>
                {aggregates.lineCount > 0 && (
                  <span className="text-base font-semibold text-neutral-600 shrink-0">
                    {aggregates.lineCount}{' '}
                    <span className="text-xs font-extralight">
                      {pluralize(aggregates.lineCount, 'позиція', 'позиції', 'позицій')}
                    </span>
                  </span>
                )}
              </div>
              <div className="flex items-end justify-between gap-3">
                <span className="text-xs text-neutral-400 leading-none">Відправлено</span>
                <div className="flex items-center gap-2.5 text-neutral-500 shrink-0">
                  <QtyPills boxes={aggregates.totalBoxes} loose={aggregates.totalLoosePortions} />
                  <PortionsLabel value={aggregates.totalPortions} />
                </div>
              </div>
              <ReceiptStatsRow summary={receiptSummary} />
            </>
          ) : (
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-baseline gap-2 min-w-0">
                <h3 className="text-lg font-bold text-default-900 leading-none">{card.displayNumber}</h3>
                {aggregates.lineCount > 0 && (
                  <span className="text-[11px] text-neutral-400">
                    {aggregates.lineCount} {pluralize(aggregates.lineCount, 'позиція', 'позиції', 'позицій')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5 text-neutral-500 shrink-0">
                <QtyPills boxes={aggregates.totalBoxes} loose={aggregates.totalLoosePortions} />
                <PortionsLabel value={aggregates.totalPortions} />
              </div>
            </div>
          )}
        </div>

        <MovementMobStatusStepper steps={card.stepperSteps} />
      </CardBody>
    </Card>
  );
}
