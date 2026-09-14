import { Input } from '@heroui/react';

export interface SplitNameValues {
  lastName: string;
  firstName: string;
  middleName: string;
}

interface ContactNameFieldsProps {
  mode: 'single' | 'split';
  displayName?: string;
  splitName?: SplitNameValues;
  canManage?: boolean;
  showFieldErrors?: boolean;
  displayNameError?: string;
  onDisplayNameChange?: (value: string) => void;
  onSplitNameChange?: (field: keyof SplitNameValues, value: string) => void;
  onSplitNameBlur?: (field: keyof SplitNameValues) => void;
}

export function ContactNameFields({
  mode,
  displayName = '',
  splitName,
  canManage = true,
  showFieldErrors = false,
  displayNameError,
  onDisplayNameChange,
  onSplitNameChange,
  onSplitNameBlur,
}: ContactNameFieldsProps) {
  if (mode === 'split' && splitName) {
    return (
      <div className="col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label="Прізвище"
          // labelPlacement="outside"
          value={splitName.lastName}
          onValueChange={(value) => onSplitNameChange?.('lastName', value)}
          onBlur={() => onSplitNameBlur?.('lastName')}
          isRequired
          isReadOnly={!canManage}
          autoComplete="off"
        />
        <Input
          label="Імʼя"
          // labelPlacement="outside"
          value={splitName.firstName}
          onValueChange={(value) => onSplitNameChange?.('firstName', value)}
          onBlur={() => onSplitNameBlur?.('firstName')}
          isRequired
          isReadOnly={!canManage}
          autoComplete="off"
        />
        <Input
          label="По батькові"
          // labelPlacement="outside"
          value={splitName.middleName}
          onValueChange={(value) => onSplitNameChange?.('middleName', value)}
          onBlur={() => onSplitNameBlur?.('middleName')}
          isReadOnly={!canManage}
          autoComplete="off"
        />
      </div>
    );
  }

  return (
    <Input
      className="md:col-span-2"
      label="ПІБ / Контрагент"
      // labelPlacement="outside"
      placeholder="Іванов Іван Іванович"
      value={displayName}
      onValueChange={(value) => onDisplayNameChange?.(value)}
      isRequired
      isReadOnly={!canManage}
      isInvalid={showFieldErrors && Boolean(displayNameError)}
      errorMessage={showFieldErrors ? displayNameError : undefined}
      autoComplete="off"
      isClearable={canManage}
    />
  );
}
