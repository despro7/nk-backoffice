import { Card, CardBody } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { MovementMobListCardViewModel } from '../WarehouseMovementMobTypes';
import { pluralize } from '@/lib/formatUtils';
import MovementMobStatusStepper, { MovementMobDirectionBadges } from './MovementMobStatusStepper';

interface MovementMobDocumentCardProps {
  card: MovementMobListCardViewModel;
  onPress: (id: number) => void;
}

export default function MovementMobDocumentCard({ card, onPress }: MovementMobDocumentCardProps) {
  const { aggregates } = card;

  return (
    <Card
      isPressable
      shadow="sm"
      className="bg-white"
      onPress={() => onPress(card.id)}
    >
      <CardBody className="gap-4 p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs text-neutral-400">{card.displayDateTime}</span>
          <MovementMobDirectionBadges
            sourceBadge={card.sourceBadge}
            destBadge={card.destBadge}
          />
        </div>

        <div className="flex items-end justify-between gap-3">
          <h3 className="text-lg font-bold text-default-900 leading-none">{card.displayNumber}</h3>
          <div className="flex items-center gap-2.5 text-neutral-500 shrink-0">
            {aggregates.totalBoxes > 0 && (
              <span className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs bg-neutral-200/50 rounded px-1.5 py-0.5 ring-1 ring-neutral-400/80">
                  <DynamicIcon name="package-2" size={14} strokeWidth={1.5} className="shrink-0" />
                  {aggregates.totalBoxes}
                </span>
                {aggregates.totalLoosePortions > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs bg-neutral-200/50 rounded px-1.5 py-0.5 ring-1 ring-neutral-400/80 relative">
                    <DynamicIcon name="plus" size={12} strokeWidth={2} className="shrink-0 text-sm absolute -left-2.5 bg-yellow-200 rounded-full border-1 border-neutral-400 leading-none" />
                    <DynamicIcon name="paper-bag" size={14} strokeWidth={1.5} className="shrink-0" />
                    {aggregates.totalLoosePortions}
                  </span>
                )}
              </span>
            )}
            <span className="text-base font-semibold text-neutral-600">{aggregates.totalPortions} <span className="text-xs font-extralight">{pluralize(aggregates.totalPortions, 'порція', 'порції', 'порцій')}</span></span>
          </div>
        </div>

        <MovementMobStatusStepper steps={card.stepperSteps} />
      </CardBody>
    </Card>
  );
}
