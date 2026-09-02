import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { cn } from '@/lib/utils';
import type { NavGroup, AppRoute } from '@/routes.config';
import { NavBadgePill } from '@/components/NavBadgePill';

/** Перевизначає size у DynamicIcon з routes.config (там часто 16). */
function withIconSize(icon: ReactNode, size: number): ReactNode {
  if (!isValidElement(icon)) return icon;
  return cloneElement(icon as ReactElement<{ size?: number }>, { size });
}

interface MobileGroupDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  group: NavGroup | null;
  activePath: string;
}

export function MobileGroupDrawer({
  isOpen,
  onOpenChange,
  group,
  activePath,
}: MobileGroupDrawerProps) {
  const navigate = useNavigate();

  const title = group?.parentRoute?.navLabel ?? group?.groupMeta?.label ?? group?.key ?? '';

  const items: AppRoute[] = [];
  if (group?.parentRoute) items.push(group.parentRoute);
  if (group) items.push(...group.children);

  const handleSelect = (path: string) => {
    navigate(path);
    onOpenChange(false);
  };

  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      placement="bottom"
      size="lg"
    >
      <DrawerContent>
        {() => (
          <>
            <DrawerHeader className="border-b border-neutral-100">
              <span className="font-inter text-base font-semibold text-neutral-800">{title}</span>
            </DrawerHeader>
            <DrawerBody className="gap-1 py-3 px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {items.map((item) => {
                const isActive = activePath === item.path;
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => handleSelect(item.path)}
                    className={cn(
                      'flex items-center gap-2 w-full px-3 py-3 rounded-lg text-left transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-neutral-700 hover:bg-neutral-100'
                    )}
                  >
                    <div className="w-6 h-6 shrink-0 flex items-center justify-center">
                      {withIconSize(item.icon, 20)}
                    </div>
                    <span className="flex-1 font-inter text-md font-medium flex items-center gap-1.5">
                      {item.navLabel}
                      {item.navBadge ? <NavBadgePill badge={item.navBadge} /> : null}
                    </span>
                    {isActive && (
                      <DynamicIcon name="check" size={18} className="text-primary shrink-0" />
                    )}
                  </button>
                );
              })}
            </DrawerBody>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
