import { useState, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { StorefrontDocJsonCompareView } from './StorefrontDocJsonCompareView';

interface PullFieldStorefrontDocComparePopoverProps {
  localRaw: string;
  wooRaw: string;
  positionLabel: string;
  children: ReactNode;
}

export function PullFieldStorefrontDocComparePopover({
  localRaw,
  wooRaw,
  positionLabel,
  children,
}: PullFieldStorefrontDocComparePopoverProps) {
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
        className="max-w-5xl border border-default-200 px-3 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-h-[min(28rem,75vh)] min-w-[min(36rem,94vw)] overflow-hidden">
          <StorefrontDocJsonCompareView
            localRaw={localRaw}
            wooRaw={wooRaw}
            positionLabel={positionLabel}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
