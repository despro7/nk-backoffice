import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Divider,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Input,
  Select,
  SelectItem,
  Switch,
  Textarea,
} from '@heroui/react';
import { CalendarDate, parseDate, type DateValue } from '@internationalized/date';
import { I18nProvider } from '@react-aria/i18n';
import { DynamicIcon } from 'lucide-react/dynamic';
import { NumberInput } from '@/components/NumberInput';
import { ToastService } from '@/services/ToastService';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import {
  HR_PAY_GROUP_LABELS,
  HR_PAY_GROUPS,
  HR_PAY_TERMS_KIND_LABELS,
  HR_PAY_TERMS_KINDS,
  type HrEmployeeDetailDto,
  type HrEmploymentDto,
  type HrLegalEntityDto,
  type HrPayGroup,
  type HrPayTermsDto,
  type HrPayTermsKind,
  type HrUserOptionDto,
} from '@shared/types/hr';

interface EmployeeDrawerProps {
  isOpen: boolean;
  employeeId: number | null;
  legalEntities: HrLegalEntityDto[];
  canManage: boolean;
  canManagePayTerms: boolean;
  canRevealCard: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  lastName: string;
  firstName: string;
  middleName: string;
  statusActive: boolean;
  userId: string;
  notes: string;
  cardNumber: string;
}

const EMPTY_FORM: FormState = {
  lastName: '',
  firstName: '',
  middleName: '',
  statusActive: true,
  userId: '',
  notes: '',
  cardNumber: '',
};

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

function errorMessage(data: Record<string, unknown>, fallback: string): string {
  if (typeof data.message === 'string' && data.message) return data.message;
  if (typeof data.error === 'string' && data.error) return data.error;
  return fallback;
}

