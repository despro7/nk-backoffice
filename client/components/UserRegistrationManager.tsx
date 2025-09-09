import React, { useState, useEffect } from 'react';
import { Button as HeroButton } from '@heroui/button';
import { Input } from '@heroui/input';
import { Select, SelectItem } from '@heroui/select';
import { Card, CardHeader, CardBody } from '@heroui/card';
import { Table, TableHeader, TableBody, TableColumn, TableRow, TableCell } from '@heroui/table';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from '@heroui/modal';
import { Checkbox } from '@heroui/checkbox';
import { useRoleAccess } from '../hooks/useRoleAccess';
import { Edit, Trash2, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';

interface UserRegistrationData {
  email: string;
  name: string;
  password: string;
  role: string;
}

interface RoleOption {
  value: string;
  label: string;
}

interface User {
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
  password?: string; // Для редактирования
}

export const UserRegistrationManager: React.FC = () => {
  const { ROLES } = useRoleAccess();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isEditPasswordVisible, setIsEditPasswordVisible] = useState(false);

  const [userData, setUserData] = useState<UserRegistrationData>({
    email: '',
    name: '',
    password: '',
    role: ROLES.STOREKEEPER // Начальная роль - самая низкая в иерархии
  });

  // Преобразование ролей из useRoleAccess в формат для Select
  const availableRoles: RoleOption[] = React.useMemo(() => {
    const roleLabels: Record<string, string> = {
      [ROLES.ADMIN]: 'Адміністратор',
      [ROLES.BOSS]: 'Директор',
      [ROLES.SHOP_MANAGER]: 'Менеджер магазину',
      [ROLES.ADS_MANAGER]: 'Ads Manager',
      [ROLES.STOREKEEPER]: 'Комірник'
    };

    return Object.values(ROLES).map(role => ({
      value: role,
      label: roleLabels[role] || role.charAt(0).toUpperCase() + role.slice(1)
    }));
  }, [ROLES]);

  // Загрузка списка пользователей
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const response = await fetch('/api/auth/users', {
        credentials: 'include'
      });
      if (response.ok) {
        const usersData = await response.json();
        setUsers(usersData);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleInputChange = (field: keyof UserRegistrationData, value: string) => {
    setUserData(prev => ({ ...prev, [field]: value }));
    if (error) setError('');
    if (success) setSuccess('');
  };

  const validateForm = (): boolean => {
    if (!userData.email || !userData.password) {
      setError('Всі обов\'язкові поля повинні бути заповнені');
      return false;
    }

    if (userData.password.length < 6) {
      setError('Пароль повинен містити мінімум 6 символів');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      setError('Некоректний email');
      return false;
    }

    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleRegister();
  };

  const handleRegister = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: userData.email,
          name: userData.name || undefined,
          password: userData.password,
          role: userData.role,
          roleName: availableRoles.find(r => r.value === userData.role)?.label || userData.role
        })
      });

      if (response.ok) {
        setSuccess('Користувач успішно створений!');
        setUserData({
          email: '',
          name: '',
          password: '',
          role: ROLES.STOREKEEPER
        });
        fetchUsers(); // Обновляем список пользователей
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Помилка створення користувача');
      }
    } catch (error) {
      console.error('Error registering user:', error);
      setError('Помилка створення користувача');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setIsEditPasswordVisible(false); // Сбрасываем видимость пароля при открытии модалки
  };

  const handleUpdateUser = async (userId: number, updates: Partial<User>) => {
    try {
      const response = await fetch(`/api/auth/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        const result = await response.json();
        setUsers(prev => prev.map(user =>
          user.id === userId ? result.user : user
        ));
        setEditingUser(null);
        setSuccess('Користувач успішно оновлений');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Помилка оновлення користувача');
      }
    } catch (error) {
      console.error('Error updating user:', error);
      setError('Помилка оновлення користувача');
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Ви впевнені, що хочете видалити цього користувача?')) {
      return;
    }

    try {
      const response = await fetch(`/api/auth/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        setUsers(prev => prev.filter(user => user.id !== userId));
        setSuccess('Користувач успішно видалений');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Помилка видалення користувача');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      setError('Помилка видалення користувача');
    }
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
  };

  return (
    <div className="space-y-6">

      {/* Success/Error сообщения */}
      {(error || success) && (
        <div className={`p-4 rounded-md ${error ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
          {error || success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Создание нового пользователя */}
        <Card className="p-2">
          <CardHeader>
            <h3 className="text-xl font-semibold">Створити нового користувача</h3>
          </CardHeader>

          <CardBody className="space-y-4">
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-4">
              <Input
                type="email"
                labelPlacement="outside"
                label="Email"
                placeholder="user@example.com"
                value={userData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                isRequired
                autoComplete="email"
              />

              <Input
                type="text"
                labelPlacement="outside"
                label="Ім'я"
                placeholder="Іван Петренко"
                value={userData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                autoComplete="name"
              />

              <Input
                type={isPasswordVisible ? "text" : "password"}
                labelPlacement="outside"
                label="Пароль"
                placeholder="Мінімум 6 символів"
                value={userData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                isRequired
                autoComplete="new-password"
                endContent={
                  <button
                    className="focus:outline-none"
                    type="button"
                    onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                  >
                    {isPasswordVisible ? (
                      <EyeOff className="text-2xl text-default-400 pointer-events-none" />
                    ) : (
                      <Eye className="text-2xl text-default-400 pointer-events-none" />
                    )}
                  </button>
                }
              />

              <Select
                label="Роль"
                labelPlacement="outside"
                placeholder="Оберіть роль"
                selectedKeys={[userData.role]}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as string;
                  handleInputChange('role', selected);
                }}
                isRequired
              >
                {availableRoles.map((role) => (
                  <SelectItem key={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </Select>

              </div>

              <HeroButton
                type="submit"
                disabled={isLoading || !userData.email || !userData.password}
                color="primary"
  			        size='lg'
                className="w-full mt-6"
              >
              {isLoading ? 'Створення...' : 'Створити користувача'}
            </HeroButton>
            </form>
          </CardBody>
        </Card>

        {/* Список пользователей */}
        <Card className="p-2">
          <CardHeader>
            <h3 className="text-xl font-semibold">Всі користувачі ({users.length})</h3>
          </CardHeader>
          <CardBody className="p-0">
            {usersLoading ? (
              <div className="p-4 text-center text-gray-500">Завантаження...</div>
            ) : users.length === 0 ? (
              <div className="p-4 text-center text-gray-500">Немає користувачів</div>
            ) : (
              <Table aria-label="Users table" classNames={{ wrapper: "p-2 shadow-none" }}>
                <TableHeader>
                  <TableColumn>Користувач</TableColumn>
                  <TableColumn>Роль</TableColumn>
                  <TableColumn className="text-center">Статус</TableColumn>
                  <TableColumn className="text-center">Дії</TableColumn>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="vertical-align-top">
                        <div>
                          <div className="font-medium">{user.name || user.email}</div>
                          <div className="text-xs text-gray-500">{user.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{user.roleLabel}</span>
                      </TableCell>
                      <TableCell className="justify-items-center">
                        {user.isActive ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <HeroButton
                            size="sm"
                            variant="light"
                            isIconOnly
                            onPress={() => handleEditUser(user)}
                          >
                            <Edit className="w-4 h-4" />
                          </HeroButton>
                          <HeroButton
                            size="sm"
                            variant="light"
                            color="danger"
                            isIconOnly
                            onPress={() => handleDeleteUser(user.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </HeroButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>

      {/* HeroUI Modal для редактирования */}
      <Modal
        isOpen={!!editingUser}
        onOpenChange={(open) => !open && handleCancelEdit()}
        size="md"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                <h3 className="text-lg font-semibold">Редагувати користувача</h3>
              </ModalHeader>
              <ModalBody className="gap-4">
                {editingUser && (
                  <>
                    <Input
                      label="Email"
                      labelPlacement="outside"
                      value={editingUser.email}
                      onChange={(e) => setEditingUser(prev => prev ? { ...prev, email: e.target.value } : null)}
                    />

                    <Input
                      label="Ім'я"
                      labelPlacement="outside"
                      value={editingUser.name}
                      onChange={(e) => setEditingUser(prev => prev ? { ...prev, name: e.target.value } : null)}
                    />

                    <Select
                      label="Роль"
                      labelPlacement="outside"
                      selectedKeys={[editingUser.role]}
                      onSelectionChange={(keys) => {
                        const selected = Array.from(keys)[0] as string;
                        setEditingUser(prev => prev ? { ...prev, role: selected } : null);
                      }}
                    >
                      {availableRoles.map((role) => (
                        <SelectItem key={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </Select>

                    <Input
                      label="Назва ролі"
                      labelPlacement="outside"
                      value={editingUser.roleName}
                      onChange={(e) => setEditingUser(prev => prev ? { ...prev, roleName: e.target.value } : null)}
                    />

                    <Input
                      label="Новий пароль (необов'язково)"
                      labelPlacement="outside"
                      placeholder="Залиште порожнім, щоб не змінювати"
                      type={isEditPasswordVisible ? "text" : "password"}
                      onChange={(e) => setEditingUser(prev => prev ? { ...prev, password: e.target.value } : null)}
                      endContent={
                        <button
                          className="focus:outline-none"
                          type="button"
                          onClick={() => setIsEditPasswordVisible(!isEditPasswordVisible)}
                        >
                          {isEditPasswordVisible ? (
                            <EyeOff className="text-2xl text-default-400 pointer-events-none" />
                          ) : (
                            <Eye className="text-2xl text-default-400 pointer-events-none" />
                          )}
                        </button>
                      }
                    />

                    <Checkbox
                      isSelected={editingUser.isActive}
                      onValueChange={(checked) => setEditingUser(prev => prev ? { ...prev, isActive: checked } : null)}
                    >
                      Активний користувач
                    </Checkbox>
                  </>
                )}
              </ModalBody>
              <ModalFooter>
                <HeroButton
                  variant="light"
                  onPress={onClose}
                >
                  Скасувати
                </HeroButton>
                <HeroButton
                  color="primary"
                  onPress={() => {
                    if (editingUser) {
                      const updates: any = {
                        name: editingUser.name,
                        email: editingUser.email,
                        role: editingUser.role,
                        roleName: editingUser.roleName,
                        isActive: editingUser.isActive
                      };

                      // Добавляем пароль только если он был введен
                      if (editingUser.password && editingUser.password.trim()) {
                        updates.password = editingUser.password;
                      }

                      handleUpdateUser(editingUser.id, updates);
                    }
                  }}
                >
                  Зберегти
                </HeroButton>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

