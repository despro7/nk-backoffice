import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ReportMenuSection } from "../../shared/ReportRefreshCacheActions";

/** Зсув кнопки від базової позиції (правий нижній кут): x – вліво, y – вгору, у px. */
export interface FilterBubbleOffset {
  x: number;
  y: number;
}

const HOLD_MS = 1000;
/** Рух пальця до спрацювання утримання: більше – це прокрутка, жест скасовується. */
const HOLD_MOVE_TOLERANCE = 8;
const BUTTON_SIZE = 56;
/**
 * Вгору кнопку можна підняти так, щоб її верх був не вище ~40% висоти екрана:
 * панель фільтрів відкривається над кнопкою, і їй потрібне місце.
 */
const MAX_BUTTON_TOP_RATIO = 0.4;
/** Відстань від низу екрана до низу кнопки в базовій позиції: 6.5rem (sticky-лінія) + 3rem (bottom-12). */
const BASE_BOTTOM_GAP = 152;
const STORAGE_PREFIX = "reports-sales:filter-bubble:";


const ZERO_OFFSET: FilterBubbleOffset = { x: 0, y: 0 };
const RESET_EVENT = "reports-sales:filter-bubble-reset";

/** Розділ «Вигляд» для меню дій звіту з пунктом скидання положення кнопки фільтра. */
export function filterBubbleResetSection(storageKey: string): ReportMenuSection {
  return {
    key: "view",
    title: "Вигляд",
    actions: [
      {
        key: "reset-filter-position",
        label: "Скинути положення фільтра",
        icon: "move-diagonal-2",
        onPress: () => resetFilterBubblePosition(storageKey),
      },
    ],
  };
}

/** Скидає збережене положення кнопки фільтра секції (пункт у меню дій звіту). */
export function resetFilterBubblePosition(storageKey: string) {
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + storageKey);
  } catch {
    // сховище недоступне: досить скинути стан нижче
  }
  window.dispatchEvent(new CustomEvent<string>(RESET_EVENT, { detail: storageKey }));
}

function readStoredOffset(storageKey: string | undefined): FilterBubbleOffset {
  if (!storageKey) return ZERO_OFFSET;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + storageKey);
    if (!raw) return ZERO_OFFSET;
    const parsed = JSON.parse(raw) as Partial<FilterBubbleOffset>;
    return {
      x: Number.isFinite(parsed.x) ? Math.max(0, Number(parsed.x)) : 0,
      y: Number.isFinite(parsed.y) ? Math.max(0, Number(parsed.y)) : 0,
    };
  } catch {
    return ZERO_OFFSET;
  }
}

function writeStoredOffset(storageKey: string | undefined, offset: FilterBubbleOffset) {
  if (!storageKey) return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(offset));
  } catch {
    // Приватний режим / заблоковане сховище: позиція просто не збережеться
  }
}

/**
 * Перетягування мобільної кнопки фільтра в межах її секції.
 * Натиснути й утримати 1 с → режим перетягування (підказка над кнопкою), далі кнопка йде за пальцем.
 * `sectionRef` – елемент, у межах ширини якого рухається кнопка.
 */
