import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Input,
  Select,
  SelectItem,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { UnsavedChangesModal } from '@/components/modals/UnsavedChangesModal';
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { ToastService } from '@/services/ToastService';
import {
  HR_PAY_GROUPS,
  HR_PAY_GROUP_LABELS,
  HR_TAX_BASES,
  HR_TAX_PAYERS,
  type HrPayGroup,
  type HrTaxBase,
  type HrTaxPayer,
  type HrTaxRuleDto,
  type HrTaxRuleWritePayload,
} from '@shared/types/hr';
import { HR_BTN_PRIMARY } from '@/lib/buttonStyles';
import {
  HR_TABLE_CLASS_NAMES,
  HR_TAX_BASE_LABELS,
  HrSpecChip,
  hrPayGroupTokens,
  hrStatusTokens,
  hrTaxPayerTokens,
  hrTaxRuleTokens,
} from '../hrUi';

interface TaxRulesTabProps {
  canManage: boolean;
}

const emptyForm = (): HrTaxRuleWritePayload => ({
  code: '',
  label: '',
  rate: '0.22',
  payer: 'employer',
  base: 'gross',
  payGroups: ['official_salary'],
  effectiveFrom: new Date().toISOString().slice(0, 10),
  isActive: true,
});

function snapshotTaxRuleForm(form: HrTaxRuleWritePayload, isCreate: boolean): string {
  return JSON.stringify({
    code: isCreate ? form.code?.trim() ?? '' : undefined,
    label: form.label?.trim() ?? '',
    rate: form.rate?.trim() ?? '',
    payer: form.payer,
    base: form.base,
    payGroups: [...(form.payGroups ?? [])].sort(),
    effectiveFrom: form.effectiveFrom ?? '',
    effectiveTo: form.effectiveTo ?? '',
    sortOrder: form.sortOrder ?? null,
    isActive: form.isActive ?? true,
  });
}

