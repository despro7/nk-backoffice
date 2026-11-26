import { DynamicIcon } from 'lucide-react/dynamic';
import { WhatsNewModal } from './WhatsNewModal';
import { CURRENT_VERSION, useWhatsNew } from './useWhatsNew';

interface SidebarWhatsNewProps {
  /** Напр. закрити мобільний сайдбар. */
  onOpen?: () => void;
}

export function SidebarWhatsNew({ onOpen }: SidebarWhatsNewProps) {
  const { releases, hasUnread, isOpen, open, close } = useWhatsNew();

  const handleClick = () => {
    onOpen?.();
    open();
  };

  return (
    <div className="shrink-0 border-t border-neutral-100 bg-white">
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-2 px-3 py-2.5 w-full cursor-pointer text-neutral-600 hover:text-neutral-700 hover:bg-neutral-100 transition-colors duration-300 ease-in-out"
      >
        <DynamicIcon name="sparkles" size={16} className="shrink-0" />
        <span className="flex flex-1 min-w-0 items-center gap-1.5 font-inter text-sm font-medium leading-[125%] text-left">
          <span className="truncate">Що нового</span>
          {hasUnread && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-danger" aria-label="Є непрочитані зміни" />
          )}
        </span>
        <span className="shrink-0 text-xs text-default-400">v{CURRENT_VERSION}</span>
      </button>
      <WhatsNewModal isOpen={isOpen} onClose={close} releases={releases} />
    </div>
  );
}
