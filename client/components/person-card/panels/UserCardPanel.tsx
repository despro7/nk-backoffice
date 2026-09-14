import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ToastService } from '@/services/ToastService';
import { useDilovodRoles } from '@/hooks/useDilovodRoles';
import { invalidateDilovodUsersCache, useDilovodUsers } from '@/hooks/useDilovodUsers';
import { generatePassword } from '@shared/lib/generatePassword';
import { DEFAULT_DILOVOD_ROLE_ID } from '@shared/types/dilovod';
import {
  UserPersonCardPanel,
  type UserPersonCardFormState,
} from './UserPersonCardPanel';
import type { EditableUser, SavedUserSummary, UserCardInitialValues } from '../UserCard.types';

interface RoleOption {
  value: string;
  label: string;
}

const EMPTY_FORM: UserPersonCardFormState = {
  email: '',
  name: '',
  password: '',
  role: '',
  dilovodUserId: '',
  dilovodRoleId: '',
  isActive: true,
};

export interface UserCardPanelHandle {
  save: () => Promise<void>;
  isBusy: boolean;
}

interface UserCardPanelProps {
  isOpen: boolean;
  user?: EditableUser | null;
  initialValues?: UserCardInitialValues;
  onSaved: (user: SavedUserSummary) => void;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function snapshotUserForm(
  form: UserPersonCardFormState,
  createNewInDilovod: boolean,
): string {
  return JSON.stringify({
    email: form.email.trim(),
    name: form.name.trim(),
    role: form.role,
    dilovodUserId: form.dilovodUserId,
    dilovodRoleId: form.dilovodRoleId,
    isActive: form.isActive,
    password: form.password,
    createNewInDilovod,
  });
}

export const UserCardPanel = forwardRef<UserCardPanelHandle, UserCardPanelProps>(function UserCardPanel({
  isOpen,
  user = null,
  initialValues,
  onSaved,
  onClose,
  onBusyChange,
  onDirtyChange,
}, ref) {
  const isCreate = user == null;
  const [availableRoles, setAvailableRoles] = useState<RoleOption[]>([]);
  const [form, setForm] = useState<UserPersonCardFormState>(EMPTY_FORM);
  const [createNewInDilovod, setCreateNewInDilovod] = useState(false);
  const [dilovodStepComplete, setDilovodStepComplete] = useState(false);
  const baselineRef = useRef('');
  const [baselineVersion, setBaselineVersion] = useState(0);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const { roles: dilovodRoles } = useDilovodRoles(isOpen);
  const { users: dilovodUsers } = useDilovodUsers(isOpen);

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

  const commitBaseline = useCallback((nextForm: UserPersonCardFormState, nextCreateNewInDilovod: boolean) => {
    baselineRef.current = snapshotUserForm(nextForm, nextCreateNewInDilovod);
    setBaselineVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      baselineRef.current = '';
      return;
    }
    if (user) {
      const nextForm = {
        email: user.email,
        name: user.name,
        password: '',
        role: user.role,
        dilovodUserId: user.dilovodUserId ?? '',
        dilovodRoleId: '',
        isActive: user.isActive,
      };
      setForm(nextForm);
      setCreateNewInDilovod(false);
      setDilovodStepComplete(true);
      commitBaseline(nextForm, false);
    } else {
      const nextForm = {
        email: initialValues?.email ?? '',
        name: initialValues?.name ?? '',
        password: '',
        role: initialValues?.role ?? '',
        dilovodUserId: initialValues?.dilovodUserId ?? '',
        dilovodRoleId: '',
        isActive: true,
      };
      setForm(nextForm);
      setCreateNewInDilovod(false);
      setDilovodStepComplete(Boolean(initialValues?.dilovodUserId));
      commitBaseline(nextForm, false);
    }
    setIsPasswordVisible(false);
    setShowFieldErrors(false);
  }, [isOpen, user, initialValues, commitBaseline]);

  const isDirty = useMemo(() => {
    if (!isOpen) return false;
    if (!baselineRef.current) return false;
    void baselineVersion;
    return snapshotUserForm(form, createNewInDilovod) !== baselineRef.current;
  }, [isOpen, form, createNewInDilovod, baselineVersion]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const patchForm = (field: keyof UserPersonCardFormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const showDilovodRole = Boolean(user || dilovodStepComplete)
    && (createNewInDilovod || Boolean(form.dilovodUserId));

  useEffect(() => {
    if (!showDilovodRole || form.dilovodRoleId) return;
    const defaultRole = dilovodRoles.find((role) => role.id === DEFAULT_DILOVOD_ROLE_ID) ?? dilovodRoles[0];
    patchForm('dilovodRoleId', defaultRole?.id ?? DEFAULT_DILOVOD_ROLE_ID);
  }, [showDilovodRole, form.dilovodRoleId, dilovodRoles]);

  useEffect(() => {
    if (!form.dilovodUserId || form.dilovodRoleId || dilovodUsers.length === 0) return;
    const linkedUser = dilovodUsers.find((item) => item.id === form.dilovodUserId);
    if (linkedUser?.roleId) {
      patchForm('dilovodRoleId', linkedUser.roleId);
    }
  }, [form.dilovodUserId, form.dilovodRoleId, dilovodUsers]);

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

  const validateForm = (): string | null => {
    if (isCreate && !dilovodStepComplete) return 'Оберіть користувача в Діловоді або увімкніть створення нового';
    if (!form.email.trim()) return 'Вкажіть email';
    if (isCreate && !form.password) return 'Вкажіть або згенеруйте пароль';
    if (form.password && form.password.length < 6) return 'Пароль повинен містити мінімум 6 символів';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Некоректний email';
    if (!form.role) return 'Оберіть роль';
    if (isCreate && !createNewInDilovod && !form.dilovodUserId) return 'Оберіть користувача в Діловоді';
    if (isCreate && createNewInDilovod && !form.name.trim()) return 'Вкажіть імʼя для нового користувача Dilovod';
    return null;
  };

  const handleSave = useCallback(async () => {
    setShowFieldErrors(true);
    const error = validateForm();
    if (error) {
      ToastService.show({ title: error, color: 'danger' });
      throw new Error(error);
    }

    setIsSaving(true);
    try {
      if (user) {
        const updates: Record<string, unknown> = {
          name: form.name,
          email: form.email,
          role: form.role,
          roleName: availableRoles.find((item) => item.value === form.role)?.label || form.role,
          isActive: form.isActive,
          dilovodUserId: form.dilovodUserId,
          dilovodRoleId: form.dilovodRoleId || undefined,
        };
        if (form.password.trim()) updates.password = form.password;

        const response = await fetch(`/api/auth/users/${user.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updates),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = data.message || 'Помилка оновлення користувача';
          ToastService.show({ title: message, color: 'danger' });
          throw new Error(message);
        }
        if (form.dilovodUserId) {
          invalidateDilovodUsersCache();
        }
        const saved = data.user as { id: number; name?: string; email: string };
        ToastService.show({ title: 'Користувача оновлено', color: 'success' });
        onSaved({
          id: saved.id,
          name: saved.name || form.name || saved.email,
          email: saved.email,
        });
        onClose();
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
          dilovodUserId: createNewInDilovod ? undefined : (form.dilovodUserId || undefined),
          dilovodRoleId: form.dilovodRoleId || undefined,
          createDilovodUser: createNewInDilovod,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.message || 'Помилка створення користувача';
        ToastService.show({ title: message, color: 'danger' });
        throw new Error(message);
      }
      if (createNewInDilovod || form.dilovodUserId) {
        invalidateDilovodUsersCache();
      }
      const saved = data.user as { id: number; name?: string; email: string };
      ToastService.show({ title: 'Користувача створено', color: 'success' });
      onSaved({
        id: saved.id,
        name: saved.name || form.name || saved.email,
        email: saved.email,
      });
      onClose();
    } catch (error) {
      console.error('Error saving user:', error);
      if (!(error instanceof Error)) {
        ToastService.show({ title: 'Помилка збереження користувача', color: 'danger' });
      }
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [availableRoles, createNewInDilovod, form, isCreate, onClose, onSaved, user]);

  useEffect(() => {
    onBusyChange?.(isSaving);
  }, [isSaving, onBusyChange]);

  useImperativeHandle(ref, () => ({
    save: handleSave,
    isBusy: isSaving,
  }), [handleSave, isSaving]);

  const panelKey = user
    ? `edit-${user.id}`
    : `create-${initialValues?.email ?? ''}-${initialValues?.dilovodUserId ?? ''}`;

  return (
    <UserPersonCardPanel
      key={isOpen ? panelKey : 'closed'}
      editingUserId={user?.id ?? null}
      form={form}
      availableRoles={availableRoles}
      createNewInDilovod={createNewInDilovod}
      dilovodStepComplete={dilovodStepComplete}
      showFieldErrors={showFieldErrors}
      isPasswordVisible={isPasswordVisible}
      onFormChange={patchForm}
      onCreateNewInDilovodChange={setCreateNewInDilovod}
      onDilovodStepCompleteChange={setDilovodStepComplete}
      onPasswordVisibilityChange={setIsPasswordVisible}
      onGeneratePassword={() => void handleGeneratePassword()}
    />
  );
});
