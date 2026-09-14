import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  DatePicker,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Input,
  Select,
  SelectItem,
  Spinner,
} from '@heroui/react';
import { CalendarDate, parseDate, type DateValue } from '@internationalized/date';
import { I18nProvider } from '@react-aria/i18n';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { UnsavedChangesModal } from '@/components/modals/UnsavedChangesModal';
import { UserCard } from '@/components/person-card/UserCard';
import type { UserCardInitialValues } from '@/components/person-card/UserCard.types';
import { EmployeePersonCardPanel } from '@/components/person-card/panels/EmployeePersonCardPanel';
import {
  PersonDrawer,
  type PersonCardInitialValues,
} from '../components/PersonDrawer';
import { HrAuditAccordion } from '@/components/hr/HrAuditAccordion';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { PERMISSIONS } from '@shared/constants/permissions';
import {
  HR_PAY_GROUP_LABELS,
  HR_PAY_GROUPS,
  HR_PAY_TERMS_KIND_LABELS,
  HR_PAY_TERMS_KINDS,
  type HrEmployeeDetailDto,
  type HrEmploymentDto,
  type HrLegalEntityDto,
  type HrPayGroup,
  type HrEmploymentWritePayload,
  type HrPayTermsDto,
  type HrPayTermsKind,
  type HrPersonDto,
  type HrPersonSummaryDto,
  type HrUserOptionDto,
} from '@shared/types/hr';
import {
  collectHrPayWarnings,
  hrDayBeforeYmd,
  hrPeriodActive,
  overlappingPayTerms,
} from '@shared/utils/hrPayHealth';
import { HR_BTN_PRIMARY, HrSpecChip, hrEmployerTokensFromName, hrPayGroupTokens, hrStatusTokens } from '../hrUi';

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
  personId: string;
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
  personId: '',
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
    personId: form.personId,
    notes: form.notes,
    cardNumber: form.cardNumber.replace(/\D/g, ''),
  });
}

function normalizePersonName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
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

function buildEmployeeFullName(form: FormState, fallback?: string | null): string {
  const parts = [form.lastName, form.firstName]
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  if (fallback?.trim()) {
    const words = fallback.trim().split(/\s+/);
    return words.slice(0, 2).join(' ');
  }
  return '';
}

const CARD_MASKED_PREFIX = '•••• •••• ••••';

function formatCardMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(.{4})(?=.)/g, '$1 ');
}

