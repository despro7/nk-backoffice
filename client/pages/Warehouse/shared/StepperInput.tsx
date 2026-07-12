import { useState, useRef, useImperativeHandle, useCallback, useEffect, forwardRef, useId } from 'react';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

// ---------------------------------------------------------------------------
// StepperInput
// ---------------------------------------------------------------------------

export interface StepperInputProps {
  label?: string;
  value?: number | null; // null = порожнє поле (не заповнено), відображається як 0
  onChange: (value: number) => void;
  onIncrement: () => void;
  onDecrement: () => void;
  forwardRef?: React.RefObject<HTMLInputElement>;
  onEnter?: () => void;
  onBlur?: () => void; // Викликається при втраті фокуса
  disabled?: boolean;
  max?: number; // Максимально допустиме значення (для обмеження по залишкам партії)
  size?: 'sm' | 'md' | 'lg'; // Візуальні налаштування розміру
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
  buttonClassName?: string;
}

/**
 * Сенсорне поле введення для touch-монітора.
 * Клік на центральну область фокусує прихований <input inputMode="numeric">,
 * що викликає системну екранну клавіатуру Windows (OSK).
 * Кнопки ± дозволяють коригувати значення без клавіатури.
 */
export const StepperInput = forwardRef<HTMLInputElement, StepperInputProps>(
  ({ label, value, onChange, onIncrement, onDecrement, onEnter, onBlur, disabled, max, size = 'md', className = '', labelClassName = '', inputClassName = '', buttonClassName = '' }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isFocused, setIsFocused] = useState(false);

    // null → порожнє поле, відображаємо як 0
    const displayValue = value ?? 0;

    const resolvedMax = typeof max === 'number' && Number.isFinite(max) && max >= 0 ? max : undefined;
    const isAtMax = resolvedMax !== undefined && displayValue >= resolvedMax;
    const isAtMin = displayValue <= 0;

    const focusInput = () => {
      if (disabled) return;
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.select(); // Виділяємо весь вміст інпуту при фокусі
    };

    const handleIncrement = useCallback(() => {
      if (disabled || isAtMax) return;
      onIncrement();
    }, [disabled, isAtMax, onIncrement]);

    const handleDecrement = useCallback(() => {
      if (disabled || isAtMin) return;
      onDecrement();
    }, [disabled, isAtMin, onDecrement]);

    useEffect(() => {
      if (disabled || resolvedMax === undefined) return;
      if (displayValue > resolvedMax) {
        onChange(resolvedMax);
      }
    }, [disabled, resolvedMax, onChange, value]);

    // Перенаправляємо ref якщо був переданий
    useImperativeHandle(ref, () => inputRef.current!);

    return (
      <div className={`flex flex-col items-center ${className ? `${className}` : 'gap-2'}`}>
        {label && <span className={`text-sm text-gray-500 ${labelClassName}`}>{label}</span>}
        <div className="relative w-full">
          {/* Видима область — клік відкриває OSK */}
          <div
            className={`w-full flex items-center justify-center font-medium transition-colors select-none ${
              size === 'sm' ? 'h-10 text-lg rounded-md border-1' : 
              size === 'lg' ? 'h-18 text-2xl rounded-lg border-2' : 
              'h-12 text-xl rounded-md border-1'
            } ${
              disabled
                ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                : `bg-white text-gray-800 cursor-text ${isFocused ? 'border-blue-500' : 'border-gray-200'}`
            } ${inputClassName}`}
            onClick={focusInput}
          >
            {displayValue}
          </div>

          {/* Прихований нативний input — отримує фокус → Windows OSK */}
          <input
            ref={inputRef}
            id={useId()}
            type="number"
            inputMode="numeric"
            value={displayValue}
            min={0}
            max={resolvedMax}
            disabled={disabled}
            onChange={(e) => {
              if (disabled) return;
              const v = parseInt(e.target.value, 10);
              const clamped = isNaN(v) ? 0 : Math.max(0, resolvedMax !== undefined ? Math.min(v, resolvedMax) : v);
              onChange(clamped);
            }}
            onKeyDown={(e) => {
              if (disabled) return;

              if (e.key === 'Enter' && onEnter) {
                e.preventDefault();
                onEnter();
                return;
              }

              if (e.key === '+' || e.key === '=' || e.key === 'ArrowUp') {
                e.preventDefault();
                handleIncrement();
                return;
              }

              if (e.key === '-' || e.key === 'ArrowDown') {
                e.preventDefault();
                handleDecrement();
              }
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setIsFocused(false);
              if (onBlur) onBlur();
            }}
            className="absolute inset-0 opacity-0 w-1 cursor-text [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            aria-label={label}
          />

          {/* Кнопки ± поверх прихованого input */}
          <Button
            isIconOnly
            variant="light"
            isDisabled={disabled}
            className={`absolute top-1/2 -translate-y-1/2 z-10 bg-gray-100 rounded-sm ${
              size === 'sm' ? 'h-8 min-w-7 w-7 left-1' : 
              size === 'lg' ? 'h-14 w-10 left-2' :
              'h-10 min-w-8 w-8 left-1'
            } ${buttonClassName}`}
            onPress={handleDecrement}
            tabIndex={-1}
            aria-label="Зменшити"
          >
            <DynamicIcon name="minus" className={`pointer-events-none flex-shrink-0 ${size === 'sm' ? 'h-4 w-4' : size === 'md' ? 'h-5 w-5' : 'h-6 w-6'}`} />
          </Button>
          <Button
            isIconOnly
            variant="light"
            isDisabled={disabled || isAtMax}
            className={`absolute top-1/2 -translate-y-1/2 z-10 bg-gray-100 rounded-sm ${
              size === 'sm' ? 'h-8 min-w-7 w-7 right-1' : 
              size === 'lg' ? 'h-14 w-10 right-2' :
              'h-10 min-w-8 w-8 right-1'
            } ${buttonClassName}`}
            onPress={handleIncrement}
            tabIndex={-1}
            aria-label="Збільшити"
          >
            <DynamicIcon name="plus" className={`pointer-events-none flex-shrink-0 ${size === 'sm' ? 'h-4 w-4' : size === 'md' ? 'h-5 w-5' : 'h-6 w-6'}`} />
          </Button>
        </div>
      </div>
    );
  }
);
StepperInput.displayName = 'StepperInput';
