import { useState, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import MetaLogJsonView from '@/components/MetaLogJsonView';

interface PullFieldFullTextPopoverProps {
  fullText: string;
  title?: string;
  children: ReactNode;
}

export function PullFieldFullTextPopover({
  fullText,
  title,
  children,
}: PullFieldFullTextPopoverProps) {
  const [open, setOpen] = useState(false);

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
        <span
          className="inline text-left"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              setOpen((v) => !v);
            }
          }}
          role="button"
          tabIndex={0}
        >
          {children}
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="max-w-lg border border-default-200 px-3 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex max-h-[min(20rem,55vh)] min-w-[min(24rem,85vw)] flex-col gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {title ? <span className="text-xs font-semibold text-default-600">{title}</span> : null}
          <MetaLogJsonView value={fullText} className="h-full min-h-52" collapsed={2} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
