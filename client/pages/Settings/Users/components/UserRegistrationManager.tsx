import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  Chip,
  Input,
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
import { UserCard } from '@/components/person-card/UserCard';
import type { EditableUser } from '@/components/person-card/UserCard.types';
import { formatDateOnly, formatRelativeDate } from '@/lib/formatUtils';
import { useAuth } from '@/contexts/auth-context';

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

export interface UsersTabActions {
  openCreate: () => void;
}

export const UserRegistrationManager = forwardRef<UsersTabActions>(function UserRegistrationManager(_props, ref) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userCardOpen, setUserCardOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
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

  const openCreate = useCallback(() => {
    setEditingUser(null);
    setUserCardOpen(true);
  }, []);

  useImperativeHandle(ref, () => ({ openCreate }), [openCreate]);

  const openEdit = (user: UserRow) => {
    setEditingUser(user);
    setUserCardOpen(true);
  };

  const closeUserCard = () => {
    setUserCardOpen(false);
    setEditingUser(null);
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

  const editableUser: EditableUser | null = editingUser
    ? {
      id: editingUser.id,
      email: editingUser.email,
      name: editingUser.name,
      role: editingUser.role,
      isActive: editingUser.isActive,
      dilovodUserId: editingUser.dilovodUserId,
    }
    : null;

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

      <UserCard
        isOpen={userCardOpen}
        user={editableUser}
        onClose={closeUserCard}
        onSaved={() => { void fetchUsers(); }}
      />

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
