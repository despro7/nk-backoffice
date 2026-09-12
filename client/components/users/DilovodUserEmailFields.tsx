import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Spinner, Switch } from '@heroui/react';
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
  createNewInDilovod: boolean;
  onCreateNewInDilovodChange: (value: boolean) => void;
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
  createNewInDilovod,
  onCreateNewInDilovodChange,
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
      })),
    [users],
  );

  const selectedDilovodUser = useMemo(
    () => users.find((user) => user.id === dilovodUserId),
    [users, dilovodUserId],
  );

  const stepComplete = variant === 'edit'
    ? true
    : Boolean(dilovodUserId) || createNewInDilovod;

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
      onEmailChange(dilovodEmail);
      setEmailMismatch(null);
      return;
    }

    setEmailMismatch({ localEmail: trimmedEmail, dilovodEmail });
  }, [onDilovodRoleIdChange, onEmailChange, onNameChange, users]);

  useEffect(() => {
    if (loading || users.length === 0 || !dilovodUserId || createNewInDilovod) return;
    applyExistingUserData(dilovodUserId, email);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- синхронізація після завантаження довідника
  }, [loading, users.length]);

  const handleDilovodUserChange = (nextUserId: string) => {
    if (createNewInDilovod) return;
    onDilovodUserIdChange(nextUserId);
    if (nextUserId) {
      onCreateNewInDilovodChange(false);
      applyExistingUserData(nextUserId, email, { prefillName: true });
      return;
    }
    setEmailMismatch(null);
  };

  const handleCreateNewChange = (next: boolean) => {
    onCreateNewInDilovodChange(next);
    if (next) {
      onDilovodUserIdChange('');
      setEmailMismatch(null);
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

  const showStepControls = variant === 'create';

  return (
    <div className="flex flex-col gap-6">
      <section className="space-y-4">
        {showStepControls ? (
          <p className="text-sm font-semibold text-text-primary">1. Оберіть або створіть користувача в Діловоді</p>
        ) : null}

        <div className="space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-text-secondary py-2">
              <Spinner size="sm" />
              Завантаження користувачів Dilovod…
            </div>
          ) : (
            <DilovodDictAutocomplete
              dictItems={dictItems}
              selectedKey={dilovodUserId}
              onChange={handleDilovodUserChange}
              label={showStepControls ? 'Обрати користувача' : 'Користувач в Діловоді'}
              description="Оберіть зі списку або почніть вводити імʼя/email користувача"
              isClearable
              showParent
              size="md"
              className="w-full"
              isDisabled={createNewInDilovod}
            />
          )}
          {error ? (
            <div className="flex items-center gap-2">
              <p className="text-xs text-danger">Не вдалося завантажити користувачів Dilovod</p>
              <Button size="sm" variant="light" onPress={() => {
                invalidateDilovodUsersCache();
                void reload();
              }}>
                Повторити
              </Button>
            </div>
          ) : null}
        </div>

        {showStepControls  ? (
          <Switch
            size="sm"
            isSelected={createNewInDilovod}
            onValueChange={handleCreateNewChange}
            aria-label="Створити нового користувача в Діловоді"
            classNames={{
              base: [
                'inline-flex w-full max-w-md hover:bg-amber-50 items-center',
                'justify-between cursor-pointer rounded-lg gap-2 px-4 py-3 border-2 border-amber-200',
                'data-[selected=true]:bg-amber-50 data-[selected=true]:border-amber-200',
              ],
              wrapper: 'group-data-[selected=true]:bg-amber-300',
            }}
          >
            <div className="flex flex-col gap-1">
              <p className="text-sm text-text-primary">Створити нового користувача в Діловоді</p>
              <p className="text-tiny text-default-400">
                Якщо облікового запису ще немає – створимо автоматично під час збереження
              </p>
            </div>
          </Switch>
        ) : null}
      </section>

      {emailMismatch ? (
        <div className="rounded-md border-2 border-warning/40 bg-warning/10 p-3 space-y-3">
          <p className="text-sm text-text-primary">
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
        <p className="text-sm font-semibold text-text-primary">2. Заповніть основні дані</p>
      ) : null}

      {showEmailField && (variant === 'edit' || stepComplete) ? (
        <Input
          type="email"
          label={emailLabel}
          labelPlacement="outside"
          placeholder="user@example.com"
          value={email}
          onValueChange={onEmailChange}
          isRequired={emailRequired}
          isClearable
          description={
            createNewInDilovod
              ? 'Email буде використано для створення облікового запису одночасно в Діловоді та в Backoffice'
              : dilovodUserId
                ? 'Підставлено з Dilovod — можна змінити перед збереженням'
                : undefined
          }
          autoComplete="off"
        />
      ) : null}
    </div>
  );
}
