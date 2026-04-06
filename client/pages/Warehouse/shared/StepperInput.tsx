import { useState, useRef, useImperativeHandle, useCallback, forwardRef } from 'react';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

// ---------------------------------------------------------------------------
// StepperInput
// ---------------------------------------------------------------------------

export interface StepperInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onIncrement: () => void;
  onDecrement: () => void;
  forwardRef?: React.RefObject<HTMLInputElement>;
  onEnter?: () => void;
  disabled?: boolean;
}

/**
 * Сенсорне поле введення для touch-монітора.
 * Клік на центральну область фокусує прихований <input inputMode="numeric">,
 * що викликає системну екранну клавіатуру Windows (OSK).
 * Кнопки ± дозволяють коригувати значення без клавіатури.
 */
export const StepperInput = forwardRef<HTMLInputElement, StepperInputProps>(
  ({ label, value, onChange, onIncrement, onDecrement, onEnter, disabled }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isFocused, setIsFocused] = useState(false);

    const focusInput = () => {
      if (!disabled) inputRef.current?.focus();
    };

    // Перенаправляємо ref якщо був переданий
    useImperativeHandle(ref, () => inputRef.current!);

    return (
      <div className="flex flex-col items-center gap-2">
        <span className="text-sm text-gray-500">{label}</span>
        <div className="relative w-full">
          {/* Видима область — клік відкриває OSK */}
          <div
            className={`w-full h-18 flex items-center justify-center text-2xl font-medium rounded-xl transition-colors select-none ${
              disabled
                ? 'bg-gray-100 border-2 border-gray-200 text-gray-400 cursor-not-allowed'
                : `bg-white border-2 text-gray-800 cursor-text ${
                    isFocused ? 'border-blue-500' : 'border-gray-200'
                  }`
            }`}
            onClick={focusInput}
          >
            {value}
          </div>

          {/* Прихований нативний input — отримує фокус → Windows OSK */}
          <input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            value={value}
            min={0}
            disabled={disabled}
            onChange={(e) => {
              if (disabled) return;
              const v = parseInt(e.target.value, 10);
              onChange(isNaN(v) ? 0 : Math.max(0, v));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && onEnter && !disabled) {
                e.preventDefault();
                onEnter();
              }
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className="absolute inset-0 opacity-0 w-full h-full cursor-text"
            aria-label={label}
          />

          {/* Кнопки ± поверх прихованого input */}
          <Button
            isIconOnly
            variant="light"
            isDisabled={disabled}
            className="absolute left-2 top-1/2 -translate-y-1/2 h-14 w-10 min-w-6 z-10 bg-gray-100"
            onPress={onDecrement}
            aria-label="Зменшити"
          >
            <DynamicIcon name="minus" className="w-6 h-6" />
          </Button>
          <Button
            isIconOnly
            variant="light"
            isDisabled={disabled}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-14 w-10 min-w-6 z-10 bg-gray-100"
            onPress={onIncrement}
            aria-label="Збільшити"
          >
            <DynamicIcon name="plus" className="w-6 h-6" />
          </Button>
        </div>
      </div>
    );
  }
);
StepperInput.displayName = 'StepperInput';
