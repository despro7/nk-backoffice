/**
 * Stable key of a spec (BOM) row. Survives reordering, drafts, approvals and Dilovod sync,
 * so techcard stages and dosing fractions can reference a row. Local only, not sent to Dilovod.
 */

const ROW_KEY_RE = /^[A-Za-z0-9-]{8,64}$/;

export function isRowKey(value: unknown): value is string {
  return typeof value === 'string' && ROW_KEY_RE.test(value);
}

export function newRowKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${hex(4)}-${hex(12)}`;
}

export interface RowKeyCandidate {
  rowKey?: string | null;
  dilovodRowId?: string | null;
  rowNum?: number | null;
  componentGoodId: string;
}

export interface RowKeyExisting {
  rowKey: string | null;
  dilovodRowId?: string | null;
  rowNum: number;
  componentGoodId: string;
}

/**
 * Keys for `rows` (same order). Priority: valid key from the row itself → existing row with the same
 * Dilovod rowID → same rowNum + good → the only remaining existing row of that good → new key.
 * Every key is used once.
 */
export function assignRowKeys(rows: RowKeyCandidate[], existing: RowKeyExisting[]): string[] {
  const used = new Set<string>();
  const pool = existing.filter((e) => isRowKey(e.rowKey));
  const take = (match: (e: RowKeyExisting) => boolean): string | null => {
    const hit = pool.find((e) => !used.has(e.rowKey as string) && match(e));
    return hit ? (hit.rowKey as string) : null;
  };

  const result: Array<string | null> = rows.map((row) => {
    if (isRowKey(row.rowKey) && !used.has(row.rowKey)) {
      used.add(row.rowKey);
      return row.rowKey;
    }
    return null;
  });

  rows.forEach((row, idx) => {
    if (result[idx]) return;
    const rowId = row.dilovodRowId?.trim();
    const key =
      (rowId ? take((e) => e.dilovodRowId?.trim() === rowId) : null) ??
      (row.rowNum != null ? take((e) => e.rowNum === row.rowNum && e.componentGoodId === row.componentGoodId) : null);
    if (key) {
      used.add(key);
      result[idx] = key;
    }
  });

  rows.forEach((row, idx) => {
    if (result[idx]) return;
    const free = pool.filter((e) => !used.has(e.rowKey as string) && e.componentGoodId === row.componentGoodId);
    const sameGoodLeft = rows.filter((r, i) => !result[i] && r.componentGoodId === row.componentGoodId).length;
    const key = free.length === 1 && sameGoodLeft === 1 ? (free[0].rowKey as string) : newRowKey();
    used.add(key);
    result[idx] = key;
  });

  return result as string[];
}
