/** Індекс блоку `content[i]` з шляху keys json-view (i може бути number або "6"). */
export function contentBlockIndexFromKeys(keys: (number | string)[]): number | null {
  if (keys[0] !== 'content' || keys.length < 2) {
    return null;
  }
  const raw = keys[1];
  const idx = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(idx) ? idx : null;
}
