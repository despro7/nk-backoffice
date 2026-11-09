import { DynamicIcon } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import type { ProductionBatchStageDto } from '@shared/types/production';
import { formatMinutes } from './techCardRecipe';

type StageProgress = 'done' | 'current' | 'upcoming';

function stageProgress(stage: ProductionBatchStageDto): StageProgress {
  if (stage.finishedAt) return 'done';
  if (stage.startedAt) return 'current';
  return 'upcoming';
}

function stageMeta(stage: ProductionBatchStageDto): string | null {
  const parts = [
    stage.plannedOffsetMin ? `старт +${formatMinutes(stage.plannedOffsetMin)}` : null,
    stage.plannedDurationMin ? formatMinutes(stage.plannedDurationMin) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function indicatorClass(state: StageProgress): string {
  const base =
    'relative z-[1] flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors';
  switch (state) {
    case 'done':
      return cn(base, 'bg-primary text-primary-foreground');
    case 'current':
      return cn(base, 'border-2 border-primary bg-background text-primary ring-4 ring-primary/15');
    case 'upcoming':
      return cn(base, 'border-2 border-default-200 bg-background text-default-400');
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

function connectorClass(filled: boolean): string {
  return cn('h-px min-w-4 flex-1', filled ? 'bg-primary' : 'bg-default-200');
}

interface BatchStagesProgressProps {
  stages: ProductionBatchStageDto[];
}

/** Горизонтальний progress steps етапів варки (Shadcn-подібний). */
export function BatchStagesProgress({ stages }: BatchStagesProgressProps) {
  return (
    <nav aria-label="Етапи варки">
      <ol className="scrollbar-hide flex w-full min-w-0 overflow-x-auto">
        {stages.map((stage, idx) => {
          const state = stageProgress(stage);
          const prevDone = idx > 0 && stageProgress(stages[idx - 1]) === 'done';
          const isLast = idx === stages.length - 1;
          const meta = stageMeta(stage);
          return (
            <li
              key={stage.id}
              className="flex min-w-[7rem] flex-1 flex-col items-center"
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <div className="flex w-full items-center">
                <span className={cn(connectorClass(prevDone), idx === 0 && 'bg-transparent')} aria-hidden />
                <span className={indicatorClass(state)}>
                  {state === 'done' ? <DynamicIcon name="check" size={14} /> : idx + 1}
                </span>
                <span className={cn(connectorClass(state === 'done'), isLast && 'bg-transparent')} aria-hidden />
              </div>
              <div className="mt-2.5 px-1.5 text-center">
                <p
                  className={cn(
                    'line-clamp-2 text-sm font-medium leading-snug',
                    state === 'upcoming' ? 'text-default-400' : 'text-default-900',
                  )}
                >
                  {stage.name}
                </p>
                {meta && <p className="mt-0.5 text-xs text-default-500">{meta}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
