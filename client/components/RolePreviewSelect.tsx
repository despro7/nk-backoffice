import React from 'react';
import { Select, SelectItem } from '@heroui/select';
import { useNavigate, useLocation } from 'react-router-dom';
import { useRolePreview } from '../contexts/RolePreviewContext';
import { ROLES } from '@shared/constants/roles';
import { canAccessRoute } from '@shared/constants/permissions';
import { findAppRouteByPath } from '@/routes.config';
import { cn } from '../lib/utils';

interface RolePreviewSelectProps {
  className?: string;
}

export const RolePreviewSelect: React.FC<RolePreviewSelectProps> = ({ className = '' }) => {
  const { isRealAdmin, effectiveRole, setPreviewRole, previewRoles } = useRolePreview();
  const navigate = useNavigate();
  const location = useLocation();

  if (!isRealAdmin) {
    return null;
  }

  const options = [...previewRoles].sort((a, b) => b.rank - a.rank);
  const selectedRole = effectiveRole || ROLES.ADMIN;

  const handleSelectionChange = (keys: 'all' | Set<React.Key>) => {
    if (keys === 'all') return;
    const value = Array.from(keys)[0];
    if (typeof value !== 'string' || !options.some((option) => option.slug === value)) {
      return;
    }

    setPreviewRole(value === ROLES.ADMIN ? null : value);

    const currentRoute = findAppRouteByPath(location.pathname);
    const selected = options.find((option) => option.slug === value);
    if (currentRoute && !canAccessRoute(selected?.permissions, currentRoute, value)) {
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
      selectedKeys={[selectedRole]}
      onSelectionChange={handleSelectionChange}
      disallowEmptySelection
      popoverProps={{ placement: 'top', offset: 8 }}
      className={cn('w-full', className)}
      classNames={{
        trigger: cn('duration-150 rounded-md min-h-10 h-10'),
        label: cn('text-xs'),
        value: cn('text-sm font-medium'),
      }}
    >
      {options.map((option) => (
        <SelectItem key={option.slug} textValue={option.name}>
          {option.name}
        </SelectItem>
      ))}
    </Select>
  );
};
