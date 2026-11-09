import { useState } from 'react';
import { Button, TimeInput, Tooltip } from '@heroui/react';
import { Time } from '@internationalized/date';
import { DynamicIcon } from 'lucide-react/dynamic';
import { NumberInputFromNumber } from '@/components/NumberInput';

const MINUTES_PER_DAY = 1440;
const WRAPPER_CLASS = 'border-1 border-default-200';

interface DurationHmFieldProps {
  label: string;
  /** Тривалість у хвилинах; 0 – не задано */
  minutes: number;
  onMinutesChange: (minutes: number) => void;
}

/**
 * Тривалість «години : хвилини» (TimeInput як поле тривалості, не час доби).
 * Дні – рідкісний випадок: вмикаються кнопкою поруч.
 */
export function DurationHmField({ label, minutes, onMinutesChange }: DurationHmFieldProps) {
  const total = Math.max(0, Math.round(minutes || 0));
  const days = Math.floor(total / MINUTES_PER_DAY);
  const rest = total % MINUTES_PER_DAY;
  const [showDays, setShowDays] = useState(days > 0);
  const daysVisible = showDays || days > 0;

  const emit = (nextDays: number, hours: number, mins: number) =>
    onMinutesChange(Math.max(0, nextDays) * MINUTES_PER_DAY + hours * 60 + mins);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-default-500">
        {label}
        {total === 0 && <span className="text-default-400"> · 00:00 – вимкнено</span>}
      </span>
      <div className="flex items-center gap-2">
        {daysVisible && (
          <NumberInputFromNumber
            size="md"
            aria-label={`${label}, днів`}
            className="w-24 shrink-0"
            value={days}
            min={0}
            max={30}
            decimalPlaces={0}
            classNames={{ inputWrapper: WRAPPER_CLASS }}
            endContent={<span className="text-xs text-default-400">дн.</span>}
            onChange={(d) => emit(d, Math.floor(rest / 60), rest % 60)}
          />
        )}
        <TimeInput
          size="md"
          aria-label={`${label}, години і хвилини`}
          className="min-w-0 flex-1"
          hourCycle={24}
          granularity="minute"
          value={new Time(Math.floor(rest / 60), rest % 60)}
          classNames={{ inputWrapper: WRAPPER_CLASS, segment: 'rounded focus:bg-default-300/75' }}
          onChange={(t) => emit(days, t?.hour ?? 0, t?.minute ?? 0)}
        />
        <Tooltip
          content={
            daysVisible
              ? 'Прибрати дні: лишаються лише години і хвилини'
              : 'Додати дні – для тривалості понад 24 години'
          }
          classNames={{ content: 'text-xs' }}
          delay={300}
        >
          <Button
            size="md"
            variant="light"
            isIconOnly
            className="shrink-0 text-default-500"
            aria-label={daysVisible ? 'Прибрати дні' : 'Додати дні'}
            onPress={() => {
              if (daysVisible) {
                setShowDays(false);
                if (days > 0) emit(0, Math.floor(rest / 60), rest % 60);
              } else {
                setShowDays(true);
              }
            }}
          >
            <DynamicIcon name={daysVisible ? 'calendar-minus' : 'calendar-plus'} size={16} />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
