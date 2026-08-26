import React from 'react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';

export type TimelineColor = 'amber' | 'sky' | 'primary' | 'success' | 'green' | 'purple' | 'pink';

export interface TimelineStep {
  key: string;
  label: string;
  icon: IconName;
}

/** Розміри одного брейкпоінту (моб або десктоп). Усі значення — px. */
export interface TimelineMetrics {
  /** Розмір іконки всередині кола */
  iconSize?: number;
  /** Внутрішній відступ кола навколо іконки */
  iconPadding?: number;
  /** Розмір підпису кроку */
  fontSize?: number;
  /** Відстань між колом і лінією-конектором */
  gap?: number;
  /** Мін. ширина лінії між кроками */
  connectorMinWidth?: number;
  /** Макс. ширина лінії між кроками */
  connectorMaxWidth?: number;
  /** Відступ підпису від кола */
  labelOffset?: number;
}

export interface TimelineIconColors {
  done?: string;
  current?: string;
  pending?: string;
  doneText?: string;
  currentText?: string;
  pendingText?: string;
}

export interface TimelineIconStyle {
  size?: number;
  padding?: number;
  colors?: TimelineIconColors;
}

const COLOR_PRESETS: Record<
  TimelineColor,
  {
    doneCircle: string;
    currentCircle: string;
    pendingCircle: string;
    doneLabel: string;
    currentLabel: string;
    pendingLabel: string;
    connectorDone: string;
    connectorPartial: string;
    connectorPending: string;
  }
> = {
  amber: {
    doneCircle: 'bg-amber-500 text-white',
    currentCircle: 'bg-orange-600 text-white',
    pendingCircle: 'bg-default-200 text-default-400',
    doneLabel: 'text-amber-600 font-medium',
    currentLabel: 'text-orange-600 font-medium',
    pendingLabel: 'text-default-400/80',
    connectorDone: 'bg-amber-500',
    connectorPartial: 'bg-amber-400/50',
    connectorPending: 'bg-default-200',
  },
  sky: {
    doneCircle: 'bg-sky-500 text-white',
    currentCircle: 'bg-sky-600 text-white',
    pendingCircle: 'bg-default-200 text-default-400',
    doneLabel: 'text-sky-600 font-medium',
    currentLabel: 'text-sky-700 font-medium',
    pendingLabel: 'text-default-400/80',
    connectorDone: 'bg-sky-500',
    connectorPartial: 'bg-sky-400/50',
    connectorPending: 'bg-default-200',
  },
  green: {
    doneCircle: 'bg-green-500 text-white',
    currentCircle: 'bg-green-600 text-white',
    pendingCircle: 'bg-default-200 text-default-400',
    doneLabel: 'text-green-600 font-medium',
    currentLabel: 'text-green-700 font-medium',
    pendingLabel: 'text-default-400/80',
    connectorDone: 'bg-green-500',
    connectorPartial: 'bg-green-400/50',
    connectorPending: 'bg-default-200',
  },
  purple: {
    doneCircle: 'bg-purple-500 text-white',
    currentCircle: 'bg-purple-600 text-white',
    pendingCircle: 'bg-default-200 text-default-400',
    doneLabel: 'text-purple-600 font-medium',
    currentLabel: 'text-purple-700 font-medium',
    pendingLabel: 'text-default-400/80',
    connectorDone: 'bg-purple-500',
    connectorPartial: 'bg-purple-400/50',
    connectorPending: 'bg-default-200',
  },
  pink: {
    doneCircle: 'bg-pink-500 text-white',
    currentCircle: 'bg-pink-600 text-white',
    pendingCircle: 'bg-default-200 text-default-400',
    doneLabel: 'text-pink-600 font-medium',
    currentLabel: 'text-pink-700 font-medium',
    pendingLabel: 'text-default-400/80',
    connectorDone: 'bg-pink-500',
    connectorPartial: 'bg-pink-400/50',
    connectorPending: 'bg-default-200',
  },
  primary: {
    doneCircle: 'bg-primary text-white',
    currentCircle: 'bg-primary text-white',
    pendingCircle: 'bg-default-200 text-default-400',
    doneLabel: 'text-primary font-medium',
    currentLabel: 'text-primary font-medium',
    pendingLabel: 'text-default-400/80',
    connectorDone: 'bg-primary',
    connectorPartial: 'bg-primary/50',
    connectorPending: 'bg-default-200',
  },
  success: {
    doneCircle: 'bg-success-500 text-white',
    currentCircle: 'bg-success-600 text-white',
    pendingCircle: 'bg-default-200 text-default-400',
    doneLabel: 'text-success-600 font-medium',
    currentLabel: 'text-success-700 font-medium',
    pendingLabel: 'text-default-400/80',
    connectorDone: 'bg-success-500',
    connectorPartial: 'bg-success-400/50',
    connectorPending: 'bg-default-200',
  },
};

