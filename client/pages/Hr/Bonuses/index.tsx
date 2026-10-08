import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
} from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { ToastService } from '@/services/ToastService';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { PERMISSIONS } from '@shared/constants/permissions';
import {
  HR_BONUS_KIND_LABELS,
  HR_BONUS_STATUS_LABELS,
  type HrBonusDto,
  type HrBonusStatus,
  type HrBonusWritePayload,
} from '@shared/types/hr';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { MonthSwitcher } from '@/components/MonthSwitcher';
import { BonusDrawer } from './BonusDrawer';
import { formatMoney } from '@/lib/formatUtils';
import { HR_BTN_PRIMARY } from '@/lib/buttonStyles';
import { HR_TABLE_CLASS_NAMES, SpecChip, hrKindTokens, hrStatusTokens } from '../hrUi';
import { formatYearMonth, parseYearMonth } from '@shared/utils/hrTimesheetCalendar';
import { useSearchParams } from 'react-router-dom';

const MONTH_NAMES = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
] as const;

interface EmploymentOption {
  id: number;
  displayName: string;
  legalEntityName: string;
}

export default function HrBonusesPage() {
  const { hasPermission } = useRoleAccess();
  const canView = hasPermission(PERMISSIONS.PAGE_HR_BONUSES);
  const canManage = hasPermission(PERMISSIONS.ACTION_HR_BONUSES_MANAGE);
  const [params, setParams] = useSearchParams();

  const monthKey = useMemo(() => {
    const raw = params.get('month');
    try {
      const parsed = parseYearMonth(raw ?? undefined);
      return formatYearMonth(parsed.year, parsed.month);
    } catch {
      const now = new Date();
      return formatYearMonth(now.getFullYear(), now.getMonth() + 1);
    }
  }, [params]);

  const { year, month } = parseYearMonth(monthKey);
  const monthDate = new Date(year, month - 1, 1);

  const [bonuses, setBonuses] = useState<HrBonusDto[]>([]);
  const [employments, setEmployments] = useState<EmploymentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingBonus, setEditingBonus] = useState<HrBonusDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HrBonusDto | null>(null);
  const [approveTarget, setApproveTarget] = useState<HrBonusDto | null>(null);

  const setMonthParam = (next: Date) => {
    const key = formatYearMonth(next.getFullYear(), next.getMonth() + 1);
    const nextParams = new URLSearchParams(params);
    nextParams.set('month', key);
    setParams(nextParams);
  };

  const fetchEmployments = useCallback(async () => {
    const response = await fetch('/api/hr/bonuses/employments', { credentials: 'include' });
    const json = await response.json().catch(() => ({}));
    if (response.ok) {
      const items = Array.isArray(json.data) ? json.data : [];
      setEmployments(
        items.map((item: EmploymentOption) => ({
          id: item.id,
          displayName: item.displayName,
          legalEntityName: item.legalEntityName,
        })),
      );
    }
  }, []);

  const fetchBonuses = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/hr/bonuses?year=${year}&month=${month}`, { credentials: 'include' });
      const json = await response.json().catch(() => ({}));
      if (response.ok) setBonuses(Array.isArray(json.data) ? json.data : []);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    void fetchEmployments();
  }, [fetchEmployments]);

  useEffect(() => {
    void fetchBonuses();
  }, [fetchBonuses]);

  const openCreate = () => {
    setEditingBonus(null);
    setDrawerOpen(true);
  };

  const openEdit = (bonus: HrBonusDto) => {
    setEditingBonus(bonus);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingBonus(null);
  };

  const save = async (form: HrBonusWritePayload) => {
    if (!form.employmentId || !form.amount) return;

    setSaving(true);
    try {
      const payload: HrBonusWritePayload = editingBonus
        ? {
            employmentId: editingBonus.employmentId,
            amount: form.amount,
            kind: form.kind,
            note: form.note,
          }
        : form;

      const response = await fetch(editingBonus ? `/api/hr/bonuses/${editingBonus.id}` : '/api/hr/bonuses', {
        method: editingBonus ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = json.message || 'Помилка збереження';
        ToastService.show({ title: message, color: 'danger' });
        throw new Error(message);
      }
      ToastService.show({ title: editingBonus ? 'Премію оновлено' : 'Премію додано', color: 'success' });
      closeDrawer();
      await fetchBonuses();
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (bonus: HrBonusDto, status: HrBonusStatus) => {
    const response = await fetch(`/api/hr/bonuses/${bonus.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      ToastService.show({ title: json.message || 'Помилка', color: 'danger' });
      return;
    }
    await fetchBonuses();
  };

  const remove = async (id: number) => {
    const response = await fetch(`/api/hr/bonuses/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      ToastService.show({ title: json.message || 'Помилка', color: 'danger' });
      return;
    }
    await fetchBonuses();
  };

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-default-900 mb-4">Доступ заборонено</h2>
          <p className="text-default-500">У вас немає прав доступу до премій.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <MonthSwitcher value={monthDate} onChange={setMonthParam} disableFuture={false} size="sm" />
        {canManage ? (
          <Button
            className={HR_BTN_PRIMARY}
            startContent={<DynamicIcon name="plus" size={16} />}
            onPress={openCreate}
          >
            Додати премію
          </Button>
        ) : null}
      </div>

      <Card shadow="none" className="rounded-lg">
        <CardBody>
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <Table aria-label="Премії" removeWrapper classNames={HR_TABLE_CLASS_NAMES}>
              <TableHeader>
                <TableColumn>Працівник</TableColumn>
                <TableColumn>Роботодавець</TableColumn>
                <TableColumn>Місяць</TableColumn>
                <TableColumn>Сума</TableColumn>
                <TableColumn>Тип</TableColumn>
                <TableColumn>Статус</TableColumn>
                {canManage ? <TableColumn width={120} align="center"> </TableColumn> : null}
              </TableHeader>
              <TableBody emptyContent="Немає премій за обраний місяць">
                {bonuses.map((bonus) => (
                  <TableRow key={bonus.id}>
                    <TableCell className="capitalize">{bonus.displayName}</TableCell>
                    <TableCell>{bonus.legalEntityName}</TableCell>
                    <TableCell>{MONTH_NAMES[bonus.periodMonth - 1]} {bonus.periodYear}</TableCell>
                    <TableCell className="tabular-nums">{formatMoney(bonus.amount)}</TableCell>
                    <TableCell>{HR_BONUS_KIND_LABELS[bonus.kind]}</TableCell>
                    <TableCell>
                      <SpecChip
                        tokens={
                          bonus.status === 'approved'
                            ? hrStatusTokens('active')
                            : bonus.status === 'locked'
                              ? hrStatusTokens('inactive')
                              : hrKindTokens('amber')
                        }
                        icon={
                          bonus.status === 'approved'
                            ? 'success'
                            : bonus.status === 'locked'
                              ? 'default'
                              : 'warning'
                        }
                      >
                        {HR_BONUS_STATUS_LABELS[bonus.status]}
                      </SpecChip>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex justify-center gap-0.5">
                          {bonus.status === 'draft' ? (
                            <>
                              <Tooltip content="Редагувати премію" placement="top-end" showArrow>
                                <Button
                                  size="sm"
                                  variant="light"
                                  isIconOnly
                                  aria-label={`Редагувати премію ${bonus.displayName}`}
                                  className="text-slate-700"
                                  onPress={() => openEdit(bonus)}
                                >
                                  <DynamicIcon name="pencil" size={16} />
                                </Button>
                              </Tooltip>
                              <Tooltip content="Затвердити премію" placement="top-end" showArrow>
                                <Button
                                  size="sm"
                                  variant="light"
                                  isIconOnly
                                  aria-label={`Затвердити премію ${bonus.displayName}`}
                                  className="text-slate-700"
                                  onPress={() => setApproveTarget(bonus)}
                                >
                                  <DynamicIcon name="circle-check" size={16} />
                                </Button>
                              </Tooltip>
                            </>
                          ) : null}
                          {bonus.status !== 'locked' ? (
                            <Tooltip content="Видалити премію" placement="top-end" showArrow>
                              <Button
                                size="sm"
                                variant="light"
                                isIconOnly
                                aria-label={`Видалити премію ${bonus.displayName}`}
                                className="text-rose-600 hover:bg-rose-600/10!"
                                onPress={() => setDeleteTarget(bonus)}
                              >
                                <DynamicIcon name="trash-2" size={16} />
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
          )}
        </CardBody>
      </Card>

      <BonusDrawer
        isOpen={drawerOpen}
        bonus={editingBonus}
        employments={employments}
        defaultYear={year}
        defaultMonth={month}
        saving={saving}
        onClose={closeDrawer}
        onSave={save}
      />

      <ConfirmModal
        isOpen={deleteTarget != null}
        title="Видалити премію?"
        message={
          deleteTarget
            ? `Премію для ${deleteTarget.displayName} на суму ${formatMoney(deleteTarget.amount)} грн буде видалено без можливості відновлення.`
            : ''
        }
        confirmText="Видалити"
        cancelText="Скасувати"
        onConfirm={() => {
          if (deleteTarget) void remove(deleteTarget.id).finally(() => setDeleteTarget(null));
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        isOpen={approveTarget != null}
        title="Затвердити премію?"
        message={
          approveTarget
            ? `Премію для ${approveTarget.displayName} на суму ${formatMoney(approveTarget.amount)} грн буде включено до розрахунку фонду оплати праці.`
            : ''
        }
        confirmText="Затвердити"
        confirmColor="primary"
        cancelText="Скасувати"
        onConfirm={() => {
          if (approveTarget) void updateStatus(approveTarget, 'approved').finally(() => setApproveTarget(null));
        }}
        onCancel={() => setApproveTarget(null)}
      />
    </div>
  );
}
