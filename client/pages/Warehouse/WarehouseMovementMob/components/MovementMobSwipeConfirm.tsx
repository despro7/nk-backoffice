import { SlideActionButton } from '@/components/motion/slide-action-button';
import { cn } from '@/lib/utils';

interface MovementMobSwipeConfirmProps {
  label?: string;
  disabled?: boolean;
  /** Space / Enter на повзунку — вбудований fallback beUI. */
  tapFallback?: boolean;
  onConfirm: () => void;
}

function GripThumb() {
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <span
          key={index}
          className="h-[18px] w-[4px] rounded-full bg-blue-500"
        />
      ))}
    </span>
  );
}

export default function MovementMobSwipeConfirm({
  label = 'Проведіть для підтвердження',
  disabled = false,
  onConfirm,
}: MovementMobSwipeConfirmProps) {
  return (
    <SlideActionButton
      className={cn(
        'h-18 w-full rounded-xl bg-blue-500 p-2 shadow-inner-sm',
        disabled && 'pointer-events-none opacity-50',
      )}
      fillClassName="bg-blue-500"
      thumbClassName="size-auto h-full w-[16vw] max-w-20 rounded-md bg-gradient-to-b from-white to-blue-100 text-blue-500 shadow-none [&:focus-visible]:ring-0 [&:focus-visible]:ring-offset-0"
      labelClassName="flex items-center justify-center font-inter text-base font-normal text-swipe-shimmer"
      completeLabelClassName="text-base font-normal text-white"
      completeLabel="Підтверджено"
      resetDelay={10_000}
      aria-disabled={disabled}
      thumb={<GripThumb />}
      onComplete={() => {
        if (disabled) return;
        onConfirm();
      }}
    >
      {label}
    </SlideActionButton>
  );
}
