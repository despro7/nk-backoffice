import { Input } from '@heroui/react';

interface ContactEmailFieldProps {
  value: string;
  canManage?: boolean;
  onChange: (value: string) => void;
}

export function ContactEmailField({
  value,
  canManage = true,
  onChange,
}: ContactEmailFieldProps) {
  return (
    <Input
      label="Email"
      // labelPlacement="outside"
      placeholder="email@example.com"
      value={value}
      onValueChange={onChange}
      isReadOnly={!canManage}
      autoComplete="off"
      isClearable={canManage}
    />
  );
}
