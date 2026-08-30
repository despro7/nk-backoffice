import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { SPRING_LAYOUT, SPRING_PRESS, SPRING_SWAP } from "@/lib/ease";
import { lightHaptic } from "@/lib/haptic";
import { TOUCH_GESTURE_CLASS, TOUCH_GESTURE_CONTENT_CLASS } from "@/lib/touch";
import { cn } from "@/lib/utils";

export interface SlideActionButtonProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> {
  children: ReactNode;
  completeLabel?: ReactNode;
  /** Кастомний вміст повзунка (до завершення). Після complete — стандартна галочка. */
  thumb?: ReactNode;
  threshold?: number;
  resetDelay?: number;
  onComplete?: () => void;
  thumbClassName?: string;
  fillClassName?: string;
  labelClassName?: string;
  completeLabelClassName?: string;
}

export function SlideActionButton({
  children,
  completeLabel = "Complete",
  thumb,
  threshold = 0.82,
  resetDelay = 1200,
  onComplete,
  thumbClassName,
  fillClassName,
  labelClassName,
  completeLabelClassName,
  className,
  ...rest
}: SlideActionButtonProps) {
  const reduce = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLButtonElement>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);
  const x = useMotionValue(0);
  const [maxDistance, setMaxDistance] = useState(0);
  const [completed, setCompleted] = useState(false);
  const safeDistance = Math.max(maxDistance, 1);
  const dragProgress = useTransform(x, [0, safeDistance], [0, 1]);
  const fillProgress = useTransform(x, [0, safeDistance], [0, 1]);
  const labelOpacity = useTransform(
    x,
    [0, safeDistance * 0.35, safeDistance * 0.65],
    [1, 0.75, 0],
  );
  const iconPath = useTransform(
    dragProgress,
    [0, 0.5, 1],
    [
      "M 8 5 L 15 12 L 8 19",
      "M 7 8 L 12 14 L 17 10",
      "M 5 12 L 10 17 L 19 7",
    ],
  );

  useLayoutEffect(() => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return;

    const measure = () => {
      const styles = getComputedStyle(track);
      const padX =
        parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      setMaxDistance(
        Math.max(track.clientWidth - thumb.clientWidth - padX, 0),
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    observer.observe(thumb);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  const moveTo = (target: number) => {
    if (reduce) {
      x.set(target);
      return;
    }
    animate(x, target, SPRING_LAYOUT);
  };

  const reset = () => {
    completedRef.current = false;
    setCompleted(false);
    moveTo(0);
  };

  const complete = () => {
    if (completedRef.current || maxDistance === 0) return;
    completedRef.current = true;
    setCompleted(true);
    lightHaptic();
    moveTo(maxDistance);
    onComplete?.();

    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(reset, resetDelay);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    complete();
  };

  return (
    <div
      ref={trackRef}
      className={cn(
        "relative h-16 w-72 overflow-hidden rounded-[22px] bg-primary/10 p-1",
        "ring-1 ring-primary/10",
        // The track only carries the label — the slide starts on the thumb,
        // which suppresses selection for the whole gesture on its own.
        TOUCH_GESTURE_CONTENT_CLASS,
        className,
      )}
      {...rest}
    >
      <motion.span
        aria-hidden="true"
        style={{ scaleX: fillProgress }}
        className={cn(
          "absolute inset-0 origin-left bg-primary will-change-transform",
          fillClassName,
        )}
      />

      <motion.span
        aria-hidden="true"
        style={{ opacity: labelOpacity }}
        className={cn(
          "pointer-events-none absolute inset-0 grid place-items-center pl-10 text-sm font-medium text-foreground",
          labelClassName,
        )}
      >
        {children}
      </motion.span>

      <motion.span
        aria-live="polite"
        animate={{ opacity: completed ? 1 : 0 }}
        transition={reduce ? { duration: 0 } : SPRING_SWAP}
        className={cn(
          "pointer-events-none absolute inset-0 grid place-items-center text-sm font-medium text-primary-foreground",
          completeLabelClassName,
        )}
      >
        {completed ? completeLabel : null}
      </motion.span>

      <motion.button
        ref={thumbRef}
        type="button"
        aria-label={typeof children === "string" ? children : "Slide action"}
        drag={completed ? false : "x"}
        dragConstraints={{ left: 0, right: maxDistance }}
        dragElastic={0}
        dragMomentum={false}
        style={{ x }}
        onDragEnd={() => {
          if (x.get() >= maxDistance * threshold) complete();
          else moveTo(0);
        }}
        onKeyDown={handleKeyDown}
        whileTap={reduce || completed ? undefined : { scale: 0.94 }}
        transition={SPRING_PRESS}
        className={cn(
          "relative z-10 grid size-14 touch-none cursor-grab place-items-center rounded-[18px] bg-primary text-primary-foreground shadow-sm",
          TOUCH_GESTURE_CLASS,
          "outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          completed && "cursor-default bg-background text-foreground",
          thumbClassName,
        )}
      >
        {thumb && !completed ? (
          thumb
        ) : (
          <motion.svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
            <motion.path
              d={iconPath}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </motion.svg>
        )}
      </motion.button>
    </div>
  );
}
