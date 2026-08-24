const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*?';
const ALL = `${LETTERS}${DIGITS}${SYMBOLS}`;

function randomInt(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

function pick(source: string): string {
  return source[randomInt(source.length)];
}

/** Пароль без неоднозначних символів (0/O, 1/l/I). Мінімум 8 символів, є літера, цифра і символ. */
export function generatePassword(length = 14): string {
  const size = Math.max(8, Math.min(64, Math.floor(length)));
  const chars = [pick(LETTERS), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < size) {
    chars.push(pick(ALL));
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
