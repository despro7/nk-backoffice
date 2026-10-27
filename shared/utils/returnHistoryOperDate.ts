/** Якщо returnDate на 45+ днів старіша за createdAt — часто в БД лежить orderDate, не дата оприбуткування. */
const MAX_OPER_BEFORE_CREATE_MS = 45 * 24 * 60 * 60 * 1000;

/** Дата операції для сортування в історії (узгоджено з UI, з корекцією legacy orderDate). */
export function resolveReturnHistoryOperDateForSort(
  returnDate: Date | string | null | undefined,
  createdAt: Date | string,
): Date {
  const created = new Date(createdAt);
  if (returnDate == null || returnDate === '') {
    return created;
  }
  const ret = new Date(returnDate);
  if (Number.isNaN(ret.getTime())) {
    return created;
  }
  if (created.getTime() - ret.getTime() > MAX_OPER_BEFORE_CREATE_MS) {
    return created;
  }
  return ret;
}

export function compareReturnHistoryOperDate(
  a: { returnDate: Date | string | null; createdAt: Date | string; id: number },
  b: { returnDate: Date | string | null; createdAt: Date | string; id: number },
  sortOrder: 'asc' | 'desc',
): number {
  const dir = sortOrder === 'asc' ? 1 : -1;
  const ta = resolveReturnHistoryOperDateForSort(a.returnDate, a.createdAt).getTime();
  const tb = resolveReturnHistoryOperDateForSort(b.returnDate, b.createdAt).getTime();
  if (ta !== tb) return (ta - tb) * dir;
  if (a.id !== b.id) return (a.id - b.id) * dir;
  return 0;
}
