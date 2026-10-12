import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Switch } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { DilovodDictAutocomplete } from '@/pages/BankStatementImport/components/DilovodDictAutocomplete';
import { invalidateDilovodUsersCache, useDilovodUsers } from '@/hooks/useDilovodUsers';
import { emailsMatch } from '@shared/lib/normalizeEmail';
import type { DilovodDictItem } from '@shared/utils/directoryUtils';

interface EmailMismatch {
  localEmail: string;
  dilovodEmail: string;
}

export interface DilovodUserEmailFieldsProps {
  dilovodUserId: string;
  email: string;
  name?: string;
  onDilovodUserIdChange: (id: string) => void;
  onEmailChange: (email: string) => void;
  onNameChange?: (name: string) => void;
  onDilovodRoleIdChange?: (roleId: string) => void;
  /** Створити обліковку лише в Backoffice (без привʼязки / створення в Dilovod) */
  backofficeOnly: boolean;
  onBackofficeOnlyChange: (value: boolean) => void;
  activateDilovodUser?: boolean;
  onActivateDilovodUserChange?: (value: boolean) => void;
  onStepCompleteChange?: (complete: boolean) => void;
  /** У режимі редагування показуємо autocomplete без покрокової логіки */
  variant?: 'create' | 'edit';
  emailRequired?: boolean;
  emailLabel?: string;
  showEmailField?: boolean;
}

