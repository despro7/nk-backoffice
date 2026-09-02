import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export type UrlHashValue = string | number | null | undefined | false;

export type UseUrlHashSyncOptions = {
  /** false — не читати і не писати hash (вбудований режим). */
  enabled?: boolean;
  /** true — замінювати поточний пункт історії замість push. */
  replace?: boolean;
};

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

function normalizeHash(hash: string): string {
  if (!hash || hash === '#') return '';
  return hash.startsWith('#') ? hash : `#${hash}`;
}

/**
 * Двостороння синхронізація стану сторінки з `location.hash` через React Router.
 * Back/forward оновлюють стан; запис іде через `navigate`, щоб не затирати history.state.
 */
export function useUrlHashSync(
  values: Record<string, UrlHashValue>,
  onRestore: (params: URLSearchParams) => void,
  options?: UseUrlHashSyncOptions
): void {
  const enabled = options?.enabled !== false;
  const replace = options?.replace === true;
  const location = useLocation();
  const navigate = useNavigate();
  const skipWriteRef = useRef(true);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  const lastAppliedHashRef = useRef<string | null>(null);
  const locationRef = useRef(location);
  locationRef.current = location;

  const hashString = buildHashString(values);
  const nextHash = hashString ? `#${hashString}` : '';

  useLayoutEffect(() => {
    if (!enabled) return;
    const current = normalizeHash(location.hash);
    if (lastAppliedHashRef.current === current) return;
    lastAppliedHashRef.current = current;
    onRestoreRef.current(parseUrlHash(current));
  }, [enabled, location.hash]);

  useEffect(() => {
    if (!enabled) return;
    if (skipWriteRef.current) {
      skipWriteRef.current = false;
      return;
    }
    const loc = locationRef.current;
    const current = normalizeHash(loc.hash);
    if (current === nextHash) return;
    lastAppliedHashRef.current = nextHash;
    navigate(
      { pathname: loc.pathname, search: loc.search, hash: nextHash },
      { replace }
    );
  }, [enabled, hashString, navigate, nextHash, replace]);
}
