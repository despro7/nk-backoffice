import { useMemo } from 'react';
import {
  Button,
  Switch,
  Input,
  Select,
  SelectItem,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { DilovodRoleSelect } from '@/components/users/DilovodRoleSelect';
import { DilovodUserEmailFields } from '@/components/users/DilovodUserEmailFields';
import { PasswordStrengthIndicator } from '@/components/users/PasswordStrengthIndicator';

export interface UserPersonCardFormState {
  email: string;
  name: string;
  password: string;
  role: string;
  dilovodUserId: string;
  dilovodRoleId: string;
  isActive: boolean;
}

interface RoleOption {
  value: string;
  label: string;
}

interface UserPersonCardPanelProps {
  editingUserId?: number | null;
  form: UserPersonCardFormState;
  availableRoles: RoleOption[];
  createNewInDilovod: boolean;
  dilovodStepComplete: boolean;
  showFieldErrors?: boolean;
  isPasswordVisible: boolean;
  onFormChange: (field: keyof UserPersonCardFormState, value: string | boolean) => void;
  onCreateNewInDilovodChange: (value: boolean) => void;
  onDilovodStepCompleteChange: (value: boolean) => void;
  onPasswordVisibilityChange: (visible: boolean) => void;
  onGeneratePassword: () => void;
}

export function UserPersonCardPanel({
  editingUserId = null,
  form,
  availableRoles,
  createNewInDilovod,
  dilovodStepComplete,
  showFieldErrors = false,
  isPasswordVisible,
  onFormChange,
  onCreateNewInDilovodChange,
  onDilovodStepCompleteChange,
  onPasswordVisibilityChange,
  onGeneratePassword,
}: UserPersonCardPanelProps) {
  const isEditing = editingUserId != null;
  const showDilovodRole = Boolean(isEditing || dilovodStepComplete)
    && (createNewInDilovod || Boolean(form.dilovodUserId));

  const selectedRoleKeys = availableRoles.some((item) => item.value === form.role)
    ? [form.role]
    : [];

  const passwordFieldError = useMemo(() => {
    if (isEditing && !form.password) return undefined;
    if (!form.password) return 'Вкажіть пароль';
    if (form.password.length < 6) return 'Пароль повинен містити мінімум 6 символів';
    return undefined;
  }, [isEditing, form.password]);

  return (
    <>
      <DilovodUserEmailFields
        key={isEditing ? `edit-${editingUserId}` : 'create'}
        dilovodUserId={form.dilovodUserId}
        email={form.email}
        name={form.name}
        onDilovodUserIdChange={(value) => onFormChange('dilovodUserId', value)}
        onEmailChange={(value) => onFormChange('email', value)}
        onNameChange={(value) => onFormChange('name', value)}
        onDilovodRoleIdChange={(value) => onFormChange('dilovodRoleId', value)}
        createNewInDilovod={createNewInDilovod}
        onCreateNewInDilovodChange={onCreateNewInDilovodChange}
        onStepCompleteChange={onDilovodStepCompleteChange}
        variant={isEditing ? 'edit' : 'create'}
        showEmailField={Boolean(isEditing) || dilovodStepComplete}
      />

      {(isEditing || dilovodStepComplete) ? (
        <>
          <Input
            type="text"
            label="Ім'я"
            // labelPlacement="outside"
            placeholder="Іван Петренко"
            value={form.name}
            onValueChange={(value) => onFormChange('name', value)}
            isRequired={true}
            description={
              createNewInDilovod || form.dilovodUserId
                ? 'Синхронізується з обліковим записом Dilovod при збереженні'
                : undefined
            }
            autoComplete="off"
            isClearable
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Роль в Backoffice"
              // labelPlacement="outside"
              placeholder="Оберіть роль"
              description="Визначає рівень доступу до Backoffice та можливості використання сервісу"
              selectedKeys={selectedRoleKeys}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0];
                if (typeof selected === 'string') onFormChange('role', selected);
              }}
              isRequired
            >
              {availableRoles.map((role) => (
                <SelectItem key={role.value}>{role.label}</SelectItem>
              ))}
            </Select>
            {showDilovodRole ? (
              <DilovodRoleSelect
                value={form.dilovodRoleId}
                onChange={(value) => onFormChange('dilovodRoleId', value)}
                isRequired={true}
              />
            ) : null}
          </div>
          <div className="space-y-2">
            <Input
              type={isPasswordVisible ? 'text' : 'password'}
              label={isEditing ? 'Новий пароль' : 'Пароль'}
              labelPlacement="outside"
              placeholder={isEditing ? 'Залиште порожнім, щоб не змінювати' : 'Мінімум 6 символів'}
              value={form.password}
              onValueChange={(value) => onFormChange('password', value)}
              isInvalid={showFieldErrors && Boolean(passwordFieldError)}
              errorMessage={showFieldErrors ? passwordFieldError : undefined}
              autoComplete="new-password"
              endContent={
                <button className="focus:outline-none" type="button" onClick={() => onPasswordVisibilityChange(!isPasswordVisible)}>
                  <DynamicIcon name={isPasswordVisible ? 'eye-off' : 'eye'} size={18} className="text-default-400" />
                </button>
              }
            />
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <PasswordStrengthIndicator password={form.password} />
              </div>
              <Button
                size="sm"
                variant="light"
                color="primary"
                className="shrink-0 hover:bg-primary-100/50! text-primary-500"
                onPress={onGeneratePassword}
                startContent={<DynamicIcon name="key-round" size={14} />}
              >
                Згенерувати надійний пароль
              </Button>
            </div>
          </div>
          {isEditing ? (
            <Switch size="sm" isSelected={form.isActive} onValueChange={(checked) => onFormChange('isActive', checked)}>
              Активний користувач
            </Switch>
          ) : null}
        </>
      ) : null}
    </>
  );
}
