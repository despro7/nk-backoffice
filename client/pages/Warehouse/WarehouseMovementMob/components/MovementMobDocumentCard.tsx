import { Button, Card, CardBody } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { MovementMobListCardViewModel } from '../WarehouseMovementMobTypes';
import { pluralize } from '@/lib/formatUtils';
import MovementMobStatusStepper, { MovementMobDirectionBadges } from './MovementMobStatusStepper';

interface MovementMobDocumentCardProps {
  card: MovementMobListCardViewModel;
  onPress: (id: number) => void;
  showAdminActions?: boolean;
  onAdminEdit?: (id: number) => void;
  onAdminDelete?: (id: number) => void;
}

export default function MovementMobDocumentCard({
  card,
  onPress,
  showAdminActions = false,
  onAdminEdit,
  onAdminDelete,
}: MovementMobDocumentCardProps) {
  const { aggregates } = card;

  return (
    <Card shadow="sm" className="bg-white">
      <CardBody
        className="gap-4 p-3 md:p-4 cursor-pointer"
        onClick={() => onPress(card.id)}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs text-neutral-400">{card.displayDateTime}</span>
          <div className="flex items-center gap-1">
            {showAdminActions && (
              <div
                className="flex items-center"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {onAdminEdit && (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    aria-label="Редагувати документ"
                    className="min-w-8 w-8 h-8 text-primary"
                    onPress={() => onAdminEdit(card.id)}
                  >
                    <DynamicIcon name="pencil" size={16} strokeWidth={1.75} />
                  </Button>
                )}
                {onAdminDelete && (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    aria-label="Видалити документ"
                    className="min-w-8 w-8 h-8 text-danger"
                    onPress={() => onAdminDelete(card.id)}
                  >
                    <DynamicIcon name="trash-2" size={16} strokeWidth={1.75} />
                  </Button>
                )}
              </div>
            )}
            <MovementMobDirectionBadges
              sourceBadge={card.sourceBadge}
              destBadge={card.destBadge}
            />
          </div>
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
