import { useState } from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { DebugModeSwitch } from '@/components/DebugModeSwitch';
import { RolePreviewSelect } from '@/components/RolePreviewSelect';
import { useRolePreview } from '@/contexts/RolePreviewContext';
import { useDebug } from '@/contexts/DebugContext';
import { ROLE_LABELS, type RoleValue } from '@shared/constants/roles';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'sidebarAdminToolsOpen';

function readStoredOpen(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function SidebarAdminFooter() {
  const { isRealAdmin, isPreviewing, effectiveRole } = useRolePreview();
  const { isDebugMode } = useDebug();
  const [open, setOpen] = useState(readStoredOpen);

  if (!isRealAdmin) {
    return null;
  }

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const previewLabel =
    isPreviewing && effectiveRole
      ? ROLE_LABELS[effectiveRole as RoleValue] ?? effectiveRole
      : null;

  const triggerLabel = previewLabel
    ? isDebugMode
      ? `${previewLabel} · debug`
      : previewLabel
    : isDebugMode
      ? 'Режим налагодження'
      : 'Інструменти';

  return (
    <div className="shrink-0 border-t border-neutral-100 bg-white">
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-in-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={cn(
              'p-3 flex flex-col gap-3 transition-transform duration-300 ease-in-out',
              open ? 'translate-y-0' : 'translate-y-2'
            )}
          >
            <DebugModeSwitch className="ml-0 w-full justify-start" />
            <RolePreviewSelect />
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Сховати інструменти' : 'Показати інструменти'}
        onClick={toggleOpen}
        className={cn(
          'flex items-center gap-2 px-3 py-2.5 w-full cursor-pointer',
          'transition-colors duration-300 ease-in-out',
          'text-neutral-600 hover:text-neutral-700 hover:bg-neutral-100',
          isPreviewing && 'text-warning-800 hover:text-warning-800 bg-warning-400/70 hover:bg-warning-400/40',
          isDebugMode && !isPreviewing && 'text-danger hover:text-danger hover:bg-danger/10'
        )}
      >
        <DynamicIcon
          name={isPreviewing ? 'scan-eye' : isDebugMode ? 'bug' : 'sliders-horizontal'}
          size={16}
          className="shrink-0"
        />
        <span className="flex-1 font-inter text-sm font-medium leading-[125%] text-left truncate">
          {triggerLabel}
        </span>
        <DynamicIcon
          name="chevron-up"
          size={16}
          className={cn(
            'shrink-0 transition-transform duration-300 ease-in-out',
            open && 'rotate-180'
          )}
        />
      </button>
    </div>
  );
}
