import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Input,
  Select,
  SelectItem,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { PasswordStrengthIndicator } from '@/components/users/PasswordStrengthIndicator';
import { ToastService } from '@/services/ToastService';
import { generatePassword } from '@shared/lib/generatePassword';

interface RoleOption {
  value: string;
  label: string;
}

export interface CreateUserInitialValues {
  name?: string;
  email?: string;
  role?: string;
  dilovodUserId?: string;
}

export interface CreatedUserSummary {
  id: number;
  name: string;
  email: string;
}

interface UserFormState {
  email: string;
  name: string;
  password: string;
  role: string;
  dilovodUserId: string;
}

interface CreateUserDrawerProps {
  isOpen: boolean;
  initialValues?: CreateUserInitialValues;
  onClose: () => void;
  onCreated: (user: CreatedUserSummary) => void;
}

const EMPTY_FORM: UserFormState = {
  email: '',
  name: '',
  password: '',
  role: '',
  dilovodUserId: '',
};

export function CreateUserDrawer({
  isOpen,
  initialValues,
  onClose,
  onCreated,
}: CreateUserDrawerProps) {
  const [availableRoles, setAvailableRoles] = useState<RoleOption[]>([]);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showFieldErrors, setShowFieldErrors] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setForm({
      email: initialValues?.email ?? '',
      name: initialValues?.name ?? '',
      password: '',
      role: initialValues?.role ?? '',
      dilovodUserId: initialValues?.dilovodUserId ?? '',
    });
    setIsPasswordVisible(false);
    setIsSaving(false);
    setShowFieldErrors(false);
  }, [isOpen, initialValues]);

  const patchForm = (field: keyof UserFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleGeneratePassword = async () => {
    const password = generatePassword(10);
    patchForm('password', password);
    setIsPasswordVisible(true);
    try {
      await navigator.clipboard.writeText(password);
      ToastService.show({ title: 'Пароль згенеровано і скопійовано', color: 'success' });
    } catch {
      ToastService.show({ title: 'Пароль згенеровано', color: 'success' });
    }
  };

  const passwordFieldError = useMemo(() => {
    if (!form.password) return 'Вкажіть або згенеруйте пароль';
    if (form.password.length < 6) return 'Пароль повинен містити мінімум 6 символів';
    return undefined;
  }, [form.password]);

  const validateForm = (): string | null => {
    if (!form.email.trim()) return 'Вкажіть email';
    if (!form.password) return 'Вкажіть або згенеруйте пароль';
    if (form.password.length < 6) return 'Пароль повинен містити мінімум 6 символів';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Некоректний email';
    if (!form.role) return 'Оберіть роль';
    return null;
  };

  const handleSave = async () => {
    setShowFieldErrors(true);
    const error = validateForm();
    if (error) {
      ToastService.show({ title: error, color: 'danger' });
      return;
    }

    setIsSaving(true);
    try {
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
      const user = data.user as { id: number; name?: string; email: string };
      ToastService.show({ title: 'Користувача створено', color: 'success' });
      onCreated({
        id: user.id,
        name: user.name || form.name || user.email,
        email: user.email,
      });
      onClose();
    } catch (error) {
      console.error('Error creating user:', error);
      ToastService.show({ title: 'Помилка створення користувача', color: 'danger' });
    } finally {
      setIsSaving(false);
    }
  };

  const selectedRoleKeys = useMemo(
    () => (availableRoles.some((item) => item.value === form.role) ? [form.role] : []),
    [availableRoles, form.role],
  );

  const closeDrawer = useCallback(() => {
    if (isSaving) return;
    onClose();
  }, [isSaving, onClose]);

  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) closeDrawer(); }}
      placement="right"
      size="md"
      classNames={{
        wrapper: '!z-[60]',
        backdrop: '!z-[55] bg-overlay/20',
        base: 'flex flex-col shadow-2xl',
        body: 'flex-1 min-h-0 overflow-y-auto',
      }}
    >
      <DrawerContent>
        {() => (
          <>
            <DrawerHeader className="border-b border-border-subtle shrink-0">
              Створити нового користувача
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
                  label="Пароль"
                  labelPlacement="outside"
                  placeholder="Мінімум 6 символів"
                  value={form.password}
                  onValueChange={(value) => patchForm('password', value)}
                  isInvalid={showFieldErrors && Boolean(passwordFieldError)}
                  errorMessage={showFieldErrors ? passwordFieldError : undefined}
                  autoComplete="new-password"
                  endContent={
                    <button className="focus:outline-none" type="button" onClick={() => setIsPasswordVisible((prev) => !prev)}>
                      <DynamicIcon name={isPasswordVisible ? 'eye-off' : 'eye'} size={18} className="text-text-secondary" />
                    </button>
                  }
                />
                <PasswordStrengthIndicator password={form.password} />
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() => void handleGeneratePassword()}
                  startContent={<DynamicIcon name="key-round" size={14} />}
                >
                  Згенерувати пароль
                </Button>
              </div>
            </DrawerBody>
            <DrawerFooter className="border-t border-border-subtle shrink-0">
              <Button variant="light" onPress={closeDrawer} isDisabled={isSaving}>Скасувати</Button>
              <Button color="primary" isLoading={isSaving} onPress={() => void handleSave()}>
                Створити
              </Button>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
