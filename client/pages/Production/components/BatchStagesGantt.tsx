import { useEffect, useMemo, useState } from 'react';
import { Tooltip } from '@heroui/react';
import { cn } from '@/lib/utils';
import type { ProductionBatchStageDto } from '@shared/types/production';
import { formatTemp } from './batchUi';
import { formatMinutes } from './techCardRecipe';

type StageState = 'done' | 'current' | 'upcoming';

const TICK_STEPS_MIN = [15, 30, 60, 120, 180, 240, 360, 480, 720];
const MAX_TICKS = 8;

function stageState(stage: ProductionBatchStageDto): StageState {
  if (stage.finishedAt) return 'done';
  if (stage.startedAt) return 'current';
  return 'upcoming';
}

function msToMin(ms: number): number {
  return ms / 60000;
}

/** Мітка осі: прошедший від старту варки час у форматі г:хх. */
function formatTick(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

function tickStep(spanMin: number): number {
  return TICK_STEPS_MIN.find((step) => spanMin / step <= MAX_TICKS) ?? Math.ceil(spanMin / MAX_TICKS / 60) * 60;
}

interface StageBar {
  stage: ProductionBatchStageDto;
  state: StageState;
  planStart: number;
  planDuration: number | null;
  /** Фактичний відрізок від старту варки, хв; null – етап ще не стартував */
  factStart: number | null;
  factEnd: number | null;
  overdue: boolean;
}

/** Хвилина «зараз», оновлюється раз на хвилину, лише поки якийсь етап триває. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

interface BatchStagesGanttProps {
  stages: ProductionBatchStageDto[];
}

/**
 * Етапи варки як діаграма Ганта: план (зсув від старту + тривалість) і факт (старт / фініш).
 * Вісь – час від старту варки (найраніший фактичний старт етапу).
 */
export function BatchStagesGantt({ stages }: BatchStagesGanttProps) {
  const running = stages.some((s) => s.startedAt && !s.finishedAt);
  const now = useNow(running);

  const { bars, span, step, nowMin } = useMemo(() => {
    const starts = stages.filter((s) => s.startedAt).map((s) => new Date(s.startedAt as string).getTime());
    const origin = starts.length > 0 ? Math.min(...starts) : null;

    const list: StageBar[] = stages.map((stage) => {
      const state = stageState(stage);
      const planStart = stage.plannedOffsetMin ?? 0;
      const planDuration = stage.plannedDurationMin && stage.plannedDurationMin > 0 ? stage.plannedDurationMin : null;
      let factStart: number | null = null;
      let factEnd: number | null = null;
      if (origin != null && stage.startedAt) {
        factStart = msToMin(new Date(stage.startedAt).getTime() - origin);
        factEnd = msToMin((stage.finishedAt ? new Date(stage.finishedAt).getTime() : now) - origin);
      }
      const planEnd = planStart + (planDuration ?? 0);
      const overdue = factEnd != null && planDuration != null && factEnd - planEnd > 5;
      return { stage, state, planStart, planDuration, factStart, factEnd, overdue };
    });

    const currentMin = origin != null && running ? msToMin(now - origin) : null;
    const maxEnd = Math.max(
      60,
      ...list.map((b) => b.planStart + (b.planDuration ?? 0)),
      ...list.map((b) => b.factEnd ?? 0),
      currentMin ?? 0,
    );
    const tick = tickStep(maxEnd);
    return { bars: list, span: Math.ceil(maxEnd / tick) * tick, step: tick, nowMin: currentMin };
  }, [stages, now, running]);

  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = 0; t <= span; t += step) out.push(t);
    return out;
  }, [span, step]);

  const pct = (min: number) => `${(Math.min(Math.max(min, 0), span) / span) * 100}%`;
  const hasFact = bars.some((b) => b.factStart != null);

  return (
    <div className="flex flex-col gap-2">
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="min-w-[560px]" role="table" aria-label="Етапи варки">
          {/* Вісь часу */}
          <div className="grid grid-cols-[minmax(9rem,14rem)_1fr] items-end gap-3 pb-1.5" role="row">
            <span className="text-xs text-default-500" role="columnheader">
              Номер і назва етапу
            </span>
            <div className="relative h-4" role="columnheader" aria-label="Час від старту варки">
              {ticks.map((t, idx) => (
                <span
                  key={t}
                  className={cn(
                    'absolute top-0 text-[11px] tabular-nums text-default-400',
                    idx === 0 ? 'translate-x-0' : idx === ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2',
                  )}
                  style={{ left: pct(t) }}
                >
                  {formatTick(t)}
                </span>
              ))}
            </div>
          </div>

          {bars.map((bar, idx) => (
            <GanttRow
              key={bar.stage.id}
              bar={bar}
              index={idx}
              ticks={ticks}
              nowMin={nowMin}
              pct={pct}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-default-500">
        <LegendItem className="h-2.5 w-5 rounded-sm border border-default-300 bg-default-100" label="План" />
        <LegendItem className="h-1.5 w-5 rounded-full bg-primary" label="Факт" />
        {hasFact && <LegendItem className="h-1.5 w-5 rounded-full bg-warning" label="Довше за план" />}
        {nowMin != null && <LegendItem className="h-3 w-px bg-danger" label="Зараз" />}
        {!hasFact && <span className="text-default-400">Факт зʼявиться після старту першого етапу</span>}
      </div>
    </div>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={className} aria-hidden />
      {label}
    </span>
  );
}

interface GanttRowProps {
  bar: StageBar;
  index: number;
  ticks: number[];
  nowMin: number | null;
  pct: (min: number) => string;
}

function GanttRow({ bar, index, ticks, nowMin, pct }: GanttRowProps) {
  const { stage, state, planStart, planDuration, factStart, factEnd, overdue } = bar;
  const meta = [
    planStart > 0 ? `+${formatMinutes(planStart)}` : 'від старту',
    planDuration ? formatMinutes(planDuration) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const tooltip = (
    <div className="flex flex-col gap-0.5 py-1 text-xs">
      <span className="font-semibold">{stage.name}</span>
      <span>
        План: {planStart > 0 ? `+${formatMinutes(planStart)}` : 'від старту'}
        {planDuration ? `, ${formatMinutes(planDuration)}` : ''}
      </span>
      {stage.startedAt && (
        <span>
          Старт: {formatClock(stage.startedAt)}
          {stage.startedByName ? ` · ${stage.startedByName}` : ''}
        </span>
      )}
      {stage.finishedAt && (
        <span>
          Фініш: {formatClock(stage.finishedAt)}
          {stage.finishedByName ? ` · ${stage.finishedByName}` : ''}
        </span>
      )}
      {factStart != null && factEnd != null && (
        <span>
          Факт: {formatMinutes(Math.max(1, Math.round(factEnd - factStart)))}
          {state === 'current' ? ' (триває)' : ''}
        </span>
      )}
      {stage.actualTemp && <span>Температура: {formatTemp(stage.actualTemp)}</span>}
    </div>
  );

  return (
    <div
      className="grid grid-cols-[minmax(9rem,14rem)_1fr] items-center gap-3 border-t border-default-200/70 py-1.5"
      role="row"
    >
      <div className="flex min-w-0 items-center gap-2" role="cell">
        <span
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
            state === 'done' && 'bg-primary text-primary-foreground',
            state === 'current' && 'border border-primary text-primary ring-2 ring-primary/15',
            state === 'upcoming' && 'border border-default-300 text-default-500',
          )}
        >
          {index + 1}
        </span>
        <div className="min-w-0">
          <p
            className={cn('truncate text-sm font-medium', state === 'upcoming' ? 'text-default-600' : 'text-default-900')}
            title={stage.name}
          >
            {stage.name}
          </p>
          <p className="truncate text-xs text-default-500 tabular-nums">{meta}</p>
        </div>
      </div>

      <Tooltip content={tooltip} placement="top" delay={250} closeDelay={0}>
        <div className="relative h-8" role="cell" aria-label={`${stage.name}: ${meta}`}>
          {ticks.map((t) => (
            <span key={t} className="absolute inset-y-0 w-px bg-default-100" style={{ left: pct(t) }} aria-hidden />
          ))}

          {planDuration ? (
            <span
              className="absolute top-1 flex h-4 items-center overflow-hidden rounded-sm border border-default-300 bg-default-100 px-1.5 text-[10px] leading-none text-default-500 tabular-nums"
              style={{ left: pct(planStart), width: `calc(${pct(planStart + planDuration)} - ${pct(planStart)})` }}
            >
              <span className="truncate">{formatMinutes(planDuration)}</span>
            </span>
          ) : (
            <span
              className="absolute top-1.5 size-2.5 -translate-x-1/2 rotate-45 rounded-[2px] bg-default-400"
              style={{ left: pct(planStart) }}
              aria-hidden
            />
          )}

          {factStart != null && factEnd != null && (
            <span
              className={cn(
                'absolute bottom-1 h-1.5 min-w-1.5 rounded-full',
                overdue ? 'bg-warning' : 'bg-primary',
                state === 'current' && 'animate-pulse',
              )}
              style={{ left: pct(factStart), width: `calc(${pct(factEnd)} - ${pct(factStart)})` }}
              aria-hidden
            />
          )}

          {nowMin != null && (
            <span className="absolute inset-y-0 w-px bg-danger" style={{ left: pct(nowMin) }} aria-hidden />
          )}
        </div>
      </Tooltip>
    </div>
  );
}
