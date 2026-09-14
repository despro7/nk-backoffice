import { Tooltip } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import {
  formatUkrainianPhone,
  parseUkrainianPhone,
  type FormatUkrainianPhoneOptions,
  type PhoneDisplayStyle,
} from '@shared/utils/phoneFormat';

export interface FormattedPhoneProps {
  phone: string | null | undefined;
  style?: PhoneDisplayStyle;
  emptyPlaceholder?: string;
  className?: string;
  showInvalidIcon?: boolean;
}

export function FormattedPhone({
  phone,
  style = 'spaced',
  emptyPlaceholder = '—',
  className,
  showInvalidIcon = true,
}: FormattedPhoneProps) {
  const parsed = parseUkrainianPhone(phone);
  const options: FormatUkrainianPhoneOptions = { style, emptyPlaceholder };
  const display = formatUkrainianPhone(phone, options);

  if (!phone?.trim()) {
    return <span className={className}>{display}</span>;
  }

  if (!showInvalidIcon || parsed.isValid) {
    return <span className={className}>{display}</span>;
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
      <span>{display}</span>
      <Tooltip content={parsed.invalidReason ?? 'Невірний формат номера'} placement="top" color="danger">
        <span className="inline-flex shrink-0" aria-label={parsed.invalidReason ?? 'Невірний формат номера'}>
          <DynamicIcon name="triangle-alert" size={14} className="text-danger-500" />
        </span>
      </Tooltip>
    </span>
  );
}
