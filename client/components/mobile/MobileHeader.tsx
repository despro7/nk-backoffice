import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, User } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { useAuth } from '@/contexts/AuthContext';
import { useRolePreview } from '@/contexts/RolePreviewContext';
import { NotificationBell } from '@/components/NotificationBell';
import { NavBadgePill } from '@/components/NavBadgePill';
import { resolveMobileNavLabel } from '@/components/mobile/resolveMobileNavLabel';
import { cn } from '@/lib/utils';
import {
  SALESDRIVE_ORDERS_PATH,
  resolveRouteNavBadge,
  useNotShippedOrdersCount,
} from '@/hooks/useNotShippedOrdersCount';

interface MobileHeaderProps {
  className?: string;
}

/**
 * Мобільний chrome-header у потоці документа (не fixed/sticky).
 * Скролиться разом зі сторінкою; TabBar закріплений знизу.
 */
export function MobileHeader({ className }: MobileHeaderProps) {
  const { user, logout } = useAuth();
  const { effectiveRole, effectivePermissions } = useRolePreview();
  const navigate = useNavigate();
  const location = useLocation();
  const navItem = resolveMobileNavLabel(location.pathname, effectiveRole, effectivePermissions);
  const notShippedCount = useNotShippedOrdersCount(navItem.path === SALESDRIVE_ORDERS_PATH);
  const navBadge = resolveRouteNavBadge(navItem.path ?? '', navItem.navBadge, notShippedCount);

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  return (
    <header
      className={cn(
        'lg:hidden shrink-0 flex items-center gap-2 px-3 py-2 min-h-12',
        'border-b border-grey-200 bg-background-paper',
        'pt-[max(0.5rem,env(safe-area-inset-top))]',
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {navItem.icon && React.isValidElement(navItem.icon) &&
          React.cloneElement(navItem.icon as React.ReactElement<{ className?: string; size?: number }>, {
            className: 'w-5 h-5 shrink-0 text-neutral-600',
            size: 20,
          })}
        <span className="min-w-0 truncate font-inter text-sm font-semibold text-neutral-700 leading-tight flex items-center gap-1.5">
          <span className="truncate">{navItem.label}</span>
          {navBadge ? <NavBadgePill badge={navBadge} /> : null}
        </span>
      </div>

      <NotificationBell onNavigate={(href) => navigate(href)} size="sm" />

      {user && (
        <Dropdown placement="bottom-end">
          <DropdownTrigger>
            <User
              as="button"
              avatarProps={{
                isBordered: false,
                className: 'w-7 h-7 bg-linear-to-br from-[#e0d7f2] to-[#a3b8ff] from-20% to-80%',
                showFallback: true,
                fallback: <DynamicIcon name="user-round" size={16} color="white" />,
                src:
                  'https://api.dicebear.com/9.x/initials/svg?seed=' + user.name +
                  '&backgroundColor=a3b8ff,7ca3d8,8fa3c6&backgroundType=gradientLinear&backgroundRotation=30&chars=1',
              }}
              classNames={{
                base: 'cursor-pointer transition-transform gap-0 ml-1',
                name: 'hidden',
                description: 'hidden',
              }}
              name={user.name || user.email}
              description={user.roleName || user.role || 'Користувач'}
            />
          </DropdownTrigger>
          <DropdownMenu aria-label="User Actions" variant="flat">
            <DropdownItem
              key="settings"
              startContent={<DynamicIcon name="user-round" size={18} />}
              onClick={() => navigate('/profile')}
            >
              Мій профіль
            </DropdownItem>
            <DropdownItem
              key="logout"
              startContent={<DynamicIcon name="log-out" size={18} />}
              onClick={handleLogout}
              color="danger"
            >
              Вийти
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      )}
    </header>
  );
}
