import {
  Autocomplete,
  AutocompleteItem,
  Button,
  Input,
  Select,
  SelectItem,
  Switch,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import type { HrPersonDto, HrPersonSummaryDto, HrUserOptionDto } from '@shared/types/hr';

export interface EmployeePersonCardFormState {
  lastName: string;
  firstName: string;
  middleName: string;
  statusActive: boolean;
  userId: string;
  personId: string;
  notes: string;
  cardNumber: string;
}

interface UserSelectOption {
  key: string;
  label: string;
  textValue: string;
}

interface EmployeePersonCardPanelProps {
  isCreate: boolean;
  canManage: boolean;
  canManagePersons: boolean;
  canCreateUser: boolean;
  canRevealCard: boolean;
  form: EmployeePersonCardFormState;
  linkedPerson: HrPersonSummaryDto | null;
  personSearch: string;
  personOptions: HrPersonDto[];
  personSearchLoading: boolean;
  userSelectOptions: UserSelectOption[];
  selectedUserKeys: string[];
  cardVisible: boolean;
  showCardMasked: boolean;
  cardDisplayLast4: string | null;
  onFormChange: <K extends keyof EmployeePersonCardFormState>(field: K, value: EmployeePersonCardFormState[K]) => void;
  onPersonSearchChange: (value: string) => void;
  onPersonSelect: (person: HrPersonDto | null) => void;
  onUnlinkPerson: () => void;
  onCreatePerson: () => void;
  onCreateUser: () => void;
  onCardVisibilityToggle: () => void;
  onCardNumberChange: (value: string) => void;
}

function formatPersonSubtitle(person: HrPersonSummaryDto | HrPersonDto): string {
  const parts: string[] = [];
  if (person.taxCode) parts.push(`ІПН ${person.taxCode}`);
  if (person.phone) parts.push(person.phone);
  return parts.join(' · ') || '—';
}

function formatCardMaskedDisplay(last4: string): string {
  return `•••• •••• •••• ${last4}`;
}

export function EmployeePersonCardPanel({
  isCreate,
  canManage,
  canManagePersons,
  canCreateUser,
  canRevealCard,
  form,
  linkedPerson,
  personSearch,
  personOptions,
  personSearchLoading,
  userSelectOptions,
  selectedUserKeys,
  cardVisible,
  showCardMasked,
  cardDisplayLast4,
  onFormChange,
  onPersonSearchChange,
  onPersonSelect,
  onUnlinkPerson,
  onCreatePerson,
  onCreateUser,
  onCardVisibilityToggle,
  onCardNumberChange,
}: EmployeePersonCardPanelProps) {
  const selectedPerson = linkedPerson;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 col-span-2">
          {selectedPerson ? (
            <div className="flex items-end gap-2">
              <div className="flex flex-col items-start flex-1 gap-1 px-3 py-2 bg-default-100 rounded-md">
                <p className="text-xs subpixel-antialiased text-foreground-500">Фізична особа</p>
                <p className="text-sm font-medium text-default-900">{selectedPerson.displayName}</p>
              </div>
              {canManage ? (
                <Tooltip
                  content="Відвʼязати фізичну особу"
                  placement="top"
                  showArrow
                  classNames={{
                    base: 'before:rounded-[3px] before:bg-rose-600 before:z-[10] before:shadow-none',
                    content: 'bg-rose-600 text-white rounded-sm',
                  }}
                >
                  <Button
                    size="lg"
                    isIconOnly
                    className="bg-rose-200 text-rose-600 size-14"
                    onPress={onUnlinkPerson}
                  >
                    <DynamicIcon name="link-2-off" size={18} />
                  </Button>
                </Tooltip>
              ) : null}
            </div>
          ) : canManage ? (
            <div className="flex items-end gap-2">
              <Autocomplete
                label="Фізична особа"
                // labelPlacement="outside"
                placeholder="Пошук за ПІБ, ІПН або телефоном"
                inputValue={personSearch}
                onInputChange={onPersonSearchChange}
                selectedKey={form.personId || null}
                items={personOptions}
                isLoading={personSearchLoading}
                allowsCustomValue={false}
                menuTrigger="input"
                className="min-w-0 flex-1"
                defaultFilter={() => true}
                isVirtualized={false}
                onSelectionChange={(key) => {
                  if (key == null) return;
                  const person = personOptions.find((item) => String(item.id) === String(key));
                  onFormChange('personId', String(key));
                  onPersonSelect(person ?? null);
                }}
              >
                {(person) => (
                  <AutocompleteItem
                    key={String(person.id)}
                    textValue={`${person.displayName} ${person.taxCode ?? ''} ${person.phone ?? ''}`}
                  >
                    <div>
                      <div className="text-sm">{person.displayName}</div>
                      <div className="text-xs text-default-500">{formatPersonSubtitle(person)}</div>
                    </div>
                  </AutocompleteItem>
                )}
              </Autocomplete>
              {canManagePersons ? (
                <Tooltip
                  content="Додати фіз. особу"
                  placement="top-end"
                  showArrow
                  classNames={{
                    base: 'before:rounded-[3px] before:bg-blue-500 before:z-[10] before:shadow-none',
                    content: 'bg-blue-500 text-white rounded-sm',
                  }}
                >
                  <Button
                    size="lg"
                    isIconOnly
                    className="bg-blue-200 text-blue-600 size-14"
                    aria-label="Додати фіз. особу"
                    onPress={onCreatePerson}
                  >
                    <DynamicIcon name="plus" size={18} />
                  </Button>
                </Tooltip>
              ) : null}
            </div>
          ) : (
            <Input label="Фізична особа" labelPlacement="outside" value="Не привʼязано" isReadOnly />
          )}
          <div className="flex items-end gap-2">
            <Select
              label="Обліковий запис (опційно)"
              // labelPlacement="outside"
              placeholder="Не привʼязано"
              items={userSelectOptions}
              selectedKeys={selectedUserKeys}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0];
                if (selected === 'none' || selected == null) {
                  onFormChange('userId', '');
                  return;
                }
                onFormChange('userId', typeof selected === 'string' ? selected : '');
              }}
              isDisabled={!canManage}
              className="min-w-0 flex-1"
            >
              {(item) => (
                <SelectItem key={item.key} textValue={item.textValue}>
                  {item.label}
                </SelectItem>
              )}
            </Select>
            {canManage && form.userId ? (
              <Tooltip
                content="Відвʼязати обліковий запис"
                placement="top-end"
                showArrow
                classNames={{
                  base: 'before:rounded-[3px] before:bg-rose-600 before:z-[10] before:shadow-none',
                  content: 'bg-rose-600 text-white rounded-sm',
                }}
              >
                <Button
                  size="lg"
                  isIconOnly
                  className="bg-rose-200 text-rose-600 size-14"
                  aria-label="Відвʼязати обліковий запис"
                  onPress={() => onFormChange('userId', '')}
                >
                  <DynamicIcon name="link-2-off" size={18} />
                </Button>
              </Tooltip>
            ) : canManage && canCreateUser ? (
              <Tooltip
                content="Створити обліковий запис на основі даних співробітника"
                placement="top-end"
                showArrow
                classNames={{
                  base: 'before:rounded-[3px] before:bg-blue-500 before:z-[10] before:shadow-none',
                  content: 'bg-blue-500 text-white rounded-sm',
                }}
              >
                <Button
                  size="lg"
                  isIconOnly
                  className="bg-blue-200 text-blue-600 size-14"
                  aria-label="Створити обліковий запис"
                  onPress={onCreateUser}
                >
                  <DynamicIcon name="plus" size={18} />
                </Button>
              </Tooltip>
            ) : null}
          </div>
      </div>

      <div className="flex flex-col gap-1">
        <Input
          label="Картка"
          // labelPlacement="outside"
          placeholder="0000 0000 0000 0000"
          type="text"
          classNames={{ input: 'font-mono placeholder:opacity-60' }}
          inputMode="numeric"
          maxLength={19}
          value={
            showCardMasked && cardDisplayLast4
              ? formatCardMaskedDisplay(cardDisplayLast4)
              : canRevealCard || isCreate
                ? form.cardNumber
                : ''
          }
          onValueChange={onCardNumberChange}
          isReadOnly={(!cardVisible && !isCreate && form.cardNumber !== '') || !canManage || (!canRevealCard && !isCreate)}
          autoComplete="off"
          endContent={
            canRevealCard && !isCreate && form.cardNumber !== '' ? (
              <button className="focus:outline-none" type="button" onClick={onCardVisibilityToggle} aria-label="Показати номер картки">
                <DynamicIcon name={cardVisible ? 'eye-off' : 'eye'} size={18} className="text-default-500" />
              </button>
            ) : null
          }
        />
        {!canRevealCard && !isCreate ? (
          <p className="px-1 text-tiny text-default-400">Повний номер доступний лише з окремим правом</p>
        ) : null}
      </div>
      <Input
        label="Примітка"
        // labelPlacement="outside"
        value={form.notes}
        onValueChange={(value) => onFormChange('notes', value)}
        isReadOnly={!canManage}
      />
      {!isCreate && canManage ? (
        <Switch
          size="sm"
          className="pl-3 mt-3"
          isSelected={form.statusActive}
          onValueChange={(value) => onFormChange('statusActive', value)}
        >
          Активний працівник
        </Switch>
      ) : null}
    </div>
  );
}
