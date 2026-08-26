import { useEffect, useLayoutEffect, useRef } from 'react';

export type UrlHashValue = string | number | null | undefined | false;

/**
 * Серіалізує значення в query-string для `location.hash`.
 * Пропускає порожні / default (`null`, `undefined`, `false`, `''`).
 */
export function buildHashString(values: Record<string, UrlHashValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === false || value === '') continue;
    params.set(key, String(value));
  }
  return params.toString();
}

export function parseUrlHash(hash: string): URLSearchParams {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return new URLSearchParams();
  return new URLSearchParams(raw);
}

export function replaceUrlHash(hashString: string): void {
  if (typeof window === 'undefined') return;
  const { pathname, search } = window.location;
  const next = hashString ? `${pathname}${search}#${hashString}` : `${pathname}${search}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === next) return;
  window.history.replaceState(null, '', next);
}

/**
 * Двостороння синхронізація стану сторінки з `window.location.hash`.
 * Restore один раз на mount; подальші зміни пишуться через `replaceState` (без історії).
 */
export function useUrlHashSync(
  values: Record<string, UrlHashValue>,
  onRestore: (params: URLSearchParams) => void
): void {
  const skipWriteRef = useRef(true);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  useLayoutEffect(() => {
    const params = parseUrlHash(window.location.hash);
    if ([...params.keys()].length === 0) return;
    onRestoreRef.current(params);
  }, []);

  const hashString = buildHashString(values);

  useEffect(() => {
    if (skipWriteRef.current) {
      skipWriteRef.current = false;
      return;
    }
    replaceUrlHash(hashString);
  }, [hashString]);
}
