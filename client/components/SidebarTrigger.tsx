import { DynamicIcon } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/contexts/SidebarContext';

interface SidebarTriggerProps {
  className?: string;
  /** Компактний варіант для mobile header / tab bar */
  size?: 'default' | 'sm';
}

export function SidebarTrigger({ className, size = 'default' }: SidebarTriggerProps) {
  const { open, toggle } = useSidebar();
  const iconSize = size === 'sm' ? 22 : 24;

  return (
    <button
      type="button"
      aria-label={open ? 'Закрити меню' : 'Відкрити меню'}
      aria-expanded={open}
      className={cn(
        'flex items-center justify-center rounded-sm transition-all duration-200',
        'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 shrink-0',
        size === 'sm' ? 'p-1.5' : 'p-2',
        className
      )}
      onClick={toggle}
    >
      <DynamicIcon name={open ? "panel-left-close" : "panel-left-open"} size={iconSize} strokeWidth={2} />
    </button>
  );
}
