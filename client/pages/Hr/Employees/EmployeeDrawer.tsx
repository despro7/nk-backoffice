import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
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
import { ToastService } from '@/services/ToastService';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { UnsavedChangesModal } from '@/components/modals/UnsavedChangesModal';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
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
import {
  collectHrPayWarnings,
  hrDayBeforeYmd,
  overlappingPayTerms,
} from '@shared/utils/hrPayHealth';
import { HrSpecChip, hrEmployerTokensFromName, hrPayGroupTokens, hrStatusTokens } from '../hrUi';

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

interface PayFormState {
  kind: HrPayTermsKind;
  amount: string;
  effectiveFrom: string;
  effectiveTo: string;
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

function snapshotEmployeeForm(form: FormState): string {
  return JSON.stringify({
    lastName: form.lastName,
    firstName: form.firstName,
    middleName: form.middleName,
    statusActive: form.statusActive,
    userId: form.userId,
    notes: form.notes,
    cardNumber: form.cardNumber.replace(/\D/g, ''),
  });
}

const PAY_KIND_OPTIONS = HR_PAY_TERMS_KINDS.map((kind) => ({
  key: kind,
  label: HR_PAY_TERMS_KIND_LABELS[kind],
  textValue: HR_PAY_TERMS_KIND_LABELS[kind],
}));

const PAY_GROUP_OPTIONS = HR_PAY_GROUPS.map((group) => ({
  key: group,
  label: HR_PAY_GROUP_LABELS[group],
  textValue: HR_PAY_GROUP_LABELS[group],
}));

const HR_ADD_BUTTON_CLASS = 'font-medium';
const DATE_FORMATTER = new Intl.DateTimeFormat('uk-UA', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

function errorMessage(data: Record<string, unknown>, fallback: string): string {
  if (typeof data.message === 'string' && data.message) return data.message;
  if (typeof data.error === 'string' && data.error) return data.error;
  return fallback;
}

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function capitalizeUaName(value: string): string {
  return value
    .trim()
    .split(/(\s+|-)/)
    .map((part) => {
      if (!part || part === '-' || /^\s+$/.test(part)) return part;
      return part.charAt(0).toLocaleUpperCase('uk-UA') + part.slice(1).toLocaleLowerCase('uk-UA');
    })
    .join('');
}

function formatCardMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(.{4})(?=.)/g, '$1 ');
}

function formatAmountMask(value: string): string {
  const digits = value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 9);
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function amountToApi(value: string): string {
  return value.replace(/\s/g, '');
}

