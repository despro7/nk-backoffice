import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  Checkbox,
  Chip,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Input,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { formatDateOnly, formatRelativeDate } from '@/lib/formatUtils';
import { generatePassword } from '@shared/lib/generatePassword';
import { useAuth } from '@/contexts/AuthContext';

interface RoleOption {
  value: string;
  label: string;
}

interface UserStats {
  orders: number;
  warehouse: number;
  breakdown: {
    movements: number;
    inventories: number;
    returns: number;
    writeOffs: number;
    releases: number;
  };
}

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: string;
  roleName: string;
  roleLabel: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  dilovodUserId: string | null;
  stats?: UserStats;
  password?: string;
}

interface UserFormState {
  email: string;
  name: string;
  password: string;
  role: string;
  dilovodUserId: string;
  isActive: boolean;
}

const EMPTY_FORM: UserFormState = {
  email: '',
  name: '',
  password: '',
  role: '',
  dilovodUserId: '',
  isActive: true,
};

export interface UsersTabActions {
  openCreate: () => void;
}

export const UserRegistrationManager = forwardRef<UsersTabActions>(function UserRegistrationManager(_props, ref) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<RoleOption[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const response = await fetch('/api/auth/users', { credentials: 'include' });
      if (response.ok) {
        setUsers(await response.json());
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    const loadRoles = async () => {
      try {
        const response = await fetch('/api/auth/roles', { credentials: 'include' });
        if (!response.ok) return;
        const roles: RoleOption[] = await response.json();
        setAvailableRoles(roles);
      } catch {
        // ignore
      }
    };
    void loadRoles();
  }, []);

  useEffect(() => {
    if (!form.role && availableRoles[0]) {
      setForm((prev) => (prev.role ? prev : { ...prev, role: availableRoles[0].value }));
    }
  }, [availableRoles, form.role]);

  const openCreate = useCallback(() => {
    setEditingUser(null);
    setForm({
      ...EMPTY_FORM,
      role: availableRoles[0]?.value ?? '',
    });
    setIsPasswordVisible(false);
    setDrawerOpen(true);
  }, [availableRoles]);

  useImperativeHandle(ref, () => ({ openCreate }), [openCreate]);

  const openEdit = (user: UserRow) => {
    setEditingUser(user);
    setForm({
      email: user.email,
      name: user.name,
      password: '',
      role: user.role,
      dilovodUserId: user.dilovodUserId ?? '',
      isActive: user.isActive,
    });
    setIsPasswordVisible(false);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setIsSaving(false);
  };

  const patchForm = (field: keyof UserFormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleGeneratePassword = async () => {
    const password = generatePassword(14);
    patchForm('password', password);
    setIsPasswordVisible(true);
    try {
      await navigator.clipboard.writeText(password);
      ToastService.show({ title: 'Пароль згенеровано і скопійовано', color: 'success' });
    } catch {
      ToastService.show({ title: 'Пароль згенеровано', color: 'success' });
    }
  };

  const validateForm = (): string | null => {
    if (!form.email.trim()) return 'Вкажіть email';
    if (!editingUser && !form.password) return 'Вкажіть пароль';
    if (form.password && form.password.length < 6) return 'Пароль повинен містити мінімум 6 символів';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Некоректний email';
    if (!form.role) return 'Оберіть роль';
    return null;
  };

  const handleSave = async () => {
    const error = validateForm();
    if (error) {
      ToastService.show({ title: error, color: 'danger' });
      return;
    }

    setIsSaving(true);
    try {
      if (editingUser) {
        const updates: Record<string, unknown> = {
          name: form.name,
          email: form.email,
          role: form.role,
          roleName: availableRoles.find((item) => item.value === form.role)?.label || form.role,
          isActive: form.isActive,
          dilovodUserId: form.dilovodUserId,
        };
        if (form.password.trim()) updates.password = form.password;

        const response = await fetch(`/api/auth/users/${editingUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updates),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          ToastService.show({ title: data.message || 'Помилка оновлення користувача', color: 'danger' });
          return;
        }
        setUsers((prev) => prev.map((user) => (user.id === editingUser.id ? { ...user, ...data.user } : user)));
        ToastService.show({ title: 'Користувача оновлено', color: 'success' });
        closeDrawer();
        return;
      }

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: form.email,
          name: form.name || undefined,
          password: form.password,
          role: form.role,
          roleName: availableRoles.find((item) => item.value === form.role)?.label || form.role,
          dilovodUserId: form.dilovodUserId || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: data.message || 'Помилка створення користувача', color: 'danger' });
        return;
      }
      ToastService.show({ title: 'Користувача створено', color: 'success' });
      closeDrawer();
      await fetchUsers();
    } catch (error) {
      console.error('Error saving user:', error);
      ToastService.show({ title: 'Помилка збереження користувача', color: 'danger' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (userId: number) => {
    try {
      const response = await fetch(`/api/auth/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: data.message || 'Помилка видалення користувача', color: 'danger' });
        return;
      }
      setUsers((prev) => prev.filter((user) => user.id !== userId));
      ToastService.show({ title: 'Користувача видалено', color: 'success' });
    } catch (error) {
      console.error('Error deleting user:', error);
      ToastService.show({ title: 'Помилка видалення користувача', color: 'danger' });
    }
  };

  const handleInlineDilovodSave = async (user: UserRow, value: string) => {
    const next = value.trim() || null;
    if ((user.dilovodUserId ?? null) === next) return;
    try {
      const response = await fetch(`/api/auth/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dilovodUserId: next ?? '' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        ToastService.show({ title: data.message || 'Не вдалося зберегти Dilovod ID', color: 'danger' });
        return;
      }
      setUsers((prev) => prev.map((item) => (item.id === user.id ? { ...item, ...data.user } : item)));
    } catch {
      ToastService.show({ title: 'Не вдалося зберегти Dilovod ID', color: 'danger' });
    }
  };

  const selectedRoleKeys = availableRoles.some((item) => item.value === form.role)
    ? [form.role]
    : [];

  return (
    <div className="space-y-6">
      <Card className="hover:shadow-md transition-shadow">
        <CardBody className="p-0">
          {usersLoading ? (
            <div className="p-8 text-center text-gray-500">Завантаження...</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Немає користувачів</div>
          ) : (
            <Table aria-label="Users table" classNames={{ wrapper: 'p-2 shadow-none' }}>
              <TableHeader>
                <TableColumn>Користувач</TableColumn>
                <TableColumn>Роль</TableColumn>
                <TableColumn>Останній візит</TableColumn>
                <TableColumn>Dilovod ID</TableColumn>
                <TableColumn>Дії в системі</TableColumn>
                <TableColumn className="text-center">Статус</TableColumn>
                <TableColumn className="text-center">Керування</TableColumn>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const lastVisit = user.lastActivityAt || user.lastLoginAt;
                  const stats = user.stats;
                  return (
                    <TableRow key={user.id} className={user.isActive ? undefined : 'opacity-40'}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{user.name || user.email}</div>
                          <div className="text-xs text-gray-500">{user.email}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            з {formatDateOnly(user.createdAt)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{user.roleLabel}</span>
                        <div className="text-xs text-gray-500">{user.role}</div>
                      </TableCell>
                      <TableCell>
                        {lastVisit ? (
                          <Tooltip
                            content={
                              <div className="text-xs space-y-1">
                                <div>Логін: {user.lastLoginAt ? formatRelativeDate(user.lastLoginAt) : 'немає'}</div>
                                <div>Активність: {user.lastActivityAt ? formatRelativeDate(user.lastActivityAt) : 'немає'}</div>
                              </div>
                            }
                          >
                            <span className="text-sm cursor-help">{formatRelativeDate(lastVisit)}</span>
                          </Tooltip>
                        ) : (
                          <span className="text-sm text-gray-400">Ще не входив</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <InlineDilovodId
                          value={user.dilovodUserId ?? ''}
                          onSave={(value) => void handleInlineDilovodSave(user, value)}
                        />
                      </TableCell>
                      <TableCell>
                        {stats && (stats.orders > 0 || stats.warehouse > 0) ? (
                          <Tooltip content={<ActivityBreakdown stats={stats} />}>
                            <span className="text-sm cursor-help">
                              {stats.orders} зам. · {stats.warehouse} скл.
                            </span>
                          </Tooltip>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {user.isActive ? (
                          <Chip size="sm" color="success" variant="flat">активний</Chip>
                        ) : (
                          <Chip size="sm" color="danger" variant="flat">неактивний</Chip>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button size="sm" variant="light" isIconOnly onPress={() => openEdit(user)}>
                            <DynamicIcon name="pencil" size={16} />
                          </Button>
                          <Button
                            size="sm"
                            variant="light"
                            color="danger"
                            isIconOnly
                            isDisabled={user.id === currentUser?.id}
                            onPress={() => setDeleteId(user.id)}
                          >
                            <DynamicIcon name="trash-2" size={16} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Drawer
        isOpen={drawerOpen}
        onOpenChange={(open) => { if (!open) closeDrawer(); }}
        placement="right"
        size="md"
        classNames={{
          base: 'flex flex-col',
          body: 'flex-1 min-h-0 overflow-y-auto',
        }}
      >
        <DrawerContent>
          {() => (
            <>
              <DrawerHeader className="border-b border-default-200 shrink-0">
                {editingUser ? 'Редагувати користувача' : 'Створити користувача'}
              </DrawerHeader>
              <DrawerBody className="gap-5 py-5 overflow-y-auto">
                <Input
                  type="email"
                  label="Email"
                  labelPlacement="outside"
                  placeholder="user@example.com"
                  value={form.email}
                  onValueChange={(value) => patchForm('email', value)}
                  isRequired
                  autoComplete="off"
                />
                <Input
                  type="text"
                  label="Ім'я"
                  labelPlacement="outside"
                  placeholder="Іван Петренко"
                  value={form.name}
                  onValueChange={(value) => patchForm('name', value)}
                  autoComplete="off"
                />
                <Select
                  label="Роль"
                  labelPlacement="outside"
                  placeholder="Оберіть роль"
                  selectedKeys={selectedRoleKeys}
                  onSelectionChange={(keys) => {
                    const selected = Array.from(keys)[0];
                    if (typeof selected === 'string') patchForm('role', selected);
                  }}
                  isRequired
                >
                  {availableRoles.map((role) => (
                    <SelectItem key={role.value}>{role.label}</SelectItem>
                  ))}
                </Select>
                <Input
                  label="Dilovod user ID"
                  labelPlacement="outside"
                  placeholder="1000200000001021"
                  description="ID користувача в Dilovod — документи складу підуть від його імені"
                  value={form.dilovodUserId}
                  onValueChange={(value) => patchForm('dilovodUserId', value)}
                />
                <div className="space-y-2">
                  <Input
                    type={isPasswordVisible ? 'text' : 'password'}
                    label={editingUser ? 'Новий пароль' : 'Пароль'}
                    labelPlacement="outside"
                    placeholder={editingUser ? 'Залиште порожнім, щоб не змінювати' : 'Мінімум 6 символів'}
                    value={form.password}
                    onValueChange={(value) => patchForm('password', value)}
                    isRequired={!editingUser}
                    autoComplete="new-password"
                    endContent={
                      <button className="focus:outline-none" type="button" onClick={() => setIsPasswordVisible((prev) => !prev)}>
                        <DynamicIcon name={isPasswordVisible ? 'eye-off' : 'eye'} size={18} className="text-default-400" />
                      </button>
                    }
                  />
                  <Button size="sm" variant="flat" onPress={() => void handleGeneratePassword()} startContent={<DynamicIcon name="key-round" size={14} />}>
                    Згенерувати пароль
                  </Button>
                </div>
                {editingUser && (
                  <Checkbox isSelected={form.isActive} onValueChange={(checked) => patchForm('isActive', checked)}>
                    Активний користувач
                  </Checkbox>
                )}
              </DrawerBody>
              <DrawerFooter className="border-t border-default-200 shrink-0">
                <Button variant="light" onPress={closeDrawer}>Скасувати</Button>
                <Button color="primary" isLoading={isSaving} onPress={() => void handleSave()}>
                  {editingUser ? 'Зберегти' : 'Створити'}
                </Button>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>

      <ConfirmModal
        isOpen={deleteId != null}
        title="Видалити користувача?"
        message="Цю дію не можна скасувати."
        confirmText="Так, видалити"
        cancelText="Скасувати"
        onConfirm={async () => {
          if (deleteId != null) await handleDelete(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
});

function InlineDilovodId({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  if (!editing) {
    return (
      <button
        type="button"
        className="text-left text-sm font-mono text-gray-700 hover:text-primary max-w-[160px] truncate"
        onClick={() => setEditing(true)}
      >
        {value || <span className="font-sans text-gray-400">не задано</span>}
      </button>
    );
  }

  return (
    <Input
      size="sm"
      autoFocus
      variant="bordered"
      value={draft}
      onValueChange={setDraft}
      onBlur={() => {
        setEditing(false);
        onSave(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          setEditing(false);
          onSave(draft);
        }
        if (event.key === 'Escape') {
          setDraft(value);
          setEditing(false);
        }
      }}
      className="min-w-[140px]"
    />
  );
}

function ActivityBreakdown({ stats }: { stats: UserStats }) {
  return (
    <div className="text-xs space-y-1">
      <div>Замовлення: {stats.orders}</div>
      <div>Переміщення: {stats.breakdown.movements}</div>
      <div>Інвентаризації: {stats.breakdown.inventories}</div>
      <div>Повернення: {stats.breakdown.returns}</div>
      <div>Списання: {stats.breakdown.writeOffs}</div>
      <div>Комплекти: {stats.breakdown.releases}</div>
    </div>
  );
}
