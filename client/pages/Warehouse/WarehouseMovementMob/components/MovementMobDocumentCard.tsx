import { Card, CardBody } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { MovementMobListCardViewModel } from '../WarehouseMovementMobTypes';
import { formatPortionsLabel } from '../WarehouseMovementMobUtils';
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
      className="bg-white border border-default-100"
      onPress={() => onPress(card.id)}
    >
      <CardBody className="gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm text-default-500">{card.displayDateTime}</span>
          <MovementMobDirectionBadges
            sourceBadge={card.sourceBadge}
            destBadge={card.destBadge}
          />
        </div>

        <div className="flex items-end justify-between gap-3">
          <h3 className="text-lg font-bold text-default-900 leading-none">{card.displayNumber}</h3>
          <div className="flex items-center gap-2.5 text-default-600 shrink-0">
            {aggregates.totalBoxes > 0 && (
              <span className="inline-flex items-center gap-1 text-sm">
                <DynamicIcon name="package" size={16} className="text-default-400" />
                {aggregates.totalBoxes}
              </span>
            )}
            {aggregates.totalLoosePortions > 0 && (
              <span className="inline-flex items-center gap-1 text-sm">
                <DynamicIcon name="shopping-bag" size={16} className="text-default-400" />
                {aggregates.totalLoosePortions}
              </span>
            )}
            <span className="text-sm font-medium text-default-700">
              {formatPortionsLabel(aggregates.totalPortions)}
            </span>
          </div>
        </div>

        <MovementMobStatusStepper steps={card.stepperSteps} />
      </CardBody>
    </Card>
  );
}
