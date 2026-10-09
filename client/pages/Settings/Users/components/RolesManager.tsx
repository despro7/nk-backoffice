import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  Checkbox,
  Chip,
  Divider,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Input,
  Select,
  SelectItem,
} from '@heroui/react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { DynamicIcon } from 'lucide-react/dynamic';
import {
  PERMISSIONS,
  collectPagePermissions,
  isActionPermission,
  isPagePermission,
  stripSupersededPermissions,
  type PermissionDef,
} from '@shared/constants/permissions';
import { RolePermissionsEditor } from './RolePermissionsEditor';
import { ROLES } from '@shared/constants/roles';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { useRolePreview } from '@/contexts/role-preview-context';
import { ToastService } from '@/services/ToastService';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { notifyPermissionsChanged } from '@/lib/notifyPermissionsChanged';
import type { RoleDto } from '@shared/types/role';
import { appRoutes } from '@/routes.config';
import { CatalogFolderAclTree } from './CatalogFolderAclTree';

const ROLE_ROW_GRID = 'grid grid-cols-[32px_minmax(160px,1.4fr)_120px_140px_80px] gap-2 items-center';

type CatalogItem = Pick<PermissionDef, 'key' | 'group' | 'label'>;

export interface RolesTabActions {
  openCreate: () => void;
}

