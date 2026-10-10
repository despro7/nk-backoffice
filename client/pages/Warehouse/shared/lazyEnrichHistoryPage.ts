const DEFAULT_CONCURRENCY = 2;

export type HistoryRecordRef = {
  id: number | string;
  items?: unknown;
  itemsNormalized?: unknown;
};

export function recordNeedsHistoryDetailsEnrich(record: HistoryRecordRef): boolean {
  const raw = record.items;
  if (Array.isArray(raw) && raw.length > 0) return false;
  if (typeof raw === 'string' && raw.trim() && raw !== '[]') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return false;
    } catch {
      // treat as missing
    }
  }
  const normalized = record.itemsNormalized;
  return !(Array.isArray(normalized) && normalized.length > 0);
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
