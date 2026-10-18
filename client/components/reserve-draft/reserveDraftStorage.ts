const STORAGE_PREFIX = 'reserve-draft:v1:';

export interface ReserveDraftRecord<T> {
  savedAt: string;
  data: T;
  placeLabel: string | null;
  placeAnchor: string | null;
}

interface StoredReserveDraft<T> {
  version: 1;
  savedAt: string;
  data: T;
  placeLabel: string | null;
  placeAnchor: string | null;
}

export function reserveDraftStorageKey(documentKey: string): string {
  return `${STORAGE_PREFIX}${documentKey}`;
}

export function reserveDraftEquals<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function readReserveDraft<T>(documentKey: string): ReserveDraftRecord<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(reserveDraftStorageKey(documentKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredReserveDraft<T>;
    if (parsed?.version !== 1 || parsed.data === undefined || typeof parsed.savedAt !== 'string') {
      return null;
    }
    return {
      savedAt: parsed.savedAt,
      data: parsed.data,
      placeLabel: parsed.placeLabel ?? null,
      placeAnchor: parsed.placeAnchor ?? null,
    };
  } catch {
    return null;
  }
}

export function writeReserveDraft<T>(
  documentKey: string,
  data: T,
  placeLabel: string | null,
  placeAnchor: string | null,
): void {
  if (typeof window === 'undefined') return;
  const payload: StoredReserveDraft<T> = {
    version: 1,
    savedAt: new Date().toISOString(),
    data,
    placeLabel,
    placeAnchor,
  };
  window.localStorage.setItem(reserveDraftStorageKey(documentKey), JSON.stringify(payload));
}

export function removeReserveDraft(documentKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(reserveDraftStorageKey(documentKey));
  } catch {
    // localStorage може бути недоступний
  }
}
