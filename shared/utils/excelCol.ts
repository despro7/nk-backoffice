/** Літера колонки Excel ('A', 'U', 'AA') → 0-based індекс. */
export function excelColToIndex(col: string): number {
  const letters = String(col ?? '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** 0-based індекс → літера колонки Excel. */
export function excelIndexToCol(index: number): string {
  if (index < 0) return '';
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function normalizeExcelCol(col: string): string {
  return String(col ?? '').trim().toUpperCase().replace(/[^A-Z]/g, '');
}
