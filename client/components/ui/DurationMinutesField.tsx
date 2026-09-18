import { useEffect, useMemo, useState } from 'react';
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
}

export function DurationMinutesField({
  label,
  description,
  minutes,
  onMinutesChange,
}: DurationMinutesFieldProps) {
  const safeMinutes = Math.max(0, minutes || 0);
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
    <div className="flex flex-col gap-1">
      <Input
        type="number"
        min={0}
        step={unit === 'minutes' ? 1 : 0.5}
        label={label}
        labelPlacement="outside"
        value={draft}
        onValueChange={(value) => {
          setDraft(value);
          onMinutesChange(parseDisplayValue(value, unit));
        }}
        description={hint ? `${description ?? ''}${description ? ' · ' : ''}${hint}` : description}
        classNames={{
          label: 'font-normal',
          inputWrapper: 'pr-0',
        }}
        endContent={
          <Select
            aria-label="Одиниця часу"
            selectedKeys={[unit]}
            className="w-[5.5rem] min-w-[5.5rem]"
            size="sm"
            variant="flat"
            classNames={{
              trigger: 'min-h-9 h-9 bg-transparent shadow-none px-2',
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
