export interface FifoBatchCandidate {
  batchId: string;
  batchNumber: string;
  quantity: number;
  expiration?: string | null;
}

export interface FifoAllocatedBatch {
  batchId: string;
  batchNumber: string;
  quantity: number;
  batchStock: number;
}

function yearFromLastDigit(digit: number, now: Date): number {
  const currentYear = now.getFullYear();
  const candidate = Math.floor(currentYear / 10) * 10 + digit;
  return candidate <= currentYear ? candidate : candidate - 10;
}

function timestampFromParts(year: number, month: number, day: number): number | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.getTime();
}

/**
 * Вік партії для FIFO: дата з назви (DD.MM.YYYY / ISO),
 * серійний код YMMDD (60814 → 2026-08-14, також K-61008),
 * інакше термін придатності. Без дати — в кінець черги.
 */
export function fifoBatchTimestamp(
  batch: Pick<FifoBatchCandidate, 'batchNumber' | 'expiration'>,
  now: Date = new Date(),
): number {
  const label = String(batch.batchNumber ?? '').trim();

  const dayFirst = /(\d{2})\.(\d{2})\.(\d{4})/.exec(label);
  if (dayFirst) {
    const timestamp = timestampFromParts(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]));
    if (timestamp != null) return timestamp;
  }

  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(label);
  if (iso) {
    const timestamp = timestampFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (timestamp != null) return timestamp;
  }

  const serial = /(?:^|[^0-9])(?:K-?)?(\d)(\d{2})(\d{2})(?:-\d+)?(?![0-9])/i.exec(label);
  if (serial) {
    const timestamp = timestampFromParts(
      yearFromLastDigit(Number(serial[1]), now),
      Number(serial[2]),
      Number(serial[3]),
    );
    if (timestamp != null) return timestamp;
  }

  const expiration = String(batch.expiration ?? '').trim().slice(0, 10);
  const expirationMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiration);
  if (expirationMatch) {
    const timestamp = timestampFromParts(
      Number(expirationMatch[1]),
      Number(expirationMatch[2]),
      Number(expirationMatch[3]),
    );
    if (timestamp != null) return timestamp;
  }

  return Number.POSITIVE_INFINITY;
}

export function sortBatchesFifo<T extends FifoBatchCandidate>(batches: T[], now: Date = new Date()): T[] {
  return [...batches].sort((left, right) => {
    const diff = fifoBatchTimestamp(left, now) - fifoBatchTimestamp(right, now);
    if (diff !== 0) return diff;
    return String(left.batchNumber).localeCompare(String(right.batchNumber), 'uk');
  });
}

/** Списує потрібну кількість зі старіших партій, не перевищуючи залишок кожної. */
export function allocateBatchesFifo(
  batches: FifoBatchCandidate[],
  requiredQuantity: number,
  now: Date = new Date(),
): FifoAllocatedBatch[] {
  let remaining = Number(requiredQuantity);
  if (!Number.isFinite(remaining) || remaining <= 0) return [];

  const allocated: FifoAllocatedBatch[] = [];
  for (const batch of sortBatchesFifo(batches, now)) {
    if (remaining <= 0.0001) break;
    const stock = Number(batch.quantity);
    if (!Number.isFinite(stock) || stock <= 0) continue;
    const quantity = Math.min(stock, remaining);
    allocated.push({
      batchId: batch.batchId,
      batchNumber: batch.batchNumber,
      quantity,
      batchStock: stock,
    });
    remaining -= quantity;
  }

  return allocated;
}
