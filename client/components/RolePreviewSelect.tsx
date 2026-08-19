import React from 'react';
import { Select, SelectItem } from '@heroui/select';
import { useNavigate, useLocation } from 'react-router-dom';
import { useRolePreview } from '../contexts/RolePreviewContext';
import { ROLES, ROLE_HIERARCHY, ROLE_LABELS, hasAccess, type RoleValue } from '@shared/constants/roles';
import { findAppRouteByPath } from '@/routes.config';
import { cn } from '../lib/utils';

interface RolePreviewSelectProps {
  className?: string;
}

const ROLE_OPTIONS = (Object.values(ROLES) as RoleValue[])
  .slice()
  .sort((a, b) => ROLE_HIERARCHY[b] - ROLE_HIERARCHY[a])
  .map((role) => ({
    value: role,
    label: ROLE_LABELS[role],
  }));

export const RolePreviewSelect: React.FC<RolePreviewSelectProps> = ({ className = '' }) => {
  const { isRealAdmin, effectiveRole, isPreviewing, setPreviewRole } = useRolePreview();
  const navigate = useNavigate();
  const location = useLocation();

  if (!isRealAdmin) {
    return null;
  }

  const selectedRole = (effectiveRole as RoleValue) || ROLES.ADMIN;

  const handleSelectionChange = (keys: 'all' | Set<React.Key>) => {
    if (keys === 'all') return;
    const value = Array.from(keys)[0];
    if (typeof value !== 'string' || !ROLE_OPTIONS.some((option) => option.value === value)) {
      return;
    }

    const role = value as RoleValue;
    setPreviewRole(role === ROLES.ADMIN ? null : role);

    const currentRoute = findAppRouteByPath(location.pathname);
    if (currentRoute && !hasAccess(role, currentRoute.roles, currentRoute.minRole)) {
      navigate('/', { replace: true });
    }
  };

  return (
    <Select
      aria-label="Перегляд інтерфейсу як роль"
      label="Роль"
      labelPlacement="inside"
      size="sm"
      variant="flat"
      // color={isPreviewing ? 'warning' : 'default'}
      selectedKeys={[selectedRole]}
      onSelectionChange={handleSelectionChange}
      disallowEmptySelection
      popoverProps={{ placement: 'top', offset: 8 }}
      className={cn('w-full', className)}
      classNames={{
        trigger: cn(
          'duration-150 rounded-md min-h-10 h-10',
          // isPreviewing ? 'bg-warning-400/50' : 'bg-neutral-100'
        ),
        label: cn(
          'text-xs',
          // isPreviewing ? 'text-warning-800' : 'text-neutral-500'
        ),
        value: cn(
          'text-sm font-medium',
          // isPreviewing ? 'text-warning-800' : 'text-neutral-600'
        ),
      }}
    >
      {ROLE_OPTIONS.map((option) => (
        <SelectItem key={option.value} textValue={option.label}>
          {option.label}
        </SelectItem>
      ))}
    </Select>
  );
};
