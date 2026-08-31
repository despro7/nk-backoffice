import { useCallback, useEffect, useRef, useState, type ComponentProps, type FocusEvent, type WheelEvent } from 'react';
import { Input } from '@heroui/react';
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

export interface NumberInputProps
  extends Omit<HeroInputProps, 'type' | 'inputMode' | 'value' | 'onValueChange'> {
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

  return (
    <Input
      {...rest}
      ref={inputRef}
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
    />
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
