/**
 * Race-safe SKU allocation for Dilovod catalogs.goods.
 * Serializes allocateNextSku in-process and retries on collisions.
 */

type SkuChecker = (sku: string) => Promise<boolean>;

let skuQueue: Promise<void> = Promise.resolve();

function enqueueSku<T>(fn: () => Promise<T>): Promise<T> {
  const run = skuQueue.then(fn, fn);
  skuQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * Increment trailing numeric suffix: 01001 → 01002, ABC9 → ABC10.
 * Preserves zero-padding length of the numeric tail when possible.
 */
export function incrementSku(sku: string): string {
  const trimmed = String(sku || '').trim();
  if (!trimmed) return '00001';

  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) {
    return `${trimmed}1`;
  }

  const prefix = match[1];
  const digits = match[2];
  const next = String(parseInt(digits, 10) + 1);
  const padded = next.length >= digits.length ? next : next.padStart(digits.length, '0');
  return `${prefix}${padded}`;
}

/** Порівняння SKU з урахуванням числового хвоста (для вибору «останнього» в папці). */
export function compareSku(a: string, b: string): number {
  const ma = String(a || '').trim().match(/^(.*?)(\d+)$/);
  const mb = String(b || '').trim().match(/^(.*?)(\d+)$/);
  if (ma && mb && ma[1] === mb[1]) {
    return parseInt(ma[2], 10) - parseInt(mb[2], 10);
  }
  return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true });
}

/** Найбільший SKU у списку (або null). */
export function pickLatestSku(skus: string[]): string | null {
  const cleaned = skus.map((s) => String(s || '').trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  return cleaned.reduce((best, cur) => (compareSku(cur, best) > 0 ? cur : best));
}

/**
 * Find next free SKU starting from baseSku (first candidate = increment of base).
 * Uses in-process mutex + Dilovod existence check with retry limit.
 */
export async function allocateNextSku(
  baseSku: string,
  isTaken: SkuChecker,
  maxAttempts = 20
): Promise<string> {
  return enqueueSku(async () => {
    let candidate = incrementSku(baseSku || '00000');

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const taken = await isTaken(candidate);
      if (!taken) {
        return candidate;
      }
      candidate = incrementSku(candidate);
    }

    throw new Error(
      `Не вдалося виділити вільний SKU після ${maxAttempts} спроб (база: ${baseSku})`
    );
  });
}

export function isSkuDuplicateError(error: unknown): boolean {
  const msg = String(
    error instanceof Error ? error.message : (error as { message?: string })?.message || error || ''
  ).toLowerCase();
  return (
    msg.includes('productnum') ||
    msg.includes('product_num') ||
    msg.includes('артикул') ||
    (msg.includes('sku') && (msg.includes('duplicate') || msg.includes('унік') || msg.includes('unique') || msg.includes('вже існу'))) ||
    msg.includes('p2002')
  );
}