const DEFAULT_MOBILE: Required<TimelineMetrics> = {
  iconSize: 12,
  iconPadding: 6,
  fontSize: 11,
  gap: 6,
  connectorMinWidth: 24,
  connectorMaxWidth: 80,
  labelOffset: 4,
};

const DEFAULT_DESKTOP: Required<TimelineMetrics> = {
  iconSize: 14,
  iconPadding: 7,
  fontSize: 14,
  gap: 8,
  connectorMinWidth: 80,
  connectorMaxWidth: 200,
  labelOffset: 6,
};

export interface TimelineProps {
  steps: TimelineStep[];
  currentKey: string;
  color?: TimelineColor;
  /** Додаткові класи обгортки */
  className?: string;
  /** Inline-стилі обгортки */
  style?: React.CSSProperties;
  /** Стиль іконок: розмір/padding (якщо не задано в mobile/desktop) і кастомні кольори */
  icon?: TimelineIconStyle;
  /** Розмір підпису (fallback, якщо не задано в metrics) */
  fontSize?: number;
  /** Відстань між кроками (fallback) */
  gap?: number;
  /** Метрики для мобільної версії (за замовчуванням) */
  mobile?: TimelineMetrics;
  /** Метрики для десктопу (md+) */
  desktop?: TimelineMetrics;
  classNames?: {
    wrapper?: string;
    step?: string;
    icon?: string;
    label?: string;
    connector?: string;
  };
}

function mergeMetrics(
  base: Required<TimelineMetrics>,
  override?: TimelineMetrics,
  icon?: TimelineIconStyle,
  fallback?: { fontSize?: number; gap?: number },
): Required<TimelineMetrics> {
  return {
    iconSize: override?.iconSize ?? icon?.size ?? base.iconSize,
    iconPadding: override?.iconPadding ?? icon?.padding ?? base.iconPadding,
    fontSize: override?.fontSize ?? fallback?.fontSize ?? base.fontSize,
    gap: override?.gap ?? fallback?.gap ?? base.gap,
    connectorMinWidth: override?.connectorMinWidth ?? base.connectorMinWidth,
    connectorMaxWidth: override?.connectorMaxWidth ?? base.connectorMaxWidth,
    labelOffset: override?.labelOffset ?? base.labelOffset,
  };
}

function circlePx(m: Required<TimelineMetrics>): number {
  return m.iconSize + m.iconPadding * 2;
}

