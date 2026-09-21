import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type FocusEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';
import { Input, Tooltip, type TooltipProps } from '@heroui/react';
import { cn } from '@/lib/utils';
import {
  formatNumberInput,
  formatNumberInputFromRaw,
  isZeroInput,
  parseNumberInput,
  sanitizeNumberInput,
  type DecimalSeparator,
} from '@/lib/numberInput';

type HeroInputProps = ComponentProps<typeof Input>;

/** Параметри HeroUI Tooltip без `children`. */
export type NumberInputTooltipProps = Omit<TooltipProps, 'children'>;

const NUMBER_INPUT_TOOLTIP_DEFAULTS = {
  color: 'default',
  placement: 'top',
  showArrow: true,
  delay: 200,
  classNames: {
    base: 'before:rounded-[2px] before:z-[10] before:shadow-[1px_1px_1px_rgba(0,0,0,0.08)]',
    content: 'rounded-sm',
  },
} as const satisfies Partial<NumberInputTooltipProps>;

export interface NumberInputProps
  extends Omit<HeroInputProps, 'type' | 'inputMode' | 'value' | 'onValueChange'> {
  /**
   * Обгортає поле в Tooltip.
   * `true` — дефолти; `content` за замовчуванням береться з `aria-label`.
   */
  tooltip?: boolean | NumberInputTooltipProps;
  value: string;
  onValueChange: (value: string) => void;
  decimalSeparator?: DecimalSeparator;
  decimalPlaces?: number;
  min?: number;
  max?: number;
  step?: number;
  /** Блокує зміну значення колесом (без blur). */
  disableMouseWheel?: boolean;
  /** Якщо в полі 0 — виділити значення при фокусі. */
  selectZeroOnFocus?: boolean;
  formatOnBlur?: boolean;
  emptyOnBlur?: 'keep' | 'min';
  trimTrailingZeros?: boolean;
  allowNegative?: boolean;
}

const SPIN_HIDE =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

function wrapNumberInputWithTooltip(
  node: ReactNode,
  tooltip: NumberInputProps['tooltip'],
  ariaLabel: HeroInputProps['aria-label'],
): ReactNode {
  if (!tooltip) return node;

  const config: NumberInputTooltipProps = typeof tooltip === 'boolean' ? {} : tooltip;
  const content = config.content ?? ariaLabel;
  if (content == null || content === '') return node;

  const {
    content: _content,
    color = NUMBER_INPUT_TOOLTIP_DEFAULTS.color,
    placement = NUMBER_INPUT_TOOLTIP_DEFAULTS.placement,
    showArrow = NUMBER_INPUT_TOOLTIP_DEFAULTS.showArrow,
    delay = NUMBER_INPUT_TOOLTIP_DEFAULTS.delay,
    classNames,
    ...tooltipRest
  } = config;

  return (
    <Tooltip
      {...tooltipRest}
      content={content}
      color={color}
      placement={placement}
      showArrow={showArrow}
      delay={delay}
      classNames={{
        base: cn(NUMBER_INPUT_TOOLTIP_DEFAULTS.classNames.base, classNames?.base),
        content: cn(NUMBER_INPUT_TOOLTIP_DEFAULTS.classNames.content, classNames?.content),
      }}
    >
      {node}
    </Tooltip>
  );
}

export function NumberInput({
  value,
  onValueChange,
  decimalSeparator = ',',
  decimalPlaces = 2,
  min,
  max,
  step,
  disableMouseWheel = true,
  selectZeroOnFocus = true,
  formatOnBlur = true,
  emptyOnBlur = 'keep',
  trimTrailingZeros = false,
  allowNegative,
  tooltip,
  'aria-label': ariaLabel,
  onBlur,
  onFocus,
  onWheel,
  classNames,
  ...rest
}: NumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const negative = allowNegative ?? (min != null && min < 0);

  // React вішає onWheel як passive — preventDefault там лише спамить консоль.
  useEffect(() => {
    if (!disableMouseWheel) return;
    const el = inputRef.current;
    if (!el) return;
    const blockWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
    };
    el.addEventListener('wheel', blockWheel, { passive: false });
    return () => el.removeEventListener('wheel', blockWheel);
  }, [disableMouseWheel]);

  const handleValueChange = useCallback(
    (next: string) => {
      onValueChange(
        sanitizeNumberInput(next, {
          decimalSeparator,
          decimalPlaces,
          allowNegative: negative,
        }),
      );
    },
    [onValueChange, decimalSeparator, decimalPlaces, negative],
  );

  const handleFocus = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      onFocus?.(e);
      if (!selectZeroOnFocus || !isZeroInput(e.currentTarget.value)) return;
      const el = e.currentTarget;
      requestAnimationFrame(() => el.select());
    },
    [onFocus, selectZeroOnFocus],
  );

  const handleBlur = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      if (formatOnBlur) {
        const next = formatNumberInputFromRaw(value, {
          decimalSeparator,
          decimalPlaces,
          allowNegative: negative,
          trimTrailingZeros,
          min,
          max,
          emptyAs: emptyOnBlur,
        });
        if (next !== value) onValueChange(next);
      }
      onBlur?.(e);
    },
    [
      formatOnBlur,
      value,
      onValueChange,
      emptyOnBlur,
      onBlur,
      decimalSeparator,
      decimalPlaces,
      negative,
      min,
      max,
      trimTrailingZeros,
    ],
  );

  const handleWheel = useCallback(
    (e: WheelEvent<HTMLInputElement>) => {
      onWheel?.(e);
    },
    [onWheel],
  );

  return wrapNumberInputWithTooltip(
    <Input
      {...rest}
      ref={inputRef}
      aria-label={ariaLabel}
      type="text"
      inputMode={decimalPlaces > 0 ? 'decimal' : 'numeric'}
      value={value}
      min={min}
      max={max}
      step={step}
      onValueChange={handleValueChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onWheel={onWheel ? handleWheel : undefined}
      classNames={{
        ...classNames,
        input: cn(SPIN_HIDE, classNames?.input),
      }}
    />,
    tooltip,
    ariaLabel,
  );
}

export interface NumberInputFromNumberProps
  extends Omit<NumberInputProps, 'value' | 'onValueChange' | 'onChange'> {
  value: number;
  onChange: (value: number) => void;
}

/** Адаптер, коли зовнішній стан — `number` (чернетка рядка всередині). */
export function NumberInputFromNumber({
  value,
  onChange,
  decimalPlaces = 2,
  trimTrailingZeros = true,
  min,
  max,
  onFocus,
  onBlur,
  ...rest
}: NumberInputFromNumberProps) {
  const focusedRef = useRef(false);
  const [text, setText] = useState(() =>
    formatNumberInput(value, { decimalPlaces, trimTrailingZeros, min, max }),
  );

  useEffect(() => {
    if (!focusedRef.current) {
      setText(formatNumberInput(value, { decimalPlaces, trimTrailingZeros, min, max }));
    }
  }, [value, decimalPlaces, trimTrailingZeros, min, max]);

  return (
    <NumberInput
      {...rest}
      min={min}
      max={max}
      decimalPlaces={decimalPlaces}
      trimTrailingZeros={trimTrailingZeros}
      value={text}
      onValueChange={(v) => {
        setText(v);
        const n = parseNumberInput(v);
        if (n != null) onChange(n);
      }}
      onFocus={(e) => {
        focusedRef.current = true;
        onFocus?.(e);
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        onBlur?.(e);
      }}
    />
  );
}
