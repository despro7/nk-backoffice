/**
 * Race-safe EAN-13 allocation for Dilovod informationRegisters.barCodes.
 * Внутрішня серія NK: 22XXXXXXXXXXC (приклад: 2200000000224).
 * Остання цифра — контрольна (GS1); інкрементуємо body (12 цифр) і перераховуємо check.
 */

/** Префікс внутрішньої серії ШК (in-store / власні коди). */
export const EAN13_SERIES_PREFIX = '22';

/** Body першого коду серії, якщо в Dilovod ще немає жодного 22… */
export const EAN13_SEED_BODY = '220000000000';

type BarcodeChecker = (code: string) => Promise<boolean>;

let barcodeQueue: Promise<void> = Promise.resolve();

function enqueueBarcode<T>(fn: () => Promise<T>): Promise<T> {
  const run = barcodeQueue.then(fn, fn);
  barcodeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Чи є рядок валідним EAN-13 (13 цифр). */
export function isEan13Format(code: string): boolean {
  return /^\d{13}$/.test(String(code || '').trim());
}

/** Чи належить код внутрішній серії 22… */
export function isInternalEan13(code: string): boolean {
  const trimmed = String(code || '').trim();
  return isEan13Format(trimmed) && trimmed.startsWith(EAN13_SERIES_PREFIX);
}

/**
 * GS1 check digit для 12-значного body.
 * Ваги зліва: 1, 3, 1, 3, …
 */
export function ean13CheckDigit(body12: string): string {
  const body = String(body12 || '').trim();
  if (!/^\d{12}$/.test(body)) {
    throw new Error(`EAN-13 body має бути 12 цифр, отримано: "${body}"`);
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(body[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return String((10 - (sum % 10)) % 10);
}

/** Зібрати повний EAN-13 з 12-значного body. */
export function buildEan13(body12: string): string {
  const body = String(body12 || '').trim();
  return `${body}${ean13CheckDigit(body)}`;
}

/** Інкремент 12-значного body з збереженням ширини (padStart 12). */
export function incrementEan13Body(body12: string): string {
  const body = String(body12 || '').trim();
  if (!/^\d{12}$/.test(body)) {
    throw new Error(`EAN-13 body має бути 12 цифр, отримано: "${body}"`);
  }
  const next = (BigInt(body) + 1n).toString();
  if (next.length > 12) {
    throw new Error('Переповнення EAN-13 body (більше 12 цифр)');
  }
  return next.padStart(12, '0');
}

/** Наступний EAN-13 після повного коду (інкремент body + новий check). */
export function nextEan13(code: string): string {
  const trimmed = String(code || '').trim();
  if (!isEan13Format(trimmed)) {
    throw new Error(`Очікується EAN-13 (13 цифр), отримано: "${trimmed}"`);
  }
  return buildEan13(incrementEan13Body(trimmed.slice(0, 12)));
}

/**
 * Найбільший внутрішній EAN-13 (серія 22…) за body (перші 12 цифр).
 * Зовнішні / не-13-цифрові коди ігноруються.
 */
export function pickLatestEan13(codes: string[]): string | null {
  let best: string | null = null;
  let bestBody = -1n;

  for (const raw of codes) {
    const code = String(raw || '').trim();
    if (!isInternalEan13(code)) continue;
    const body = BigInt(code.slice(0, 12));
    if (body > bestBody) {
      bestBody = body;
      best = code;
    }
  }

  return best;
}

/**
 * Виділити наступний вільний EAN-13 серії 22…:
 * — якщо є latest — next(latest);
 * — інакше — buildEan13(seedBody).
 * Mutex + isTaken retry.
 */
export async function allocateNextEan13(
  existingCodes: string[],
  isTaken: BarcodeChecker,
  seedBody: string = EAN13_SEED_BODY,
  maxAttempts = 20
): Promise<string> {
  return enqueueBarcode(async () => {
    const latest = pickLatestEan13(existingCodes);
    let candidate = latest ? nextEan13(latest) : buildEan13(seedBody);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const taken = await isTaken(candidate);
      if (!taken) {
        return candidate;
      }
      candidate = nextEan13(candidate);
    }

    throw new Error(
      `Не вдалося виділити вільний EAN-13 після ${maxAttempts} спроб (база: ${latest || seedBody})`
    );
  });
}

export type CatalogBarcodeMatchRow = {
  code: string;
  activity: boolean;
  dilovodRegisterId?: string | null;
  goodPart?: string | null;
  goodPartName?: string | null;
};

export function catalogBarcodeRowKey(row: CatalogBarcodeMatchRow): string {
  return row.dilovodRegisterId || `${row.code}::${row.goodPart || ''}`;
}

/**
 * Знайти існуючий рядок ШК, щоб оновити регістр Dilovod, а не створити дублікат коду.
 * 1) точний code + goodPart
 * 2) той самий code без партії (привʼязка партії)
 * 3) єдиний рядок з цим code (зміна партії)
 */
export function matchExistingBarcode(
  rows: CatalogBarcodeMatchRow[],
  code: string,
  goodPart: string | null,
  usedKeys: Set<string>
): CatalogBarcodeMatchRow | undefined {
  const available = rows.filter((row) => {
    if (row.code !== code) return false;
    return !usedKeys.has(catalogBarcodeRowKey(row));
  });

  const exact = available.find((row) => (row.goodPart || null) === goodPart);
  if (exact) return exact;

  const unbound = available.find((row) => !row.goodPart);
  if (unbound) return unbound;

  if (available.length === 1) return available[0];
  return undefined;
}
