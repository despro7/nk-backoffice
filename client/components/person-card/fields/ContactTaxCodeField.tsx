import { Input } from '@heroui/react';

export function formatTaxCodeInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10);
}

interface ContactTaxCodeFieldProps {
  value: string;
  canManage?: boolean;
  showFieldErrors?: boolean;
  error?: string;
  onChange: (value: string) => void;
}

export function ContactTaxCodeField({
  value,
  canManage = true,
  showFieldErrors = false,
  error,
  onChange,
}: ContactTaxCodeFieldProps) {
  return (
    <Input
      label="Податковий номер"
      // labelPlacement="outside"
      placeholder="1234567890"
      value={value}
      onValueChange={(value) => onChange(formatTaxCodeInput(value))}
      isReadOnly={!canManage}
      isInvalid={showFieldErrors && Boolean(error)}
      errorMessage={showFieldErrors ? error : undefined}
      inputMode="numeric"
      maxLength={10}
      autoComplete="off"
      isClearable={canManage}
    />
  );
}
