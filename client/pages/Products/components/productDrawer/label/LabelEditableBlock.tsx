import { useState } from 'react';
import { LabelEditableZone } from './LabelEditableZone';

interface LabelEditableBlockProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  multiline?: boolean;
  ariaLabel: string;
  /** Типографіка на весь блок (префікс + текст). */
  className?: string;
  /** Класи лише для редагованої зони. */
  contentClassName?: string;
  style?: React.CSSProperties;
  /** Префікс перед редагованим текстом (наприклад, «Склад: »). */
  prefix?: string;
  prefixClassName?: string;
  muted?: boolean;
  /** Типографує значення при втраті фокусу. */
  typographOnBlur?: boolean;
}

/**
 * Редагований блок з суцільним outline на весь контент (включно з префіксом).
 */
export function LabelEditableBlock({
  value,
  onChange,
  disabled,
  multiline = false,
  ariaLabel,
  className = '',
  contentClassName = '',
  style,
  prefix,
  prefixClassName = 'font-bold',
  muted = false,
  typographOnBlur = false,
}: LabelEditableBlockProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div
      className={[
        'rounded-[2px] transition-shadow',
        className,
        !disabled && focused ? 'ring-2 ring-primary/50' : '',
        !disabled && !focused ? 'hover:ring-1 hover:ring-primary/30' : '',
      ].join(' ')}
      style={style}
    >
      {prefix ? <span className={prefixClassName}>{prefix}</span> : null}
      <LabelEditableZone
        ariaLabel={ariaLabel}
        value={value}
        onChange={onChange}
        disabled={disabled}
        multiline={multiline}
        muted={muted}
        typographOnBlur={typographOnBlur}
        noOutline
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={[disabled ? '' : 'cursor-text', contentClassName].join(' ')}
      />
    </div>
  );
}
