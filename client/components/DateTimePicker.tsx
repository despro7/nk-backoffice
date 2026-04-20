import { Button, DatePicker, Spinner } from '@heroui/react';
import { I18nProvider } from '@react-aria/i18n';
import { getLocalTimeZone, now, parseZonedDateTime } from '@internationalized/date';
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

interface WarehouseDateTimePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  label?: string;
  isDisabled?: boolean;
  isLoading?: boolean;
  presets?: PresetTime[];
}

// Конвертуємо JS Date в ZonedDateTime для DatePicker
const toZonedDateTime = (date: Date): DateValue => {
  const year   = date.getFullYear();
  const month  = String(date.getMonth() + 1).padStart(2, '0');
  const day    = String(date.getDate()).padStart(2, '0');
  const hours  = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return parseZonedDateTime(`${year}-${month}-${day}T${hours}:${minutes}:00[${getLocalTimeZone()}]`);
};

// Конвертуємо DateValue назад у JS Date
const fromDateValue = (dateValue: DateValue): Date => {
  const hours   = 'hour'   in dateValue ? dateValue.hour   : 0;
  const minutes = 'minute' in dateValue ? dateValue.minute : 0;
  return new Date(dateValue.year, dateValue.month - 1, dateValue.day, hours, minutes);
};

export const DateTimePicker = ({
  value,
  onChange,
  label = 'Дата і час',
  isDisabled = false,
  isLoading = false,
  presets = DEFAULT_PRESETS,
}: WarehouseDateTimePickerProps) => {
  const handleChange = (dateValue: DateValue | null) => {
    if (dateValue) onChange(fromDateValue(dateValue));
  };

  return (
    <I18nProvider locale="uk-UA">
      <DatePicker
        showMonthAndYearPickers
        value={toZonedDateTime(value)}
        onChange={handleChange}
        granularity="minute"
        hideTimeZone
        hourCycle={24}
        shouldForceLeadingZeros
        label={label}
        labelPlacement="outside-left"
        selectorButtonPlacement="start"
        size="lg"
        isDisabled={isDisabled}
        maxValue={now(getLocalTimeZone())}
        classNames={{
          base: 'w-fit',
          inputWrapper: 'hover:bg-white focus-within:bg-white!',
          segment: 'rounded focus:bg-neutral-300/80',
          label: 'text-[13px] text-gray-500 max-w-26 leading-tight text-right pr-1',
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
                    // "Зараз" — поточна дата і поточний час
                    onChange(new Date());
                  } else {
                    // Фіксований час — зберігаємо дату з календаря
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
