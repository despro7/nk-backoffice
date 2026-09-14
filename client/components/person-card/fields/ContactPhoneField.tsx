import { Input } from '@heroui/react';
import {
  applyPhoneInputChange,
  formatPhoneInputMask,
  parseUkrainianPhone,
} from '@shared/utils/phoneFormat';

export function normalizePhoneForSave(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/\D/g, '') ?? '';
  if (!digits) return null;
  const parsed = parseUkrainianPhone(digits);
  return parsed.isValid ? parsed.normalized : null;
}

interface ContactPhoneFieldProps {
  value: string;
  canManage?: boolean;
  showFieldErrors?: boolean;
  error?: string;
  onChange: (stored: string) => void;
}

export function ContactPhoneField({
  value,
  canManage = true,
  showFieldErrors = false,
  error,
  onChange,
}: ContactPhoneFieldProps) {
  const display = formatPhoneInputMask(value);

  return (
    <Input
      label="Телефон"
      // labelPlacement="outside"
      placeholder="+38 (0XX) XXX-XX-XX"
      value={display}
      onValueChange={(next) => {
        const { stored } = applyPhoneInputChange(next);
        onChange(stored);
      }}
      isReadOnly={!canManage}
      isInvalid={showFieldErrors && Boolean(error)}
      errorMessage={showFieldErrors ? error : undefined}
      inputMode="tel"
      autoComplete="off"
      isClearable={canManage}
      onClear={() => onChange('')}
    />
  );
}

export function validatePhoneField(phone: string | null | undefined): string | undefined {
  const digits = phone?.replace(/\D/g, '') ?? '';
  if (!digits) return undefined;
  const parsed = parseUkrainianPhone(digits);
  if (!parsed.isValid) return 'Невірний формат українського номера';
  return undefined;
}