export function useDraggableFilterBubble({
  enabled,
  storageKey,
  sectionRef,
  handleSelector,
}: {
  enabled: boolean;
  storageKey?: string;
  sectionRef: React.RefObject<HTMLElement | null>;
  /** CSS-селектор елемента, за який можна тягнути. */
  handleSelector: string;
}) {
  const [offset, setOffset] = useState<FilterBubbleOffset>(() => readStoredOffset(storageKey));
  const [isDragging, setIsDragging] = useState(false);
  const [bounds, setBounds] = useState({ maxX: 0, maxY: 0 });

  const holdTimerRef = useRef<number | null>(null);
  const gestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffset: FilterBubbleOffset;
    target: HTMLElement;
  } | null>(null);
  const draggingRef = useRef(false);
  /** Після перетягування відпускання пальця не має відкривати панель. */
  const suppressPressRef = useRef(false);

  // Скидання з меню дій звіту: кнопка повертається у правий нижній кут
  useEffect(() => {
    if (!storageKey) return;
    const onReset = (event: Event) => {
      if ((event as CustomEvent<string>).detail === storageKey) setOffset(ZERO_OFFSET);
    };
    window.addEventListener(RESET_EVENT, onReset);
    return () => window.removeEventListener(RESET_EVENT, onReset);
  }, [storageKey]);

  // Межі: ширина секції і висота екрана (кнопка не заходить під шапку)
  useEffect(() => {
    if (!enabled) return;
    const section = sectionRef.current;
    if (!section) return;

    const measure = () => {
      const maxX = Math.max(0, section.clientWidth - BUTTON_SIZE);
      const maxY = Math.max(0, window.innerHeight * (1 - MAX_BUTTON_TOP_RATIO) - BASE_BOTTOM_GAP - BUTTON_SIZE);
      setBounds({ maxX, maxY });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(section);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [enabled, sectionRef]);

  const clampedOffset: FilterBubbleOffset = {
    x: Math.min(Math.max(0, offset.x), bounds.maxX),
    y: Math.min(Math.max(0, offset.y), bounds.maxY),
  };

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearHoldTimer, [clearHoldTimer]);

  const finishGesture = useCallback(() => {
    clearHoldTimer();
    const gesture = gestureRef.current;
    if (gesture && draggingRef.current) {
      try {
        gesture.target.releasePointerCapture(gesture.pointerId);
      } catch {
        // pointer вже відпущено
      }
      setOffset((current) => {
        writeStoredOffset(storageKey, current);
        return current;
      });
    }
    gestureRef.current = null;
    draggingRef.current = false;
    setIsDragging(false);
  }, [clearHoldTimer, storageKey]);

  const onPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0) return;
      // Жест лише з самої кнопки: утримання в панелі фільтрів (поля, списки) не перетягує
      if (!(event.target as HTMLElement).closest(handleSelector)) return;
      suppressPressRef.current = false;
      gestureRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffset: clampedOffset,
        target: event.currentTarget,
      };
      clearHoldTimer();
      holdTimerRef.current = window.setTimeout(() => {
        const gesture = gestureRef.current;
        if (!gesture) return;
        draggingRef.current = true;
        suppressPressRef.current = true;
        setIsDragging(true);
        try {
          gesture.target.setPointerCapture(gesture.pointerId);
        } catch {
          // pointer вже не активний
        }
        navigator.vibrate?.(20);
      }, HOLD_MS);
    },
    [clampedOffset, clearHoldTimer, enabled, handleSelector],
  );

  const onPointerMoveCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;

      if (!draggingRef.current) {
        if (Math.hypot(dx, dy) > HOLD_MOVE_TOLERANCE) {
          // Палець поїхав до спрацювання утримання: це прокрутка або звичайний тап
          clearHoldTimer();
          gestureRef.current = null;
        }
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setOffset({
        x: Math.min(Math.max(0, gesture.startOffset.x - dx), bounds.maxX),
        y: Math.min(Math.max(0, gesture.startOffset.y - dy), bounds.maxY),
      });
    },
    [bounds.maxX, bounds.maxY, clearHoldTimer],
  );

  const onPointerUpCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (draggingRef.current) {
        event.preventDefault();
        event.stopPropagation();
      }
      finishGesture();
    },
    [finishGesture],
  );

  /** true один раз після перетягування: обгортка onOpenChange ігнорує цей «тап». */
  const consumeSuppressedPress = useCallback(() => {
    if (!suppressPressRef.current) return false;
    suppressPressRef.current = false;
    return true;
  }, []);

  return {
    offset: clampedOffset,
    /** Найбільший зсув вліво: ширина секції мінус кнопка. */
    maxOffsetX: bounds.maxX,
    isDragging,
    consumeSuppressedPress,
    dragHandlers: {
      onPointerDownCapture,
      onPointerMoveCapture,
      onPointerUpCapture,
      onPointerCancelCapture: finishGesture,
      onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    },
  };
}
