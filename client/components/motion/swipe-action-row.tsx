import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { SPRING_LAYOUT, SPRING_PANEL, SPRING_SWAP } from "@/lib/ease";
import { lightHaptic } from "@/lib/haptic";
import {
  TOUCH_GESTURE_CONTENT_CLASS,
  capturePointer,
  holdSelection,
  releasePointer,
  usesIosSwipeGestures,
} from "@/lib/touch";
import { cn } from "@/lib/utils";

export type SwipeActionRest = "closed" | "leading" | "trailing" | "panel";

export interface SwipeActionRowAction {
  label: string;
  icon: ReactNode;
  className?: string;
  onAction: () => void;
}

export interface SwipeActionRowProps {
  children: ReactNode;
  disabled?: boolean;
  rest: SwipeActionRest;
  enterFromCollapsed?: boolean;
  onRestChange: (rest: SwipeActionRest) => void;
  /** Swipe right / left panel button. */
  leading?: SwipeActionRowAction;
  /** Swipe left / right panel button. */
  trailing?: SwipeActionRowAction;
  className?: string;
}

const REST = 72;
const PAD = 8;
const GAP = 10;
const MIN_PILL = 52;
const COMMIT_RATIO = 0.68;
const COMMIT_MIN = 220;
const PANEL_HEIGHT = 48;

function restTarget(rest: SwipeActionRest): number {
  if (rest === "leading") return REST;
  if (rest === "trailing") return -REST;
  return 0;
}

function lockPageScroll() {
  const html = document.documentElement;
  const body = document.body;
  html.style.setProperty("overflow", "hidden");
  body.style.setProperty("overflow", "hidden");
  html.style.setProperty("overscroll-behavior", "none");
  body.style.setProperty("overscroll-behavior", "none");
  const prevent = (event: TouchEvent) => {
    event.preventDefault();
  };
  document.addEventListener("touchmove", prevent, { passive: false });
  return () => {
    html.style.removeProperty("overflow");
    body.style.removeProperty("overflow");
    html.style.removeProperty("overscroll-behavior");
    body.style.removeProperty("overscroll-behavior");
    document.removeEventListener("touchmove", prevent);
  };
}

function useEnterFromCollapsed(
  enterFromCollapsed: boolean,
  heightMv: ReturnType<typeof useMotionValue<number | "auto">>,
  opacityMv: ReturnType<typeof useMotionValue<number>>,
  boxRef: RefObject<HTMLDivElement | null>,
) {
  useLayoutEffect(() => {
    if (!enterFromCollapsed) return;
    const node = boxRef.current;
    if (!node) return;
    const full = node.offsetHeight;
    heightMv.set(0);
    opacityMv.set(0);
    const frame = requestAnimationFrame(() => {
      void animate(heightMv, full, SPRING_PANEL).then(() => {
        heightMv.set("auto");
      });
      void animate(opacityMv, 1, SPRING_SWAP);
    });
    return () => cancelAnimationFrame(frame);
  }, [enterFromCollapsed, heightMv, opacityMv, boxRef]);
}

export function SwipeActionRow(props: SwipeActionRowProps) {
  if (props.disabled) {
    return <div className={cn("pb-4", props.className)}>{props.children}</div>;
  }
  if (!usesIosSwipeGestures()) {
    return <PanelActionRow {...props} />;
  }
  return <IosSwipeRow {...props} />;
}

