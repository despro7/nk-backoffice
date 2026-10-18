import { useEffect, useRef, useState } from 'react';
import { Button, DatePicker, Spinner } from '@heroui/react';
import { I18nProvider } from '@react-aria/i18n';
import {
  fromDate,
  getLocalTimeZone,
  now,
  toCalendarDateTime,
  toZoned,
} from '@internationalized/date';
import type { DateValue } from '@internationalized/date';

// ---------------------------------------------------------------------------
// DateTimePicker — універсальний DatePicker з пресетами часу
// ---------------------------------------------------------------------------

interface PresetTime {
  label: string;
  hour: number | null;
  minute: number | null;
}

const DEFAULT_PRESETS: PresetTime[] = [
  { label: '9:00',  hour: 9,    minute: 0    },
  { label: '16:00', hour: 16,   minute: 0    },
  { label: 'Зараз', hour: null, minute: null },
];

const MIN_COMMIT_YEAR = 1000;
const MAX_COMMIT_YEAR = 9999;

interface WarehouseDateTimePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  onOpenChange?: (isOpen: boolean) => void;
  label?: string | React.ReactNode;
  labelPlacement?: 'outside-left' | 'outside' | 'inside';
  isDisabled?: boolean;
  isLoading?: boolean;
  presets?: PresetTime[];
  labelStyle?: string;
  inputStyle?: string;
  size?: 'sm' | 'md' | 'lg';
}

const isValidJsDate = (date: Date): boolean => {
  if (Number.isNaN(date.getTime())) return false;
  const year = date.getFullYear();
  return year >= MIN_COMMIT_YEAR && year <= MAX_COMMIT_YEAR;
};

const jsDateToZoned = (date: Date): DateValue => fromDate(date, getLocalTimeZone());

const dateValueToZoned = (dateValue: DateValue): DateValue => {
  if ('timeZone' in dateValue) return dateValue;
  return toZoned(toCalendarDateTime(dateValue), getLocalTimeZone());
};

const isCommitReady = (dateValue: DateValue): boolean =>
  dateValue.year >= MIN_COMMIT_YEAR && dateValue.year <= MAX_COMMIT_YEAR;

// Конвертуємо DateValue назад у JS Date
const fromDateValue = (dateValue: DateValue): Date => {
  const hours   = 'hour'   in dateValue ? dateValue.hour   : 0;
  const minutes = 'minute' in dateValue ? dateValue.minute : 0;
  return new Date(dateValue.year, dateValue.month - 1, dateValue.day, hours, minutes);
};

export const DateTimePicker = ({
  value,
  onChange,
  onOpenChange,
  label = 'Дата і час',
  labelPlacement = 'outside-left',
  labelStyle = 'text-[13px] text-gray-500 max-w-26 leading-tight text-right pr-1',
  inputStyle = 'hover:bg-white focus-within:bg-white!',
  size = 'md',
  isDisabled = false,
  isLoading = false,
  presets = DEFAULT_PRESETS,
}: WarehouseDateTimePickerProps) => {
  const committedMsRef = useRef(isValidJsDate(value) ? value.getTime() : Date.now());
  const [pickerValue, setPickerValue] = useState<DateValue>(() =>
    jsDateToZoned(isValidJsDate(value) ? value : new Date()),
  );

  useEffect(() => {
    if (!isValidJsDate(value)) return;
    if (value.getTime() === committedMsRef.current) return;
    committedMsRef.current = value.getTime();
    setPickerValue(jsDateToZoned(value));
  }, [value]);

  const handleChange = (dateValue: DateValue | null) => {
    if (!dateValue) return;
    setPickerValue(dateValueToZoned(dateValue));
    if (!isCommitReady(dateValue)) return;
    const next = fromDateValue(dateValue);
    committedMsRef.current = next.getTime();
    onChange(next);
  };

  return (
    <I18nProvider locale="uk-UA">
      <DatePicker
        showMonthAndYearPickers
        value={pickerValue}
        onChange={handleChange}
        onOpenChange={onOpenChange}
        granularity="minute"
        hideTimeZone
        hourCycle={24}
        shouldForceLeadingZeros
        label={label}
        labelPlacement={labelPlacement}
        selectorButtonPlacement="start"
        size={size}
        isDisabled={isDisabled}
        maxValue={now(getLocalTimeZone())}
        popoverProps={{ shouldCloseOnScroll: false }}
        classNames={{
          base: 'w-fit',
          inputWrapper: inputStyle,
          segment: 'rounded focus:bg-neutral-300/80',
          label: labelStyle,
        }}
        endContent={isLoading ? <Spinner size="sm" color="primary" /> : undefined}
        CalendarBottomContent={
          <div className="px-3 pb-3 flex items-center gap-1">
            {presets.map(({ label: presetLabel, hour, minute }) => (
              <Button
                key={presetLabel}
                size="sm"
                variant="flat"
                className="h-auto px-2 py-1.5 min-w-0 flex-auto"
                onPress={() => {
                  if (hour === null) {
                    onChange(new Date());
                  } else {
                    onChange(new Date(value.getFullYear(), value.getMonth(), value.getDate(), hour, minute ?? 0));
                  }
                }}
              >
                {presetLabel}
              </Button>
            ))}
          </div>
        }
      />
    </I18nProvider>
  );
};