function ymdToDateValue(value: string): CalendarDate | null {
  if (!value) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

function dateValueToYmd(value: DateValue | null): string {
  if (!value) return '';
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

interface HrDateFieldProps {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  isRequired?: boolean;
}

function HrDateField({ label, description, value, onChange, isRequired }: HrDateFieldProps) {
  return (
    <DatePicker
      label={label}
      labelPlacement="outside"
      description={description}
      value={ymdToDateValue(value)}
      onChange={(date) => onChange(dateValueToYmd(date))}
      isRequired={isRequired}
      showMonthAndYearPickers
      granularity="day"
      selectorButtonPlacement="start"
      classNames={{
        base: 'w-full',
        segment: 'rounded',
      }}
    />
  );
}

const HR_ADD_BUTTON_CLASS = 'font-medium';

export function EmployeeDrawer({
  isOpen,
  employeeId,
  legalEntities,
  canManage,
  canManagePayTerms,
  canRevealCard,
  onClose,
  onSaved,
}: EmployeeDrawerProps) {
  const isCreate = employeeId == null;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [detail, setDetail] = useState<HrEmployeeDetailDto | null>(null);
  const [userOptions, setUserOptions] = useState<HrUserOptionDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cardVisible, setCardVisible] = useState(false);
  const [employmentForm, setEmploymentForm] = useState({
    legalEntityId: '',
    payGroup: 'official_salary' as HrPayGroup,
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: '',
  });
  const [payForm, setPayForm] = useState({
    employmentId: '',
    kind: 'salary' as HrPayTermsKind,
    amount: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: '',
  });
  const [deleteEmploymentId, setDeleteEmploymentId] = useState<number | null>(null);
  const [deletePayId, setDeletePayId] = useState<number | null>(null);

  const patchForm = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const loadUsers = useCallback(async (exclude?: number) => {
    const qs = exclude ? `?excludeEmployeeId=${exclude}` : '';
    const response = await fetch(`/api/hr/users-options${qs}`, { credentials: 'include' });
    if (!response.ok) return;
    const data = await response.json();
    setUserOptions(Array.isArray(data.data) ? data.data : []);
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/hr/employees/${id}`, { credentials: 'include' });
      const data = await readJson(response);
      if (!response.ok) {
        ToastService.show({ title: errorMessage(data, 'Не вдалося завантажити співробітника'), color: 'danger' });
        return;
      }
      const employee = data.data as HrEmployeeDetailDto;
      setDetail(employee);
      setForm({
        lastName: employee.lastName,
        firstName: employee.firstName,
        middleName: employee.middleName ?? '',
        statusActive: employee.status === 'active',
        userId: employee.userId != null ? String(employee.userId) : '',
        notes: employee.notes ?? '',
        cardNumber: employee.cardNumber ?? '',
      });
      if (employee.employments[0]) {
        setPayForm((prev) => ({ ...prev, employmentId: String(employee.employments[0].id) }));
      }
      await loadUsers(id);
    } finally {
      setLoading(false);
    }
  }, [loadUsers]);

  useEffect(() => {
    if (!isOpen) return;
    setCardVisible(false);
    if (isCreate) {
      setDetail(null);
      setForm(EMPTY_FORM);
      setEmploymentForm({
        legalEntityId: legalEntities[0] ? String(legalEntities[0].id) : '',
        payGroup: 'official_salary',
        validFrom: new Date().toISOString().slice(0, 10),
        validTo: '',
      });
      void loadUsers();
      return;
    }
    if (employeeId != null) void loadDetail(employeeId);
  }, [isOpen, isCreate, employeeId, legalEntities, loadDetail, loadUsers]);

  const selectedUserKeys = useMemo(() => (form.userId ? [form.userId] : ['none']), [form.userId]);

  const userSelectOptions = useMemo(
    () => [
      { key: 'none', label: 'Не привʼязано', textValue: 'Не привʼязано' },
      ...userOptions.map((user) => ({
        key: String(user.id),
        label: `${user.name} · ${user.email}`,
        textValue: `${user.name} ${user.email}`,
      })),
    ],
    [userOptions],
  );

  const handleSave = async () => {
    if (!form.lastName.trim() || !form.firstName.trim()) {
      ToastService.show({ title: 'Вкажіть прізвище та імʼя', color: 'danger' });
      return;
    }
    setSaving(true);
    try {
      const body = {
        lastName: form.lastName.trim(),
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim() || null,
        status: form.statusActive ? 'active' : 'inactive',
        userId: form.userId ? Number(form.userId) : null,
        notes: form.notes.trim() || null,
        ...(canRevealCard || isCreate || form.cardNumber.trim()
          ? { cardNumber: form.cardNumber.trim() || null }
          : {}),
      };
      const response = await fetch(isCreate ? '/api/hr/employees' : `/api/hr/employees/${employeeId}`, {
        method: isCreate ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await readJson(response);
      if (!response.ok) {
        ToastService.show({ title: errorMessage(data, 'Не вдалося зберегти'), color: 'danger' });
        return;
      }
      ToastService.show({ title: isCreate ? 'Співробітника створено' : 'Збережено', color: 'success' });
      onSaved();
      if (isCreate) onClose();
      else if (employeeId != null) await loadDetail(employeeId);
    } finally {
      setSaving(false);
    }
  };

  const handleAddEmployment = async () => {
    if (employeeId == null) {
      ToastService.show({ title: 'Спочатку збережіть співробітника', color: 'warning' });
      return;
    }
    if (!employmentForm.legalEntityId || !employmentForm.validFrom) {
      ToastService.show({ title: 'Оберіть юрособу і дату початку', color: 'danger' });
      return;
    }
    const response = await fetch(`/api/hr/employees/${employeeId}/employments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        legalEntityId: Number(employmentForm.legalEntityId),
        payGroup: employmentForm.payGroup,
        validFrom: employmentForm.validFrom,
        validTo: employmentForm.validTo || null,
      }),
    });
    const data = await readJson(response);
    if (!response.ok) {
      ToastService.show({ title: errorMessage(data, 'Не вдалося додати зайнятість'), color: 'danger' });
      return;
    }
    ToastService.show({ title: 'Зайнятість додано', color: 'success' });
    await loadDetail(employeeId);
    onSaved();
  };

  const handleAddPayTerms = async () => {
    if (!payForm.employmentId || !payForm.amount.trim()) {
      ToastService.show({ title: 'Оберіть зайнятість і суму', color: 'danger' });
      return;
    }
    const response = await fetch(`/api/hr/employments/${payForm.employmentId}/pay-terms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        kind: payForm.kind,
        amount: payForm.amount.replace(',', '.'),
        effectiveFrom: payForm.effectiveFrom,
        effectiveTo: payForm.effectiveTo || null,
      }),
    });
    const data = await readJson(response);
    if (!response.ok) {
      ToastService.show({ title: errorMessage(data, 'Не вдалося зберегти ставку'), color: 'danger' });
      return;
    }
    ToastService.show({ title: 'Ставку додано', color: 'success' });
    if (employeeId != null) await loadDetail(employeeId);
  };

  const confirmDeleteEmployment = async () => {
    if (deleteEmploymentId == null) return;
    const response = await fetch(`/api/hr/employments/${deleteEmploymentId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await readJson(response);
    if (!response.ok) {
      ToastService.show({ title: errorMessage(data, 'Не вдалося видалити зайнятість'), color: 'danger' });
      return;
    }
    setDeleteEmploymentId(null);
    if (employeeId != null) await loadDetail(employeeId);
    onSaved();
  };

  const confirmDeletePay = async () => {
    if (deletePayId == null) return;
    const response = await fetch(`/api/hr/pay-terms/${deletePayId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await readJson(response);
    if (!response.ok) {
      ToastService.show({ title: errorMessage(data, 'Не вдалося видалити ставку'), color: 'danger' });
      return;
    }
    setDeletePayId(null);
    if (employeeId != null) await loadDetail(employeeId);
  };

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onOpenChange={(open) => { if (!open) onClose(); }}
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
                {isCreate ? 'Новий співробітник' : detail?.displayName || 'Співробітник'}
              </DrawerHeader>
              <DrawerBody className="gap-5 py-5 overflow-y-auto">
                <I18nProvider locale="uk-UA">
                {loading ? (
                  <div className="text-sm text-gray-500">Завантаження...</div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4">
                      <Input
                        label="Прізвище"
                        labelPlacement="outside"
                        value={form.lastName}
                        onValueChange={(value) => patchForm('lastName', value)}
                        isRequired
                        isReadOnly={!canManage}
                        autoComplete="off"
                      />
                      <Input
                        label="Імʼя"
                        labelPlacement="outside"
                        value={form.firstName}
                        onValueChange={(value) => patchForm('firstName', value)}
                        isRequired
                        isReadOnly={!canManage}
                        autoComplete="off"
                      />
                      <Input
                        label="По батькові"
                        labelPlacement="outside"
                        value={form.middleName}
                        onValueChange={(value) => patchForm('middleName', value)}
                        isReadOnly={!canManage}
                        autoComplete="off"
                      />
                      <Select
                        label="Обліковий запис (опційно)"
                        labelPlacement="outside"
                        placeholder="Не привʼязано"
                        items={userSelectOptions}
                        selectedKeys={selectedUserKeys}
                        onSelectionChange={(keys) => {
                          const selected = Array.from(keys)[0];
                          if (selected === 'none' || selected == null) {
                            patchForm('userId', '');
                            return;
                          }
                          patchForm('userId', typeof selected === 'string' ? selected : '');
                        }}
                        isDisabled={!canManage}
                      >
                        {(item) => (
                          <SelectItem key={item.key} textValue={item.textValue}>
                            {item.label}
                          </SelectItem>
                        )}
                      </Select>
                      <Input
                        label="Картка"
                        labelPlacement="outside"
                        placeholder={detail?.cardMasked && !canRevealCard ? detail.cardMasked : 'Номер картки'}
                        description={canRevealCard ? 'Зберігається окремо від ПІБ, у списку — маска' : 'Повний номер доступний лише з окремим правом'}
                        type={cardVisible && canRevealCard ? 'text' : 'password'}
                        value={canRevealCard || isCreate ? form.cardNumber : ''}
                        onValueChange={(value) => patchForm('cardNumber', value)}
                        isReadOnly={!canManage || (!canRevealCard && !isCreate)}
                        autoComplete="off"
                        endContent={
                          canRevealCard ? (
                            <button className="focus:outline-none" type="button" onClick={() => setCardVisible((prev) => !prev)} aria-label="Показати номер картки">
                              <DynamicIcon name={cardVisible ? 'eye-off' : 'eye'} size={18} className="text-default-400" />
                            </button>
                          ) : null
                        }
                      />
                      {!canRevealCard && detail?.cardMasked ? (
                        <p className="text-sm text-gray-500">{detail.cardMasked}</p>
                      ) : null}
                      <Textarea
                        label="Примітка"
                        labelPlacement="outside"
                        value={form.notes}
                        onValueChange={(value) => patchForm('notes', value)}
                        isReadOnly={!canManage}
                        minRows={2}
                      />
                      {!isCreate && canManage ? (
                        <Switch
                          isSelected={form.statusActive}
                          size="sm"
                          onValueChange={(value) => patchForm('statusActive', value)}
                        >
                          Активний
                        </Switch>
                      ) : null}
                    </div>

                    {!isCreate ? (
                      <>
                        <Divider />
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold">Зайнятість</h3>
                          {(detail?.employments ?? []).length === 0 ? (
                            <p className="text-sm text-gray-500">Немає зайнятості</p>
                          ) : (
                            <ul className="space-y-3">
                              {(detail?.employments ?? []).map((employment) => (
                                <EmploymentBlock
                                  key={employment.id}
                                  employment={employment}
                                  canManage={canManage}
                                  canManagePayTerms={canManagePayTerms}
                                  onDelete={() => setDeleteEmploymentId(employment.id)}
                                  onDeletePay={(id) => setDeletePayId(id)}
                                />
                              ))}
                            </ul>
                          )}
                          {canManage ? (
                            <div className="grid grid-cols-1 gap-3 rounded-medium border border-default-200 p-3">
                              <Select
                                label="Роботодавець"
                                labelPlacement="outside"
                                selectedKeys={employmentForm.legalEntityId ? [employmentForm.legalEntityId] : []}
                                onSelectionChange={(keys) => {
                                  const selected = Array.from(keys)[0];
                                  if (typeof selected === 'string') {
                                    setEmploymentForm((prev) => ({ ...prev, legalEntityId: selected }));
                                  }
                                }}
                              >
                                {legalEntities.map((entity) => (
                                  <SelectItem key={String(entity.id)}>{entity.name}</SelectItem>
                                ))}
                              </Select>
                              <Select
                                label="Група оплати"
                                labelPlacement="outside"
                                selectedKeys={[employmentForm.payGroup]}
                                onSelectionChange={(keys) => {
                                  const selected = Array.from(keys)[0];
                                  if (typeof selected === 'string' && HR_PAY_GROUPS.includes(selected as HrPayGroup)) {
                                    setEmploymentForm((prev) => ({ ...prev, payGroup: selected as HrPayGroup }));
                                  }
                                }}
                              >
                                {HR_PAY_GROUPS.map((group) => (
                                  <SelectItem key={group}>{HR_PAY_GROUP_LABELS[group]}</SelectItem>
                                ))}
                              </Select>
                              <HrDateField
                                label="Дата початку"
                                description="З якого дня діє ця зайнятість"
                                value={employmentForm.validFrom}
                                onChange={(value) => setEmploymentForm((prev) => ({ ...prev, validFrom: value }))}
                                isRequired
                              />
                              <HrDateField
                                label="Дата закінчення"
                                description="Залиште порожнім, якщо зайнятість діє досі"
                                value={employmentForm.validTo}
                                onChange={(value) => setEmploymentForm((prev) => ({ ...prev, validTo: value }))}
                              />
                              <Button
                                size="sm"
                                color="primary"
                                variant="solid"
                                className={HR_ADD_BUTTON_CLASS}
                                startContent={<DynamicIcon name="plus" size={14} />}
                                onPress={() => void handleAddEmployment()}
                              >
                                Додати зайнятість
                              </Button>
                            </div>
                          ) : null}
                        </div>

                        {canManagePayTerms ? (
                          <div className="space-y-3">
                            <h3 className="text-sm font-semibold">Нова ставка</h3>
                            <div className="grid grid-cols-1 gap-3 rounded-medium border border-default-200 p-3">
                              <Select
                                label="Зайнятість"
                                labelPlacement="outside"
                                selectedKeys={payForm.employmentId ? [payForm.employmentId] : []}
                                onSelectionChange={(keys) => {
                                  const selected = Array.from(keys)[0];
                                  if (typeof selected === 'string') setPayForm((prev) => ({ ...prev, employmentId: selected }));
                                }}
                              >
                                {(detail?.employments ?? []).map((employment) => (
                                  <SelectItem key={String(employment.id)}>
                                    {employment.legalEntity.name} · {HR_PAY_GROUP_LABELS[employment.payGroup]}
                                  </SelectItem>
                                ))}
                              </Select>
                              <Select
                                label="Тип"
                                labelPlacement="outside"
                                selectedKeys={[payForm.kind]}
                                onSelectionChange={(keys) => {
                                  const selected = Array.from(keys)[0];
                                  if (typeof selected === 'string' && HR_PAY_TERMS_KINDS.includes(selected as HrPayTermsKind)) {
                                    setPayForm((prev) => ({ ...prev, kind: selected as HrPayTermsKind }));
                                  }
                                }}
                              >
                                {HR_PAY_TERMS_KINDS.map((kind) => (
                                  <SelectItem key={kind}>{HR_PAY_TERMS_KIND_LABELS[kind]}</SelectItem>
                                ))}
                              </Select>
                              <NumberInput
                                label="Сума, грн"
                                labelPlacement="outside"
                                value={payForm.amount}
                                onValueChange={(value) => setPayForm((prev) => ({ ...prev, amount: value }))}
                                decimalPlaces={2}
                                min={0}
                              />
                              <HrDateField
                                label="Чинна з"
                                description="З якого дня застосовується ця ставка"
                                value={payForm.effectiveFrom}
                                onChange={(value) => setPayForm((prev) => ({ ...prev, effectiveFrom: value }))}
                                isRequired
                              />
                              <HrDateField
                                label="Дата закінчення"
                                description="Залиште порожнім, якщо ставка діє досі"
                                value={payForm.effectiveTo}
                                onChange={(value) => setPayForm((prev) => ({ ...prev, effectiveTo: value }))}
                              />
                              <Button
                                size="sm"
                                color="primary"
                                variant="solid"
                                className={HR_ADD_BUTTON_CLASS}
                                startContent={<DynamicIcon name="plus" size={14} />}
                                onPress={() => void handleAddPayTerms()}
                              >
                                Додати ставку
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-xs text-gray-500">Зайнятість і ставки можна додати після створення картки.</p>
                    )}
                  </>
                )}
                </I18nProvider>
              </DrawerBody>
              <DrawerFooter className="border-t border-default-200 shrink-0">
                <Button variant="light" onPress={onClose}>Закрити</Button>
                {canManage ? (
                  <Button color="primary" isLoading={saving} onPress={() => void handleSave()}>
                    {isCreate ? 'Створити' : 'Зберегти'}
                  </Button>
                ) : null}
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>

      <ConfirmModal
        isOpen={deleteEmploymentId != null}
        title="Видалити зайнятість?"
        message="Ставки цієї зайнятості також буде видалено."
        confirmText="Видалити"
        cancelText="Скасувати"
        onConfirm={() => void confirmDeleteEmployment()}
        onCancel={() => setDeleteEmploymentId(null)}
      />
      <ConfirmModal
        isOpen={deletePayId != null}
        title="Видалити ставку?"
        message="Цю дію не можна скасувати."
        confirmText="Видалити"
        cancelText="Скасувати"
        onConfirm={() => void confirmDeletePay()}
        onCancel={() => setDeletePayId(null)}
      />
    </>
  );
}

function EmploymentBlock({
  employment,
  canManage,
  canManagePayTerms,
  onDelete,
  onDeletePay,
}: {
  employment: HrEmploymentDto;
  canManage: boolean;
  canManagePayTerms: boolean;
  onDelete: () => void;
  onDeletePay: (id: number) => void;
}) {
  return (
    <li className="rounded-medium border border-default-200 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{employment.legalEntity.name}</div>
          <div className="text-xs text-gray-500">
            {HR_PAY_GROUP_LABELS[employment.payGroup]} · {employment.validFrom}
            {employment.validTo ? ` — ${employment.validTo}` : ' — досі'}
          </div>
        </div>
        {canManage ? (
          <Button size="sm" variant="light" color="danger" isIconOnly aria-label="Видалити зайнятість" onPress={onDelete}>
            <DynamicIcon name="trash-2" size={14} />
          </Button>
        ) : null}
      </div>
      {employment.payTerms.length > 0 ? (
        <ul className="space-y-1">
          {employment.payTerms.map((term: HrPayTermsDto) => (
            <li key={term.id} className="flex items-center justify-between text-xs text-gray-700">
              <span>
                {HR_PAY_TERMS_KIND_LABELS[term.kind]} {term.amount} {term.currency} з {term.effectiveFrom}
                {term.effectiveTo ? ` по ${term.effectiveTo}` : ''}
              </span>
              {canManagePayTerms ? (
                <Button size="sm" variant="light" isIconOnly aria-label="Видалити ставку" onPress={() => onDeletePay(term.id)}>
                  <DynamicIcon name="x" size={12} />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-400">Ставки немає</p>
      )}
    </li>
  );
}