export const RolesManager = forwardRef<RolesTabActions>(function RolesManager(_props, ref) {
  const { hasPermission } = useRoleAccess();
  const { refreshPreviewRoles } = useRolePreview();
  const canManage = hasPermission(PERMISSIONS.ACTION_ROLES_MANAGE);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RoleDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteRole, setDeleteRole] = useState<RoleDto | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [actionCatalog, setActionCatalog] = useState<CatalogItem[]>([]);
  const pageCatalog = useMemo(() => collectPagePermissions(appRoutes), []);
  const catalog = useMemo(() => [...pageCatalog, ...actionCatalog], [pageCatalog, actionCatalog]);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/roles', { credentials: 'include' });
      if (!response.ok) throw new Error('Не вдалося завантажити ролі');
      setRoles(await response.json());
    } catch (err) {
      ToastService.show({
        title: err instanceof Error ? err.message : 'Помилка завантаження ролей',
        color: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRoles();
  }, [fetchRoles]);

  useEffect(() => {
    void fetch('/api/roles/catalog', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : { permissions: [] }))
      .then((data: { permissions?: CatalogItem[] }) => {
        const list = Array.isArray(data.permissions) ? data.permissions : [];
        setActionCatalog(
          list.filter(
            (item) =>
              isActionPermission(item.key) && item.key !== PERMISSIONS.ACTION_CATALOG_MANAGE
          )
        );
      })
      .catch(() => setActionCatalog([]));
  }, []);

  const handleDragEnd = async (result: DropResult) => {
    if (!canManage || savingOrder) return;
    if (!result.destination || result.destination.index === result.source.index) return;

    const previous = roles;
    const next = [...roles];
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setRoles(next);
    setSavingOrder(true);
    try {
      const response = await fetch('/api/roles/reorder', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: next.map((role) => role.id) }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Не вдалося зберегти порядок');
      }
      const saved = await response.json();
      if (Array.isArray(saved)) setRoles(saved);
      await refreshPreviewRoles();
    } catch (err) {
      setRoles(previous);
      ToastService.show({
        title: err instanceof Error ? err.message : 'Не вдалося зберегти порядок',
        color: 'danger',
      });
    } finally {
      setSavingOrder(false);
    }
  };

  useImperativeHandle(ref, () => ({
    openCreate: () => setCreating(true),
  }), []);

  const handleDelete = async (role: RoleDto) => {
    const response = await fetch(`/api/roles/${role.id}`, { method: 'DELETE', credentials: 'include' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      ToastService.show({ title: data.message || 'Не вдалося видалити роль', color: 'danger' });
      return;
    }
    ToastService.show({ title: 'Роль видалено', color: 'success' });
    notifyPermissionsChanged();
    void fetchRoles();
  };

  return (
    <div className="space-y-6">
      <Card className="hover:shadow-md transition-shadow">
        <CardBody className="p-4">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Завантаження...</div>
          ) : (
            <>
              <div className={`${ROLE_ROW_GRID} px-3 py-2 bg-gray-100 rounded-sm text-xs font-medium text-gray-500 uppercase tracking-wide`}>
                <div />
                <div>Назва</div>
                <div>Користувачі</div>
                <div>Права</div>
                <div className="text-center">Керування</div>
              </div>
              <DragDropContext onDragEnd={(result) => void handleDragEnd(result)}>
                <Droppable droppableId="roles" isDropDisabled={!canManage || savingOrder}>
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}>
                      {roles.map((role, index) => {
                        const pageCount = role.permissions.filter(isPagePermission).length;
                        const actionCount = role.permissions.filter(isActionPermission).length;
                        return (
                          <Draggable
                            key={role.id}
                            draggableId={String(role.id)}
                            index={index}
                            isDragDisabled={!canManage || savingOrder}
                          >
                            {(drag, snapshot) => (
                              <div
                                ref={drag.innerRef}
                                {...drag.draggableProps}
                                className={`${ROLE_ROW_GRID} px-3 py-3 border-b border-gray-50 rounded-sm ${
                                  snapshot.isDragging ? 'bg-gray-100 shadow-md' : 'hover:bg-gray-50'
                                }`}
                              >
                                <div
                                  {...drag.dragHandleProps}
                                  className={`flex items-center justify-center text-gray-300 ${
                                    canManage ? 'cursor-grab active:cursor-grabbing hover:text-gray-500' : 'cursor-default'
                                  }`}
                                  title={canManage ? 'Перетягніть для зміни порядку' : undefined}
                                >
                                  <DynamicIcon name="grip-vertical" size={16} />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-medium text-gray-900">{role.name}</div>
                                  {role.description && (
                                    <div className="text-xs text-gray-500 mt-0.5">{role.description}</div>
                                  )}
                                  {role.isSystem && (
                                    <Chip size="sm" variant="flat" className="mt-1">системна</Chip>
                                  )}
                                </div>
                                <div className="text-sm">{role.userCount}</div>
                                <div className="flex flex-wrap gap-1">
                                  <Chip 
                                    size="sm"
                                    className="bg-sky-400/20 text-sky-600 pl-2 pr-1.5 whitespace-nowrap"
                                    startContent={<DynamicIcon name="layout-dashboard" size={13} strokeWidth={1.5} />}
                                  >
                                    {pageCount}
                                  </Chip>
                                  <Chip 
                                    size="sm"
                                    className="bg-amber-400/20 text-amber-600 pl-2 pr-1.5 whitespace-nowrap"
                                    startContent={<DynamicIcon name="zap" size={13} strokeWidth={1.5} />}
                                  >
                                    {actionCount}
                                  </Chip>
                                </div>
                                <div className="flex justify-center gap-1">
                                  <Button size="sm" variant="light" isIconOnly onPress={() => setEditing(role)}>
                                    <DynamicIcon name="pencil" size={16} />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="light"
                                    color="danger"
                                    isIconOnly
                                    isDisabled={role.isSystem || !canManage}
                                    onPress={() => setDeleteRole(role)}
                                  >
                                    <DynamicIcon name="trash-2" size={16} />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </>
          )}
        </CardBody>
      </Card>

      {(editing || creating) && (
        <RoleEditorDrawer
          role={editing}
          roles={roles}
          catalog={catalog}
          isAdminLocked={editing?.slug === ROLES.ADMIN}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={async (message) => {
            ToastService.show({ title: message, color: 'success' });
            notifyPermissionsChanged();
            setEditing(null);
            setCreating(false);
            await fetchRoles();
          }}
          onError={(message) => ToastService.show({ title: message, color: 'danger' })}
        />
      )}

      <ConfirmModal
        isOpen={deleteRole != null}
        title="Видалити роль?"
        message={deleteRole ? `Роль «${deleteRole.name}» буде видалено.` : ''}
        confirmText="Так, видалити"
        cancelText="Скасувати"
        onConfirm={async () => {
          if (deleteRole) await handleDelete(deleteRole);
          setDeleteRole(null);
        }}
        onCancel={() => setDeleteRole(null)}
      />
    </div>
  );
});

function roleFormSnapshot(name: string, description: string, selected: Iterable<string>): string {
  return JSON.stringify({
    name: name.trim(),
    description: description.trim(),
    permissions: [...selected].sort(),
  });
}

function RoleEditorDrawer({
  role,
  roles,
  catalog,
  isAdminLocked,
  onClose,
  onSaved,
  onError,
}: {
  role: RoleDto | null;
  roles: RoleDto[];
  catalog: CatalogItem[];
  isAdminLocked: boolean;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const isNew = !role;
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const initialPermissions = isAdminLocked
    ? catalog.map((item) => item.key)
    : (role?.permissions ?? []);
  const [selected, setSelected] = useState<Set<string>>(() =>
    stripSupersededPermissions(initialPermissions)
  );
  const [saving, setSaving] = useState(false);
  const [cloneFrom, setCloneFrom] = useState('');
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const baselineRef = useRef(
    roleFormSnapshot(
      role?.name ?? '',
      role?.description ?? '',
      stripSupersededPermissions(initialPermissions),
    ),
  );

  const isDirty = useMemo(
    () => roleFormSnapshot(name, description, selected) !== baselineRef.current,
    [name, description, selected],
  );

  const requestClose = useCallback(() => {
    if (saving) return;
    if (isDirty) {
      setDiscardConfirmOpen(true);
      return;
    }
    onClose();
  }, [isDirty, onClose, saving]);

  const toggle = (key: string, value: boolean) => {
    if (isAdminLocked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return stripSupersededPermissions(next);
    });
  };

  const toggleGroup = (items: CatalogItem[], value: boolean) => {
    if (isAdminLocked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of items) {
        if (value) next.add(item.key);
        else next.delete(item.key);
      }
      return stripSupersededPermissions(next);
    });
  };

  const handleClone = (slugToCopy: string) => {
    setCloneFrom(slugToCopy);
    const source = roles.find((item) => item.slug === slugToCopy);
    if (source) setSelected(stripSupersededPermissions(source.permissions));
  };

  const handleSave = async () => {
    const permissionsToSave = [...stripSupersededPermissions(selected)];
    setSaving(true);
    try {
      if (isNew) {
        const created = await fetch('/api/roles', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            description: description || null,
            permissions: permissionsToSave,
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
          description: description || null,
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
          body: JSON.stringify({ permissions: permissionsToSave }),
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
    <>
    <Drawer
      isOpen
      onOpenChange={(open) => { if (!open) requestClose(); }}
      placement="right"
      size="4xl"
      classNames={{
        base: 'md:rounded-l-xl overflow-hidden flex flex-col',
        header: `shrink-0 sticky top-0 z-10 bg-content1 flex flex-col gap-3 border-b border-default-200/60 py-3 md:py-4 px-3 md:px-6 md:pb-4`,
        body: 'px-3 md:px-6 flex-1 min-h-0 overflow-y-auto',
        footer: 'pb-0 -mx-6 mt-8',
        closeButton: 'absolute top-2 md:top-3 z-20',
      }}
    >
      <DrawerContent>
        {() => (
          <>
            <DrawerHeader className="border-b border-default-200 shrink-0">
              {isNew ? 'Нова роль' : `Роль «${role.name}»`}
            </DrawerHeader>
            <DrawerBody className="gap-6 py-5 overflow-y-auto">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-1.5 text-default-900 mb-3">
                  <DynamicIcon name="id-card" size={14} className="text-default-500 shrink-0" />
                  Метадані ролі
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Input label="Назва" value={name} onValueChange={setName} isRequired />
                  <Input
                    label="Опис"
                    placeholder="Коротко, для чого ця роль..."
                    value={description}
                    onValueChange={setDescription}
                    classNames={{ input: 'placeholder:text-gray-400/75' }}
                  />
                </div>
              </div>

              {!isAdminLocked && (
                <Select
                  label="Скопіювати права з ролі"
                  placeholder="Не копіювати"
                  description="Замінює поточний набір прав вибраною роллю"
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
                <p className="text-sm text-default-500">Права адміністратора завжди повні і не редагуються.</p>
              )}

              <Divider className="bg-default-200/60" />

              <RolePermissionsEditor
                catalog={catalog}
                selected={selected}
                disabled={isAdminLocked}
                onToggle={toggle}
                onToggleGroup={toggleGroup}
              />
              <Divider className="bg-default-200/60" />

              <CatalogFolderAclTree
                selected={selected}
                disabled={isAdminLocked}
                onChange={setSelected}
              />
              <DrawerFooter className="border-t border-default-200 shrink-0">
                <Button variant="light" onPress={requestClose} isDisabled={saving}>Скасувати</Button>
                <Button
                  color="primary"
                  isLoading={saving}
                  isDisabled={!isDirty}
                  onPress={() => void handleSave()}
                >
                  Зберегти
                </Button>
              </DrawerFooter>
            </DrawerBody>
          </>
        )}
      </DrawerContent>
    </Drawer>

    <ConfirmModal
      isOpen={discardConfirmOpen}
      title="Незбережені зміни"
      message="У формі ролі є незбережені зміни. Закрити без збереження?"
      confirmText="Закрити без збереження"
      cancelText="Залишитись"
      confirmColor="danger"
      overlayZClassName="z-[2000]"
      onConfirm={() => {
        setDiscardConfirmOpen(false);
        onClose();
      }}
      onCancel={() => setDiscardConfirmOpen(false)}
    />
    </>
  );
}
