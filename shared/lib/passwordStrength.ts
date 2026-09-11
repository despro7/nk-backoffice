export type PasswordStrengthColor = 'danger' | 'warning' | 'primary' | 'success';

export interface PasswordStrength {
  score: number;
  label: string;
  color: PasswordStrengthColor;
}

const EMPTY_STRENGTH: PasswordStrength = {
  score: 0,
  label: '',
  color: 'danger',
};

/** Оцінка сили паролю (0–100) для UI-індикатора. */
export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return EMPTY_STRENGTH;

  let score = 0;

  if (password.length >= 6) score += 10;
  if (password.length >= 8) score += 10;
  if (password.length >= 10) score += 10;
  if (password.length >= 12) score += 10;

  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 10;
  if (/\d/.test(password)) score += 10;
  if (/[^a-zA-Z0-9]/.test(password)) score += 10;

  const typeCount = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length;

  if (typeCount >= 3) score += 10;
  if (typeCount >= 4) score += 10;

  score = Math.min(100, score);

  if (score < 30) return { score, label: 'Слабкий', color: 'danger' };
  if (score < 55) return { score, label: 'Середній', color: 'warning' };
  if (score < 80) return { score, label: 'Добрий', color: 'primary' };
  return { score, label: 'Надійний', color: 'success' };
}
