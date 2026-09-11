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
      value={strength.score}
    />
  );
}