export function TaxRulesTab({ canManage }: TaxRulesTabProps) {
  const [rules, setRules] = useState<HrTaxRuleDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<HrTaxRuleDto | null>(null);
  const [form, setForm] = useState<HrTaxRuleWritePayload>(emptyForm());
  const [open, setOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<HrTaxRuleDto | null>(null);
  const baselineRef = useRef('');
  const [baselineVersion, setBaselineVersion] = useState(0);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/hr/tax-rules?includeInactive=true', { credentials: 'include' });
      const json = await response.json().catch(() => ({}));
      if (response.ok) setRules(Array.isArray(json.data) ? json.data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRules();
  }, [fetchRules]);

  const commitBaseline = useCallback((nextForm: HrTaxRuleWritePayload, isCreate: boolean) => {
    baselineRef.current = snapshotTaxRuleForm(nextForm, isCreate);
    setBaselineVersion((version) => version + 1);
  }, []);

  const openCreate = () => {
    const nextForm = emptyForm();
    setEditing(null);
    setForm(nextForm);
    commitBaseline(nextForm, true);
    setOpen(true);
  };

  const openEdit = (rule: HrTaxRuleDto) => {
    const nextForm: HrTaxRuleWritePayload = {
      label: rule.label,
      rate: rule.rate,
      payer: rule.payer,
      base: rule.base,
      payGroups: rule.payGroups,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
      sortOrder: rule.sortOrder,
      isActive: rule.isActive,
    };
    setEditing(rule);
    setForm(nextForm);
    commitBaseline(nextForm, false);
    setOpen(true);
  };

  const closeDrawer = useCallback(() => {
    if (saving) return;
    baselineRef.current = '';
    setOpen(false);
    setEditing(null);
  }, [saving]);

  const isDirty = useMemo(() => {
    if (!open || !canManage) return false;
    if (!baselineRef.current) return false;
    void baselineVersion;
    return snapshotTaxRuleForm(form, editing == null) !== baselineRef.current;
  }, [baselineVersion, canManage, editing, form, open]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetch(editing ? `/api/hr/tax-rules/${editing.id}` : '/api/hr/tax-rules', {
        method: editing ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = json.message || 'Помилка збереження';
        ToastService.show({ title: message, color: 'danger' });
        throw new Error(message);
      }
      ToastService.show({ title: 'Збережено', color: 'success' });
      closeDrawer();
      await fetchRules();
    } finally {
      setSaving(false);
    }
  }, [closeDrawer, editing, fetchRules, form]);

  const guard = useUnsavedGuard({
    isDirty,
    onSaveDraft: save,
  });

  const requestCloseDrawer = guard.guardAction(closeDrawer, {
    title: 'Незбережені зміни',
    message: 'У формі податкового правила є незбережені зміни. Що зробити перед закриттям?',
    saveText: 'Зберегти і закрити',
    leaveText: 'Закрити без збереження',
    cancelText: 'Залишитись',
  });

  const deactivate = async (id: number) => {
    const response = await fetch(`/api/hr/tax-rules/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      ToastService.show({ title: json.message || 'Помилка', color: 'danger' });
      return;
    }
    await fetchRules();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-default-500">
          Правила ЄСВ і податків для групи «Офіційна ставка». Ставки з effective dates — історія змін.
        </p>
        {canManage ? (
          <Button
            size="sm"
            className={HR_BTN_PRIMARY}
            startContent={<DynamicIcon name="plus" size={14} />}
            onPress={openCreate}
          >
            Додати правило
          </Button>
        ) : null}
      </div>

      <Card className="border border-default-200 shadow-sm">
        <CardBody>
          <Table aria-label="Податкові правила" removeWrapper classNames={HR_TABLE_CLASS_NAMES}>
            <TableHeader>
              <TableColumn>Назва</TableColumn>
              <TableColumn>Ставка</TableColumn>
              <TableColumn>Платник</TableColumn>
              <TableColumn>База</TableColumn>
              <TableColumn>Групи</TableColumn>
              <TableColumn>З</TableColumn>
              <TableColumn>Статус</TableColumn>
              {canManage ? <TableColumn width={96} align="center"> </TableColumn> : null}
            </TableHeader>
            <TableBody emptyContent="Немає правил">
              {rules.map((rule) => (
                <TableRow key={rule.id} className={!rule.isActive ? 'opacity-50' : undefined}>
                  <TableCell>
                    <HrSpecChip tokens={hrTaxRuleTokens(rule.code)} rounded="sm">
                      {rule.label}
                    </HrSpecChip>
                  </TableCell>
                  <TableCell className="tabular-nums font-medium">{(Number(rule.rate) * 100).toFixed(2)}%</TableCell>
                  <TableCell>
                    <HrSpecChip tokens={hrTaxPayerTokens(rule.payer)} rounded="sm">
                      {rule.payer === 'employer' ? 'Роботодавець' : 'Працівник'}
                    </HrSpecChip>
                  </TableCell>
                  <TableCell>{HR_TAX_BASE_LABELS[rule.base]}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {rule.payGroups.map((group) => (
                        <HrSpecChip key={group} tokens={hrPayGroupTokens(group)} className="h-5 text-xs">
                          {HR_PAY_GROUP_LABELS[group]}
                        </HrSpecChip>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-default-500">{rule.effectiveFrom}</TableCell>
                  <TableCell>
                    <HrSpecChip
                      tokens={hrStatusTokens(rule.isActive ? 'active' : 'inactive')}
                      icon={rule.isActive ? 'success' : 'error'}
                    >
                      {rule.isActive ? 'активне' : 'неактивне'}
                    </HrSpecChip>
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      <div className="flex justify-center gap-0.5">
                        <Tooltip
                          content="Редагувати правило"
                          placement="top-end"
                          showArrow
                          classNames={{
                            base: 'before:bg-slate-700 before:rounded-[3px]',
                            content: 'bg-slate-700 border-0 text-white text-xs',
                          }}
                        >
                          <Button
                            size="sm"
                            variant="light"
                            isIconOnly
                            aria-label={`Редагувати ${rule.label}`}
                            className="text-slate-700"
                            onPress={() => openEdit(rule)}
                          >
                            <DynamicIcon name="pencil" size={16} />
                          </Button>
                        </Tooltip>
                        {rule.isActive ? (
                          <Tooltip
                            content="Деактивувати правило"
                            placement="top-end"
                            showArrow
                            classNames={{
                              base: 'before:bg-danger before:rounded-[3px]',
                              content: 'bg-danger border-0 text-white text-xs',
                            }}
                          >
                            <Button
                              size="sm"
                              variant="light"
                              isIconOnly
                              aria-label={`Деактивувати ${rule.label}`}
                              className="text-rose-600 hover:bg-rose-600/10!"
                              onPress={() => setDeactivateTarget(rule)}
                            >
                              <DynamicIcon name="ban" size={16} />
                            </Button>
                          </Tooltip>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      <Drawer
        isOpen={open}
        onOpenChange={(isDrawerOpen) => { if (!isDrawerOpen) requestCloseDrawer(); }}
        placement="right"
        size="md"
        classNames={{
          wrapper: '!z-[60]',
          backdrop: '!z-[55] bg-overlay/20',
          base: 'flex flex-col shadow-2xl',
          body: 'flex-1 min-h-0 overflow-y-auto',
          closeButton: 'top-4',
        }}
      >
        <DrawerContent>
          {() => (
            <>
              <DrawerHeader className="border-b border-default-200 shrink-0">
                {editing ? 'Редагувати правило' : 'Нове правило'}
              </DrawerHeader>
              <DrawerBody className="gap-5 py-5 overflow-y-auto">
                {!editing ? (
                  <Input
                    label="Код"
                    value={form.code ?? ''}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, code: value }))}
                    placeholder="esv"
                    description="Технічний ідентифікатор — не показується у таблиці"
                  />
                ) : null}
                <Input
                  label="Назва"
                  value={form.label ?? ''}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, label: value }))}
                />
                <Input
                  label="Ставка (0.22 = 22%)"
                  value={form.rate ?? ''}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, rate: value }))}
                />
                <Select
                  label="Платник"
                  selectedKeys={form.payer ? [form.payer] : []}
                  onSelectionChange={(keys) => {
                    const value = Array.from(keys)[0];
                    if (typeof value === 'string' && (HR_TAX_PAYERS as readonly string[]).includes(value)) {
                      setForm((prev) => ({ ...prev, payer: value as HrTaxPayer }));
                    }
                  }}
                >
                  <SelectItem key="employer">Роботодавець</SelectItem>
                  <SelectItem key="employee">Працівник</SelectItem>
                </Select>
                <Select
                  label="База"
                  selectedKeys={form.base ? [form.base] : []}
                  onSelectionChange={(keys) => {
                    const value = Array.from(keys)[0];
                    if (typeof value === 'string' && (HR_TAX_BASES as readonly string[]).includes(value)) {
                      setForm((prev) => ({ ...prev, base: value as HrTaxBase }));
                    }
                  }}
                >
                  <SelectItem key="gross">{HR_TAX_BASE_LABELS.gross}</SelectItem>
                  <SelectItem key="accrued">{HR_TAX_BASE_LABELS.accrued}</SelectItem>
                </Select>
                <Select
                  label="Групи оплати"
                  selectionMode="multiple"
                  selectedKeys={new Set(form.payGroups ?? [])}
                  onSelectionChange={(keys) => {
                    const selected = Array.from(keys).filter(
                      (value): value is HrPayGroup =>
                        typeof value === 'string' && (HR_PAY_GROUPS as readonly string[]).includes(value),
                    );
                    setForm((prev) => ({ ...prev, payGroups: selected }));
                  }}
                >
                  {HR_PAY_GROUPS.map((group) => (
                    <SelectItem key={group}>{HR_PAY_GROUP_LABELS[group]}</SelectItem>
                  ))}
                </Select>
                <Input
                  label="Діє з"
                  type="date"
                  value={form.effectiveFrom ?? ''}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, effectiveFrom: value }))}
                />
                <Switch
                  size="sm"
                  className="pl-1"
                  isSelected={form.isActive ?? true}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, isActive: value }))}
                >
                  Активне
                </Switch>
              </DrawerBody>
              <DrawerFooter className="border-t border-default-200 shrink-0">
                <Button variant="light" onPress={requestCloseDrawer} isDisabled={saving}>
                  Скасувати
                </Button>
                <Button
                  className={HR_BTN_PRIMARY}
                  onPress={() => void save()}
                  isLoading={saving}
                  isDisabled={!isDirty}
                >
                  Зберегти
                </Button>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>

      <UnsavedChangesModal {...guard.modalProps} overlayZClassName="z-[2000]" />

      <ConfirmModal
        isOpen={deactivateTarget != null}
        title="Деактивувати правило?"
        message={
          deactivateTarget
            ? `Правило «${deactivateTarget.label}» буде позначене як неактивне. Історичні розрахунки не зміняться.`
            : ''
        }
        confirmText="Деактивувати"
        cancelText="Скасувати"
        onConfirm={() => {
          if (deactivateTarget) void deactivate(deactivateTarget.id).finally(() => setDeactivateTarget(null));
        }}
        onCancel={() => setDeactivateTarget(null)}
      />
    </div>
  );
}
