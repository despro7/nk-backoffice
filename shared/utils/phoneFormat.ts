export type PhoneDisplayStyle = 'international' | 'national' | 'spaced';

export interface ParsedUkrainianPhone {
  /** Нормалізований номер у форматі 380XXXXXXXXX */
  normalized: string | null;
  /** Національний формат 0XXXXXXXXX */
  national: string | null;
  isValid: boolean;
  invalidReason?: string;
}

function formatFromNational(national: string, style: PhoneDisplayStyle): string {
  const operator = national.slice(0, 3);
  const part1 = national.slice(3, 6);
  const part2 = national.slice(6, 8);
  const part3 = national.slice(8, 10);

  switch (style) {
    case 'international':
      return `+38 (${operator}) ${part1}-${part2}-${part3}`;
    case 'national':
      return `(${operator}) ${part1}-${part2}-${part3}`;
    case 'spaced':
      return `${operator} ${part1} ${part2} ${part3}`;
  }
}

function normalizeDigitsToE164(digits: string): string | null {
  if (digits.length === 12 && digits.startsWith('380')) {
    return digits;
  }

  if (digits.length === 10 && digits.startsWith('0')) {
    return `380${digits.slice(1)}`;
  }

  if (digits.length === 9 && !digits.startsWith('0')) {
    return `380${digits}`;
  }

  return null;
}

/**
 * Розбирає український номер телефону з будь-якого поширеного формату вводу.
 */
export function parseUkrainianPhone(phone: string | null | undefined): ParsedUkrainianPhone {
  const raw = phone?.trim() ?? '';
  if (!raw) {
    return {
      normalized: null,
      national: null,
      isValid: false,
      invalidReason: 'Порожній номер',
    };
  }

  const digits = raw.replace(/\D/g, '');
  if (!digits) {
    return {
      normalized: null,
      national: null,
      isValid: false,
      invalidReason: 'Немає цифр у номері',
    };
  }

  const normalized = normalizeDigitsToE164(digits);
  if (!normalized) {
    return {
      normalized: null,
      national: null,
      isValid: false,
      invalidReason: 'Невірний формат українського номера',
    };
  }

  const national = `0${normalized.slice(3)}`;
  if (!/^0\d{9}$/.test(national)) {
    return {
      normalized: null,
      national: null,
      isValid: false,
      invalidReason: 'Невірний формат національного номера',
    };
  }

  return {
    normalized,
    national,
    isValid: true,
  };
}

export interface FormatUkrainianPhoneOptions {
  style?: PhoneDisplayStyle;
  emptyPlaceholder?: string;
}

/**
 * Форматує український номер телефону для відображення.
 * Для невалідних номерів повертає вихідне значення без змін.
 */
export function formatUkrainianPhone(
  phone: string | null | undefined,
  options: PhoneDisplayStyle | FormatUkrainianPhoneOptions = 'spaced',
): string {
  const resolved: FormatUkrainianPhoneOptions = typeof options === 'string'
    ? { style: options }
    : options;

  const style = resolved.style ?? 'spaced';
  const emptyPlaceholder = resolved.emptyPlaceholder ?? '—';

  if (!phone?.trim()) {
    return emptyPlaceholder;
  }

  const parsed = parseUkrainianPhone(phone);
  if (!parsed.isValid || !parsed.national) {
    return phone.trim();
  }

  return formatFromNational(parsed.national, style);
}

/**
 * Витягує цифри з поля вводу та нормалізує до префікса 380 (макс. 12 цифр).
 */
export function extractPhoneDigitsFromInput(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('380')) {
    return digits.slice(0, 12);
  }
  if (digits.startsWith('38')) {
    return digits.slice(0, 12);
  }
  if (digits.startsWith('0')) {
    return (`38${digits}`).slice(0, 12);
  }
  return (`380${digits}`).slice(0, 12);
}

/**
 * Маска вводу телефону для візуального контролю (+38 (0XX) XXX-XX-XX).
 */
export function formatPhoneInputMask(storedDigits: string): string {
  const digits = storedDigits.replace(/\D/g, '');
  if (!digits) return '';

  let national = '';
  if (digits.startsWith('380')) {
    national = `0${digits.slice(3)}`;
  } else if (digits.startsWith('38')) {
    const rest = digits.slice(2);
    national = rest.startsWith('0') ? rest : `0${rest}`;
  } else if (digits.startsWith('0')) {
    national = digits;
  } else {
    national = `0${digits}`;
  }
  national = national.slice(0, 10);

  const len = national.length;
  if (len <= 3) return `+38 (${national}`;
  if (len <= 6) return `+38 (${national.slice(0, 3)}) ${national.slice(3)}`;
  if (len <= 8) {
    return `+38 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  }
  return `+38 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6, 8)}-${national.slice(8)}`;
}

export function applyPhoneInputChange(input: string): { stored: string; display: string } {
  const stored = extractPhoneDigitsFromInput(input);
  return {
    stored,
    display: formatPhoneInputMask(stored),
  };
}
