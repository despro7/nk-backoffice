import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Select, SelectItem } from '@heroui/select';
import { Card, CardHeader, CardBody } from '@heroui/card';
import { Table, TableHeader, TableBody, TableColumn, TableRow, TableCell } from '@heroui/table';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { Checkbox } from '@heroui/checkbox';
import { Chip } from '@heroui/chip';
import { Edit, Plus, Trash2 } from 'lucide-react';
import {
  PERMISSIONS,
  PERMISSION_CATALOG,
  PERMISSION_GROUP_LABELS,
  type PermissionGroup,
} from '@shared/constants/permissions';
import { ROLES } from '@shared/constants/roles';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import type { RoleDto } from '@shared/types/role';

export function RolesManager() {
  const { hasPermission } = useRoleAccess();
  const canManage = hasPermission(PERMISSIONS.ACTION_ROLES_MANAGE);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editing, setEditing] = useState<RoleDto | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/roles', { credentials: 'include' });
      if (!response.ok) throw new Error('Не вдалося завантажити ролі');
      setRoles(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка завантаження ролей');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRoles();
  }, [fetchRoles]);

  const flash = (message: string, isError = false) => {
    if (isError) {
      setError(message);
      setSuccess('');
    } else {
      setSuccess(message);
      setError('');
    }
    setTimeout(() => {
      setError('');
      setSuccess('');
    }, 3000);
  };

  const handleDelete = async (role: RoleDto) => {
    if (role.isSystem || role.slug === ROLES.ADMIN) return;
    if (!confirm(`Видалити роль «${role.name}»?`)) return;
    const response = await fetch(`/api/roles/${role.id}`, { method: 'DELETE', credentials: 'include' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      flash(data.message || 'Не вдалося видалити роль', true);
      return;
    }
    flash('Роль видалено');
    void fetchRoles();
  };

  return (
    <div className="space-y-4">
      {(error || success) && (
        <div className={`p-4 rounded-md ${error ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
          {error || success}
        </div>
      )}

      <Card className="p-2">
        <CardHeader className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Ролі ({roles.length})</h3>
          {canManage && (
            <Button color="primary" startContent={<Plus className="w-4 h-4" />} onPress={() => setCreating(true)}>
              Нова роль
            </Button>
          )}
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <div className="p-4 text-center text-gray-500">Завантаження...</div>
          ) : (
            <Table aria-label="Roles table" classNames={{ wrapper: 'p-2 shadow-none' }}>
              <TableHeader>
                <TableColumn>Назва</TableColumn>
                <TableColumn>Slug</TableColumn>
                <TableColumn>Користувачі</TableColumn>
                <TableColumn>Права</TableColumn>
                <TableColumn className="text-center">Дії</TableColumn>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell>
                      <div className="font-medium">{role.name}</div>
                      {role.isSystem && (
                        <Chip size="sm" variant="flat" className="mt-1">системна</Chip>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{role.slug}</TableCell>
                    <TableCell>{role.userCount}</TableCell>
                    <TableCell>{role.permissions.length}</TableCell>
                    <TableCell>
                      <div className="flex justify-center gap-1">
                        <Button size="sm" variant="light" isIconOnly onPress={() => setEditing(role)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="light"
                          color="danger"
                          isIconOnly
                          isDisabled={role.isSystem || !canManage}
                          onPress={() => void handleDelete(role)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {(editing || creating) && (
        <RoleEditorModal
          role={editing}
          roles={roles}
          isAdminLocked={editing?.slug === ROLES.ADMIN}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={async (message) => {
            flash(message);
            setEditing(null);
            setCreating(false);
            await fetchRoles();
          }}
          onError={(message) => flash(message, true)}
        />
      )}
    </div>
  );
}

function RoleEditorModal({
  role,
  roles,
  isAdminLocked,
  onClose,
  onSaved,
  onError,
}: {
  role: RoleDto | null;
  roles: RoleDto[];
  isAdminLocked: boolean;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const isNew = !role;
  const [name, setName] = useState(role?.name ?? '');
  const [slug, setSlug] = useState(role?.slug ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [rank, setRank] = useState(String(role?.rank ?? 0));
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [saving, setSaving] = useState(false);
  const [cloneFrom, setCloneFrom] = useState('');

  const grouped = useMemo(() => {
    const map = new Map<PermissionGroup, typeof PERMISSION_CATALOG>();
    for (const item of PERMISSION_CATALOG) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return map;
  }, []);

  const toggle = (key: string, value: boolean) => {
    if (isAdminLocked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const handleClone = (slugToCopy: string) => {
    setCloneFrom(slugToCopy);
    const source = roles.find((item) => item.slug === slugToCopy);
    if (source) setSelected(new Set(source.permissions));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isNew) {
        const created = await fetch('/api/roles', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            slug: slug || undefined,
            description: description || null,
            rank: Number(rank) || 0,
            permissions: [...selected],
          }),
        });
        const data = await created.json().catch(() => ({}));
        if (!created.ok) {
          onError(data.message || 'Не вдалося створити роль');
          return;
        }
        await onSaved('Роль створено');
        return;
      }

      const updated = await fetch(`/api/roles/${role.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug: isAdminLocked ? undefined : slug,
          description: description || null,
          rank: Number(rank) || 0,
        }),
      });
      const updateData = await updated.json().catch(() => ({}));
      if (!updated.ok) {
        onError(updateData.message || 'Не вдалося оновити роль');
        return;
      }

      if (!isAdminLocked) {
        const perms = await fetch(`/api/roles/${role.id}/permissions`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissions: [...selected] }),
        });
        const permData = await perms.json().catch(() => ({}));
        if (!perms.ok) {
          onError(permData.message || 'Не вдалося зберегти права');
          return;
        }
      }

      await onSaved('Роль збережено');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onOpenChange={(open) => !open && onClose()} size="3xl" scrollBehavior="inside">
      <ModalContent>
        {() => (
          <>
            <ModalHeader>{isNew ? 'Нова роль' : `Роль «${role.name}»`}</ModalHeader>
            <ModalBody className="gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Назва" labelPlacement="outside" value={name} onValueChange={setName} isRequired />
                <Input
                  label="Slug"
                  labelPlacement="outside"
                  value={slug}
                  onValueChange={setSlug}
                  isDisabled={!isNew && (role?.isSystem || isAdminLocked)}
                  description="kebab-case латиницею"
                />
                <Input label="Опис" labelPlacement="outside" value={description} onValueChange={setDescription} />
                <Input label="Ранг" labelPlacement="outside" type="number" value={rank} onValueChange={setRank} />
              </div>

              {!isAdminLocked && (
                <Select
                  label="Скопіювати права з ролі"
                  labelPlacement="outside"
                  selectedKeys={cloneFrom ? [cloneFrom] : []}
                  onSelectionChange={(keys) => {
                    const value = Array.from(keys)[0];
                    if (typeof value === 'string') handleClone(value);
                  }}
                >
                  {roles.map((item) => (
                    <SelectItem key={item.slug}>{item.name}</SelectItem>
                  ))}
                </Select>
              )}

              {isAdminLocked && (
                <p className="text-sm text-gray-500">Права адміністратора завжди повні і не редагуються.</p>
              )}

              {[...grouped.entries()].map(([group, items]) => (
                <div key={group} className="border border-gray-200 rounded-lg p-3">
                  <div className="font-medium mb-2">{PERMISSION_GROUP_LABELS[group]}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {items.map((item) => (
                      <Checkbox
                        key={item.key}
                        isSelected={selected.has(item.key)}
                        isDisabled={isAdminLocked}
                        onValueChange={(value) => toggle(item.key, value)}
                      >
                        {item.label}
                      </Checkbox>
                    ))}
                  </div>
                </div>
              ))}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>Скасувати</Button>
              <Button color="primary" isLoading={saving} onPress={() => void handleSave()}>Зберегти</Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