function resolveCardDisplayLast4(
  canRevealCard: boolean,
  isCreate: boolean,
  cardNumber: string,
  cardLast4: string | null | undefined,
  cardMasked: string | null | undefined,
): string | null {
  if (!canRevealCard && !isCreate) {
    const last4 = cardLast4?.trim();
    if (last4 && /^\d{4}$/.test(last4)) return last4;
    const match = cardMasked?.match(/(\d{4})$/);
    return match?.[1] ?? null;
  }
  const digits = cardNumber.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function shouldShowCardMasked(
  canRevealCard: boolean,
  isCreate: boolean,
  cardVisible: boolean,
  displayLast4: string | null,
): boolean {
  if (isCreate || !displayLast4) return false;
  if (!canRevealCard) return true;
  return !cardVisible;
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

function formatEmploymentPeriod(employment: HrEmploymentDto): string {
  return `${formatHrDate(employment.validFrom)} – ${employment.validTo ? formatHrDate(employment.validTo) : 'досі'}`;
}

function describeEmploymentForMerge(employment: HrEmploymentDto): string {
  const parts = [
    employment.legalEntity.name,
    HR_PAY_GROUP_LABELS[employment.payGroup],
    formatEmploymentPeriod(employment),
  ];
  if (employment.personnelNumber) {
    parts.push(`таб. № ${employment.personnelNumber}`);
  }
  return parts.join(' · ');
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
  const { hasPermission } = useRoleAccess();
  const canCreateUser = hasPermission(PERMISSIONS.ACTION_USERS_MANAGE);
  const canManagePersons = hasPermission(PERMISSIONS.ACTION_HR_PERSONS_MANAGE);
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
  const [dirtyRateEmploymentIds, setDirtyRateEmploymentIds] = useState<Set<number>>(() => new Set());
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [createUserInitial, setCreateUserInitial] = useState<UserCardInitialValues | undefined>();
  const [createPersonOpen, setCreatePersonOpen] = useState(false);
  const [createPersonInitial, setCreatePersonInitial] = useState<PersonCardInitialValues | undefined>();
  const [mergeSourceId, setMergeSourceId] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);
  const [personSearch, setPersonSearch] = useState('');
  const [personOptions, setPersonOptions] = useState<HrPersonDto[]>([]);
  const [personSearchLoading, setPersonSearchLoading] = useState(false);
  const [linkedPerson, setLinkedPerson] = useState<HrPersonSummaryDto | null>(null);

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
        personId: employee.personId != null ? String(employee.personId) : '',
        notes: employee.notes ?? '',
        cardNumber: formatCardMask(employee.cardNumber ?? ''),
      };
      setForm(nextForm);
      setLinkedPerson(employee.person ?? null);
      setPersonSearch('');
      commitBaseline(nextForm);
      await loadUsers(id);
      setAuditRefreshKey((key) => key + 1);
    } finally {
      setLoading(false);
    }
  }, [loadUsers, commitBaseline]);

  useEffect(() => {
    if (!isOpen) {
      baselineRef.current = '';
      setCreateUserOpen(false);
      setCreatePersonOpen(false);
      setDirtyRateEmploymentIds(new Set());
      return;
    }
    setCardVisible(false);
    setAddingEmployment(false);
    setDirtyRateEmploymentIds(new Set());
    setCreateUserOpen(false);
    setCreatePersonOpen(false);
    if (isCreate) {
      setDetail(null);
      setForm(EMPTY_FORM);
      setLinkedPerson(null);
      setPersonSearch('');
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

  useEffect(() => {
    if (!isOpen || isCreate) return;
    const query = personSearch.trim();
    if (!query) {
      setPersonOptions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        setPersonSearchLoading(true);
        try {
          const response = await fetch(`/api/hr/persons?search=${encodeURIComponent(query)}`, {
            credentials: 'include',
          });
          const data = await readJson(response);
          if (!response.ok) return;
          const rows = Array.isArray(data.data) ? data.data as HrPersonDto[] : [];
          setPersonOptions(rows);
        } finally {
          setPersonSearchLoading(false);
        }
      })();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [isOpen, isCreate, personSearch]);

  const selectedUserKeys = useMemo(() => (form.userId ? [form.userId] : ['none']), [form.userId]);

  const selectedPerson = useMemo(() => {
    if (!form.personId) return null;
    if (linkedPerson && String(linkedPerson.id) === form.personId) return linkedPerson;
    const fromOptions = personOptions.find((person) => String(person.id) === form.personId);
    if (fromOptions) {
      return {
        id: fromOptions.id,
        displayName: fromOptions.displayName,
        taxCode: fromOptions.taxCode,
        phone: fromOptions.phone,
      };
    }
    return linkedPerson;
  }, [form.personId, linkedPerson, personOptions]);

  const personNameMismatch = useMemo(() => {
    if (!selectedPerson || !detail?.displayName) return false;
    return normalizePersonName(detail.displayName) !== normalizePersonName(selectedPerson.displayName);
  }, [selectedPerson, detail?.displayName]);

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

  const mergePair = useMemo(() => {
    if (mergeSourceId == null || !detail) return null;
    const source = detail.employments.find((employment) => employment.id === mergeSourceId);
    if (!source) return null;
    const target = sortedEmployments.find(
      (employment) =>
        employment.id !== mergeSourceId && employment.payGroupId === source.payGroupId,
    );
    if (!target) return null;
    return { source, target };
  }, [mergeSourceId, detail, sortedEmployments]);

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

  const employmentIdsWithMergeOption = useMemo(() => {
    const today = todayYmd();
    const activeByPayGroup = new Map<number, number>();
    for (const employment of detail?.employments ?? []) {
      if (!hrPeriodActive(employment.validFrom, employment.validTo, today)) continue;
      activeByPayGroup.set(
        employment.payGroupId,
        (activeByPayGroup.get(employment.payGroupId) ?? 0) + 1,
      );
    }
    return new Set(
      (detail?.employments ?? [])
        .filter((employment) => (activeByPayGroup.get(employment.payGroupId) ?? 0) > 1)
        .map((employment) => employment.id),
    );
  }, [detail?.employments]);

  const handleRateDirtyChange = useCallback((employmentId: number, dirty: boolean) => {
    setDirtyRateEmploymentIds((prev) => {
      const has = prev.has(employmentId);
      if (dirty === has) return prev;
      const next = new Set(prev);
      if (dirty) next.add(employmentId);
      else next.delete(employmentId);
      return next;
    });
  }, []);

  const isDirty = useMemo(() => {
    if (!isOpen || !canManage) return false;
    if (!baselineRef.current) return false;
    if (!isCreate && loading) return false;
    if (addingEmployment) return true;
    if (dirtyRateEmploymentIds.size > 0) return true;
    void baselineVersion;
    return snapshotEmployeeForm(form) !== baselineRef.current;
  }, [isOpen, canManage, isCreate, loading, form, baselineVersion, addingEmployment, dirtyRateEmploymentIds]);

  const cardDisplayLast4 = useMemo(
    () => resolveCardDisplayLast4(
      canRevealCard,
      isCreate,
      form.cardNumber,
      detail?.cardLast4,
      detail?.cardMasked,
    ),
    [canRevealCard, isCreate, form.cardNumber, detail?.cardLast4, detail?.cardMasked],
  );

  const showCardMasked = useMemo(
    () => shouldShowCardMasked(canRevealCard, isCreate, cardVisible, cardDisplayLast4),
    [canRevealCard, isCreate, cardVisible, cardDisplayLast4],
  );

  const openCreatePerson = useCallback(() => {
    const displayName = detail?.displayName?.trim()
      || [form.lastName, form.firstName, form.middleName].map((part) => part.trim()).filter(Boolean).join(' ');
    setCreatePersonInitial({ displayName });
    setCreatePersonOpen(true);
  }, [detail?.displayName, form.firstName, form.lastName, form.middleName]);

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
        personId: form.personId ? Number(form.personId) : null,
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
          closeButton: 'top-3 right-3',
        }}
      >
        <DrawerContent>
          {() => (
            <>
              <DrawerHeader className="border-b border-border-subtle shrink-0">
                {isCreate ? 'Новий співробітник' : detail?.displayName || 'Співробітник'}
              </DrawerHeader>
              <DrawerBody className="flex flex-col gap-5 py-5 overflow-y-auto min-h-0">
                <I18nProvider locale="uk-UA">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-text-secondary">
                    <Spinner size="lg" color="primary" />
                    <p className="text-sm">Завантаження…</p>
                  </div>
                ) : (
                  <div className="flex flex-col min-h-full flex-1 gap-5">
                    <EmployeePersonCardPanel
                        isCreate={isCreate}
                        canManage={canManage}
                        canManagePersons={canManagePersons}
                        canCreateUser={canCreateUser}
                        canRevealCard={canRevealCard}
                        form={form}
                        detail={detail}
                        linkedPerson={selectedPerson}
                        personSearch={personSearch}
                        personOptions={personOptions}
                        personSearchLoading={personSearchLoading}
                        userSelectOptions={userSelectOptions}
                        selectedUserKeys={selectedUserKeys}
                        cardVisible={cardVisible}
                        showCardMasked={showCardMasked}
                        cardDisplayLast4={cardDisplayLast4}
                        onFormChange={patchForm}
                        onSplitNameBlur={(field) => patchForm(field, capitalizeUaName(form[field]))}
                        onPersonSearchChange={setPersonSearch}
                        onPersonSelect={(person) => {
                          if (person) {
                            setLinkedPerson({
                              id: person.id,
                              displayName: person.displayName,
                              taxCode: person.taxCode,
                              phone: person.phone,
                            });
                          }
                        }}
                        onUnlinkPerson={() => {
                          patchForm('personId', '');
                          setLinkedPerson(null);
                        }}
                        onCreatePerson={openCreatePerson}
                        onCreateUser={() => {
                          setCreateUserInitial({
                            name: buildEmployeeFullName(form, detail?.displayName),
                          });
                          setCreateUserOpen(true);
                        }}
                        onCardVisibilityToggle={() => setCardVisible((prev) => !prev)}
                        onCardNumberChange={(value) => {
                          const masked = formatCardMask(value);
                          const hadCard = form.cardNumber.replace(/\D/g, '').length > 0;
                          const hasCard = masked.replace(/\D/g, '').length > 0;
                          if (!hadCard && hasCard) {
                            setCardVisible(true);
                          }
                          patchForm('cardNumber', masked);
                        }}
                      />

                    {!isCreate ? (
                      <div className="space-y-3 pt-8 mt-2 border-t border-border-subtle">
                          <div>
                            <h3 className="text-sm font-semibold text-text-primary">Зайнятості</h3>
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
                                  showMerge={employmentIdsWithMergeOption.has(employment.id)}
                                  onRateDirtyChange={handleRateDirtyChange}
                                  onDelete={() => setDeleteEmploymentId(employment.id)}
                                  onMerge={() => setMergeSourceId(employment.id)}
                                  onDeletePay={(id) => setDeletePayId(id)}
                                  onAddPayTerms={handleAddPayTerms}
                                  onUpdateEmployment={async (payload) => {
                                    const response = await fetch(`/api/hr/employments/${employment.id}`, {
                                      method: 'PUT',
                                      credentials: 'include',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify(payload),
                                    });
                                    const data = await readJson(response);
                                    if (!response.ok) {
                                      ToastService.show({ title: errorMessage(data, 'Не вдалося оновити'), color: 'danger' });
                                      return false;
                                    }
                                    if (employeeId) await loadDetail(employeeId);
                                    return true;
                                  }}
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
                    ) : (
                      <p className="text-xs text-text-secondary">Зайнятість і ставки можна додати після створення картки.</p>
                    )}

                    {!isCreate ? (
                      <HrAuditAccordion
                        className="mt-auto pt-8 pb-4"
                        entityType="employee"
                        entityId={employeeId}
                        refreshKey={auditRefreshKey}
                      />
                    ) : null}
                  </div>
                )}
                </I18nProvider>
              </DrawerBody>
              <DrawerFooter className="border-t border-border-subtle shrink-0">
                <Button variant="light" onPress={requestClose} isDisabled={saving}>Закрити</Button>
                {canManage ? (
                  <Button
                    className={HR_BTN_PRIMARY}
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
        isOpen={mergeSourceId != null}
        title="Об'єднати зайнятість?"
        message={
          mergePair ? (
            <div className="space-y-3 text-sm text-text-primary">
              <p>
                Записи табеля, ставки та виплати з нижньої зайнятості будуть перенесені до верхньої.
                Нижню зайнятість буде видалено — цю дію не можна скасувати.
              </p>
              <div className="space-y-2 rounded-[8px] border border-border-subtle bg-surface-page p-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-success-500">
                    Залишиться
                  </p>
                  <p className="mt-0.5">{describeEmploymentForMerge(mergePair.target)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-danger-500">
                    Буде видалено
                  </p>
                  <p className="mt-0.5">{describeEmploymentForMerge(mergePair.source)}</p>
                </div>
              </div>
            </div>
          ) : (
            'Немає цільової зайнятості з тією ж групою оплати для обʼєднання.'
          )
        }
        confirmText="Об'єднати"
        cancelText="Скасувати"
        confirmLoading={merging}
        onConfirm={async () => {
          if (mergeSourceId == null || !mergePair || merging) {
            if (mergeSourceId != null && !mergePair) {
              ToastService.show({ title: 'Немає цільової зайнятості для обʼєднання', color: 'danger' });
              setMergeSourceId(null);
            }
            return;
          }
          setMerging(true);
          try {
            const response = await fetch(`/api/hr/employments/${mergeSourceId}/merge`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ targetEmploymentId: mergePair.target.id }),
            });
            const data = await readJson(response);
            if (!response.ok) {
              ToastService.show({ title: errorMessage(data, 'Не вдалося обʼєднати'), color: 'danger' });
            } else {
              ToastService.show({ title: 'Зайнятості обʼєднано', color: 'success' });
              if (employeeId) await loadDetail(employeeId);
              onSaved();
            }
            setMergeSourceId(null);
          } finally {
            setMerging(false);
          }
        }}
        onCancel={() => {
          if (merging) return;
          setMergeSourceId(null);
        }}
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
      <UserCard
        isOpen={createUserOpen}
        initialValues={createUserInitial}
        onClose={() => setCreateUserOpen(false)}
        onSaved={(user) => {
          patchForm('userId', String(user.id));
          void loadUsers(isCreate ? undefined : employeeId ?? undefined);
        }}
      />
      <PersonDrawer
        isOpen={createPersonOpen}
        initialValues={createPersonInitial}
        syncOnSave={false}
        enableMerge={false}
        onClose={() => setCreatePersonOpen(false)}
        onSaved={(person) => {
          patchForm('personId', String(person.id));
          setLinkedPerson({
            id: person.id,
            displayName: person.displayName,
            taxCode: person.taxCode,
            phone: person.phone,
          });
          setPersonSearch('');
          setPersonOptions([person]);
        }}
      />
    </>
  );
}

