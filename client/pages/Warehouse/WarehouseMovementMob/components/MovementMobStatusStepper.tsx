import { Chip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
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
      <div className="flex items-start">
        {steps.map((step, index) => {
          const isDone = step.state === 'done';
          const isLast = index === steps.length - 1;
          const nextDone = !isLast && steps[index + 1]?.state === 'done';

          return (
            <div key={step.key} className={`flex items-start ${isLast ? '' : 'flex-1'}`}>
              <div className="flex flex-col items-center min-w-14">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center ${
                    isDone ? 'bg-success text-white' : 'bg-default-200 text-default-500'
                  }`}
                >
                  <DynamicIcon
                    name={isDone ? 'check' : 'clock'}
                    size={14}
                    className="shrink-0"
                  />
                </div>
                <span
                  className={`mt-1.5 text-[10px] leading-tight text-center max-w-18 ${
                    isDone ? 'text-success-600 font-medium' : 'text-default-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {!isLast && (
                <div
                  className={`flex-1 h-0.5 mt-3.5 mx-1 rounded-full ${
                    isDone && nextDone ? 'bg-success' : isDone ? 'bg-success/40' : 'bg-default-200'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
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
      <Chip size="sm" variant="flat" className="bg-sky-500/15 text-sky-700 h-6 px-2">
        {sourceBadge}
      </Chip>
      <DynamicIcon name="arrow-right" size={14} className="text-default-400 shrink-0" />
      <Chip size="sm" variant="flat" className="bg-lime-500/15 text-lime-700 h-6 px-2">
        {destBadge}
      </Chip>
    </div>
  );
}
