import type { BarcodeRow } from './productDrawerTypes';

export type BarcodeRowEntry = {
  row: BarcodeRow;
  originalIdx: number;
};

export function sortBarcodeEntries(rows: BarcodeRow[]): BarcodeRowEntry[] {
  return rows.map((row, originalIdx) => ({ row, originalIdx }));
}

export function reorderBarcodeRows(rows: BarcodeRow[], from: number, to: number): BarcodeRow[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) {
    return rows;
  }
  const next = [...rows];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}
