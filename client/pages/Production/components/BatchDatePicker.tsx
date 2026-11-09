import { DatePicker } from '@heroui/react';
import { parseDate, type DateValue } from '@internationalized/date';
import { I18nProvider } from '@react-aria/i18n';

function toDateValue(value: string | null | undefined): DateValue | null {
  if (!value) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

function toYmd(value: DateValue | null): string {
  if (!value) return '';
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

interface BatchDatePickerProps {
  /** YYYY-MM-DD або порожньо */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  ariaLabel?: string;
  className?: string;
  isRequired?: boolean;
}

/** Дата варки (лише день) – HeroUI DatePicker в українській локалі; значення – YYYY-MM-DD. */
export function BatchDatePicker({ value, onChange, label, ariaLabel, className, isRequired }: BatchDatePickerProps) {
  return (
    <I18nProvider locale="uk-UA">
      <DatePicker
        label={label}
        aria-label={ariaLabel ?? label}
        value={toDateValue(value)}
        onChange={(date) => onChange(toYmd(date))}
        granularity="day"
        showMonthAndYearPickers
        selectorButtonPlacement="end"
        isRequired={isRequired}
        className={className}
      />
    </I18nProvider>
  );
}
