import { useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

export function formatPullConflictValue(value: string | null | undefined, max = 120): string {
  if (!value?.trim()) return '—';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}…`;
}

interface PullFieldConflictTooltipProps {
  fieldLabel: string;
  localValue: string | null;
  remoteValue: string | null;
}

function PullConflictTooltipContent({
  fieldLabel,
  localValue,
  remoteValue,
}: PullFieldConflictTooltipProps) {
  return (
    <div className="max-w-xs space-y-2 text-xs">
      <p className="font-semibold">{fieldLabel}</p>
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5">
        <span className="font-medium text-default-400">BO</span>
        <span className="break-words text-default-700">{formatPullConflictValue(localValue)}</span>
        <span className="font-medium text-default-400">WC</span>
        <span className="break-words text-primary-700">{formatPullConflictValue(remoteValue)}</span>
      </div>
    </div>
  );
}

export function PullFieldConflictTooltip({
  fieldLabel,
  localValue,
  remoteValue,
}: PullFieldConflictTooltipProps) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), 120);
  };

  const openNow = () => {
    cancelClose();
    setOpen(true);
  };

  return (
    <Popover
      isOpen={open}
      onOpenChange={setOpen}
      placement="top"
      showArrow
      offset={8}
      shouldBlockScroll={false}
      classNames={{ base: 'z-[10050]' }}
    >
      <PopoverTrigger>
        <button
          type="button"
          className="inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded text-warning-600 hover:bg-warning-50"
          aria-label={`Конфлікт ${fieldLabel}`}
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
          onFocus={openNow}
          onBlur={scheduleClose}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((value) => !value);
          }}
        >
          <DynamicIcon name="triangle-alert" size={12} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="max-w-xs border border-default-200 px-3 py-2"
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      >
        <PullConflictTooltipContent
          fieldLabel={fieldLabel}
          localValue={localValue}
          remoteValue={remoteValue}
        />
      </PopoverContent>
    </Popover>
  );
}
