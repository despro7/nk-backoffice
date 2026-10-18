import { useCallback, useEffect, useRef, useState } from 'react';
import {
  readReserveDraft,
  removeReserveDraft,
  reserveDraftEquals,
  writeReserveDraft,
  type ReserveDraftRecord,
} from './reserveDraftStorage';

const WRITE_DELAY_MS = 200;

export interface UseReserveDraftOptions<T> {
  /** Стабільний ключ документа, напр. `warehouse-inventory:172`. null — резерв вимкнено. */
  documentKey: string | null;
  /** Поточний знімок редактора. Має бути JSON-серіалізованим і стабільним між рендерами. */
  value: T;
  /** Останнє офіційне збереження. null — документ ще не готовий, запис заблоковано. */
  baseline: T | null;
  enabled: boolean;
  /** Підпис місця, де зупинились (назва позиції, секції тощо). */
  placeLabel?: string | null;
  /** Якір для відновлення позиції. Формат визначає документ, що підключає хук. */
  placeAnchor?: string | null;
}

export interface UseReserveDraftResult<T> {
  /** Є резерв, який відрізняється від офіційного збереження. Поки офер відкритий, нові записи не перетирають його. */
  offer: ReserveDraftRecord<T> | null;
  /** Знімає паузу після того, як документ застосував `offer.data`. */
  acceptOffer: () => void;
  /** Відкидає резерв і лишає офіційне збереження. */
  dismissOffer: () => void;
  /** Прибирає резерв після офіційного збереження або явного скасування. */
  clearReserve: () => void;
}

function suppressionToken<T>(documentKey: string, baseline: T): string {
  return `${documentKey}::${JSON.stringify(baseline)}`;
}

/**
 * Локальний резерв документа: пише знімок у localStorage на кожну зміну,
 * не замінюючи офіційне збереження. Після виходу або збою повертає offer,
 * якщо резерв відрізняється від baseline.
 */
export function useReserveDraft<T>({
  documentKey,
  value,
  baseline,
  enabled,
  placeLabel = null,
  placeAnchor = null,
}: UseReserveDraftOptions<T>): UseReserveDraftResult<T> {
  const [offer, setOffer] = useState<ReserveDraftRecord<T> | null>(null);
  const [boundKey, setBoundKey] = useState<string | null>(null);
  /** Ключ, для якого резерв на диску не можна перезаписати поточним знімком. */
  const holdKeyRef = useRef<string | null>(null);
  /** Після clear не дати cleanup-ефекту знову записати ще не скинутий брудний знімок. */
  const suppressedTokenRef = useRef<string | null>(null);
  const valueRef = useRef(value);
  const baselineRef = useRef(baseline);
  const placeLabelRef = useRef(placeLabel);
  const placeAnchorRef = useRef(placeAnchor);

  valueRef.current = value;
  baselineRef.current = baseline;
  placeLabelRef.current = placeLabel;
  placeAnchorRef.current = placeAnchor;

  const ready = Boolean(enabled && documentKey && baseline !== null);

  if (ready && documentKey && boundKey !== documentKey) {
    const stored = readReserveDraft<T>(documentKey);
    const nextOffer = stored && !reserveDraftEquals(stored.data, baseline as T) ? stored : null;
    holdKeyRef.current = nextOffer ? documentKey : null;
    setBoundKey(documentKey);
    setOffer(nextOffer);
  } else if (!ready && boundKey !== null) {
    holdKeyRef.current = null;
    setBoundKey(null);
    setOffer(null);
  }

  const persist = useCallback((key: string, nextValue: T, nextBaseline: T | null) => {
    if (holdKeyRef.current === key || nextBaseline === null) return;
    const marker = suppressionToken(key, nextBaseline);
    if (suppressedTokenRef.current === marker && !reserveDraftEquals(nextValue, nextBaseline)) return;
    try {
      if (reserveDraftEquals(nextValue, nextBaseline)) {
        if (suppressedTokenRef.current === marker) suppressedTokenRef.current = null;
        removeReserveDraft(key);
        return;
      }
      suppressedTokenRef.current = null;
      writeReserveDraft(key, nextValue, placeLabelRef.current, placeAnchorRef.current);
    } catch {
      // переповнення або заборона localStorage не блокує редагування
    }
  }, []);

  useEffect(() => {
    if (!ready || !documentKey || baseline === null || boundKey !== documentKey) return;
    if (holdKeyRef.current === documentKey || offer) return;

    const timer = window.setTimeout(() => {
      persist(documentKey, value, baseline);
    }, WRITE_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      persist(documentKey, value, baseline);
    };
  }, [ready, documentKey, baseline, boundKey, offer, value, placeLabel, placeAnchor, persist]);

  useEffect(() => {
    if (!documentKey) return;

    const flush = () => {
      if (!enabled || baselineRef.current === null) return;
      persist(documentKey, valueRef.current, baselineRef.current);
    };

    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [documentKey, enabled, persist]);

  const acceptOffer = useCallback(() => {
    holdKeyRef.current = null;
    setOffer(null);
  }, []);

  const dismissOffer = useCallback(() => {
    holdKeyRef.current = null;
    if (documentKey) removeReserveDraft(documentKey);
    setOffer(null);
  }, [documentKey]);

  const clearReserve = useCallback(() => {
    holdKeyRef.current = null;
    if (documentKey && baselineRef.current !== null) {
      suppressedTokenRef.current = suppressionToken(documentKey, baselineRef.current);
    }
    if (documentKey) removeReserveDraft(documentKey);
    setOffer(null);
  }, [documentKey]);

  return { offer, acceptOffer, dismissOffer, clearReserve };
}