function isPayFormDirty(form: PayFormState, addingRate: boolean): boolean {
  if (addingRate) return true;
  return form.amount.trim() !== '' || form.effectiveTo.trim() !== '';
}

function EmploymentBlock({
  employment,
  canManage,
  canManagePayTerms,
  showMerge = false,
  onRateDirtyChange,
  onDelete,
  onMerge,
  onDeletePay,
  onAddPayTerms,
  onUpdateEmployment,
}: {
  employment: HrEmploymentDto;
  canManage: boolean;
  canManagePayTerms: boolean;
  showMerge?: boolean;
  onRateDirtyChange?: (employmentId: number, dirty: boolean) => void;
  onDelete: () => void;
  onMerge: () => void;
  onDeletePay: (id: number) => void;
  onAddPayTerms: (employmentId: number, payload: PayFormState, closePrevious?: boolean) => Promise<boolean>;
  onUpdateEmployment: (payload: Partial<HrEmploymentWritePayload>) => Promise<boolean>;
}) {
  const [payForm, setPayForm] = useState<PayFormState>(emptyPayForm);
  const [savingRate, setSavingRate] = useState(false);
  const [addingRate, setAddingRate] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [pushingPersonnel, setPushingPersonnel] = useState(false);
  const [personnelConflict, setPersonnelConflict] = useState<{ local: string; remote: string } | null>(null);
  const [localPersonnelNumber, setLocalPersonnelNumber] = useState(employment.personnelNumber ?? '');
  useEffect(() => {
    setLocalPersonnelNumber(employment.personnelNumber ?? '');
  }, [employment.id, employment.personnelNumber]);
  useEffect(() => {
    onRateDirtyChange?.(employment.id, isPayFormDirty(payForm, addingRate));
  }, [employment.id, payForm, addingRate, onRateDirtyChange]);
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

  const executePushPersonnel = async (): Promise<boolean> => {
    const response = await fetch(`/api/hr/employments/${employment.id}/sync/push-personnel-number`, {
      method: 'POST',
      credentials: 'include',
    });
    const data = await readJson(response);
    if (!response.ok) {
      ToastService.show({ title: errorMessage(data, 'Не вдалося відправити табельний №'), color: 'danger' });
      return false;
    }
    ToastService.show({ title: 'Табельний № відправлено в Dilovod', color: 'success' });
    setPersonnelConflict(null);
    return true;
  };

  const handlePushPersonnelClick = async () => {
    if (!employment.dilovodEmployeeId) return;
    if (!localPersonnelNumber.trim()) {
      ToastService.show({ title: 'Вкажіть табельний номер', color: 'danger' });
      return;
    }
    setPushingPersonnel(true);
    try {
      const response = await fetch(`/api/hr/employments/${employment.id}/dilovod-personnel-number`, {
        credentials: 'include',
      });
      const data = await readJson(response);
      if (!response.ok) {
        ToastService.show({ title: errorMessage(data, 'Не вдалося перевірити Dilovod'), color: 'danger' });
        return;
      }
      const payload = data.data as { remoteCode?: string | null } | undefined;
      const remoteCode = typeof payload?.remoteCode === 'string' ? payload.remoteCode : null;
      if (remoteCode && remoteCode !== localPersonnelNumber.trim()) {
        setPersonnelConflict({ local: localPersonnelNumber.trim(), remote: remoteCode });
        return;
      }
      await executePushPersonnel();
    } finally {
      setPushingPersonnel(false);
    }
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
            <div className="flex gap-1">
              {showMerge ? (
                <Button
                  size="sm"
                  variant="light"
                  className="text-primary-500 bg-primary-500/10 hover:bg-primary-500/20! gap-1"
                  startContent={<DynamicIcon name="merge" size={14} />}
                  onPress={onMerge}
                >
                  Обʼєднати
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="light"
                color="danger"
                className="text-danger-500 bg-danger-500/10 hover:bg-danger-500/20!"
                isIconOnly
                aria-label="Видалити зайнятість"
                onPress={onDelete}
              >
                <DynamicIcon name="trash-2" size={14} />
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardBody className="space-y-3 px-3 pb-3 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="flex items-end gap-2">
              <Input
                label="Табельний №"
                labelPlacement="outside"
                size="sm"
                value={localPersonnelNumber}
                isReadOnly={!canManage}
                className="min-w-0 flex-1"
                onValueChange={(value) => {
                  setLocalPersonnelNumber(value);
                  void onUpdateEmployment({
                    legalEntityId: employment.legalEntityId,
                    payGroup: employment.payGroup,
                    validFrom: employment.validFrom,
                    validTo: employment.validTo,
                    personnelNumber: value,
                  });
                }}
              />
              {canManage && employment.dilovodEmployeeId ? (
                <Button
                  size="sm"
                  variant="flat"
                  className={HR_ADD_BUTTON_CLASS}
                  isLoading={pushingPersonnel}
                  onPress={() => void handlePushPersonnelClick()}
                >
                  Відправити в Dilovod
                </Button>
              ) : null}
            </div>
            <Input
              label="Посада (офіційна)"
              labelPlacement="outside"
              size="sm"
              value={employment.officialPosition ?? ''}
              isReadOnly={!canManage}
              onValueChange={(value) => {
                void onUpdateEmployment({
                  legalEntityId: employment.legalEntityId,
                  payGroup: employment.payGroup,
                  validFrom: employment.validFrom,
                  validTo: employment.validTo,
                  officialPosition: value,
                });
              }}
            />
          </div>
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
      <ConfirmModal
        isOpen={personnelConflict != null}
        title="Розбіжність табельного №"
        message={
          personnelConflict
            ? `У Dilovod: ${personnelConflict.remote}, у нас: ${personnelConflict.local}. Перезаписати в Dilovod?`
            : ''
        }
        confirmText="Перезаписати"
        cancelText="Скасувати"
        confirmColor="warning"
        confirmLoading={pushingPersonnel}
        overlayZClassName="z-[2000]"
        onConfirm={async () => {
          setPushingPersonnel(true);
          try {
            await executePushPersonnel();
          } finally {
            setPushingPersonnel(false);
          }
        }}
        onCancel={() => {
          if (pushingPersonnel) return;
          setPersonnelConflict(null);
        }}
      />
    </>
  );
}
