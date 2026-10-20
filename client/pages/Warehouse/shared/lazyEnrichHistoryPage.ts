import { resolveHistoryItemQuantity, safeParseItems } from './historyNormalize';

const DEFAULT_CONCURRENCY = 2;

export type HistoryRecordRef = {
  id: number | string;
  items?: unknown;
  itemsNormalized?: unknown;
};

function parsedItemsHaveQuantity(raw: unknown): boolean {
  const arr = safeParseItems(raw);
  if (arr.length === 0) return false;
  return arr.some((row) => resolveHistoryItemQuantity(row) > 0);
}

function normalizedItemsHaveQuantity(normalized: unknown): boolean {
  if (!Array.isArray(normalized) || normalized.length === 0) return false;
  return normalized.some((row) => Number((row as { qty?: number }).qty ?? 0) > 0);
}

export function recordNeedsHistoryDetailsEnrich(record: HistoryRecordRef): boolean {
  if (normalizedItemsHaveQuantity(record.itemsNormalized)) return false;
  if (parsedItemsHaveQuantity(record.items)) return false;
  return true;
}

/**
 * Фонове підвантаження tpGoods для записів поточної сторінки (без force).
 */
export async function lazyEnrichHistoryPage(
  records: HistoryRecordRef[],
  loadDetails: (record: HistoryRecordRef, force?: boolean, silent?: boolean) => Promise<unknown>,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<void> {
  const queue = records.filter(recordNeedsHistoryDetailsEnrich);
  if (queue.length === 0) return;

  let cursor = 0;
  const workerCount = Math.min(concurrency, queue.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < queue.length) {
      const index = cursor;
      cursor += 1;
      const record = queue[index];
      try {
        await loadDetails(record, false, true);
      } catch {
        // фонові помилки не блокують UI
      }
    }
  });
  await Promise.all(workers);
}
