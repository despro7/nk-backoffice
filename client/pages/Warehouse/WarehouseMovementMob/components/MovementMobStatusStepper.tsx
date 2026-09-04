import { DynamicIcon } from 'lucide-react/dynamic';
import { StockBadge, type StockBadgeVariant } from '@/components/StockBadge';
import type { MovementMobStepperStep } from '../WarehouseMovementMobTypes';

interface MovementMobStatusStepperProps {
  steps: MovementMobStepperStep[];
  className?: string;
}

export default function MovementMobStatusStepper({
  steps,
  className = '',
}: MovementMobStatusStepperProps) {
  return (
    <div className={`w-full ${className}`}>
      <div className={`flex items-center ${steps.length > 3 ? 'gap-4 sm:gap-8' : 'gap-12'}`}>
        {steps.map((step, index) => {
          const isDone = step.state === 'done';
          const isFirst = index === 0;
          const isLast = index === steps.length - 1;
          const nextDone = !isLast && steps[index + 1]?.state === 'done';

          return (
            <div key={step.key} className={`relative flex-1 min-w-0 flex flex-col items-center`}>
              <div className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center ${isDone ? 'bg-success-500 text-white' : 'bg-default-200 text-default-500'}`}>
                <DynamicIcon name={isDone ? 'check' : 'clock'} size={14} className="shrink-0" />
              </div>
              <span className={`mt-1.5 w-full text-[10px] leading-tight text-center px-0.5 whitespace-nowrap ${isDone ? 'text-success-600/90 font-medium' : 'text-default-400'}`}>
                <span className="sm:hidden">{step.shortLabel ?? step.label}</span>
                <span className="hidden sm:inline">{step.label}</span>
              </span>
              {!isLast && (
                <div className={`absolute top-3.5 left-full w-[calc(100%-1rem)] h-0.5 rounded-full -translate-x-[calc(50%-0.5rem)] md:-translate-x-[calc(50%-1rem)] ${
                    isDone && nextDone ? 'bg-success-500' : isDone ? 'bg-gradient-to-r from-success-500 to-default-200' : 'bg-default-200'}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function badgeToStockVariant(badge: string): StockBadgeVariant | null {
  if (badge === 'МС') return 'ms';
  if (badge === 'ГП') return 'gp';
  return null;
}

function DirectionStockBadge({ badge }: { badge: string }) {
  const variant = badgeToStockVariant(badge);
  if (variant) {
    return <StockBadge variant={variant} size="10px" className="leading-tight pt-[3px]" />;
  }
  return (
    <span className="px-1 py-0.5 rounded ring-1 text-[10px] text-default-500 bg-default-100">
      {badge}
    </span>
  );
}

export function MovementMobDirectionBadges({
  sourceBadge,
  destBadge,
}: {
  sourceBadge: string;
  destBadge: string;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <DirectionStockBadge badge={sourceBadge} />
      <DynamicIcon name="arrow-right" size={14} className="text-default-400 shrink-0" />
      <DirectionStockBadge badge={destBadge} />
    </div>
  );
}