function PanelActionRow({
  children,
  rest,
  enterFromCollapsed = false,
  onRestChange,
  leading,
  trailing,
  className,
}: SwipeActionRowProps) {
  const open = rest !== "closed";
  const heightMv = useMotionValue<number | "auto">("auto");
  const cardOpacity = useMotionValue(1);
  const boxRef = useRef<HTMLDivElement>(null);
  const exitingRef = useRef(false);
  const [exiting, setExiting] = useState(false);

  useEnterFromCollapsed(enterFromCollapsed, heightMv, cardOpacity, boxRef);

  const runTrailing = () => {
    if (!trailing || exitingRef.current) return;
    exitingRef.current = true;
    setExiting(true);
    onRestChange("closed");
    lightHaptic();
    const height = boxRef.current?.offsetHeight ?? 0;
    heightMv.set(height);
    void animate(cardOpacity, 0, SPRING_SWAP);
    void animate(heightMv, 0, SPRING_PANEL)
      .then(() => {
        trailing.onAction();
      })
      .catch(() => {
        trailing.onAction();
      });
  };

  return (
    <motion.div
      className="overflow-hidden"
      style={{ height: heightMv, opacity: cardOpacity }}
    >
      <div ref={boxRef} className={cn("pb-2.5", className)}>
        <div className="overflow-hidden rounded-xl bg-white">
          <div
            role="button"
            tabIndex={0}
            className="relative z-10 bg-white text-left outline-none touch-manipulation [&>*]:rounded-none [&>*]:shadow-none"
            onClick={() => {
              if (exiting) return;
              onRestChange(open ? "closed" : "panel");
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              if (exiting) return;
              onRestChange(open ? "closed" : "panel");
            }}
          >
            {children}
          </div>

          <motion.div
            initial={false}
            animate={{ height: open && !exiting ? PANEL_HEIGHT : 0 }}
            transition={SPRING_PANEL}
            className="overflow-hidden"
          >
            <div className="flex h-12">
              {leading ? (
                <button
                  type="button"
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 text-sm font-semibold text-white touch-manipulation bg-primary",
                    leading.className,
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (exiting) return;
                    lightHaptic();
                    onRestChange("closed");
                    leading.onAction();
                  }}
                >
                  {leading.icon}
                  {leading.label}
                </button>
              ) : null}
              {trailing ? (
                <button
                  type="button"
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 text-sm font-semibold text-white touch-manipulation bg-danger",
                    trailing.className,
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    runTrailing();
                  }}
                >
                  {trailing.icon}
                  {trailing.label}
                </button>
              ) : null}
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function IosSwipeRow({
  children,
  rest,
  enterFromCollapsed = false,
  onRestChange,
  leading,
  trailing,
  className,
}: SwipeActionRowProps) {
  const x = useMotionValue(0);
  const heightMv = useMotionValue<number | "auto">("auto");
  const cardOpacity = useMotionValue(1);
  const boxRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(320);
  const heightRef = useRef(96);
  const restRef = useRef(rest);
  const draggingRef = useRef(false);
  const armedRef = useRef(false);
  const exitingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const releaseSelectionRef = useRef<(() => void) | null>(null);
  const unlockScrollRef = useRef<(() => void) | null>(null);
  const [exiting, setExiting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rowWidth, setRowWidth] = useState(320);
  const [cardHeight, setCardHeight] = useState(96);
  restRef.current = rest;

  useLayoutEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const measure = () => {
      widthRef.current = node.offsetWidth;
      setRowWidth(node.offsetWidth);
      if (!exitingRef.current) {
        heightRef.current = node.offsetHeight;
        setCardHeight(Math.max(MIN_PILL + PAD * 2, node.offsetHeight - GAP));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEnterFromCollapsed(enterFromCollapsed, heightMv, cardOpacity, boxRef);

  useEffect(() => {
    return () => {
      unlockScrollRef.current?.();
      unlockScrollRef.current = null;
      releaseSelectionRef.current?.();
      releaseSelectionRef.current = null;
    };
  }, []);

  const beginScrollLock = () => {
    if (unlockScrollRef.current) return;
    unlockScrollRef.current = lockPageScroll();
  };

  const endScrollLock = () => {
    unlockScrollRef.current?.();
    unlockScrollRef.current = null;
    setDragging(false);
  };

  useEffect(() => {
    if (draggingRef.current || exitingRef.current) return;
    void animate(x, restTarget(rest), SPRING_LAYOUT);
  }, [rest, x]);

  const commitAt = () => Math.max(COMMIT_MIN, widthRef.current * COMMIT_RATIO);

  const capPill = (revealed: number) => {
    const maxW = Math.max(0, widthRef.current - PAD * 2);
    return Math.min(Math.max(0, revealed), maxW);
  };
  const trailingWidth = useTransform(x, (value) => capPill(-value - PAD * 2));
  const leadingWidth = useTransform(x, (value) => capPill(value - PAD * 2));
  const trailingOpacity = useTransform(x, (value) => (value < -6 ? 1 : 0));
  const leadingOpacity = useTransform(x, (value) => (value > 6 ? 1 : 0));
  const trailingLabelOpacity = useTransform(x, (value) => {
    const over = -value - commitAt();
    return Math.max(0, Math.min(1, over / 28));
  });
  const leadingLabelOpacity = useTransform(x, (value) => {
    const over = value - commitAt();
    return Math.max(0, Math.min(1, over / 28));
  });
  const trailingLabelMaxW = useTransform(
    trailingLabelOpacity,
    (opacity) => `${Math.round(opacity * 110)}px`,
  );
  const leadingLabelMaxW = useTransform(
    leadingLabelOpacity,
    (opacity) => `${Math.round(opacity * 110)}px`,
  );
  const trailingLabelGap = useTransform(trailingLabelOpacity, (opacity) => opacity * 8);
  const leadingLabelGap = useTransform(leadingLabelOpacity, (opacity) => opacity * 8);
  const leadingPointerEvents = useTransform(x, (value): "auto" | "none" =>
    value > 10 ? "auto" : "none",
  );
  const trailingPointerEvents = useTransform(x, (value): "auto" | "none" =>
    value < -10 ? "auto" : "none",
  );

  useMotionValueEvent(x, "change", (value) => {
    if (exitingRef.current) return;
    const armed = Math.abs(value) >= commitAt();
    if (armed && !armedRef.current) {
      armedRef.current = true;
      lightHaptic();
    }
    if (!armed) armedRef.current = false;
  });

  const pillHeight = Math.max(MIN_PILL, cardHeight - PAD * 2);

  const finishTrailing = () => {
    if (!trailing || exitingRef.current) return;
    exitingRef.current = true;
    draggingRef.current = false;
    setExiting(true);
    onRestChange("closed");
    lightHaptic();
    const width = widthRef.current;
    const height = heightRef.current;
    heightMv.set(height);
    void Promise.all([
      animate(x, -(width + 40), { type: "spring", stiffness: 320, damping: 36, mass: 0.7 }),
      animate(cardOpacity, 0, SPRING_SWAP),
    ])
      .then(() => animate(heightMv, 0, SPRING_PANEL))
      .then(() => {
        trailing.onAction();
      })
      .catch(() => {
        trailing.onAction();
      });
  };

  const finishLeading = () => {
    if (!leading || exitingRef.current) return;
    exitingRef.current = true;
    draggingRef.current = false;
    setExiting(true);
    onRestChange("closed");
    lightHaptic();
    const width = widthRef.current;
    void animate(x, width + 40, { type: "spring", stiffness: 320, damping: 36, mass: 0.7 })
      .then(() => {
        leading.onAction();
        x.set(0);
        exitingRef.current = false;
        setExiting(false);
      })
      .catch(() => {
        leading.onAction();
        x.set(0);
        exitingRef.current = false;
        setExiting(false);
      });
  };

  return (
    <motion.div className="overflow-hidden" style={{ height: heightMv }}>
      <div ref={boxRef} className={cn("pb-2.5", className)}>
        <div className="relative overflow-hidden rounded-xl">
          {leading ? (
            <motion.button
              type="button"
              aria-label={leading.label}
              className={cn(
                "absolute top-1/2 left-2 z-[2] flex items-center justify-center overflow-hidden",
                "bg-primary text-white shadow-sm",
                TOUCH_GESTURE_CONTENT_CLASS,
                leading.className,
              )}
              style={{
                width: leadingWidth,
                height: pillHeight,
                y: "-50%",
                borderRadius: pillHeight / 2,
                opacity: leadingOpacity,
                minWidth: 0,
                pointerEvents: leadingPointerEvents,
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => {
                event.stopPropagation();
                if (draggingRef.current || exitingRef.current) return;
                finishLeading();
              }}
            >
              {leading.icon}
              <motion.span
                className="overflow-hidden whitespace-nowrap text-sm font-medium"
                style={{
                  opacity: leadingLabelOpacity,
                  maxWidth: leadingLabelMaxW,
                  marginLeft: leadingLabelGap,
                }}
              >
                {leading.label}
              </motion.span>
            </motion.button>
          ) : null}

          {trailing ? (
            <motion.button
              type="button"
              aria-label={trailing.label}
              className={cn(
                "absolute top-1/2 right-2 z-[2] flex items-center justify-center overflow-hidden",
                "bg-danger text-white shadow-sm",
                TOUCH_GESTURE_CONTENT_CLASS,
                trailing.className,
              )}
              style={{
                width: trailingWidth,
                height: pillHeight,
                y: "-50%",
                borderRadius: pillHeight / 2,
                opacity: trailingOpacity,
                minWidth: 0,
                pointerEvents: trailingPointerEvents,
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => {
                event.stopPropagation();
                if (draggingRef.current || exitingRef.current) return;
                finishTrailing();
              }}
            >
              {trailing.icon}
              <motion.span
                className="overflow-hidden whitespace-nowrap text-sm font-medium"
                style={{
                  opacity: trailingLabelOpacity,
                  maxWidth: trailingLabelMaxW,
                  marginLeft: trailingLabelGap,
                }}
              >
                {trailing.label}
              </motion.span>
            </motion.button>
          ) : null}

          <motion.div
            ref={cardRef}
            className={cn(
              "relative z-[1] overflow-hidden rounded-xl will-change-transform",
              TOUCH_GESTURE_CONTENT_CLASS,
              dragging && "touch-none",
            )}
            style={{ x, opacity: cardOpacity }}
            drag={exiting ? false : "x"}
            dragDirectionLock
            dragMomentum={false}
            dragElastic={0.04}
            dragConstraints={{
              left: trailing ? -(rowWidth * 0.92) : 0,
              right: leading ? rowWidth * 0.92 : 0,
            }}
            onPointerDown={(event) => {
              if (event.pointerType === "mouse" && event.button !== 0) return;
              pointerIdRef.current = event.pointerId;
              if (cardRef.current) {
                releaseSelectionRef.current?.();
                releaseSelectionRef.current = holdSelection(cardRef.current);
              }
            }}
            onDragStart={() => {
              draggingRef.current = true;
              setDragging(true);
              beginScrollLock();
              const node = cardRef.current;
              const pointerId = pointerIdRef.current;
              if (node && pointerId != null) {
                capturePointer(node, pointerId);
              }
            }}
            onDragEnd={(_, info) => {
              endScrollLock();
              draggingRef.current = false;
              const node = cardRef.current;
              const pointerId = pointerIdRef.current;
              if (node && pointerId != null) {
                releasePointer(node, pointerId);
              }
              pointerIdRef.current = null;
              releaseSelectionRef.current?.();
              releaseSelectionRef.current = null;
              if (exitingRef.current) return;
              const offset = x.get();
              const abs = Math.abs(offset);
              const threshold = commitAt();
              const flungFar = abs >= threshold * 0.8;
              const flungTrailing = Boolean(trailing) && flungFar && info.velocity.x < -1100;
              const flungLeading = Boolean(leading) && flungFar && info.velocity.x > 1100;

              if (trailing && offset < 0 && (abs >= threshold || flungTrailing)) {
                finishTrailing();
                return;
              }
              if (leading && offset > 0 && (abs >= threshold || flungLeading)) {
                finishLeading();
                return;
              }

              const snapOpen = abs >= REST * 0.85;

              if (snapOpen) {
                const side: SwipeActionRest =
                  offset < 0 && trailing ? "trailing" : leading ? "leading" : "closed";
                onRestChange(side);
                void animate(x, restTarget(side), SPRING_LAYOUT);
                return;
              }

              onRestChange("closed");
              void animate(x, 0, SPRING_LAYOUT);
            }}
            onTap={() => {
              if (restRef.current === "closed" || exitingRef.current) return;
              onRestChange("closed");
              void animate(x, 0, SPRING_LAYOUT);
            }}
          >
            {children}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
