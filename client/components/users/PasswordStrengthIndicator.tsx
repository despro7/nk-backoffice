import { Progress } from '@heroui/react';
import { getPasswordStrength } from '@shared/lib/passwordStrength';

interface PasswordStrengthIndicatorProps {
  password: string;
}

export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  if (!password) return null;

  const strength = getPasswordStrength(password);

  return (
    <Progress
      aria-label="Сила паролю"
      className="w-full"
      color={strength.color}
      label={strength.label}
      maxValue={100}
      size="sm"
      classNames={{
        base: 'gap-1',
        // indicator: 'h-1',
        label: `text-xs font-medium text-${strength.color}`,
        // track: 'bg-default-200',
        // value: 'bg-primary-500',
      }}
      value={strength.score}
    />
  );
}
