/**
 * Кодування EAN-13 для шрифту Code EAN13 (Grandzebu / Libre Barcode compatible).
 * Формат: {перша_цифра}{6_лівих}*{6_правих}+
 */
const PARITY: string[] = [
  'AAAAAA',
  'AABABB',
  'AABBAB',
  'AABBBA',
  'ABAABB',
  'ABBAAB',
  'ABBBAA',
  'ABABAB',
  'ABABBA',
  'ABBABA',
];

/** Set A: 0-9 → A-J */
const SET_A: Record<string, string> = {
  '0': 'A',
  '1': 'B',
  '2': 'C',
  '3': 'D',
  '4': 'E',
  '5': 'F',
  '6': 'G',
  '7': 'H',
  '8': 'I',
  '9': 'J',
};

/** Set B: 0-9 → K-T */
const SET_B: Record<string, string> = {
  '0': 'K',
  '1': 'L',
  '2': 'M',
  '3': 'N',
  '4': 'O',
  '5': 'P',
  '6': 'Q',
  '7': 'R',
  '8': 'S',
  '9': 'T',
};

/** Set C: 0-9 → a-j */
const SET_C: Record<string, string> = {
  '0': 'a',
  '1': 'b',
  '2': 'c',
  '3': 'd',
  '4': 'e',
  '5': 'f',
  '6': 'g',
  '7': 'h',
  '8': 'i',
  '9': 'j',
};

function ean13CheckDigit(body12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = parseInt(body12[i], 10);
    sum += i % 2 === 0 ? n : n * 3;
  }
  const mod = sum % 10;
  return String(mod === 0 ? 0 : 10 - mod);
}

/** Повертає рядок для font-family: Code EAN13, або '' якщо код невалідний. */
export function encodeEan13ForFont(code: string): string {
  const digits = code.replace(/\D/g, '');
  if (digits.length < 12) return '';

  const body12 = digits.length >= 13 ? digits.slice(0, 12) : digits.padStart(12, '0').slice(0, 12);
  const check = digits.length >= 13 ? digits[12] : ean13CheckDigit(body12);
  const full = body12 + check;
  if (!/^\d{13}$/.test(full)) return '';

  const first = parseInt(full[0], 10);
  const parity = PARITY[first];
  if (!parity) return '';

  let encoded = full[0];
  for (let i = 1; i <= 6; i++) {
    const digit = full[i];
    encoded += parity[i - 1] === 'A' ? SET_A[digit] : SET_B[digit];
  }
  encoded += '*';
  for (let i = 7; i <= 12; i++) {
    encoded += SET_C[full[i]];
  }
  encoded += '+';
  return encoded;
}