export function DilovodUserEmailFields({
  dilovodUserId,
  email,
  name = '',
  onDilovodUserIdChange,
  onEmailChange,
  onNameChange,
  onDilovodRoleIdChange,
  backofficeOnly,
  onBackofficeOnlyChange,
  activateDilovodUser = false,
  onActivateDilovodUserChange,
  onStepCompleteChange,
  variant = 'create',
  emailRequired = true,
  emailLabel = 'Email',
  showEmailField = true,
}: DilovodUserEmailFieldsProps) {
  const { users, loading, error, reload } = useDilovodUsers();
  const [emailMismatch, setEmailMismatch] = useState<EmailMismatch | null>(null);

  const dictItems = useMemo<DilovodDictItem[]>(
    () =>
      users.map((user) => ({
        id: user.id,
        name: user.name,
        id__pr: user.name,
        parent__pr: user.code || undefined,
        code: user.code || undefined,
        disabled: Boolean(user.disabled),
      })),
    [users],
  );

  const selectedDilovodUser = useMemo(
    () => users.find((user) => user.id === dilovodUserId),
    [users, dilovodUserId],
  );

  const selectedIsDisabled = Boolean(selectedDilovodUser?.disabled);
  const showActivateOption = selectedIsDisabled && !backofficeOnly && Boolean(onActivateDilovodUserChange);

  const stepComplete = variant === 'edit'
    ? true
    : Boolean(dilovodUserId) || backofficeOnly;

  useEffect(() => {
    onStepCompleteChange?.(stepComplete);
  }, [onStepCompleteChange, stepComplete]);

  const applyExistingUserData = useCallback((
    nextUserId: string,
    currentEmail: string,
    options?: { prefillName?: boolean },
  ) => {
    if (!nextUserId) {
      setEmailMismatch(null);
      return;
    }

    const dilovodUser = users.find((user) => user.id === nextUserId);
    const dilovodEmail = dilovodUser?.code?.trim() || '';
    const dilovodName = dilovodUser?.name?.trim() || '';

    if (options?.prefillName && dilovodName && onNameChange) {
      onNameChange(dilovodName);
    }

    if (dilovodUser?.roleId && onDilovodRoleIdChange) {
      onDilovodRoleIdChange(dilovodUser.roleId);
    }

    if (!dilovodEmail) {
      setEmailMismatch(null);
      return;
    }

    const trimmedEmail = currentEmail.trim();

    if (!trimmedEmail) {
      onEmailChange(dilovodEmail);
      setEmailMismatch(null);
      return;
    }

    if (emailsMatch(trimmedEmail, dilovodEmail)) {
      // Не перезаписуємо email при збігу — інакше регістр/формат робить форму dirty
      setEmailMismatch(null);
      return;
    }

    setEmailMismatch({ localEmail: trimmedEmail, dilovodEmail });
  }, [onDilovodRoleIdChange, onEmailChange, onNameChange, users]);

  useEffect(() => {
    if (loading || users.length === 0 || !dilovodUserId || backofficeOnly) return;

    // У edit не мутуємо форму з довідника — лише mismatch; роль підставляє UserCardPanel
    if (variant === 'edit') {
      const dilovodUser = users.find((item) => item.id === dilovodUserId);
      const dilovodEmail = dilovodUser?.code?.trim() || '';
      if (!dilovodEmail || !email.trim()) {
        setEmailMismatch(null);
        return;
      }
      if (emailsMatch(email, dilovodEmail)) {
        setEmailMismatch(null);
        return;
      }
      setEmailMismatch({ localEmail: email.trim(), dilovodEmail });
      return;
    }

    applyExistingUserData(dilovodUserId, email);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- синхронізація після завантаження довідника
  }, [loading, users.length, variant]);

  // Скидаємо activate, якщо обраний не вимкнений / лише Backoffice
  useEffect(() => {
    if (!onActivateDilovodUserChange) return;
    if ((!selectedIsDisabled || backofficeOnly) && activateDilovodUser) {
      onActivateDilovodUserChange(false);
    }
  }, [selectedIsDisabled, backofficeOnly, activateDilovodUser, onActivateDilovodUserChange]);

  const handleDilovodUserChange = (nextUserId: string) => {
    if (backofficeOnly) return;
    onDilovodUserIdChange(nextUserId);
    if (nextUserId) {
      onBackofficeOnlyChange(false);
      const nextUser = users.find((user) => user.id === nextUserId);
      // При виборі вимкненого — за замовчуванням пропонуємо активувати
      onActivateDilovodUserChange?.(Boolean(nextUser?.disabled));
      applyExistingUserData(nextUserId, email, { prefillName: true });
      return;
    }
    setEmailMismatch(null);
    onActivateDilovodUserChange?.(false);
  };

  const handleBackofficeOnlyChange = (next: boolean) => {
    onBackofficeOnlyChange(next);
    if (next) {
      onDilovodUserIdChange('');
      setEmailMismatch(null);
      onActivateDilovodUserChange?.(false);
      return;
    }
    setEmailMismatch(null);
  };

  const handleKeepLocalEmail = () => {
    setEmailMismatch(null);
  };

  const handleUseDilovodEmail = () => {
    if (!emailMismatch) return;
    onEmailChange(emailMismatch.dilovodEmail);
    setEmailMismatch(null);
  };

  const handleRefresh = () => {
    invalidateDilovodUsersCache();
    void reload();
  };

  const showStepControls = variant === 'create';

  return (
    <div className="flex flex-col gap-6">
      <section className="space-y-4">
        {showStepControls ? (
          <p className="text-sm font-semibold text-default-900">1. Привʼязка до Dilovod (необовʼязково)</p>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-end gap-2">
            <DilovodDictAutocomplete
              labelPlacement="outside"
              dictItems={dictItems}
              selectedKey={dilovodUserId}
              onChange={handleDilovodUserChange}
              label={showStepControls ? 'Обрати користувача Dilovod' : 'Користувач в Діловоді'}
              placeholder="Почніть вводити імʼя/email користувача"
              isClearable
              showParent
              size="md"
              className="w-full min-w-0 flex-1 [&_input::placeholder]:opacity-50"
              isDisabled={backofficeOnly || loading}
            />
            <Button
              isIconOnly
              variant="flat"
              className="shrink-0"
              aria-label="Оновити список користувачів Dilovod"
              title="Примусово оновити список"
              isDisabled={backofficeOnly}
              isLoading={loading}
              onPress={handleRefresh}
            >
              <DynamicIcon name="refresh-cw" size={16} />
            </Button>
          </div>
          {dilovodUserId ? (
            <p className="text-xs text-default-400">
              Dilovod ID:{' '}
              <span className="font-mono text-default-600">{dilovodUserId}</span>
            </p>
          ) : null}
          {error ? (
            <div className="flex items-center gap-2">
              <p className="text-xs text-danger">Не вдалося завантажити користувачів Dilovod</p>
              <Button size="sm" variant="light" onPress={handleRefresh}>
                Повторити
              </Button>
            </div>
          ) : null}
        </div>

        {showActivateOption ? (
          <Switch
            size="sm"
            isSelected={activateDilovodUser}
            onValueChange={(checked) => onActivateDilovodUserChange?.(checked)}
            aria-label="Активувати користувача в Діловоді"
            classNames={{
              base: [
                'inline-flex w-full bg-white hover:bg-blue-50/40 items-center',
                'justify-between cursor-pointer rounded-lg gap-2 px-4 py-3 border-2 border-primary-300',
                'data-[selected=true]:bg-blue-50 data-[selected=true]:border-blue-400',
              ],
              wrapper: 'group-data-[selected=true]:bg-blue-500',
            }}
          >
            <div className="flex flex-col gap-1">
              <p className="text-sm text-default-900">Активувати користувача в Діловоді?</p>
              <p className="text-tiny text-default-400">
                Обраний обліковий запис у Dilovod зараз вимкнений і при збереженні буде активований
              </p>
            </div>
          </Switch>
        ) : null}

        {showStepControls && !dilovodUserId ? (
          <Switch
            size="sm"
            isSelected={backofficeOnly}
            onValueChange={handleBackofficeOnlyChange}
            aria-label="Створити лише в Backoffice"
            classNames={{
              base: [
                'inline-flex w-full bg-white hover:bg-default-100 items-center',
                'justify-between cursor-pointer rounded-lg gap-2 px-4 py-3 border-2 border-default-200',
                'data-[selected=true]:bg-default-50 data-[selected=true]:border-default-300',
              ],
              wrapper: 'group-data-[selected=true]:bg-default-500',
            }}
          >
            <div className="flex flex-col gap-1">
              <p className="text-sm text-default-900">Створити лише в Backoffice</p>
              <p className="text-tiny text-default-400">
                Без привʼязки до Dilovod. Обліковий запис Dilovod можна додати пізніше вручну
              </p>
            </div>
          </Switch>
        ) : null}
      </section>

      {emailMismatch ? (
        <div className="rounded-md border-2 border-warning/40 bg-warning/10 p-3 space-y-3">
          <p className="text-sm text-default-900">
            Email у формі (<span className="font-mono text-xs">{emailMismatch.localEmail}</span>) відрізняється
            від Dilovod (<span className="font-mono text-xs">{emailMismatch.dilovodEmail}</span>
            {selectedDilovodUser?.name ? ` – ${selectedDilovodUser.name}` : ''}).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" color="warning" variant="flat" onPress={handleKeepLocalEmail}>
              Залишити поточний
            </Button>
            <Button size="sm" color="warning" variant="flat" onPress={handleUseDilovodEmail}>
              Використати з Dilovod
            </Button>
          </div>
        </div>
      ) : null}

      {stepComplete ? (
        <p className="text-sm font-semibold text-default-900">2. Заповніть основні дані</p>
      ) : null}

      {showEmailField && (variant === 'edit' || stepComplete) ? (
        <Input
          type="email"
          label={emailLabel}
          placeholder="user@example.com"
          value={email}
          onValueChange={onEmailChange}
          isRequired={emailRequired}
          isClearable
          description={
            backofficeOnly
              ? 'Email для входу в Backoffice'
              : dilovodUserId
                ? 'Підставлено з Dilovod, можна змінити перед збереженням'
                : undefined
          }
          autoComplete="off"
        />
      ) : null}
    </div>
  );
}
