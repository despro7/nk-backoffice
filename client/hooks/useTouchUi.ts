import { useEffect, useState } from 'react';

/** Збігається з MobileHeader / MobileTabBar (`lg`). */
const LG_BREAKPOINT = 1024;
const COMPACT_QUERY = `(max-width: ${LG_BREAKPOINT - 1}px)`;
const COARSE_POINTER_QUERY = '(any-pointer: coarse)';

function readMatch(query: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(query).matches;
}

function subscribe(query: string, onChange: (matches: boolean) => void): () => void {
  const mql = window.matchMedia(query);
  const handler = () => onChange(mql.matches);
  handler();
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}

export function useCompactViewport(): boolean {
  const [compact, setCompact] = useState(() => readMatch(COMPACT_QUERY));

  useEffect(() => subscribe(COMPACT_QUERY, setCompact), []);

  return compact;
}

export function useHasTouchScreen(): boolean {
  const [hasTouch, setHasTouch] = useState(() => readMatch(COARSE_POINTER_QUERY));

  useEffect(() => subscribe(COARSE_POINTER_QUERY, setHasTouch), []);

  return hasTouch;
}

/** Compact viewport (< lg) або пристрій з coarse-pointer (планшет / тач). */
export function useTouchUi(): boolean {
  const isCompact = useCompactViewport();
  const hasTouchScreen = useHasTouchScreen();
  return isCompact || hasTouchScreen;
}

/** Alias compact viewport — той самий поріг, що й мобільний chrome. */
export function useIsMobile(): boolean {
  return useCompactViewport();
}