export default function Timeline({
  steps,
  currentKey,
  color = 'amber',
  className,
  style,
  icon,
  fontSize,
  gap,
  mobile,
  desktop,
  classNames,
}: TimelineProps) {
  const preset = COLOR_PRESETS[color];
  const m = mergeMetrics(DEFAULT_MOBILE, mobile, icon, { fontSize, gap });
  const d = mergeMetrics(DEFAULT_DESKTOP, desktop, icon, { fontSize, gap });
  const currentIndex = Math.max(0, steps.findIndex((s) => s.key === currentKey));
  const customColors = icon?.colors;

  const vars = {
    '--tl-circle': `${circlePx(m)}px`,
    '--tl-circle-md': `${circlePx(d)}px`,
    '--tl-icon': `${m.iconSize}px`,
    '--tl-icon-md': `${d.iconSize}px`,
    '--tl-font': `${m.fontSize}px`,
    '--tl-font-md': `${d.fontSize}px`,
    '--tl-gap': `${m.gap}px`,
    '--tl-gap-md': `${d.gap}px`,
    '--tl-conn-min': `${m.connectorMinWidth}px`,
    '--tl-conn-min-md': `${d.connectorMinWidth}px`,
    '--tl-conn-max': `${m.connectorMaxWidth}px`,
    '--tl-conn-max-md': `${d.connectorMaxWidth}px`,
    '--tl-label-off': `${m.labelOffset}px`,
    '--tl-label-off-md': `${d.labelOffset}px`,
  } as React.CSSProperties;

  return (
    <div
      className={cn(
        'flex w-full items-center justify-center pb-6',
        'md:[--tl-circle:var(--tl-circle-md)] md:[--tl-icon:var(--tl-icon-md)]',
        'md:[--tl-font:var(--tl-font-md)] md:[--tl-gap:var(--tl-gap-md)]',
        'md:[--tl-conn-min:var(--tl-conn-min-md)] md:[--tl-conn-max:var(--tl-conn-max-md)]',
        'md:[--tl-label-off:var(--tl-label-off-md)]',
        className,
        classNames?.wrapper,
      )}
      style={{ ...vars, gap: 'var(--tl-gap)', ...style }}
    >
      {steps.map((step, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isLast = index === steps.length - 1;
        const nextDone = !isLast && index + 1 <= currentIndex;

        const circleClass = customColors
          ? ''
          : isDone
            ? preset.doneCircle
            : isCurrent
              ? preset.currentCircle
              : preset.pendingCircle;

        const circleStyle: React.CSSProperties | undefined = customColors
          ? {
              backgroundColor: isDone
                ? customColors.done
                : isCurrent
                  ? customColors.current
                  : customColors.pending,
              color: isDone
                ? customColors.doneText ?? '#fff'
                : isCurrent
                  ? customColors.currentText ?? '#fff'
                  : customColors.pendingText ?? undefined,
            }
          : undefined;

        const labelClass = isDone
          ? preset.doneLabel
          : isCurrent
            ? preset.currentLabel
            : preset.pendingLabel;

        const connectorClass = isDone && nextDone
          ? preset.connectorDone
          : isDone
            ? preset.connectorPartial
            : preset.connectorPending;

        return (
          <React.Fragment key={step.key}>
            <div
              className={cn('relative shrink-0', classNames?.step)}
              style={{ width: 'var(--tl-circle)', height: 'var(--tl-circle)' }}
            >
              <div
                className={cn(
                  'flex items-center justify-center rounded-full w-full h-full',
                  circleClass,
                  classNames?.icon,
                )}
                style={circleStyle}
              >
                <DynamicIcon
                  name={step.icon}
                  size={d.iconSize}
                  className="shrink-0"
                  style={{ width: 'var(--tl-icon)', height: 'var(--tl-icon)' }}
                />
              </div>
              <span
                className={cn(
                  'absolute left-1/2 -translate-x-1/2 whitespace-nowrap leading-tight',
                  labelClass,
                  classNames?.label,
                )}
                style={{
                  top: '100%',
                  marginTop: 'var(--tl-label-off)',
                  fontSize: 'var(--tl-font)',
                }}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={cn('h-0.5 flex-1 rounded-full', connectorClass, classNames?.connector)}
                style={{
                  minWidth: 'var(--tl-conn-min)',
                  maxWidth: 'var(--tl-conn-max)',
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
