import { useCallback, useEffect, useRef } from 'react';
import { typographUk } from '@shared/utils/typograph';

/**
 * Стилі outline для редагованих зон на Canvas.
 * Налаштування: змініть класи нижче (hover/focus ring).
 */
export const LABEL_EDITABLE_OUTLINE_CLASSES =
  'cursor-text rounded-[2px] ring-0 transition-shadow hover:ring-1 hover:ring-primary/30 focus:ring-2 focus:ring-primary/50';

interface LabelEditableZoneProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  multiline?: boolean;
  ariaLabel: string;
  /** М’яке підсвічування незаповненого або невалідного поля. */
  muted?: boolean;
  /** Вимикає власний outline (для використання в LabelEditableBlock). */
  noOutline?: boolean;
  /** Типографує значення при втраті фокусу (неразривні пробіли, лапки тощо). */
  typographOnBlur?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function LabelEditableZone({
  value,
  onChange,
  disabled,
  className = '',
  style,
  multiline = false,
  ariaLabel,
  muted = false,
  noOutline = false,
  typographOnBlur = false,
  onFocus,
  onBlur,
}: LabelEditableZoneProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    if (el.textContent !== value) {
      el.textContent = value;
    }
  }, [value]);

  const handleInput = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    onChange(multiline ? (el.innerText ?? '') : (el.textContent ?? ''));
  }, [onChange, multiline]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    if (!multiline) {
      e.preventDefault();
      ref.current?.blur();
      return;
    }
    // BR замість <div>, щоб не ламати міжрядковий інтервал.
    e.preventDefault();
    document.execCommand('insertLineBreak');
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  const handleBlur = useCallback(() => {
    if (typographOnBlur && !disabled) {
      const el = ref.current;
      if (!el) return;
      const raw = multiline ? (el.innerText ?? '') : (el.textContent ?? '');
      const next = typographUk(raw);
      if (next !== raw) {
        el.textContent = next;
        onChange(next);
      }
    }
    onBlur?.();
  }, [typographOnBlur, disabled, multiline, onChange, onBlur]);

  return (
    <div
      ref={ref}
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline={multiline}
      contentEditable={!disabled}
      suppressContentEditableWarning
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onFocus={onFocus}
      onBlur={handleBlur}
      className={[
        'outline-none',
        muted ? 'text-black/35' : '',
        disabled ? 'cursor-default' : noOutline ? 'cursor-text' : LABEL_EDITABLE_OUTLINE_CLASSES,
        multiline ? '[&_div]:m-0 [&_div]:inline [&_div]:p-0 [&_div]:leading-[inherit]' : '',
        className,
      ].join(' ')}
      style={style}
    />
  );
}
