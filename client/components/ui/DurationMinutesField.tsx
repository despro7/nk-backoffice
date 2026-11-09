import { useEffect, useMemo, useRef, useState } from 'react';
import { Input, Select, SelectItem } from '@heroui/react';

export type DurationUnit = 'minutes' | 'hours' | 'days';

const UNIT_FACTORS: Record<DurationUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

const UNIT_LABELS: Record<DurationUnit, string> = {
  minutes: 'хв',
  hours: 'год',
  days: 'днів',
};

function pickDisplayUnit(totalMinutes: number): DurationUnit {
  if (!totalMinutes || totalMinutes <= 0) return 'minutes';
  if (totalMinutes % UNIT_FACTORS.days === 0) return 'days';
  if (totalMinutes % UNIT_FACTORS.hours === 0) return 'hours';
  return 'minutes';
}

function formatDisplayValue(totalMinutes: number, unit: DurationUnit): string {
  const raw = totalMinutes / UNIT_FACTORS[unit];
  if (!Number.isFinite(raw) || raw <= 0) return '0';
  if (Number.isInteger(raw)) return String(raw);
  return String(Math.round(raw * 10) / 10);
}

function parseDisplayValue(value: string, unit: DurationUnit): number {
  const parsed = Number(value.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * UNIT_FACTORS[unit]);
}

interface DurationMinutesFieldProps {
  label: string;
  description?: string;
  minutes: number;
  onMinutesChange: (minutes: number) => void;
  /** Компактний вигляд: size sm, рамка, маленька сіра мітка над полем */
  compact?: boolean;
}

export function DurationMinutesField({
  label,
  description,
  minutes,
  onMinutesChange,
  compact = false,
}: DurationMinutesFieldProps) {
  const safeMinutes = Math.max(0, minutes || 0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Колесо миші над сфокусованим number-полем змінює значення: знімаємо фокус, сторінка прокручується далі
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onWheel = () => {
      if (document.activeElement === el) el.blur();
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const [unit, setUnit] = useState<DurationUnit>(() => pickDisplayUnit(safeMinutes));
  const [draft, setDraft] = useState(() => formatDisplayValue(safeMinutes, pickDisplayUnit(safeMinutes)));

  useEffect(() => {
    const nextUnit = pickDisplayUnit(safeMinutes);
    setUnit(nextUnit);
    setDraft(formatDisplayValue(safeMinutes, nextUnit));
  }, [safeMinutes]);

  const hint = useMemo(() => {
    if (safeMinutes <= 0) return 'Вимкнено';
    if (unit === 'minutes') return null;
    return `≈ ${safeMinutes} хв`;
  }, [safeMinutes, unit]);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {compact && (
        <span className="text-xs text-default-500">
          {label}
          {(safeMinutes <= 0 || hint) && (
            <span className="text-default-400">
              {safeMinutes <= 0 ? ' · 0 – вимкнено' : ` ${hint}`}
            </span>
          )}
        </span>
      )}
      <Input
        ref={inputRef}
        type="number"
        min={0}
        step={unit === 'minutes' ? 1 : 0.5}
        label={compact ? undefined : label}
        aria-label={compact ? label : undefined}
        labelPlacement={compact ? undefined : 'outside'}
        size={compact ? 'md' : undefined}
        value={draft}
        onValueChange={(value) => {
          setDraft(value);
          onMinutesChange(parseDisplayValue(value, unit));
        }}
        description={
          compact
            ? description
            : hint
              ? `${description ?? ''}${description ? ' · ' : ''}${hint}`
              : description
        }
        classNames={{
          label: 'font-normal',
          inputWrapper: compact ? 'pr-0 border-1 border-default-200' : 'pr-0',
        }}
        endContent={
          <Select
            aria-label="Одиниця часу"
            selectedKeys={[unit]}
            className="w-[5.5rem] min-w-[5.5rem]"
            size="sm"
            variant="flat"
            classNames={{
              trigger: compact
                ? 'min-h-9 h-9 bg-transparent shadow-none px-2 data-[hover=true]:bg-transparent'
                : 'min-h-9 h-9 bg-transparent shadow-none px-2',
              value: 'text-sm',
            }}
            onSelectionChange={(keys) => {
              const next = Array.from(keys)[0] as DurationUnit | undefined;
              if (!next || next === unit) return;
              setUnit(next);
              setDraft(formatDisplayValue(safeMinutes, next));
            }}
          >
            {(Object.keys(UNIT_LABELS) as DurationUnit[]).map((key) => (
              <SelectItem key={key} textValue={UNIT_LABELS[key]}>
                {UNIT_LABELS[key]}
              </SelectItem>
            ))}
          </Select>
        }
      />
    </div>
  );
}
