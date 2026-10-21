import type { PriceRow } from './productDrawerTypes';

export type PriceRowEntry = {
  row: PriceRow;
  originalIdx: number;
};

export function sortPriceEntries(rows: PriceRow[]): PriceRowEntry[] {
  return rows.map((row, originalIdx) => ({ row, originalIdx }));
}

export function reorderPriceRows(rows: PriceRow[], from: number, to: number): PriceRow[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) {
    return rows;
  }
  const next = [...rows];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}