function emptyPayForm(): PayFormState {
  return {
    kind: 'salary',
    amount: '',
    effectiveFrom: todayYmd(),
    effectiveTo: '',
  };
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

function formatHrDate(value: string): string {
  if (!value) return '';
  const date = ymdToDateValue(value);
  if (!date) return value;
  return DATE_FORMATTER.format(new Date(date.year, date.month - 1, date.day));
}

function formatMoney(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return formatAmountMask(String(Math.round(n)));
}

function payAmountFieldMeta(kind: HrPayTermsKind): { label: string; placeholder: string; description?: string } {
  if (kind === 'hourly') {
    return {
      label: 'Ставка за годину',
      placeholder: 'Введіть суму',
    };
  }
  return {
    label: 'Місячна ставка',
    placeholder: 'Введіть суму',
  };
}

function isEmploymentActive(employment: HrEmploymentDto, today: string): boolean {
  return !employment.validTo || employment.validTo >= today;
}

function sortEmployments(employments: HrEmploymentDto[], today: string): HrEmploymentDto[] {
  return [...employments].sort((a, b) => {
    const aActive = isEmploymentActive(a, today) ? 1 : 0;
    const bActive = isEmploymentActive(b, today) ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    return b.validFrom.localeCompare(a.validFrom);
  });
}

function sortPayTerms(terms: HrPayTermsDto[]): HrPayTermsDto[] {
  return [...terms].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
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
        label: 'text-xs font-medium',
      }}
    />
  );
}

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
  const baselineRef = useRef('');
  const [baselineVersion, setBaselineVersion] = useState(0);
  const [employmentForm, setEmploymentForm] = useState({
    legalEntityId: '',
    payGroup: 'official_salary' as HrPayGroup,
    validFrom: todayYmd(),
    validTo: '',
  });
  const [deleteEmploymentId, setDeleteEmploymentId] = useState<number | null>(null);
  const [deletePayId, setDeletePayId] = useState<number | null>(null);
  const [addingEmployment, setAddingEmployment] = useState(false);

  const patchForm = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const commitBaseline = useCallback((nextForm: FormState) => {
    baselineRef.current = snapshotEmployeeForm(nextForm);
    setBaselineVersion((version) => version + 1);
  }, []);

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
      const nextForm: FormState = {
        lastName: employee.lastName,
        firstName: employee.firstName,
        middleName: employee.middleName ?? '',
        statusActive: employee.status === 'active',
        userId: employee.userId != null ? String(employee.userId) : '',
        notes: employee.notes ?? '',
        cardNumber: formatCardMask(employee.cardNumber ?? ''),
      };
      setForm(nextForm);
      commitBaseline(nextForm);
      await loadUsers(id);
    } finally {
      setLoading(false);
    }
  }, [loadUsers, commitBaseline]);

  useEffect(() => {
    if (!isOpen) {
      baselineRef.current = '';
      return;
    }
    setCardVisible(false);
    setAddingEmployment(false);
    if (isCreate) {
      setDetail(null);
      setForm(EMPTY_FORM);
      commitBaseline(EMPTY_FORM);
      setEmploymentForm({
        legalEntityId: legalEntities[0] ? String(legalEntities[0].id) : '',
        payGroup: 'official_salary',
        validFrom: todayYmd(),
        validTo: '',
      });
      void loadUsers();
      return;
    }
    baselineRef.current = '';
    setBaselineVersion((version) => version + 1);
    if (employeeId != null) void loadDetail(employeeId);
  }, [isOpen, isCreate, employeeId, legalEntities, loadDetail, loadUsers, commitBaseline]);

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

  const legalEntityOptions = useMemo(
    () =>
      legalEntities.map((entity) => ({
        key: String(entity.id),
        label: entity.name,
        textValue: entity.name,
      })),
    [legalEntities],
  );

  const sortedEmployments = useMemo(
    () => sortEmployments(detail?.employments ?? [], todayYmd()),
    [detail?.employments],
  );

  const payWarnings = useMemo(
    () =>
      collectHrPayWarnings(
        (detail?.employments ?? []).map((employment) => ({
          payGroup: employment.payGroup,
          validFrom: employment.validFrom,
          validTo: employment.validTo,
          legalEntityName: employment.legalEntity.name,
          payTerms: employment.payTerms,
        })),
        undefined,
        detail?.status ?? 'active',
      ),
    [detail?.employments, detail?.status],
  );

  const isDirty = useMemo(() => {
    if (!isOpen || !canManage) return false;
    if (!baselineRef.current) return false;
    if (!isCreate && loading) return false;
    void baselineVersion;
    return snapshotEmployeeForm(form) !== baselineRef.current;
  }, [isOpen, canManage, isCreate, loading, form, baselineVersion]);

  const handleSave = useCallback(async () => {
    const lastName = capitalizeUaName(form.lastName);
    const firstName = capitalizeUaName(form.firstName);
    const middleName = capitalizeUaName(form.middleName);
    if (!lastName || !firstName) {
      ToastService.show({ title: 'Вкажіть прізвище та імʼя', color: 'danger' });
      throw new Error('Вкажіть прізвище та імʼя');
    }
    setForm((prev) => ({ ...prev, lastName, firstName, middleName }));
    setSaving(true);
    try {
      const body = {
        lastName,
        firstName,
        middleName: middleName || null,
        status: form.statusActive ? 'active' : 'inactive',
        userId: form.userId ? Number(form.userId) : null,
        notes: form.notes.trim() || null,
        ...(canRevealCard || isCreate || form.cardNumber.trim()
          ? { cardNumber: form.cardNumber.replace(/\D/g, '') || null }
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
        throw new Error(errorMessage(data, 'Не вдалося зберегти'));
      }
      ToastService.show({ title: isCreate ? 'Співробітника створено' : 'Збережено', color: 'success' });
      onSaved();
      if (isCreate) onClose();
      else if (employeeId != null) await loadDetail(employeeId);
    } finally {
      setSaving(false);
    }
  }, [form, canRevealCard, isCreate, employeeId, onSaved, onClose, loadDetail]);

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
    setAddingEmployment(false);
    await loadDetail(employeeId);
    onSaved();
  };

  const handleAddPayTerms = async (employmentId: number, payload: PayFormState, closePrevious = false) => {
    if (!payload.amount.trim()) {
      ToastService.show({ title: 'Вкажіть суму ставки', color: 'danger' });
      return false;
    }
    const response = await fetch(`/api/hr/employments/${employmentId}/pay-terms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        kind: payload.kind,
        amount: amountToApi(payload.amount),
        effectiveFrom: payload.effectiveFrom,
        effectiveTo: payload.effectiveTo || null,
        closePrevious,
      }),
    });
    const data = await readJson(response);
    if (!response.ok) {
      ToastService.show({ title: errorMessage(data, 'Не вдалося зберегти ставку'), color: 'danger' });
      return false;
    }
    ToastService.show({ title: 'Ставку додано', color: 'success' });
    if (employeeId != null) await loadDetail(employeeId);
    onSaved();
    return true;
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
    onSaved();
  };

  const guard = useUnsavedGuard({
    isDirty,
    onSaveDraft: handleSave,
  });

  const requestClose = guard.guardAction(onClose, {
    title: 'Незбережені зміни',
    message: 'У картці співробітника є незбережені зміни. Що зробити перед закриттям?',
    saveText: 'Зберегти і закрити',
    leaveText: 'Закрити без збереження',
    cancelText: 'Залишитись',
  });

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onOpenChange={(open) => { if (!open) requestClose(); }}
        placement="right"
        size="3xl"
        classNames={{
          base: 'flex flex-col',
          body: 'flex-1 min-h-0 overflow-y-auto',
        }}
      >
        <DrawerContent>
          {() => (
            <>
              <DrawerHeader className="border-b border-border-subtle shrink-0">
                {isCreate ? 'Новий співробітник' : detail?.displayName || 'Співробітник'}
              </DrawerHeader>
              <DrawerBody className="gap-5 py-5 overflow-y-auto">
                <I18nProvider locale="uk-UA">
                {loading ? (
                  <div className="text-sm text-text-secondary">Завантаження...</div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        label="Прізвище"
                        labelPlacement="outside"
                        value={form.lastName}
                        onValueChange={(value) => patchForm('lastName', value)}
                        onBlur={() => patchForm('lastName', capitalizeUaName(form.lastName))}
                        isRequired
                        isReadOnly={!canManage}
                        autoComplete="off"
                      />
                      <Input
                        label="Імʼя"
                        labelPlacement="outside"
                        value={form.firstName}
                        onValueChange={(value) => patchForm('firstName', value)}
                        onBlur={() => patchForm('firstName', capitalizeUaName(form.firstName))}
                        isRequired
                        isReadOnly={!canManage}
                        autoComplete="off"
                      />
                      <Input
                        label="По батькові"
                        labelPlacement="outside"
                        value={form.middleName}
                        onValueChange={(value) => patchForm('middleName', value)}
                        onBlur={() => patchForm('middleName', capitalizeUaName(form.middleName))}
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
                        placeholder={detail?.cardMasked && !canRevealCard ? detail.cardMasked : '0000 0000 0000 0000'}
                        description={!canRevealCard && 'Повний номер доступний лише з окремим правом'}
                        type={cardVisible && canRevealCard ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={19}
                        value={canRevealCard || isCreate ? form.cardNumber : ''}
                        onValueChange={(value) => patchForm('cardNumber', formatCardMask(value))}
                        isReadOnly={!canManage || (!canRevealCard && !isCreate)}
                        autoComplete="off"
                        endContent={
                          canRevealCard ? (
                            <button className="focus:outline-none" type="button" onClick={() => setCardVisible((prev) => !prev)} aria-label="Показати номер картки">
                              <DynamicIcon name={cardVisible ? 'eye-off' : 'eye'} size={18} className="text-text-secondary" />
                            </button>
                          ) : null
                        }
                      />
                      {!canRevealCard && detail?.cardMasked ? (
                        <p className="text-sm text-text-secondary self-end pb-1">{detail.cardMasked}</p>
                      ) : null}
                      <Input
                        label="Примітка"
                        labelPlacement="outside"
                        value={form.notes}
                        onValueChange={(value) => patchForm('notes', value)}
                        isReadOnly={!canManage}
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
                          <div>
                            <h3 className="text-sm font-semibold text-text-primary">Зайнятість</h3>
                            <p className="mt-1 text-xs text-text-secondary">
                              Це рядок у табелі та розрахунку (роботодавець + спосіб оплати + період). Ставки задають суму для цієї зайнятості.
                            </p>
                          </div>
                          {payWarnings.length > 0 ? (
                            <Alert color="danger" variant="faded" title="Перевірте ставки">
                              <ul className="mt-1 list-disc pl-4 text-sm">
                                {payWarnings.map((warning) => (
                                  <li key={warning}>{warning}</li>
                                ))}
                              </ul>
                            </Alert>
                          ) : null}
                          {sortedEmployments.length === 0 ? (
                            <p className="text-sm text-text-secondary">Немає зайнятості</p>
                          ) : (
                            <div className="space-y-3">
                              {sortedEmployments.map((employment) => (
                                <EmploymentBlock
                                  key={employment.id}
                                  employment={employment}
                                  canManage={canManage}
                                  canManagePayTerms={canManagePayTerms}
                                  onDelete={() => setDeleteEmploymentId(employment.id)}
                                  onDeletePay={(id) => setDeletePayId(id)}
                                  onAddPayTerms={handleAddPayTerms}
                                />
                              ))}
                            </div>
                          )}
                          {canManage ? (
                            addingEmployment ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-[12px] border border-border-subtle p-3">
                              <Select
                                label="Роботодавець"
                                labelPlacement="outside"
                                placeholder="Оберіть роботодавця"
                                items={legalEntityOptions}
                                selectedKeys={employmentForm.legalEntityId ? [employmentForm.legalEntityId] : []}
                                onSelectionChange={(keys) => {
                                  const selected = Array.from(keys)[0];
                                  if (typeof selected === 'string') {
                                    setEmploymentForm((prev) => ({ ...prev, legalEntityId: selected }));
                                  }
                                }}
                                classNames={{
                                  label: 'text-xs font-medium',
                                }}
                              >
                                {(item) => (
                                  <SelectItem key={item.key} textValue={item.textValue}>
                                    {item.label}
                                  </SelectItem>
                                )}
                              </Select>
                              <Select
                                label="Група оплати"
                                labelPlacement="outside"
                                items={PAY_GROUP_OPTIONS}
                                selectedKeys={[employmentForm.payGroup]}
                                onSelectionChange={(keys) => {
                                  const selected = Array.from(keys)[0];
                                  if (typeof selected === 'string' && HR_PAY_GROUPS.includes(selected as HrPayGroup)) {
                                    setEmploymentForm((prev) => ({ ...prev, payGroup: selected as HrPayGroup }));
                                  }
                                }}
                                classNames={{
                                  label: 'text-xs font-medium',
                                }}
                              >
                                {(item) => (
                                  <SelectItem key={item.key} textValue={item.textValue}>
                                    {item.label}
                                  </SelectItem>
                                )}
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
                              <div className="md:col-span-2 flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="light"
                                  onPress={() => setAddingEmployment(false)}
                                >
                                  Скасувати
                                </Button>
                                <Button
                                  size="sm"
                                  color="primary"
                                  variant="solid"
                                  className={HR_ADD_BUTTON_CLASS}
                                  startContent={<DynamicIcon name="check" size={14} />}
                                  onPress={() => void handleAddEmployment()}
                                >
                                  Зберегти зайнятість
                                </Button>
                              </div>
                            </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="flat"
                                className={HR_ADD_BUTTON_CLASS}
                                startContent={<DynamicIcon name="plus" size={14} />}
                                onPress={() => setAddingEmployment(true)}
                              >
                                Додати зайнятість
                              </Button>
                            )
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-text-secondary">Зайнятість і ставки можна додати після створення картки.</p>
                    )}
                  </>
                )}
                </I18nProvider>
              </DrawerBody>
              <DrawerFooter className="border-t border-border-subtle shrink-0">
                <Button variant="light" onPress={requestClose} isDisabled={saving}>Закрити</Button>
                {canManage ? (
                  <Button
                    color="primary"
                    isLoading={saving}
                    isDisabled={!isDirty || saving}
                    onPress={() => void handleSave().catch(() => undefined)}
                  >
                    {isCreate ? 'Створити' : 'Зберегти'}
                  </Button>
                ) : null}
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>

      <UnsavedChangesModal {...guard.modalProps} overlayZClassName="z-[2000]" />
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
  onAddPayTerms,
}: {
  employment: HrEmploymentDto;
  canManage: boolean;
  canManagePayTerms: boolean;
  onDelete: () => void;
  onDeletePay: (id: number) => void;
  onAddPayTerms: (employmentId: number, payload: PayFormState, closePrevious?: boolean) => Promise<boolean>;
}) {
  const [payForm, setPayForm] = useState<PayFormState>(emptyPayForm);
  const [savingRate, setSavingRate] = useState(false);
  const [addingRate, setAddingRate] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const active = isEmploymentActive(employment, todayYmd());
  const amountMeta = payAmountFieldMeta(payForm.kind);
  const sortedTerms = sortPayTerms(employment.payTerms);
  const ratesTitle = sortedTerms.length > 1 ? 'Ставки' : 'Ставка';
  const overlapping = overlappingPayTerms(
    employment.payTerms,
    payForm.effectiveFrom,
    payForm.effectiveTo || null,
  );
  const closeUntil = hrDayBeforeYmd(payForm.effectiveFrom);

  const saveRate = async (closePrevious: boolean) => {
    setSavingRate(true);
    try {
      const ok = await onAddPayTerms(employment.id, payForm, closePrevious);
      if (ok) {
        setPayForm((prev) => ({ ...emptyPayForm(), kind: prev.kind }));
        setAddingRate(false);
        setCloseConfirmOpen(false);
      }
    } finally {
      setSavingRate(false);
    }
  };

  const submitRate = () => {
    if (!payForm.amount.trim()) {
      ToastService.show({ title: 'Вкажіть суму ставки', color: 'danger' });
      return;
    }
    if (overlapping.length > 0) {
      setCloseConfirmOpen(true);
      return;
    }
    void saveRate(false);
  };

  return (
    <>
      <Card shadow="none" className="border border-border-subtle bg-surface-card shadow-surface rounded-[12px]">
        <CardHeader className="flex flex-row items-center justify-between gap-2 px-3 py-2.5">
          <p className="flex min-w-0 items-center text-sm text-text-secondary">
            <span className="font-semibold mr-1">Період:</span> {formatHrDate(employment.validFrom)} – {employment.validTo ? formatHrDate(employment.validTo) : 'досі'}
            {active ? (
              <span className="text-success-500 border border-success-500 rounded px-1 py-0.5 ml-3 text-[10px] leading-none uppercase">Активна</span>
            ) : (
              <span className="text-danger-500 border border-danger-500 rounded px-1 py-0.5 ml-3 text-[10px] leading-none uppercase">Завершена</span>
            )}
          </p>
          {canManage ? (
            <Button size="sm" variant="light" color="danger" isIconOnly aria-label="Видалити зайнятість" onPress={onDelete}>
              <DynamicIcon name="trash-2" size={14} />
            </Button>
          ) : null}
        </CardHeader>
        <CardBody className="space-y-3 px-3 pb-3 pt-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <HrSpecChip tokens={hrPayGroupTokens(employment.payGroup)} rounded="sm">
              {HR_PAY_GROUP_LABELS[employment.payGroup]}
            </HrSpecChip>
            <HrSpecChip tokens={hrEmployerTokensFromName(employment.legalEntity.name)} rounded="sm">
              {employment.legalEntity.name}
            </HrSpecChip>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-text-primary">{ratesTitle}</h4>
            {sortedTerms.length > 0 ? (
              <ul className="divide-y divide-border-subtle rounded-[8px] border border-border-subtle">
                {sortedTerms.map((term: HrPayTermsDto) => (
                  <li key={term.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm">
                    <span className="text-text-primary">
                      <span className="text-text-secondary">
                        {HR_PAY_TERMS_KIND_LABELS[term.kind]} · {formatMoney(term.amount)} {term.kind === 'hourly' ? 'грн/год' : 'грн/міс'} · з {formatHrDate(term.effectiveFrom)}
                        {term.effectiveTo ? ` по ${formatHrDate(term.effectiveTo)}` : ''}
                      </span>
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
              <p className="rounded-[8px] border border-dashed border-gray-300 px-2.5 py-2 text-xs text-gray-400/75">
                Ставка не задана, додайте її для розрахунку заробітної плати
              </p>
            )}

            {canManagePayTerms ? (
              addingRate ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start rounded-[8px] border border-border-subtle p-3">
                  <Select
                    label="Тип"
                    labelPlacement="outside"
                    items={PAY_KIND_OPTIONS}
                    selectedKeys={[payForm.kind]}
                    onSelectionChange={(keys) => {
                      const selected = Array.from(keys)[0];
                      if (typeof selected === 'string' && HR_PAY_TERMS_KINDS.includes(selected as HrPayTermsKind)) {
                        setPayForm((prev) => ({ ...prev, kind: selected as HrPayTermsKind }));
                      }
                    }}
                    classNames={{
                      label: 'text-xs font-medium',
                    }}
                  >
                    {(item) => (
                      <SelectItem key={item.key} textValue={item.textValue}>
                        {item.label}
                      </SelectItem>
                    )}
                  </Select>
                  <Input
                    label={amountMeta.label}
                    labelPlacement="outside"
                    placeholder={amountMeta.placeholder}
                    description={amountMeta.description}
                    inputMode="numeric"
                    value={payForm.amount}
                    onValueChange={(value) => setPayForm((prev) => ({ ...prev, amount: formatAmountMask(value) }))}
                    endContent={<span className="text-xs text-text-secondary">грн</span>}
                    classNames={{
                      label: 'text-xs font-medium',
                      input: 'placeholder:opacity-50',
                    }}
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
                  <div className="md:col-span-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="light" onPress={() => setAddingRate(false)}>
                      Скасувати
                    </Button>
                    <Button
                      size="sm"
                      color="primary"
                      variant="solid"
                      className={HR_ADD_BUTTON_CLASS}
                      startContent={<DynamicIcon name="check" size={14} />}
                      isLoading={savingRate}
                      onPress={submitRate}
                    >
                      Зберегти ставку
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="flat"
                  className={HR_ADD_BUTTON_CLASS}
                  startContent={<DynamicIcon name="plus" size={14} />}
                  onPress={() => setAddingRate(true)}
                >
                  Додати ставку
                </Button>
              )
            ) : null}
          </div>
        </CardBody>
      </Card>

      <ConfirmModal
        isOpen={closeConfirmOpen}
        title="Закрити попередню ставку?"
        message={`Чинна ставка буде закрита ${formatHrDate(closeUntil)}. Нова ставка почне діяти з ${formatHrDate(payForm.effectiveFrom)}.`}
        confirmText="Закрити і зберегти"
        cancelText="Скасувати"
        confirmColor="warning"
        confirmLoading={savingRate}
        overlayZClassName="z-[2000]"
        onConfirm={() => void saveRate(true)}
        onCancel={() => setCloseConfirmOpen(false)}
      />
    </>
  );
}
