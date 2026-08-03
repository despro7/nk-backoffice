/**
 * Інтервальна нумерація sortOrder для catalog_goods (крок 10).
 * Дозволяє вставляти елементи між сусідами без масового shift.
 */

export const CATALOG_SORT_ORDER_STEP = 10;

export type IntervalSortResult =
  | { kind: 'single'; sortOrder: number }
  | { kind: 'rebalance' };

/**
 * Обчислює новий sortOrder між prev і next (null = край списку).
 * Якщо щілини немає — повертає rebalance.
 */
export function computeIntervalSortOrder(
  prevOrder: number | null,
  nextOrder: number | null
): IntervalSortResult {
  if (prevOrder == null && nextOrder == null) {
    return { kind: 'single', sortOrder: CATALOG_SORT_ORDER_STEP };
  }

  if (prevOrder == null && nextOrder != null) {
    // На початок
    if (nextOrder > CATALOG_SORT_ORDER_STEP) {
      return { kind: 'single', sortOrder: nextOrder - CATALOG_SORT_ORDER_STEP };
    }
    if (nextOrder > 1) {
      const mid = Math.floor(nextOrder / 2);
      if (mid >= 1 && mid < nextOrder) {
        return { kind: 'single', sortOrder: mid };
      }
    }
    return { kind: 'rebalance' };
  }

  if (prevOrder != null && nextOrder == null) {
    // В кінець
    return { kind: 'single', sortOrder: prevOrder + CATALOG_SORT_ORDER_STEP };
  }

  // Між prev і next
  const prev = prevOrder as number;
  const next = nextOrder as number;
  if (next - prev <= 1) {
    return { kind: 'rebalance' };
  }
  const mid = Math.floor((prev + next) / 2);
  if (mid <= prev || mid >= next) {
    return { kind: 'rebalance' };
  }
  return { kind: 'single', sortOrder: mid };
}

/** Призначити 10, 20, 30… у заданому порядку ids. */
export function rebalanceSortOrders(orderedIds: string[]): Array<{ id: string; sortOrder: number }> {
  return orderedIds.map((id, idx) => ({
    id,
    sortOrder: (idx + 1) * CATALOG_SORT_ORDER_STEP,
  }));
}

/** Наступний sortOrder для нового sibling (max + 10, або 10 якщо порожньо). */
export function nextSiblingSortOrder(maxSortOrder: number | null | undefined): number {
  if (maxSortOrder == null || Number.isNaN(maxSortOrder)) {
    return CATALOG_SORT_ORDER_STEP;
  }
  return maxSortOrder + CATALOG_SORT_ORDER_STEP;
}
